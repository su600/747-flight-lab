// Rendering budgets and the colour/shadow helpers that need no GPU.
import assert from 'node:assert/strict';
import {renderProfile,bloomFor,gradeFor,shadowExtent,shadowSizeFor,isTouchDevice} from '../src/render-profile.js';

// Low quality is direct rendering at 1x: no post-processing, no multisampling, no shadow map.
const low=renderProfile({low:true,width:2560,height:1440,devicePixelRatio:2});
assert.equal(low.pixelRatio,1);assert.equal(low.post,false);assert.equal(low.bloom,false);assert.equal(low.samples,0);assert.equal(low.shadowSize,0);

// Desktop high quality caps the pixel ratio at 1.5 and multisamples the scene.
const desktop=renderProfile({width:1280,height:720,devicePixelRatio:2});
assert.equal(desktop.pixelRatio,1.5);assert.equal(desktop.post,true);assert.equal(desktop.samples,4);assert.equal(desktop.shadowSize,2048);
assert.equal(renderProfile({width:1280,height:720,devicePixelRatio:1}).pixelRatio,1,'never upscales past the device ratio');

// A very large canvas is held to the pixel budget instead of the ratio cap.
const wide=renderProfile({width:3840,height:2160,devicePixelRatio:2});
assert(wide.pixelRatio<1.1&&wide.pixelRatio>=.5,'4K canvas is scaled to the budget');
assert(wide.pixelRatio*wide.pixelRatio*3840*2160<=8.31e6,'budget respected');

// Touch devices get a tighter cap, fewer samples, a cheaper bloom and a smaller shadow map.
const touch=renderProfile({width:1194,height:834,devicePixelRatio:2,touch:true});
assert(touch.pixelRatio<=1.25);assert.equal(touch.samples,2);assert(touch.bloomScale<desktop.bloomScale);assert.equal(touch.shadowSize,1024);

// Without float render targets there is no HDR chain at all, so no bloom or grade either.
const noFloat=renderProfile({width:1280,height:720,devicePixelRatio:1,floatTargets:false});
assert.equal(noFloat.post,false);assert.equal(noFloat.bloom,false);

assert.equal(shadowSizeFor(true,false),0);assert.equal(shadowSizeFor(false,true),1024);assert.equal(shadowSizeFor(false,false),2048);

// Bloom thresholds stay above diffuse white by day, so only lamps, the sun and clouds' brightest tops glow.
for(const mode of ['day','dusk','night']){
 const b=bloomFor(mode);assert(b.threshold>0&&b.strength>0&&b.radius>0,mode);
 assert(bloomFor(mode,true).strength<b.strength,`${mode}: touch bloom is gentler`);
 const g=gradeFor(mode);assert(g.saturation>=1&&g.contrast>=1&&g.vignette>=0&&g.vignette<=.4,`${mode}: grade stays subtle`);
}
assert(bloomFor('day').threshold>bloomFor('night').threshold,'day bloom is stricter than night');
assert.deepEqual(bloomFor('nonsense'),bloomFor('day'),'unknown modes fall back to day');

// The shadow box is sized to the aircraft: bigger aircraft get bigger boxes, within sane limits.
const b747=shadowExtent({x:70.7,y:19.4,z:64.4}),a380=shadowExtent({x:73,y:24,z:80}),shuttle=shadowExtent({x:37,y:17,z:24});
assert(a380>b747,'A380 needs more room than a 747');assert.equal(shuttle,70,'small aircraft use the minimum box');
assert(b747>=60&&b747<=100,`747 box ${b747}`);assert(shadowExtent(undefined)>=70&&shadowExtent({x:9999,z:9999})<=150,'bounded');
// The box must contain the aircraft's half-diagonal whatever its heading.
assert(a380>Math.hypot(73,80)/2,'contains the whole airframe');

// Touch detection: coarse pointer, or an iPad that reports a Mac platform.
assert.equal(isTouchDevice({},()=>({matches:true})),true);
assert.equal(isTouchDevice({maxTouchPoints:5,platform:'MacIntel',userAgent:'Safari'},()=>({matches:false})),true);
assert.equal(isTouchDevice({maxTouchPoints:0,platform:'Win32',userAgent:'Chrome'},()=>({matches:false})),false);
assert.equal(isTouchDevice({maxTouchPoints:10,platform:'Win32',userAgent:'Windows Chrome'},()=>({matches:false})),false,'touchscreen laptops keep the desktop profile');
assert.equal(isTouchDevice({},undefined),false,'no matchMedia, no touch');
console.log('Render profile passed: quality tiers, pixel budget, bloom/grade profiles, shadow sizing and touch detection.');
