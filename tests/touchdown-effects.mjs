import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../src/flight.js';
import {Airflow,TYRE_SMOKE_RGB} from '../src/airflow.js';
import {audioTargets} from '../src/audio.js';

const gradient={addColorStop(){}};
globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>gradient,fillRect(){},set fillStyle(v){}})})};
const plane={root:new T.Group(),native:{scale:new T.Vector3(1,1,1)},contact:5,wingtipPoints:[]};
const airflow=new Airflow(new T.Scene(),plane);
const sim=new Flight();sim.reset('free');Object.assign(sim,{x:-1200,z:0,heading:90,gear:1,speed:70,pitch:3,bank:0,throttle:0});
sim.touchdownOrCrash(1);assert(!sim.failed&&sim.onGround);
assert.equal(sim.spoilerTarget,1);assert.equal(sim.reverseTarget,0,'manual reverse remains manual');
airflow.update(sim,.05,'orbit','day');
const smoke=airflow.smoke,n=smoke.activeCount;
assert.equal(n,airflow.mainGear.length*16,'one puff per main bogie');
const size=smoke.sizes[0],x=smoke.pos[0];
airflow.update(sim,.4,'orbit','day');assert.equal(smoke.activeCount,n,'rolling does not emit again');
assert(smoke.pos[0]<x,'smoke drifts aft');assert(smoke.sizes[0]>size,'smoke expands');
assert(TYRE_SMOKE_RGB[0]<TYRE_SMOKE_RGB[1]&&TYRE_SMOKE_RGB[1]<TYRE_SMOKE_RGB[2]);
assert.equal(smoke.points.material.depthWrite,false);assert(smoke.points.material.transparent);
sim.onGround=false;sim.touchdownOrCrash(1);airflow.update(sim,.05,'orbit','day');assert.equal(smoke.activeCount,n*2,'second contact after bounce emits again');
airflow.setQuality(true);sim.onGround=false;sim.touchdownOrCrash(1);airflow.update(sim,.05,'orbit','day');assert.equal(smoke.activeCount,n*2+airflow.mainGear.length*6,'low quality reduces particles');
for(let i=0;i<35;i++)airflow.update(sim,.1,'orbit','day');assert.equal(smoke.activeCount,0,'puffs expire within three seconds');
sim.control('reverse',1);sim.control('throttle',.5);sim.step(.01);assert.equal(sim.spoilerTarget,1,'reverse thrust is not a go-around');
sim.control('reverse',0);sim.reverse=0;sim.step(.01);assert.equal(sim.spoilerTarget,0,'go-around retracts automatic spoilers');
const high=new Flight();high.reset('free');Object.assign(high,{x:-1200,z:0,gear:1,speed:70,pitch:3,bank:0,throttle:.6});high.touchdownOrCrash(1);assert.equal(high.spoilerTarget,0,'thrust above idle prevents manual auto deployment');
const stop=new Flight();stop.reset('free');Object.assign(stop,{x:-1200,z:0,gear:1,speed:70,pitch:3,bank:0,throttle:0});stop.touchdownOrCrash(1);stop.speed=.1;stop.step(.01);assert.equal(stop.spoilerTarget,0,'automatic spoilers retract at stop');
const land=new Flight();land.reset('land');Object.assign(land,{x:-1200,z:0,gear:1,speed:70,pitch:3,bank:0});land.touchdownOrCrash(1);assert.equal(land.reverseTarget,1);assert.equal(land.spoilerTarget,1);land.speed=30;land.landingGuidance();assert.equal(land.reverseTarget,0,'reverse stows below 60 kt');land.speed=1;land.landingGuidance();assert.equal(land.spoilerTarget,0);
const shuttle=new Flight();shuttle.unpowered=true;shuttle.chuteAvailable=true;shuttle.reset('land');Object.assign(shuttle,{x:-1200,z:0,gear:1,speed:70,pitch:3,bank:0});shuttle.touchdownOrCrash(1);assert.equal(shuttle.reverseTarget,0);assert(shuttle.control('reverse',1));assert.equal(shuttle.reverseTarget,0);shuttle.landingGuidance();assert.equal(shuttle.chuteTarget,1);assert.equal(shuttle.spoilerTarget,1,'existing orbiter speed brake is retained');shuttle.speed=10;shuttle.chute=1;shuttle.landingGuidance();assert.equal(shuttle.chuteTarget,0);assert(shuttle.chuteJettisoned);
for(const type of ['b747','a380','a330','b777']){
 const normal=audioTargets(type,{engine:.7,speed:70,reverse:0});const reverse=audioTargets(type,{engine:.7,speed:70,reverse:1});
 assert(reverse.roar.gain>normal.roar.gain&&reverse.roar.hz<normal.roar.hz);assert(audioTargets(type,{engine:.7,speed:70},1).wind.gain>normal.wind.gain);
}
assert.deepEqual(audioTargets('shuttle',{engine:1,speed:70,reverse:1},1),audioTargets('shuttle',{engine:1,speed:70,reverse:0},0));
const crash=new Flight();crash.reset('free');Object.assign(crash,{x:-1200,z:0,gear:0,speed:70,pitch:3,bank:0});crash.touchdownOrCrash(1);const before=smoke.activeCount;airflow.update(crash,.01,'orbit','day');assert.equal(smoke.activeCount,before,'no main-wheel puff on gear-up crash');
console.log('Touchdown effects passed: one expanding puff per contact, automatic systems and airframe sound.');
