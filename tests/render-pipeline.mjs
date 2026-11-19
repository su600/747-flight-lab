// Node-only regression tests for the HDR bloom/output passes; no WebGL context is needed.
import assert from 'node:assert/strict';
import {ACESFilmicToneMapping, AdditiveBlending, Color, PerspectiveCamera, Scene, SRGBColorSpace, Vector2, WebGLRenderTarget} from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import * as pipeline from '../src/render-pipeline.js';

const {ScaledBloomPass, BloomOutputPass} = pipeline;
assert.equal(typeof ScaledBloomPass, 'function', 'render-pipeline.js must export ScaledBloomPass');
assert.equal(typeof BloomOutputPass, 'function', 'render-pipeline.js must export BloomOutputPass');

// Snapshot the uniforms at draw time: blur materials and the output pass mutate them between draws.
function uniformSnapshot(material) {
 const values = {};
 for (const [name, uniform] of Object.entries(material.uniforms || {})) {
  const value = uniform.value;
  values[name] = value?.isVector2 ? value.clone() : value;
 }
 return values;
}
class MockRenderer {
 constructor(autoClear = true) {
  this.autoClear = autoClear;
  this.autoClearColor = this.autoClearDepth = this.autoClearStencil = true;
  this.color = new Color(0.17, 0.31, 0.53);
  this.alpha = 0.37;
  this.target = null;
  this.targets = [];
  this.clears = [];
  this.draws = [];
  this.toneMapping = ACESFilmicToneMapping;
  this.toneMappingExposure = 1.4;
  this.extensions = {has() { return true; }};
  this.outputColorSpace = SRGBColorSpace;
  this.state = {buffers: {stencil: {setTest() {}}}};
  this.failAtDraw = 0;
  this.failure = new Error('injected renderer failure');
 }
 getPixelRatio() { return 1; }
 getSize(v) { return v.set(128, 80); }
 getRenderTarget() { return this.target; }
 setRenderTarget(target) { this.target = target; this.targets.push(target); }
 getClearColor(result) { return result.copy(this.color); }
 getClearAlpha() { return this.alpha; }
 setClearColor(color, alpha) { this.color.set(color); if (alpha !== undefined) this.alpha = alpha; }
 clear() { this.clears.push(this.target); }
 render(mesh) {
  this.draws.push({target: this.target, material: mesh.material, uniforms: uniformSnapshot(mesh.material)});
  if (this.draws.length === this.failAtDraw) throw this.failure;
 }
}
function assertRendererState(renderer, color, alpha, autoClear) {
 assert(renderer.color.equals(color), 'clear color must be restored');
 assert.equal(renderer.alpha, alpha, 'clear alpha must be restored');
 assert.equal(renderer.autoClear, autoClear, 'autoClear must be restored');
}
function assertVector(actual, expected, message) {
 assert(actual?.isVector2 && actual.equals(expected), message);
}

const resolution = new Vector2(128, 80);
const args = [resolution, 0.73, 0.42, 1.15];
const bloom = new ScaledBloomPass(0.5, ...args);
const baseline = new UnrealBloomPass(...args);
const readBuffer = new WebGLRenderTarget(128, 80);
const writeBuffer = new WebGLRenderTarget(128, 80);
const output = new BloomOutputPass(bloom);

