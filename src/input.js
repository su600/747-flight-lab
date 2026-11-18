import {clamp,THRUST_DETENTS} from './flight.js';
import {createCameraGestures} from './camera-gestures.js';
import {$,all,setAnimatedText} from './ui/dom.js';

export function createInput({sim,renderer,keys,touch,surface,manualControl,notify,toggleGear,flapStep,setCam,beginCameraGesture,rotateCamera,panCamera,zoomCamera,cancelCameraGestures,setCancelCameraGestures}){
// ---- Thrust lever ---------------------------------------------------------
const throttleEl=$('#throttle');
const DETENT_SNAP=[0,.66,.84,1];
function detentName(t){if(t<.35)return '慢车';if(t<.75)return '巡航';if(t<.92)return '爬升';return '起飞';}
function setThrottle(value,snap=false){
 let v=clamp(value,0,1);
 if(snap){const nearest=DETENT_SNAP.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);if(Math.abs(nearest-v)<.055)v=nearest;}
 if(Math.abs(sim.throttle-v)>.001){manualControl();notify(sim.control('throttle',v));}
 syncThrottleUI();
}
function syncThrottleUI(){
 const value=clamp(sim.throttle,0,1),pct=Math.round(value*100);
 const det=THRUST_DETENTS.find(d=>Math.abs(d.value-value)<.05),text=(det?det.en+' ':'')+pct+'%';
 if(throttleEl.dataset.value!==String(value)){
  throttleEl.dataset.value=String(value);
  throttleEl.style.setProperty('--p',String(value));
 }
 if(throttleEl.getAttribute('aria-valuenow')!==String(pct))throttleEl.setAttribute('aria-valuenow',String(pct));
 const valueText=detentName(value)+' '+pct+'%';
 if(throttleEl.getAttribute('aria-valuetext')!==valueText)throttleEl.setAttribute('aria-valuetext',valueText);
 setAnimatedText($('#throttleValue'),text,240);
}
function throttleValueFromPointer(event){
 const rect=throttleEl.getBoundingClientRect();
 return clamp(1-(event.clientY-rect.top)/rect.height,0,1);
}
throttleEl.addEventListener('pointerdown',e=>{
 e.preventDefault();throttleEl.setPointerCapture(e.pointerId);throttleEl.classList.add('dragging');
 setThrottle(throttleValueFromPointer(e));
});
throttleEl.addEventListener('pointermove',e=>{
 if(!throttleEl.hasPointerCapture(e.pointerId))return;
 setThrottle(throttleValueFromPointer(e));
});
const endThrottleDrag=e=>{
 if(throttleEl.hasPointerCapture?.(e.pointerId))throttleEl.releasePointerCapture(e.pointerId);
 throttleEl.classList.remove('dragging');
 setThrottle(sim.throttle,true);
 // Give the arrow keys back to the aircraft after the lever is released.
 throttleEl.blur();
};
['pointerup','pointercancel','lostpointercapture'].forEach(type=>throttleEl.addEventListener(type,endThrottleDrag));
throttleEl.addEventListener('keydown',e=>{
 const step=e.shiftKey?.02:.04;
 if(e.code==='ArrowUp'||e.code==='PageUp'){e.preventDefault();setThrottle(sim.throttle+(e.code==='PageUp'?.2:step));}
 else if(e.code==='ArrowDown'||e.code==='PageDown'){e.preventDefault();setThrottle(sim.throttle-(e.code==='PageDown'?.2:step));}
 else if(e.code==='Home'){e.preventDefault();setThrottle(0);}
 else if(e.code==='End'){e.preventDefault();setThrottle(1);}
});

function bindInput(){
 // Space/Enter on a focused livery button must retain native button activation,
 // rather than being intercepted by the simulator's pause shortcut.
 const ignore=()=>document.activeElement?.matches('input,select,textarea,[role=slider],.livery-card')||!!document.querySelector('dialog[open]');
 addEventListener('keydown',e=>{if(ignore())return;const cameraKeys={KeyI:[0,-24],KeyK:[0,24],KeyJ:[-24,0],KeyL:[24,0]};if(cameraKeys[e.code]){e.preventDefault();beginCameraGesture('rotate');rotateCamera(...cameraKeys[e.code]);return;}if(e.code==='BracketLeft'||e.code==='BracketRight'){e.preventDefault();beginCameraGesture('zoom');zoomCamera(e.code==='BracketLeft'?.9:1.1);return;}if(e.code==='KeyR'){if(!e.repeat)setCam('orbit');return;}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyG')toggleGear();if(e.code==='KeyF')flapStep();if(e.code==='KeyP')$('#parkBrake').click();if(e.code==='KeyT')$('#reverse').click();if(e.code==='KeyH')manualControl();if(e.code==='Space')sim.paused=!sim.paused;if(/^Digit[1-5]$/.test(e.code))setCam(['orbit','chase','cockpit','wing','tower'][+e.code.at(-1)-1]);});
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();touch.clear();cancelCameraGestures();});
 document.addEventListener('visibilitychange',()=>{keys.clear();touch.clear();cancelCameraGestures();});
 all('[data-hold]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.add(b.dataset.hold);b.classList.add('active');};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>{touch.delete(b.dataset.hold);b.classList.remove('active');};});
 const gestures=createCameraGestures(renderer.domElement,{onStart:beginCameraGesture,onRotate:rotateCamera,onPan:panCamera,onZoom:zoomCamera});
 setCancelCameraGestures(()=>gestures.cancel());
}
function readInput(dt){const pressed=(...a)=>a.some(k=>keys.has(k));const pitch=clamp((pressed('ArrowDown','KeyS')||touch.has('down')?1:0)-(pressed('ArrowUp','KeyW')||touch.has('up')?1:0)+surface.pitch,-1,1),roll=clamp((pressed('ArrowRight','KeyD')||touch.has('right')?1:0)-(pressed('ArrowLeft','KeyA')||touch.has('left')?1:0)+surface.roll,-1,1),yaw=clamp((pressed('KeyE')?1:0)-(pressed('KeyQ')?1:0)+surface.yaw,-1,1);if(pitch||roll||yaw)manualControl();if(pressed('ShiftLeft','ShiftRight','Equal')){manualControl();notify(sim.control('throttle',clamp(sim.throttle+dt*.3,0,1)));}if(pressed('ControlLeft','ControlRight','Minus')){manualControl();notify(sim.control('throttle',clamp(sim.throttle-dt*.3,0,1)));}return{pitch,roll,yaw,brake:pressed('KeyB')||touch.has('brake')?1:0};}
return {setThrottle,syncThrottleUI,bindInput,readInput};
}
