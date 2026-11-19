import * as T from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {renderProfile,bloomFor,gradeFor,isTouchDevice} from './render-profile.js';

// Tone-mapped output is already in display space. A lightweight FXAA edge filter runs in the existing grade
// pass, so aircraft silhouettes get smoother without another full-screen pass or another composer buffer swap.
export const GradeShader={
 name:'FlightGrade',
 uniforms:{tDiffuse:{value:null},tDepth:{value:null},saturation:{value:1},contrast:{value:1},vignette:{value:0},tint:{value:new T.Vector3(1,1,1)},inverseResolution:{value:new T.Vector2(1,1)},edgeAA:{value:1},depthEdge:{value:new T.Vector2(.0012,.004)}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:`uniform sampler2D tDiffuse;uniform sampler2D tDepth;uniform float saturation,contrast,vignette,edgeAA;uniform vec3 tint;uniform vec2 inverseResolution,depthEdge;varying vec2 vUv;
 float edgeLuma(vec3 c){return dot(c,vec3(.299,.587,.114));}
 vec3 edgeSample(vec2 uv){return texture2D(tDiffuse,clamp(uv,vec2(0.0),vec2(1.0))).rgb;}
 vec3 filterEdge(vec3 middle){
  vec3 nw=edgeSample(vUv+inverseResolution*vec2(-1.,1.));
  vec3 ne=edgeSample(vUv+inverseResolution*vec2(1.,1.));
  vec3 sw=edgeSample(vUv+inverseResolution*vec2(-1.,-1.));
  vec3 se=edgeSample(vUv+inverseResolution*vec2(1.,-1.));
  float m=edgeLuma(middle),a=edgeLuma(nw),b=edgeLuma(ne),c=edgeLuma(sw),d=edgeLuma(se);
  float lo=min(m,min(min(a,b),min(c,d))),hi=max(m,max(max(a,b),max(c,d)));
  if(hi-lo<max(.0625,hi*.125))return middle;
  vec2 dir=vec2(-((a+b)-(c+d)),(a+c)-(b+d));
  float reduce=max((a+b+c+d)*.03125,.0078125);
  dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),vec2(-6.),vec2(6.))*inverseResolution;
  vec3 first=.5*(edgeSample(vUv+dir*(-1./6.))+edgeSample(vUv+dir*(1./6.)));
  vec3 second=first*.5+.25*(edgeSample(vUv+dir*(-.5))+edgeSample(vUv+dir*.5));
  float test=edgeLuma(second);
  return test<lo||test>hi?first:second;
 }
 // Only geometric silhouettes (a depth discontinuity) are filtered; livery lettering and stripes on one
 // surface keep their full texture detail at a distance.
 float silhouette(){
  float d=texture2D(tDepth,vUv).x,j=0.0;
  j=max(j,abs(d-texture2D(tDepth,clamp(vUv+inverseResolution*vec2(-1.,1.),0.,1.)).x));
  j=max(j,abs(d-texture2D(tDepth,clamp(vUv+inverseResolution*vec2(1.,1.),0.,1.)).x));
  j=max(j,abs(d-texture2D(tDepth,clamp(vUv+inverseResolution*vec2(-1.,-1.),0.,1.)).x));
  j=max(j,abs(d-texture2D(tDepth,clamp(vUv+inverseResolution*vec2(1.,-1.),0.,1.)).x));
  return smoothstep(depthEdge.x,depthEdge.y,j);
 }
 void main(){
  vec4 texel=texture2D(tDiffuse,vUv);vec3 c=texel.rgb;
  if(edgeAA>0.5){float e=silhouette();if(e>0.0)c=mix(c,filterEdge(c),e);}
  float luma=dot(c,vec3(.2126,.7152,.0722));
  c=mix(vec3(luma),c,saturation);
  c=(c-.5)*contrast+.5;
  c*=tint;
  vec2 d=vUv-.5;c*=1.-vignette*smoothstep(.35,.95,length(d*vec2(1.15,1.)))*1.2;
  gl_FragColor=vec4(clamp(c,0.,1.),texel.a);
 }`
};

// A single NaN or infinite pixel in the HDR buffer (a degenerate normal, a divide by zero in a model's material)
// would be smeared across the whole screen by the bloom blur and turn the frame black. Direct rendering only ever
// shows one odd pixel, so the bloom input is sanitised: bad pixels become black and brightness is capped (a hot specular glint on a dark part would otherwise glow across half the screen).
const SAMPLE='vec4 texel = texture2D( tDiffuse, vUv );';
const sanitizedHighPass=source=>source.replace(SAMPLE,`${SAMPLE}
			if ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0 );
			texel = min( texel, vec4( 6.0 ) );`);

// Keep all five bloom levels, but leave the completed blur in its small texture. The output pass composites it
// before tone mapping, avoiding a full-screen additive draw back into the multisampled HDR scene target.
export class ScaledBloomPass extends UnrealBloomPass{
 constructor(scale,...args){
  super(...args);this.sizeScale=scale;
  const material=this.materialHighPassFilter;material.fragmentShader=sanitizedHighPass(material.fragmentShader);material.needsUpdate=true;
  // Pair adjacent Gaussian taps with linear filtering where source and target have the same size.
  // All r170 kernels here are odd (3, 5, 7, 9, 11), so every positive tap has a neighbour.
  for(const blur of this.separableBlurMaterials){
   blur.uniforms.pairBlurSamples={value:false};
   const source=blur.fragmentShader;
   const withUniform=source.replace('uniform float gaussianCoefficients[KERNEL_RADIUS];','uniform float gaussianCoefficients[KERNEL_RADIUS];\n                uniform bool pairBlurSamples;');
   blur.fragmentShader=withUniform.replace(/for\( int i = 1; i < KERNEL_RADIUS; i \+\+ \) \{[\s\S]*?\n\s*\}/,`if (pairBlurSamples) {
      for (int i=1; i<KERNEL_RADIUS; i+=2) {
       float a=gaussianCoefficients[i], b=gaussianCoefficients[i+1], w=a+b;
       float offset=float(i)+b/w;
       vec2 uvOffset=direction*invSize*offset;
       diffuseSum+=(texture2D(colorTexture,vUv+uvOffset).rgb+texture2D(colorTexture,vUv-uvOffset).rgb)*w;
       weightSum+=2.0*w;
      }
     } else {
      for (int i=1; i<KERNEL_RADIUS; i++) {
       float w=gaussianCoefficients[i];vec2 uvOffset=direction*invSize*float(i);
       diffuseSum+=(texture2D(colorTexture,vUv+uvOffset).rgb+texture2D(colorTexture,vUv-uvOffset).rgb)*w;
       weightSum+=2.0*w;
      }
     }`);
   if(blur.fragmentShader===withUniform||withUniform===source)throw new Error('Unsupported bloom blur shader');
   blur.needsUpdate=true;
  }
 }
 get outputTexture(){return this.renderTargetsHorizontal[0].texture;}
 setSize(width,height){super.setSize(Math.max(1,Math.round(width*this.sizeScale)),Math.max(1,Math.round(height*this.sizeScale)));}
 render(renderer,writeBuffer,readBuffer,deltaTime,maskActive){
  // The pipeline always follows bloom with OutputPass. Retain the stock behavior if it is used as a final pass.
  if(this.renderToScreen)return super.render(renderer,writeBuffer,readBuffer,deltaTime,maskActive);
  renderer.getClearColor(this._oldClearColor);this.oldClearAlpha=renderer.getClearAlpha();
  const oldAutoClear=renderer.autoClear;renderer.autoClear=false;
  try{
   renderer.setClearColor(this.clearColor,0);
   if(maskActive)renderer.state.buffers.stencil.setTest(false);
   this.highPassUniforms.tDiffuse.value=readBuffer.texture;
   this.highPassUniforms.luminosityThreshold.value=this.threshold;
   this.fsQuad.material=this.materialHighPassFilter;
   renderer.setRenderTarget(this.renderTargetBright);renderer.clear();this.fsQuad.render(renderer);
   let input=this.renderTargetBright;
   for(let i=0;i<this.nMips;i++){
    const blur=this.separableBlurMaterials[i];this.fsQuad.material=blur;
    blur.uniforms.colorTexture.value=input.texture;blur.uniforms.direction.value=UnrealBloomPass.BlurDirectionX;
    // Later horizontal passes downsample the previous mip, so their taps are two source texels apart.
    blur.uniforms.pairBlurSamples.value=i===0;
    renderer.setRenderTarget(this.renderTargetsHorizontal[i]);renderer.clear();this.fsQuad.render(renderer);
    blur.uniforms.colorTexture.value=this.renderTargetsHorizontal[i].texture;blur.uniforms.direction.value=UnrealBloomPass.BlurDirectionY;
    blur.uniforms.pairBlurSamples.value=true;
    renderer.setRenderTarget(this.renderTargetsVertical[i]);renderer.clear();this.fsQuad.render(renderer);
    input=this.renderTargetsVertical[i];
   }
   this.fsQuad.material=this.compositeMaterial;
   this.compositeMaterial.uniforms.bloomStrength.value=this.strength;
   this.compositeMaterial.uniforms.bloomRadius.value=this.radius;
   this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;
   renderer.setRenderTarget(this.renderTargetsHorizontal[0]);renderer.clear();this.fsQuad.render(renderer);
  }finally{
   if(maskActive)renderer.state.buffers.stencil.setTest(true);
   renderer.setClearColor(this._oldClearColor,this.oldClearAlpha);renderer.autoClear=oldAutoClear;
  }
 }
}

// Three r170's bloom blend uses SRC_ALPHA, ONE (not simply ONE, ONE). Reproduce that blend in linear HDR
// before OutputPass applies tone mapping and output colour conversion, including the original alpha channel.
export class BloomOutputPass extends OutputPass{
 constructor(bloom){
  super();this.bloom=bloom;this.uniforms.tBloom={value:null};this.uniforms.bloomEnabled={value:0};
  this.material.fragmentShader=this.material.fragmentShader
   .replace('uniform sampler2D tDiffuse;','uniform sampler2D tDiffuse;\nuniform sampler2D tBloom;\nuniform float bloomEnabled;')
   .replace('gl_FragColor = texture2D( tDiffuse, vUv );',`gl_FragColor = texture2D( tDiffuse, vUv );
    vec4 bloomColor=texture2D(tBloom,vUv);
    gl_FragColor+=bloomEnabled*bloomColor*clamp(bloomColor.a,0.0,1.0);`);
  this.material.needsUpdate=true;
 }
 render(renderer,writeBuffer,readBuffer,deltaTime,maskActive){
  const enabled=!!this.bloom?.enabled;
  this.uniforms.bloomEnabled.value=enabled?1:0;
  this.uniforms.tBloom.value=enabled?this.bloom.outputTexture:readBuffer.texture;
  super.render(renderer,writeBuffer,readBuffer,deltaTime,maskActive);
 }
}

// Owns the post-processing chain: scene (MSAA, half-float) -> bloom -> tone map + sRGB -> grade. Anything that goes
// wrong falls back to plain direct rendering, which is also what low quality uses.
//
// EffectComposer draws the scene into its second target and swaps targets after every pass that sets needsSwap
// (output and grade here). An even number of swaps keeps the scene landing in that same, multisampled target every
// frame, so do not add or remove a swapping pass without keeping the count even.
export class RenderingPipeline{
 constructor(renderer,scene,camera,{low=false}={}){
  this.renderer=renderer;this.scene=scene;this.camera=camera;this.low=!!low;this.edgeAntialias=true;
  this.touch=isTouchDevice();
  const size=renderer.getSize(new T.Vector2());this.width=Math.max(1,size.x);this.height=Math.max(1,size.y);
  this.floatTargets=renderer.extensions.has('EXT_color_buffer_float')||renderer.extensions.has('EXT_color_buffer_half_float');
  this.time='day';this.composer=null;this.passes=[];this.bloom=null;this.grade=null;
  this.fallback=false;this.fallbackCount=0;this.renderFailures=0;
  this.profile=this.computeProfile();
  this.build();
 }
 computeProfile(){
  return renderProfile({low:this.low,width:this.width,height:this.height,devicePixelRatio:globalThis.devicePixelRatio||1,touch:this.touch,floatTargets:this.floatTargets});
 }
 targetSize(){return [Math.max(1,Math.floor(this.width*this.profile.pixelRatio)),Math.max(1,Math.floor(this.height*this.profile.pixelRatio))];}
 get active(){return !!this.composer&&!this.fallback;}
 build(){
  this.dispose();this.profile=this.computeProfile();
  if(!this.profile.post)return;
  try{
   const [w,h]=this.targetSize();
   const target=new T.WebGLRenderTarget(w,h,{type:T.HalfFloatType,depthBuffer:true,stencilBuffer:false});
   this.composer=new EffectComposer(this.renderer,target);
   // Only the scene target gets a depth texture. A cloned DepthTexture would share its GPU source with the
   // other composer target, whose output pass would then overwrite the depth the grade pass reads.
   this.composer.renderTarget2.depthTexture=new T.DepthTexture(w,h);
   this.composer.renderTarget2.samples=this.profile.samples;
   const add=pass=>{this.composer.addPass(pass);this.passes.push(pass);return pass;};
   add(new RenderPass(this.scene,this.camera));
   if(this.profile.bloom)this.bloom=add(new ScaledBloomPass(this.profile.bloomScale,new T.Vector2(w,h),.1,.55,1.2));
   add(new BloomOutputPass(this.bloom));
   this.grade=add(new ShaderPass(GradeShader));
   // The scene always lands in renderTarget2 (two swaps per frame); its resolved depth marks silhouettes.
   this.grade.uniforms.tDepth.value=this.composer.renderTarget2.depthTexture;
   this.grade.uniforms.edgeAA.value=this.edgeAntialias?1:0;
   this.fallback=false;
   this.setTime(this.time);this.resize(this.width,this.height);
  }catch(error){
   this.fallbackCount++;this.fallback=true;this.dispose();console.warn('Post-processing unavailable; using the direct renderer.',error);
  }
 }
 setQuality(low){this.low=!!low;this.build();}
 setEdgeAntialias(enabled){this.edgeAntialias=!!enabled;if(this.grade)this.grade.uniforms.edgeAA.value=this.edgeAntialias?1:0;}
 setTime(time){
  this.time=time;
  if(this.bloom)Object.assign(this.bloom,bloomFor(time,this.touch));
  if(this.grade){
   const g=gradeFor(time),u=this.grade.uniforms;
   u.saturation.value=g.saturation;u.contrast.value=g.contrast;u.vignette.value=g.vignette;u.tint.value.set(...g.tint);
  }
 }
 // After a lost WebGL context three recreates textures lazily, but targets sized for the old context are rebuilt to be safe.
 restore(){if(!this.low)this.build();}
 resize(width,height){
  this.width=Math.max(1,Math.round(width));this.height=Math.max(1,Math.round(height));
  this.profile=this.computeProfile();
  if(!this.composer)return;
  // Whole pixels, matching the canvas's own drawing-buffer size (a fractional target size is truncated by the GPU).
  const [w,h]=this.targetSize();
  this.composer.setPixelRatio(1);
  this.composer.setSize(w,h);
  if(this.grade)this.grade.uniforms.inverseResolution.value.set(1/w,1/h);
 }
 // Returns true when a complete frame reached the canvas.
 render(){
  if(!this.active){
   try{this.renderer.render(this.scene,this.camera);return true;}
   catch(error){this.renderFailures++;console.warn('A frame could not be drawn; keeping the last image.',error);return false;}
  }
  // The composer issues several render() calls per frame; keep renderer.info describing the whole frame.
  const info=this.renderer.info,autoReset=info.autoReset;info.autoReset=false;info.reset();
  try{this.composer.render();}
  catch(error){
   this.fallbackCount++;this.fallback=true;this.dispose();info.autoReset=autoReset;
   console.warn('Post-processing failed; continuing with the direct renderer.',error);
   try{this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);}
   catch(directError){this.renderFailures++;return false;}
   return true;
  }
  info.autoReset=autoReset;return true;
 }
 diagnostics(){return {...this.profile,time:this.time,floatTargets:this.floatTargets,active:this.active,bloom:!!this.bloom,grade:!!this.grade,edgeAA:!!(this.active&&this.grade&&this.edgeAntialias),samples:this.profile.samples,fallback:this.fallback,fallbacks:this.fallbackCount,renderFailures:this.renderFailures};}
 dispose(){
  for(const pass of this.passes)pass.dispose?.();
  this.passes.length=0;this.composer?.dispose();this.composer=null;this.bloom=null;this.grade=null;
 }
}
