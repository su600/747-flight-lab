// Camera gesture regression checks, independent of WebGL. Run: npm run check:camera
import assert from 'node:assert/strict';
import {createCameraGestures} from '../src/camera-gestures.js';
import {setCockpitAirframeVisibility,cameraModeForWiperToggle,cockpitWiperSweepAngle} from '../src/cockpit-view.js';
class FakeCanvas{
 constructor(){this.listeners=new Map();this.captured=new Set();this.clientHeight=800;}
 addEventListener(type,fn){this.listeners.set(type,fn);}
 removeEventListener(type,fn){if(this.listeners.get(type)===fn)this.listeners.delete(type);}
 setPointerCapture(id){this.captured.add(id);}
 hasPointerCapture(id){return this.captured.has(id);}
 releasePointerCapture(id){this.captured.delete(id);}
 emit(type,props={}){const event={pointerType:'mouse',pointerId:1,button:0,clientX:0,clientY:0,deltaY:0,deltaMode:0,prevented:false,preventDefault(){this.prevented=true;},...props};this.listeners.get(type)?.(event);return event;}
}
const canvas=new FakeCanvas(),events=[];
const gesture=createCameraGestures(canvas,{onStart:kind=>events.push(['start',kind]),onRotate:(x,y)=>events.push(['rotate',x,y]),onPan:(x,y)=>events.push(['pan',x,y]),onZoom:factor=>events.push(['zoom',factor])});
canvas.emit('pointerdown',{clientX:10,clientY:20});canvas.emit('pointermove',{clientX:25,clientY:10});
assert.deepEqual(events,[['start','rotate'],['rotate',15,-10]]);
canvas.emit('pointerup');canvas.emit('pointermove',{clientX:90});assert.equal(events.length,2,'released pointer must stop');
canvas.emit('pointerdown',{button:2,clientX:3,clientY:4});canvas.emit('pointermove',{clientX:13,clientY:9});
assert.deepEqual(events.slice(-2),[['start','pan'],['pan',10,5]]);assert(canvas.emit('contextmenu').prevented);
canvas.emit('pointercancel');assert.equal(canvas.captured.size,0);
events.length=0;
canvas.emit('pointerdown',{pointerType:'touch',pointerId:11,clientX:100,clientY:100});
canvas.emit('pointermove',{pointerType:'touch',pointerId:11,clientX:110,clientY:105});
canvas.emit('pointerdown',{pointerType:'touch',pointerId:12,clientX:210,clientY:105});
canvas.emit('pointerdown',{pointerType:'touch',pointerId:13,clientX:300,clientY:100}); // extra finger ignored
canvas.emit('pointermove',{pointerType:'touch',pointerId:12,clientX:250,clientY:105});
assert.deepEqual(events.slice(0,2),[['start','rotate'],['rotate',10,5]]);
assert(Math.abs(events[2][1]-100/140)<1e-10,'pinch out must zoom in');assert.deepEqual(events[3],['pan',20,0]);
const n=events.length;canvas.emit('pointermove',{pointerType:'touch',pointerId:13,clientX:500});assert.equal(events.length,n,'third pointer ignored');
canvas.emit('pointerup',{pointerType:'touch',pointerId:12});canvas.emit('pointermove',{pointerType:'touch',pointerId:11,clientX:115,clientY:107});
assert.deepEqual(events.at(-1),['rotate',5,2],'two-to-one transition must not jump');
gesture.cancel();const count=events.length;canvas.emit('pointermove',{pointerType:'touch',pointerId:11,clientX:400});assert.equal(events.length,count);assert.equal(canvas.captured.size,0);
const wheel=canvas.emit('wheel',{deltaY:2,deltaMode:1});assert(wheel.prevented);assert.deepEqual(events.at(-2),['start','zoom']);assert(Math.abs(events.at(-1)[1]-Math.exp(.032))<1e-10);
gesture.dispose();assert.equal(canvas.listeners.size,0);
console.log('Camera gestures passed: rotate, pan, wheel, pinch, pointer transitions, cancellation.');

const fuselage={visible:true},wing={visible:true},gear={visible:true},engine={visible:true};
const b747={type:'b747',root:{visible:false},native:{children:[fuselage,wing,gear,engine]}};
setCockpitAirframeVisibility(b747,'cockpit');
assert.equal(b747.root.visible,true,'the airframe remains available in cockpit mode');
assert.equal(fuselage.visible,false,'the fuselage shell is cut away around the first-person camera');
assert([wing,gear,engine].every(part=>part.visible),'wings, gear and engines remain visible through side windows');
setCockpitAirframeVisibility(b747,'orbit');
assert([fuselage,wing,gear,engine].every(part=>part.visible),'the full B747 is restored outside cockpit mode');
const a380={type:'a380',root:{visible:true},native:{children:[]}};
setCockpitAirframeVisibility(a380,'cockpit');assert.equal(a380.root.visible,false,'unmatched external interiors stay hidden');
assert.equal(cameraModeForWiperToggle('orbit',true),'cockpit','turning wipers on opens the cockpit view');
assert.equal(cameraModeForWiperToggle('cockpit',false),'cockpit','turning wipers off preserves cockpit view');
assert.equal(cockpitWiperSweepAngle(0),0);assert(Math.abs(cockpitWiperSweepAngle(Math.PI/6)-26)<1e-10,'wiper sweep is driven by simulation time');
console.log('Cockpit view passed: exterior wing groups persist, fuselage cutaway avoids occlusion, wiper view/sweep state is correct.');