try {
 assert(bloom instanceof UnrealBloomPass);
 assert(output instanceof OutputPass);
 assert.equal(bloom.needsSwap, false, 'bloom leaves the composer input in place');
 assert.equal(output.needsSwap, true, 'output must swap the composer buffers');
 assert.equal(bloom.outputTexture, bloom.renderTargetsHorizontal[0].texture);
 assert.equal(bloom.nMips, 5);
 assert.equal(bloom.strength, args[1]);
 assert.equal(bloom.radius, args[2]);
 assert.equal(bloom.threshold, args[3]);

 // Existing scale behavior still applies when the composer resizes the pass.
 bloom.setSize(128, 80);
 baseline.setSize(64, 40);
 assert.equal(bloom.renderTargetBright.width, 32);
 assert.equal(bloom.renderTargetBright.height, 20);
 for (let i = 0; i < 5; i++) {
  assert.equal(bloom.renderTargetsHorizontal[i].width, baseline.renderTargetsHorizontal[i].width);
  assert.equal(bloom.renderTargetsHorizontal[i].height, baseline.renderTargetsHorizontal[i].height);
  assert.equal(bloom.renderTargetsVertical[i].width, baseline.renderTargetsVertical[i].width);
  assert.equal(bloom.renderTargetsVertical[i].height, baseline.renderTargetsVertical[i].height);
 }

 const referenceRenderer = new MockRenderer();
 baseline.render(referenceRenderer, writeBuffer, readBuffer, 0, false);
 assert.equal(referenceRenderer.draws.length, 13, 'Three.js baseline: high pass, ten blurs, composite, blend');
 assert.equal(referenceRenderer.draws.at(-1).target, readBuffer, 'baseline blends into the input');
 assert.equal(baseline.blendMaterial.blending, AdditiveBlending);
 assert.equal(baseline.blendMaterial.premultipliedAlpha, false);
 assert.equal(baseline.copyUniforms.opacity.value, 1);

 const renderer = new MockRenderer();
 const originalColor = renderer.color.clone(), originalAlpha = renderer.alpha;
 bloom.render(renderer, writeBuffer, readBuffer, 0, false);
 assertRendererState(renderer, originalColor, originalAlpha, true);
 assert.equal(renderer.draws.length, referenceRenderer.draws.length - 1, 'one fewer bloom draw');
 assert(!renderer.targets.includes(readBuffer), 'never bind the input framebuffer for bloom writes');
 assert(!renderer.clears.includes(readBuffer), 'never clear the input framebuffer');
 assert(!renderer.draws.some(draw => draw.target === readBuffer), 'never draw into the input framebuffer');
 const high = renderer.draws[0];
 assert.equal(high.target, bloom.renderTargetBright);
 assert.equal(high.material, bloom.materialHighPassFilter);
 assert.equal(high.uniforms.tDiffuse, readBuffer.texture);
 assert.equal(high.uniforms.luminosityThreshold, bloom.threshold);
 for (let i = 0; i < 5; i++) {
  const horizontal = renderer.draws[1 + i * 2], vertical = renderer.draws[2 + i * 2];
  assert.equal(horizontal.target, bloom.renderTargetsHorizontal[i]);
  assert.equal(vertical.target, bloom.renderTargetsVertical[i]);
  assert.equal(horizontal.material, bloom.separableBlurMaterials[i]);
  assert.equal(vertical.material, bloom.separableBlurMaterials[i]);
  assert.equal(horizontal.uniforms.colorTexture, i ? bloom.renderTargetsVertical[i - 1].texture : bloom.renderTargetBright.texture);
  assert.equal(vertical.uniforms.colorTexture, bloom.renderTargetsHorizontal[i].texture);
  assertVector(horizontal.uniforms.direction, UnrealBloomPass.BlurDirectionX, `mip ${i} horizontal direction`);
  assertVector(vertical.uniforms.direction, UnrealBloomPass.BlurDirectionY, `mip ${i} vertical direction`);
  assert.equal(horizontal.uniforms.pairBlurSamples, i === 0, `mip ${i} only pairs same-size horizontal samples`);
  assert.equal(vertical.uniforms.pairBlurSamples, true, `mip ${i} pairs same-size vertical samples`);
  assert.match(horizontal.material.fragmentShader, /float offset=float\(i\)\+b\/w/, 'weighted linear interpolation preserves the Gaussian taps');
 }
 const composite = renderer.draws.at(-1);
 assert.equal(composite.target, bloom.renderTargetsHorizontal[0]);
 assert.equal(composite.material, bloom.compositeMaterial);
 assert.equal(composite.uniforms.bloomStrength, bloom.strength);
 assert.equal(composite.uniforms.bloomRadius, bloom.radius);
 for (let i = 0; i < 5; i++) assert.equal(composite.uniforms[`blurTexture${i + 1}`], bloom.renderTargetsVertical[i].texture);

 // A failure at several stages must not leak the temporary black/transparent clear or autoClear state.
 for (const autoClear of [true, false]) {
  for (const failAtDraw of [1, 6, 12]) {
   const failing = new MockRenderer(autoClear);
   const color = failing.color.clone(), alpha = failing.alpha;
   failing.failAtDraw = failAtDraw;
   assert.throws(() => bloom.render(failing, writeBuffer, readBuffer, 0, false), error => error === failing.failure);
   assertRendererState(failing, color, alpha, autoClear);
  }
  const normal = new MockRenderer(autoClear);
  const color = normal.color.clone(), alpha = normal.alpha;
  bloom.render(normal, writeBuffer, readBuffer, 0, false);
  assertRendererState(normal, color, alpha, autoClear);
 }

 // Exercise the real OutputPass render path, recording uniforms as seen by the quad.
 const outRenderer = new MockRenderer();
 bloom.enabled = true;
 output.render(outRenderer, writeBuffer, readBuffer, 0, false);
 const on = outRenderer.draws.at(-1);
 assert.equal(on.target, writeBuffer);
 assert.equal(on.material, output.material);
 assert.equal(on.uniforms.tDiffuse, readBuffer.texture);
 assert.equal(on.uniforms.toneMappingExposure, outRenderer.toneMappingExposure);
 assert('ACES_FILMIC_TONE_MAPPING' in output.material.defines, 'Three output tone mapping remains active');
 assert('SRGB_TRANSFER' in output.material.defines, 'Three output color conversion remains active');

 bloom.enabled = false;
 output.render(outRenderer, writeBuffer, readBuffer, 0, false);
 const off = outRenderer.draws.at(-1);
 assert.equal(off.target, writeBuffer);
 assert.equal(off.uniforms.tDiffuse, readBuffer.texture);
 assert.equal(on.uniforms.tBloom, bloom.outputTexture, 'enabled output binds the current bloom texture');
 assert(on.uniforms.bloomEnabled === true || on.uniforms.bloomEnabled === 1);
 assert(off.uniforms.bloomEnabled === false || off.uniforms.bloomEnabled === 0, 'disabled bloom uniform');
 assert.notEqual(off.uniforms.tBloom, bloom.outputTexture, 'disabled output must not sample the stale bloom texture');
 bloom.enabled = true;
 output.render(outRenderer, writeBuffer, readBuffer, 0, false);
 const reenabled = outRenderer.draws.at(-1);
 assert.equal(reenabled.uniforms.tBloom, bloom.outputTexture, 're-enabling binds bloom again');
 assert(reenabled.uniforms.bloomEnabled === true || reenabled.uniforms.bloomEnabled === 1);

 // Inspect executable shader code (not comments). The blend must be in linear HDR, before any tone mapping.
 const shader = output.material.fragmentShader.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
 const mainStart = shader.search(/\bvoid\s+main\s*\(/);
 assert(mainStart >= 0, 'output shader has a main function');
 const main = shader.slice(mainStart);
 const toneIndex = main.search(/#\s*if(?:def)?\s+[^\n]*TONE_MAPPING\b/);
 assert(toneIndex >= 0 && /\bACESFilmicToneMapping\s*\(/.test(main.slice(toneIndex)), 'OutputShader tone mapping is preserved');
 const linearStage = main.slice(0, toneIndex);
 assert(/\bgl_FragColor\s*=\s*texture(?:2D)?\s*\(\s*tDiffuse\s*,\s*vUv\s*\)\s*;/.test(linearStage),
  'output starts with the HDR input before adding bloom');
 // Three r170's non-premultiplied AdditiveBlending uses SRC_ALPHA, ONE. Check the actual
 // sampled vec4 and its multiplication in the shader, rather than merely looking for '+' or 'clamp'.
 // This intentionally accepts the vec4 form (also preserves stock alpha blending) or an rgb-only form.
 function checkBloomBlend(stage) {
  const sample = /\bvec4\s+(\w+)\s*=\s*texture(?:2D)?\s*\(\s*tBloom\s*,\s*vUv\s*\)\s*;/.exec(stage);
  assert(sample, 'sample tBloom as a vec4 before tone mapping');
  const addition = /\bgl_FragColor(\.rgb)?\s*\+=\s*([^;]+);/.exec(stage.slice(sample.index + sample[0].length));
  assert(addition, 'add the sampled bloom to the output before tone mapping');
  const variable = sample[1];
  const factors = addition[2].replace(/\s+/g, '').split('*').sort();
  const bloomFactor = variable + (addition[1] || '');
  // GLSL floating constants can be written as 0., 0.0, 1., 1.0, etc.
  const clampFactor = factors.find(f => f.startsWith('clamp('));
  assert(clampFactor, 'bloom alpha must be clamped');
  assert.match(clampFactor, new RegExp(`^clamp\\(${variable}\\.a,0(?:\\.0*)?,1(?:\\.0*)?\\)$`),
   'clamp the sampled bloom alpha to [0, 1]');
  const expected = [bloomFactor, clampFactor];
  if (factors.includes('bloomEnabled')) expected.push('bloomEnabled');
  assert.deepEqual(factors, expected.sort(), 'blend must be bloom RGB times clamped bloom alpha');
  assert(factors.includes('bloomEnabled') || /\bif\s*\([^)]*\bbloomEnabled\b/.test(stage.slice(0, sample.index)),
   'bloom contribution is controlled by bloomEnabled');
  return factors;
 }
 const factors = checkBloomBlend(linearStage);
 // Evaluate the checked source factors with representative HDR samples, including both clamp limits.
 for (const alpha of [-0.5, 0, 0.35, 1, 1.7]) {
  const scene = [0.2, 0.5, 2], bloomRgb = [2, 0.8, 3];
  const actual = scene.map((value, i) => value + factors.reduce((product, factor) =>
   product * (factor === 'bloomEnabled' ? 1 : factor.startsWith('clamp(') ? Math.min(1, Math.max(0, alpha)) : bloomRgb[i]), 1));
  const expected = scene.map((value, i) => value + bloomRgb[i] * Math.min(1, Math.max(0, alpha)));
  actual.forEach((value, i) => assert(Math.abs(value - expected[i]) < 1e-12, `SRC_ALPHA, ONE at alpha ${alpha}`));
 }

 // Use the real composer swap logic for two enabled and two disabled frames. An output + grade pair
 // must swap twice so the next scene always starts on the same (multisampled in production) target.
 const composerRenderer = new MockRenderer();
 const composer = new EffectComposer(composerRenderer, new WebGLRenderTarget(128, 80));
 composer.renderToScreen = false;
 const sceneReads = [], gradeReads = [];
 const scenePass = new Pass();
 scenePass.needsSwap = false;
 scenePass.render = (_renderer, _write, read) => sceneReads.push(read);
 const gradePass = new Pass();
 gradePass.render = (_renderer, _write, read) => gradeReads.push(read);
 composer.addPass(scenePass);
 composer.addPass(bloom);
 composer.addPass(output);
 composer.addPass(gradePass);
 const initialRead = composer.readBuffer, initialWrite = composer.writeBuffer;
 try {
  for (const enabled of [true, true, false, false]) {
   bloom.enabled = enabled;
   const drawCount = composerRenderer.draws.length;
   composer.render(0);
   assert.equal(composerRenderer.draws.length - drawCount, enabled ? 13 : 1, 'disabled bloom is skipped');
   assert.equal(composer.readBuffer, initialRead, 'two swaps restore the read buffer');
   assert.equal(composer.writeBuffer, initialWrite, 'two swaps restore the write buffer');
   assert.equal(sceneReads.at(-1), initialRead);
   assert.equal(gradeReads.at(-1), initialWrite, 'grade reads the output pass result');
   const outputDraw = composerRenderer.draws.at(-1);
   assert.equal(outputDraw.target, initialWrite);
   assert.equal(outputDraw.uniforms.tDiffuse, initialRead.texture);
   assert.equal(!!outputDraw.uniforms.bloomEnabled, enabled, 'output tracks bloom on every frame');
  }
 } finally {
  composer.dispose();
 }
 // FXAA runs inside the existing grade pass rather than adding a swapping composer pass.
 const actual = new pipeline.RenderingPipeline(new MockRenderer(), new Scene(), new PerspectiveCamera(), {low:false});
 try {
  assert.equal(actual.diagnostics().edgeAA,true,'high quality enables display-space edge AA');
  assert.equal(actual.passes.filter(pass=>pass.needsSwap).length,2,'edge AA preserves the two-swap composer invariant');
  assert.match(actual.grade.material.fragmentShader,/filterEdge\(c\)/,'edge AA is fused into grade');
  assert.match(actual.grade.material.fragmentShader,/float e=silhouette\(\);if\(e>0\.0\)c=mix\(c,filterEdge\(c\),e\)/,'edge AA is limited to depth silhouettes so livery detail stays sharp');
  assert(actual.composer.renderTarget2.depthTexture?.isDepthTexture,'scene target resolves depth into a texture');
  assert.equal(actual.grade.uniforms.tDepth.value,actual.composer.renderTarget2.depthTexture,'grade reads the scene depth');
  actual.resize(256,128);
  assertVector(actual.grade.uniforms.inverseResolution.value,new Vector2(1/256,1/128),'FXAA uses drawing-buffer pixels after resize');
  actual.setEdgeAntialias(false);assert.equal(actual.grade.uniforms.edgeAA.value,0);assert.equal(actual.diagnostics().edgeAA,false);
  actual.setQuality(true);assert.equal(actual.diagnostics().edgeAA,false,'direct low-quality fallback stays direct');
  actual.setQuality(false);assert.equal(actual.grade.uniforms.edgeAA.value,0,'explicit AA setting survives pipeline rebuild');
  actual.setEdgeAntialias(true);assert.equal(actual.diagnostics().edgeAA,true);
 } finally { actual.dispose(); }
 console.log('Render pipeline passed: bloom optimization, renderer state, HDR output, fused edge AA and composer swaps.');
} finally {
 output.dispose();
 bloom.dispose();
 baseline.dispose();
 readBuffer.dispose();
 writeBuffer.dispose();
}
