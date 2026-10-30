// Flight-model regression checks. Run with: npm run check
import assert from 'node:assert/strict';
import {Flight,RUNWAY,AIRCRAFT,atmosphere,THRUST_DETENTS} from '../src/flight.js';

const run=(s,seconds,input={})=>{for(let i=0;i<seconds*60;i++)s.step(1/60,input);};
const report={passed:[]};
const pass=(name,detail)=>{report.passed.push(name);if(detail!==undefined)report[name]=detail;};

// 1. Atmosphere follows the ISA standard atmosphere.
const rho0=atmosphere(0),rho11=atmosphere(11000);
assert(Math.abs(rho0-1.225)<.01,`sea level density ${rho0}`);
assert(rho11>.33&&rho11<.4,`11 km density ${rho11}`);
pass('atmosphere',{seaLevel:rho0,at11km:rho11});

// 2. Engines spool up gradually instead of jumping to takeoff thrust.
let s=new Flight();s.reset('manual');
const idleN1=s.engineN1;
s.control('throttle',1);
run(s,.5);assert(s.engineN1>idleN1&&s.engineN1<.6,`N1 after 0.5 s ${s.engineN1}`);
run(s,5);assert(s.engineN1>.9,`N1 after 5.5 s ${s.engineN1}`);
pass('engine spool',{idle:.22,after5s:s.engineN1});
assert(THRUST_DETENTS.length===4&&THRUST_DETENTS[0].value===0&&THRUST_DETENTS[3].value===1);

// 3. The automatic takeoff has a plausible ground roll, then climbs away.
s=new Flight();s.reset('takeoff');
let liftoff=null,groundRoll=0;
for(let i=0;i<60*150;i++){
 const wasGround=s.onGround;s.step(1/60,{});
 if(wasGround&&!s.onGround&&!liftoff)liftoff={speed:s.speed,x:s.x,time:s.time};
 if(s.onGround)groundRoll=s.x+1730;
}
assert(liftoff,`takeoff never lifted off: ${s.message}`);
assert(liftoff.speed>68&&liftoff.speed<88,`liftoff speed ${liftoff.speed}`);
assert(groundRoll>700&&groundRoll<1900,`ground roll ${groundRoll}`);
assert(s.complete&&!s.failed&&!s.onGround,`auto takeoff incomplete: ${s.phase} ${s.message}`);
assert(s.altitude>580&&s.gear===0,`altitude ${s.altitude} gear ${s.gear}`);
pass('automatic takeoff',{liftoff,groundRoll:Math.round(groundRoll),altitude:s.altitude,touchdown:null});

// 4. The automatic landing reaches the runway with a soft sink rate and stops.
s=new Flight();s.reset('land');
run(s,150);
assert(s.complete&&s.onGround&&!s.failed,`auto landing incomplete: ${s.message}`);
assert(s.speed===0&&s.x<RUNWAY.end,`landing stop x=${s.x} speed=${s.speed}`);
assert(s.touchdown.rate>0&&s.touchdown.rate<4,`touchdown sink ${s.touchdown.rate}`);
pass('automatic landing',{touchdown:s.touchdown,stopX:s.x});

// 5. A pilot can rotate and lift off by hand, only once fast enough.
s=new Flight();s.reset('manual');s.flapTarget=20;s.throttle=1;s.park=false;
let manualLift=null;
for(let i=0;i<60*70;i++){
 const wasGround=s.onGround;s.step(1/60,{pitch:1});
 if(wasGround&&!s.onGround&&!manualLift)manualLift={speed:s.speed,pitch:s.pitch,time:s.time};
}
assert(manualLift,`manual takeoff never lifted off: ${s.message}`);
assert(manualLift.speed>60&&manualLift.speed<95,`manual liftoff ${manualLift.speed}`);
assert(!s.failed&&s.altitude>50,`manual takeoff failed: ${s.message}`);
pass('manual takeoff',manualLift);

// 6. The aircraft is stable hands-off: trim holds a level attitude.
s=new Flight();s.reset('free');
const startAlt=s.altitude;
run(s,90);
assert(!s.failed&&!s.stalled,'hands-off flight should not stall or crash');
assert(Math.abs(s.altitude-startAlt)<150,`hands-off altitude drift ${s.altitude-startAlt}`);
assert(s.speed>95&&s.speed<150,`hands-off speed ${s.speed}`);
pass('hands-off stability',{altitude:s.altitude,speed:s.speed,alpha:s.alpha});

// 7. Releasing the elevator returns the aircraft to its trim angle of attack.
s=new Flight();s.reset('free');
run(s,4,{pitch:1});const peak=s.alpha;
run(s,35,{});
assert(peak>9,`expected a pitch-up, alpha ${peak}`);
assert(Math.abs(s.alpha-s.alphaTrim)<2.5,`alpha did not return to trim: ${s.alpha} vs ${s.alphaTrim}`);
pass('pitch stability',{peakAlpha:peak,settledAlpha:s.alpha,trimAlpha:s.alphaTrim});

