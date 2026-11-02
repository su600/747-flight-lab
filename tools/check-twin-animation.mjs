import assert from 'node:assert/strict';
import * as T from 'three';
import {TwinAircraft} from '../src/twin-aircraft.js';
import {Flight} from '../src/flight.js';

const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const world=(plane,object,point=new T.Vector3())=>{
 plane.root.updateMatrixWorld(true);return object.localToWorld(point.clone());
};

for(const type of ['a330','b777']){
 const plane=await new TwinAircraft(type).load();
 const sim=new Flight();
 assert.equal(plane.parts.gear.length,3);
 assert.equal(plane.parts.wheels.length,type==='b777'?14:10);
 assert.equal(plane.parts.elevators.length,2);
 assert.equal(plane.parts.spoilers.length,4);
 assert.equal(plane.parts.reversers.length,2);
 assert.equal(plane.parts.doors.length,1);
 // Fully extended wheel bottoms agree with the placement used by main.js.
 for(const wheel of plane.parts.wheels){
  const box=new T.Box3().setFromObject(wheel);near(box.min.y,-plane.contact,1e-5);
 }
 near(plane.contact,5.68,1e-5);
 // Inspect mode permits cycling gear on the ground; use the actual Flight state.
 assert.equal(sim.control('gear',0),'');
 const nose=plane.parts.gear[0],main=plane.parts.gear[2];
 const down=world(plane,plane.parts.wheels[0]);
 for(let i=0;i<35;i++)sim.step(.1,{});
 plane.update(sim,.1);
 near(sim.gear,.5,1e-6);
 near(nose.rotation.z,Math.PI/4);near(main.rotation.x,35*Math.PI/180);
 assert.ok(plane.parts.gear.every(g=>g.visible));
 assert.ok(world(plane,plane.parts.wheels[0]).distanceTo(down)>1);
 for(let i=0;i<35;i++)sim.step(.1,{});
 plane.update(sim,.1);
 assert.ok(sim.gear<1e-6);
 // Continuous folding right down to stow, not a threshold disappearance.
 sim.gear=.001;plane.update(sim,0);assert.ok(plane.parts.gear.every(g=>g.visible));
 sim.gear=0;plane.update(sim,0);assert.ok(plane.parts.gear.every(g=>g.visible));
 // Every gear vertex, including the struts, is buried in the opaque hull at stow.
 plane.root.updateMatrixWorld(true);
 for(const gear of plane.parts.gear)gear.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const positions=mesh.geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
   const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
   assert.ok(Math.hypot(p.y,p.z)<plane.spec.radius*.97,`exposed stowed gear: ${p.toArray()}`);
  }
 });
 assert.equal(sim.control('gear',1),'');
 for(let i=0;i<70;i++)sim.step(.1,{});
 plane.update(sim,0);near(sim.gear,1);near(nose.rotation.z,0);near(main.rotation.x,0);
 const wheelAngle=plane.parts.wheels[0].rotation.z;
 sim.speed=10;sim.onGround=true;plane.update(sim,.1);
 near(plane.parts.wheels[0].rotation.z,wheelAngle-10*.1/.68);
 sim.onGround=false;plane.update(sim,.1);
 near(plane.parts.wheels[0].rotation.z,wheelAngle-10*.1/.68);

 // Drive each surface through Flight's controls/step rather than invented fields.
 sim.reset('inspect');
 assert.equal(sim.control('spoiler',1),'');
 assert.equal(sim.control('reverse',1),'');
 assert.equal(sim.control('door',1),'');
 const closedSleeve=plane.parts.reversers[0].userData.closedX;
 const elevatorPoints=plane.parts.elevators.map(e=>world(plane,e,new T.Vector3(-plane.spec.length*.018,0,0)));
 const spoilerPoints=plane.parts.spoilers.map(p=>world(plane,p,new T.Vector3(-2.4,0,0)));
 const door=plane.parts.doors[0],r=plane.spec.radius+.03;
 const normal=door.children[0].geometry.attributes.normal;
 assert.ok(normal.getZ(0)>0,'closed door faces outward');
 const bottom=new T.Vector3(0,r*Math.sin(-.72)-door.position.y,r*Math.cos(-.72)-door.position.z);
 const closed=world(plane,door,bottom);
 for(let i=0;i<25;i++)sim.step(.1,{pitch:1});
 plane.update(sim,0);
 near(sim.elevator,-1);near(sim.spoiler,1);near(sim.reverse,1);near(sim.door,.55,1e-6);
 for(const [i,e] of plane.parts.elevators.entries()){
  near(e.quaternion.angleTo(new T.Quaternion()),.35);
  assert.ok(world(plane,e,new T.Vector3(-plane.spec.length*.018,0,0)).y>elevatorPoints[i].y);
 }
 for(const [i,p] of plane.parts.spoilers.entries()){
  near(p.rotation.z,-.8);assert.ok(world(plane,p,new T.Vector3(-2.4,0,0)).y>spoilerPoints[i].y+1);
 }
 for(const sleeve of plane.parts.reversers)near(sleeve.position.x,closedSleeve-.85);
 near(door.rotation.x,-1.25*sim.door);
 assert.ok(world(plane,door,bottom).z>closed.z+.5,'door opens outward');
 // Returning commands smoothly returns all surfaces to neutral.
 sim.control('spoiler',0);sim.control('reverse',0);sim.control('door',0);
 for(let i=0;i<60;i++)sim.step(.1,{});
 plane.update(sim,0);
 near(sim.door,0);near(door.rotation.x,0);near(plane.parts.spoilers[0].rotation.z,0);
 near(plane.parts.reversers[0].position.x,closedSleeve);
 near(plane.parts.elevators[0].quaternion.angleTo(new T.Quaternion()),0);
 // Initial/default partial state must not produce NaNs.
 plane.update({},0);
 plane.root.traverse(o=>assert.ok([...o.position.toArray(),...o.quaternion.toArray()].every(Number.isFinite),o.name));
 console.log(`${type}: gear, contact, wheels and four animated systems OK`);
}
