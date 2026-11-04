import assert from 'node:assert/strict';
import * as T from 'three';
import {World} from '../src/world.js';

const context={beginPath(){},roundRect(){},fill(){},fillText(){}};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};

const world=Object.create(World.prototype);
world.scene=new T.Scene();
world.buildServiceVehicles(new T.MeshStandardMaterial({color:'#293e45'}));

const aircraft={x:-850,z:-300};
const routeDistance=(route,point)=>Math.min(...route.map(([x,z],i)=>{
 const [nextX,nextZ]=route[(i+1)%route.length],dx=nextX-x,dz=nextZ-z;
 const t=Math.max(0,Math.min(1,((point.x-x)*dx+(point.z-z)*dz)/(dx*dx+dz*dz)));
 return Math.hypot(point.x-x-dx*t,point.z-z-dz*t);
}));

assert.deepEqual([...new Set(world.vehicles.map(vehicle=>vehicle.task))].sort(),['baggage','bus','fuel','tug']);
assert.equal(world.vehicles.length,5,'airport service fleet includes two shuttles');
for(const vehicle of world.vehicles){
 assert(routeDistance(vehicle.route,aircraft)>=40,`${vehicle.task} route clears the parked aircraft`);
}

const tug=world.vehicles.find(vehicle=>vehicle.task==='tug');
tug.wait=0;
const tugStart=tug.root.position.clone();
world.updateServiceVehicles(.1);
assert(tug.root.position.distanceTo(tugStart)>0,'tug follows its service route');
assert(tug.wheels.some(wheel=>wheel.rotation.y!==0),'vehicle wheels rotate while moving');

const shuttle=world.vehicles.find(vehicle=>vehicle.task==='bus');
const [stopX,stopZ,dwell]=shuttle.route[1];
shuttle.wait=0;shuttle.next=1;shuttle.root.position.set(stopX-.1,0,stopZ);
world.updateServiceVehicles(.1);
assert.equal(shuttle.root.position.x,stopX,'shuttle reaches its stop');
assert.equal(shuttle.wait,dwell,'shuttle waits at passenger stops');
const stoppedAt=shuttle.root.position.clone();
world.updateServiceVehicles(.5);
assert(shuttle.root.position.distanceTo(stoppedAt)<1e-8,'shuttle remains stopped during dwell');

console.log('Airport service vehicle models, route movement, wheel rotation, and stop dwell passed.');