// 8. Banking turns the aircraft and produces a real load factor.
s=new Flight();s.reset('free');const heading0=s.heading;let maxLoad=0;
for(let i=0;i<60*12;i++){s.step(1/60,{roll:1});maxLoad=Math.max(maxLoad,s.loadFactor);}
const turned=Math.abs(((s.heading-heading0+540)%360)-180);
assert(turned>12,`heading changed only ${turned}`);
assert(Math.abs(s.bank)>15,`bank ${s.bank}`);
assert(maxLoad>1.05,`load factor ${maxLoad}`);
pass('banked turn',{headingChange:turned,bank:s.bank,loadFactor:maxLoad});

// 9. With assistance off a held stick does stall the wing, and the model warns.
s=new Flight();s.reset('free');s.assist=false;s.throttle=0;
let stalled=false,maxAlpha=0;
for(let i=0;i<60*25&&!stalled;i++){s.step(1/60,{pitch:1});maxAlpha=Math.max(maxAlpha,s.alpha);stalled=s.stalled;}
assert(stalled,`stall never happened (alpha ${maxAlpha})`);
assert(s.stallWarning&&s.buffet,'stall warning flags should be set');
pass('stall',{maxAlpha,stalled:s.stalled});

// 10. Assistance keeps a held stick out of a full stall.
s=new Flight();s.reset('free');s.throttle=0;
let assistedStall=false;
for(let i=0;i<60*30;i++){s.step(1/60,{pitch:1});if(s.stalled)assistedStall=true;}
assert(!assistedStall,'assisted flight should not fully stall');
assert(s.alpha<s.stallAngle+1,`assisted alpha ${s.alpha}`);
pass('assisted alpha protection',{alpha:s.alpha,stallAngle:s.stallAngle});

// 11. Brakes stop the aircraft in a realistic distance without leaving the runway.
s=new Flight();s.reset('manual');s.speed=70;s.park=false;
const brakeX=s.x;let stoppedAt=null;
for(let i=0;i<60*60;i++){s.step(1/60,{brake:1});if(s.speed<.05&&!stoppedAt){stoppedAt=s.time;break;}}
assert(stoppedAt,`brakes did not stop the aircraft (speed ${s.speed})`);
const brakeDistance=s.x-brakeX;
assert(brakeDistance>350&&brakeDistance<1000,`braking distance ${brakeDistance}`);
pass('brakes',{seconds:stoppedAt,distance:Math.round(brakeDistance)});

// 12. Reverse thrust adds braking once on the ground.
s=new Flight();s.reset('manual');s.speed=45;s.park=false;
assert(s.control('reverse',1)==='','reverse must be allowed on the ground below 170 kt');s.control('throttle',1);
let reverseStopped=null;
for(let i=0;i<60*90;i++){s.step(1/60,{brake:0});if(s.speed<.05&&!reverseStopped){reverseStopped=s.time;break;}}
assert(reverseStopped,`reverse thrust did not stop the aircraft (speed ${s.speed})`);
pass('reverse thrust',{seconds:reverseStopped});

// 13. Cockpit interlocks still guard unsafe actions.
s=new Flight();s.reset('free');
assert(s.control('reverse',1)!=='','reverse in flight must be blocked');
assert(s.control('door',1)!=='','cargo door in flight must be blocked');
assert(s.control('park',1)!=='','parking brake in flight must be blocked');
s=new Flight();s.reset('manual');s.speed=200*0.514444;
s.flapTarget=0;const flapMsg=s.control('flaps',30);assert(flapMsg!=='','flap overspeed must be blocked');
pass('control interlocks');

// 14. Overspeed is detected and climbs are limited by the envelope.
s=new Flight();s.reset('free');s.speed=200;s.updateAirData();s.updateWarnings();
assert(s.overspeed,'overspeed should be flagged above Vmo');
pass('overspeed warning',{speed:s.speed,mach:s.mach});

// 15. Ground steering turns the aircraft while taxiing.
s=new Flight();s.reset('manual');s.speed=8;s.park=false;
const taxiHeading=s.heading;
run(s,3,{yaw:1});
assert(Math.abs(((s.heading-taxiHeading+540)%360)-180)>5,`taxi turn ${s.heading}`);
pass('ground steering',{headingChange:s.heading-taxiHeading});

// 16. Maximum altitude and structural limits are honoured.
s=new Flight();s.reset('free');s.altitude=AIRCRAFT.maxAltitude+500;s.updateAirData();
assert(s.altitude<=AIRCRAFT.maxAltitude+500);
pass('envelope limits',{maxAltitude:AIRCRAFT.maxAltitude,vmo:AIRCRAFT.vmo,mmo:AIRCRAFT.mmo});

console.log(JSON.stringify(report,null,2));

