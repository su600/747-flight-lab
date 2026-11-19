// Time-of-day presets, the tone-map inverse that keeps fog and horizon the same colour, and the sky shader patch.
import assert from 'node:assert/strict';
import {Sky} from 'three/addons/objects/Sky.js';
import {LIGHTING,lightingFor,acesFilmic,inverseAces,hexToRgb} from '../src/world/lighting.js';
import {patchSkyFragment,createSky,applySkyPreset,SKY_SHADER_VERSION} from '../src/world/sky.js';
const near=(a,b,e=1e-3,m='')=>assert(Math.abs(a-b)<e,`${m} ${a} != ${b}`);

// Intensities other tests and tools rely on stay exactly as authored.
assert.equal(LIGHTING.day.sun,3.2);assert.equal(LIGHTING.day.hemi,1.15);assert.equal(LIGHTING.day.env,1);
assert.equal(LIGHTING.dusk.sun,2.6);assert.equal(LIGHTING.dusk.hemi,.75);assert.equal(LIGHTING.dusk.env,.8);
assert.equal(LIGHTING.night.sun,.35);assert.equal(LIGHTING.night.hemi,.45);assert.equal(LIGHTING.night.env,.55);
assert.equal(LIGHTING.night.fogDensity,.00008);
assert.equal(lightingFor('nonsense'),LIGHTING.day);
for(const [mode,p] of Object.entries(LIGHTING)){
 assert(p.exposure>.5&&p.exposure<1.3,`${mode} exposure`);assert(p.fill>=0&&p.fill<.6,`${mode} fill`);
 assert(p.fogDensity>0&&p.fogDensity<.0003,`${mode} fog`);
 assert(p.cloud.gain>=1&&p.cloud.opacity>0&&p.cloud.opacity<=1,`${mode} cloud`);
}
assert(LIGHTING.day.cloud.gain>1.5,'sunlit clouds must out-shine the HDR sky behind them');
assert(LIGHTING.day.cloud.fog===false,'daytime clouds are not tinted by fog');

// ACES matches known values: black stays black, white at unit exposure lands near 0.8, output is monotonic and clamped.
assert.deepEqual(acesFilmic([0,0,0],1).map(v=>Math.round(v*1e4)),[0,0,0]);
const white=acesFilmic([1,1,1],1);assert(white.every(v=>v>.75&&v<.85),`white maps to ${white}`);
assert(acesFilmic([40,40,40],1).every(v=>v<=1));
let last=-1;for(let v=0;v<8;v+=.25){const out=acesFilmic([v,v,v],.74)[1];assert(out>=last);last=out;}

// inverseAces recovers a colour that tone-maps back to the target display colour.
for(const mode of ['day','dusk','night']){
 const p=LIGHTING[mode],raw=inverseAces(p.horizon,p.exposure),back=acesFilmic(raw,p.exposure),target=hexToRgb(p.horizon).map(c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4));
 back.forEach((v,i)=>near(v,target[i],.004,`${mode} channel ${i}`));
}
assert.deepEqual(inverseAces(0x86b8ec,.72),inverseAces(0x86b8ec,.72),'cached result is stable');
const a=inverseAces(0x86b8ec,.72);a[0]=99;assert.notEqual(inverseAces(0x86b8ec,.72)[0],99,'callers cannot corrupt the cache');
assert(inverseAces(LIGHTING.day.horizon,LIGHTING.day.exposure)[2]>1,'a blue horizon needs HDR blue, which is why clouds get a gain');

// The sky patch must find every anchor in the installed three version, or the sky silently loses its gradient.
const stock=new Sky().material.fragmentShader,patched=patchSkyFragment(stock);
for(const needle of ['uniform vec3 horizonColor','retColor*skyTint','discColor*smoothstep'])assert(patched.includes(needle),`patched shader lacks ${needle}`);
assert(!patched.includes('L0 += ( vSunE * 19000.0 * Fex ) * sundisk;'),'stock sun disc (which the tint would turn blue) is removed');
assert(!patched.includes('gl_FragColor = vec4( retColor, 1.0 );'),'stock output replaced');
assert.equal((patched.match(/uniform vec3 skyTint/g)||[]).length,1);
assert(patched.indexOf('uniform vec3 skyTint')<patched.indexOf('void main'),'uniforms declared before use');

// createSky exposes the uniforms applySkyPreset fills in.
const sky=createSky(),u=sky.material.uniforms;
for(const name of ['skyTint','horizonColor','hazeParams','glowColor','glowParams','discColor','sunPosition','turbidity','rayleigh'])assert(name in u,name);
assert.equal(sky.material.customProgramCacheKey(),SKY_SHADER_VERSION);
const sun=new (u.sunPosition.value.constructor)(300,360,-250).normalize();
applySkyPreset(sky,LIGHTING.day,inverseAces(LIGHTING.day.horizon,LIGHTING.day.exposure),sun);
near(u.turbidity.value,LIGHTING.day.sky.turbidity);near(u.skyTint.value.z,LIGHTING.day.sky.tint[2]);
assert(u.discColor.value.length()>10,'daytime sun disc is a bright HDR value');
applySkyPreset(sky,LIGHTING.night,inverseAces(LIGHTING.night.horizon,LIGHTING.night.exposure),sun);
assert.equal(u.discColor.value.length(),0,'no sun disc at night');
applySkyPreset(sky,LIGHTING.day,[1,1,1],sun,{tintMix:0});
near(u.skyTint.value.x,1);near(u.skyTint.value.z,1,1e-9,'tintMix 0 leaves the sky untinted');
applySkyPreset(sky,LIGHTING.day,[1,1,1],sun,{discScale:.1});
assert(u.discColor.value.length()<LIGHTING.day.sky.discPower,'reflection probe uses a gentler sun');
console.log('Lighting presets passed: authored intensities, tone-map inverse, cloud gain and sky shader patch.');
