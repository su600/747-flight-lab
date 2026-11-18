import assert from 'node:assert/strict';
import * as T from 'three';
import {Aircraft} from '../src/aircraft.js';
import {TwinAircraft} from '../src/twin-aircraft.js';
import {createVisualControls,updateVisualControls} from '../src/aircraft-motion.js';

const target=Object.freeze({gear:0,flaps:30,spoiler:1,reverse:1,door:1,engine:1,aileron:1,elevator:-1,rudder:.5});
const visual=createVisualControls({gear:1,flaps:0,engine:0});
updateVisualControls(visual,target,.05);
for(const [key,end] of [['gear',0],['flaps',30],['spoiler',1],['reverse',1],['door',1],['engine',1]]){
 assert.notEqual(visual[key],end,`${key} eases rather than snapping`);
}
assert.deepEqual(target,{gear:0,flaps:30,spoiler:1,reverse:1,door:1,engine:1,aileron:1,elevator:-1,rudder:.5},'visual damping never changes simulator control contracts');
for(let i=0;i<300;i++)updateVisualControls(visual,target,1/60);
assert(Math.abs(visual.gear)<1e-4&&Math.abs(visual.flaps-30)<1e-3&&visual.engine>.999,'moving parts settle to their requested poses');
updateVisualControls(visual,{...target,gear:1,flaps:0,engine:0},0);
assert.equal(visual.gear,1);assert.equal(visual.flaps,0);assert.equal(visual.engine,0);

const aircraft=new Aircraft();
aircraft.update({gear:0,flaps:30,spoiler:1,reverse:1,door:1,engine:1},.05);
assert(aircraft.visualControls.gear>0&&aircraft.visualControls.gear<1);
assert(aircraft.visualControls.flaps>0&&aircraft.visualControls.flaps<30);
aircraft.update({gear:0,flaps:30,spoiler:1,reverse:1,door:1,engine:1},0);
assert.equal(aircraft.visualControls.gear,0);assert.equal(aircraft.visualControls.flaps,30);

const twin=new TwinAircraft('b777'),fan=new T.Group(),flap=new T.Group();
twin.parts.fans.push(fan);twin.parts.flaps.push(flap);
twin.update({gear:1,flaps:30,engine:1},1/60);
assert(fan.rotation.x>0&&fan.rotation.x<18*1.0,'fan uses the damped visual engine indication');
assert(flap.rotation.z<0&&Math.abs(flap.rotation.z)<Math.PI/6,'flap follows through a damped pose');
console.log('Aircraft visual motion passed: controls remain untouched, mechanisms damp, zero-time initialization stays exact and exposed fans spin from visual N1.');
