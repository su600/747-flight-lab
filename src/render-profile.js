// Decides how much rendering work each device class gets. Pure functions, so they are unit-tested without a GPU.
import {LIGHTING} from './world/lighting.js';

export function isTouchDevice(nav=globalThis.navigator||{},media=globalThis.matchMedia){
 const coarse=typeof media==='function'?!!media('(pointer:coarse)')?.matches:false;
 const iPad=(nav.maxTouchPoints||0)>1&&/Mac/i.test(nav.platform||'')&&!/Windows/i.test(nav.userAgent||'');
 return coarse||iPad;
}

// The shadow box is fitted to the aircraft (see shadowExtent), so 2048 texels already resolve about twice the detail
// of the old fixed 300 m box at 2048; touch devices get a quarter of the memory and fill cost.
export const shadowSizeFor=(low,touch)=>low?0:touch?1024:2048;

export function renderProfile({low=false,width=1280,height=720,devicePixelRatio=1,touch=false,floatTargets=true}={}){
 const cap=touch?1.25:1.5,budget=touch?3.2e6:8.3e6;
 const requested=Math.max(.5,Number(devicePixelRatio)||1),area=Math.max(1,(Number(width)||1)*(Number(height)||1));
 const pixelRatio=low?1:Math.max(.5,Math.min(requested,cap,Math.sqrt(budget/area)));
 return {
  low:!!low,touch:!!touch,pixelRatio,
  post:!low&&!!floatTargets,
  bloom:!low&&!!floatTargets,
  grade:!low&&!!floatTargets,
  samples:low?0:touch?2:4,
  bloomScale:touch?.35:.5,
  shadowSize:shadowSizeFor(low,touch)
 };
}

// Bloom is applied to the linear HDR buffer before exposure, so thresholds sit above diffuse white (about 1.0 under
// full sun) and only lamps, the sun and specular glints bloom. Touch devices get a lighter touch.
export function bloomFor(mode,touch=false){
 const b=(LIGHTING[mode]||LIGHTING.day).bloom;
 return {strength:b.strength*(touch?.75:1),radius:b.radius,threshold:b.threshold};
}
export const gradeFor=mode=>(LIGHTING[mode]||LIGHTING.day).grade;

// Light-space half-extent that comfortably contains an aircraft whatever its heading: its half-diagonal plus margin.
export function shadowExtent(dimensions){
 const length=Number(dimensions?.x)||70,span=Number(dimensions?.z)||65;
 return Math.min(150,Math.max(70,Math.hypot(length,span)/2*1.3+8));
}
