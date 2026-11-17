// Run: node tests/cockpit-wipers.mjs.
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFileSync} from 'node:fs';
import {createCockpitWipers} from '../src/cockpit-wipers.js';
import {COCKPIT_WIPER_MAX_ANGLE,cockpitWiperSweepAngle} from '../src/cockpit-view.js';
import {WINDSHIELD_PANES,WIPER_LENGTH,windshieldBasis,windshieldPoint,windshieldWiperCoordinates,createCockpitWindshield,wiperSweepRange} from '../src/cockpit-windshield.js';
import {Weather} from '../src/weather.js';

const cockpitRoot=new T.Group(),scale=new T.Vector3(.99,.97,.98);
const wipers=createCockpitWipers(cockpitRoot,scale);
assert.equal(wipers.root.parent,cockpitRoot);
const meshes=[];wipers.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
assert.equal(meshes.length,6,'two arms, two blades and two pivots are actual 3D meshes');
assert(meshes.every(m=>m.geometry&&m.material));
wipers.update({wipers:false,time:0});
assert.equal(Math.abs(wipers.left.rotation.x),0);assert.equal(Math.abs(wipers.right.rotation.x),0);
assert(wipers.left.parent.position.z<wipers.right.parent.position.z);
const angles=[];for(let t=0;t<2*Math.PI;t+=.05){wipers.update({wipers:true,time:t});angles.push(wipers.left.rotation.x);}
assert(Math.max(...angles.map(Math.abs))<=COCKPIT_WIPER_MAX_ANGLE*Math.PI/180+1e-9);
wipers.update({wipers:true,time:Math.PI/6});
const a=cockpitWiperSweepAngle(Math.PI/6)*Math.PI/180;
assert(Math.abs(a-46*Math.PI/180)<1e-10);
assert(Math.abs(wipers.left.rotation.x+a)<1e-10);assert(Math.abs(wipers.right.rotation.x-a)<1e-10);
wipers.update({wipers:false,time:Math.PI/6});
assert.equal(Math.abs(wipers.left.rotation.x),0);assert.equal(Math.abs(wipers.right.rotation.x),0);

// Guard the measured pane corners against changes to the underlying model.
const fuselage=readFileSync(new URL('../assets/aircraft/747-400_fuselage.ac',import.meta.url),'utf8');
for(const pane of WINDSHIELD_PANES)for(const p of [pane.bottomOuter,pane.bottomInner,pane.topOuter,pane.topInner]){
 assert(fuselage.includes(`${-p.x} ${p.y} ${-p.z}`),`measured corner ${p.toArray()} exists in the source model`);
}
// Check the actual triangular pane surfaces, including every edge and corner.
for(const pane of WINDSHIELD_PANES)for(let i=0;i<=40;i++)for(let j=0;j<=40;j++){
 const p=windshieldPoint(pane,i/40,j/40),{inboard,up}=windshieldWiperCoordinates(pane,p);
 if(Math.hypot(inboard,up)<1e-8)continue;
 const angle=Math.atan2(up,inboard);
 assert(angle>=-1e-8&&angle<=COCKPIT_WIPER_MAX_ANGLE*Math.PI/180+1e-8,`pane ${pane.side} point ${i},${j} angle ${angle}`);
 assert(Math.hypot(inboard,up)<=WIPER_LENGTH,`pane ${pane.side} point ${i},${j} beyond blade tip`);
}
// Verify the rendered mesh endpoints follow the same geometric sweep used above.
for(const degrees of [0,46,92]){
 const t=Math.acos(1-2*degrees/COCKPIT_WIPER_MAX_ANGLE)/3;wipers.update({wipers:true,time:t});cockpitRoot.updateMatrixWorld(true);
 for(const [index,pivot] of [wipers.left,wipers.right].entries()){
  const pane=WINDSHIELD_PANES[index],basis=windshieldBasis(pane),blade=pivot.getObjectByName(`wiper-blade-${index?'right':'left'}`);
  assert(Math.abs(blade.geometry.parameters.height-WIPER_LENGTH)<1e-10);
  const tip=wipers.root.worldToLocal(blade.localToWorld(new T.Vector3(0,WIPER_LENGTH/2,0)));
  const radians=degrees*Math.PI/180,expected=pane.bottomOuter.clone().addScaledVector(basis.x,.025).addScaledVector(basis.y,WIPER_LENGTH*Math.sin(radians)).addScaledVector(basis.z,-pane.side*WIPER_LENGTH*Math.cos(radians));
  assert(tip.distanceTo(expected)<1e-9,`rendered blade tip matches sweep at ${degrees} degrees`);
 }
}
const [lo,hi]=wiperSweepRange(.9,1.2);assert(hi>91*Math.PI/180&&lo>0,'frame spanning the upper turnaround wipes to the limit');
const full=wiperSweepRange(0,4);assert.equal(full[0],0);assert(Math.abs(full[1]-COCKPIT_WIPER_MAX_ANGLE*Math.PI/180)<1e-10);

// Stub canvas; test the real weather update path and retain individual UVs across modes.
const context={clearRect(){},beginPath(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){}};
const rain=createCockpitWindshield(cockpitRoot,scale,()=>({getContext:()=>context}));
const weather=Object.create(Weather.prototype);
Object.assign(weather,{rain:'heavy',low:false,rainCount:0,rainPositions:new Float32Array(),rainLines:{visible:false,geometry:{setDrawRange(){},attributes:{position:{}}},position:new T.Vector3()},windshield:rain,windHud:{hidden:true}});
const state={time:0,wipers:false,windSpeed:0,heading:0},camera=new T.PerspectiveCamera();
rain.drops.push({pane:0,u:.4,v:.7,r:2},{pane:1,u:.2,v:.3,r:2});
const before=structuredClone(rain.drops);
function worldPositions(){cockpitRoot.updateMatrixWorld(true);return rain.drops.map(d=>rain.root.localToWorld(windshieldPoint(WINDSHIELD_PANES[d.pane],d.u,d.v)).toArray());}
cockpitRoot.position.set(100,50,-20);cockpitRoot.rotation.set(.1,.3,-.2);
weather.update(0,camera,'cockpit',state);const positionBefore=worldPositions();assert(rain.root.visible);
weather.update(0,camera,'orbit',state);assert(!rain.root.visible);assert.deepEqual(rain.drops,before);assert.deepEqual(worldPositions(),positionBefore);
weather.update(0,camera,'chase',state);assert.deepEqual(worldPositions(),positionBefore);
weather.update(0,camera,'cockpit',state);assert(rain.root.visible);assert.deepEqual(rain.drops,before);assert.deepEqual(worldPositions(),positionBefore);
// Wiping uses the same aircraft-local geometry in exterior and cockpit modes.
state.wipers=true;weather.update(0,camera,'orbit',state);state.time=Math.PI/3;weather.update(0,camera,'orbit',state);assert.equal(rain.drops.length,0,'full sweep clears both panes even outside cockpit view');
console.log('Cockpit wipers passed: shared 3D blades, full forward-pane coverage and aircraft-fixed rain across camera modes.');
