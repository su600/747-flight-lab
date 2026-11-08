// CPU regression for the subtle cyan landing-tire smoke tint.
// Run: node tests/airflow-smoke.mjs.
import assert from 'node:assert/strict';
import * as T from 'three';
import {Airflow,TYRE_SMOKE_RGB} from '../src/airflow.js';

const gradient={addColorStop(){}};
const context={createRadialGradient(){return gradient;},fillRect(){},set fillStyle(_value){}};
globalThis.document={createElement(type){assert.equal(type,'canvas');return {width:0,height:0,getContext:()=>context};}};

const plane={root:new T.Group(),native:{scale:new T.Vector3(1,1,1)},contact:5,wingtipPoints:[]};
const airflow=new Airflow(new T.Scene(),plane);
const streakVersion=airflow.streaks.geometry.attributes.position.version;
assert.deepEqual(airflow.smoke.rgb,[.84,.93,.98]);
assert(airflow.smoke.rgb[0]<airflow.smoke.rgb[1]&&airflow.smoke.rgb[1]<airflow.smoke.rgb[2],'tire smoke should be lightly cyan, not neutral white');
assert(airflow.smoke.rgb[2]-airflow.smoke.rgb[0]<.16,'tire smoke tint remains subtle');
for(const [time,intensity] of [['day',1],['dusk',.82],['night',.32]]){
 airflow.update({paused:true,mode:'inspect',onGround:true,speed:0,heading:90,gamma:0,cl:0,engineN1:.22,altitude:0,touchdown:null},0,'orbit',time);
 const color=airflow.smoke.points.material.color;
 assert(Math.abs(color.r-intensity)<1e-6&&Math.abs(color.g-intensity)<1e-6&&Math.abs(color.b-intensity)<1e-6,`${time}: brightness modifier remains neutral`);
 for(let channel=0;channel<3;channel++)assert(Math.abs(airflow.smoke.col[channel]-TYRE_SMOKE_RGB[channel])<1e-6,`${time}: vertex tint keeps its cyan hue`);
}
assert.equal(airflow.streaks.geometry.attributes.position.version,streakVersion,'hidden wind streaks do not upload unchanged buffers');
const smoke=airflow.smoke,posAttribute=smoke.points.geometry.attributes.position,colorAttribute=smoke.points.geometry.attributes.color;
smoke.emit(new T.Vector3(1,2,3),new T.Vector3(1,0,0),.1,1);const positionVersion=posAttribute.version,colorVersion=colorAttribute.version;
smoke.update(0);assert.equal(posAttribute.version,positionVersion,'paused particles do not dirty position buffers');assert.equal(colorAttribute.version,colorVersion,'paused particles do not dirty color buffers');
smoke.update(.05);assert.equal(smoke.activeCount,1);assert(colorAttribute.array[3]>0,'live particle fades in');
smoke.update(.1);assert.equal(smoke.activeCount,0);assert.equal(smoke.alive,0);assert.equal(colorAttribute.array[3],0,'expired particle leaves the active set');
console.log('Landing tire smoke passed: subtle cyan hue is preserved; particle pools update only active, advancing particles.');
