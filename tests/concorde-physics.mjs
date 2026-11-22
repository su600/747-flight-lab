// Run with: node tests/concorde-physics.mjs
import assert from 'node:assert/strict';
import {Flight,AIRCRAFT,atmosphere,speedOfSound} from '../src/flight.js';
import {CONCORDE} from '../src/concorde-flight.js';

const KNOT=.514444,DEG=180/Math.PI;
const make=(mode='free')=>{const s=new Flight();s.setAircraftType('concorde');s.reset(mode);return s;};
const run=(s,seconds,dt=1/60,input={})=>{for(let i=0;i<Math.round(seconds/dt);i++)s.step(dt,input);};
const levelInput=(s,alt)=>{
 const correction=Math.max(-3,Math.min(3,(alt-s.altitude)*.003-s.gamma*DEG*1.5));
 return {pitch:s.autoElevator(s.trimAlpha()*DEG+correction)};
};
const setMach=(s,mach,alt)=>{
 s.altitude=alt;s.speed=mach*speedOfSound(alt);s.gamma=0;s.pitch=s.trimAlpha()*DEG;
 s.updateAirData();s.calculateAero();
};

// The scenario is actual flight, not a Mach readout: sustain it for 10 minutes,
// including large externally supplied time steps, with meaningful distance covered.
for(const mode of ['supersonic','supersonic-cruise']){
 const s=make(mode),x=s.x;
 assert.equal(s.onGround,false);assert.equal(s.gear,0);assert.equal(s.flaps,0);
 assert(Math.abs(s.speed-2*speedOfSound(s.altitude))<1e-8);
 run(s,600,.1);
 assert(!s.failed&&!s.overspeed);assert(Math.abs(s.mach-2)<.01,`Mach ${s.mach}`);
 assert(Math.abs(s.altitude-17000)<100,`altitude ${s.altitude}`);
 assert(s.x-x>350000,`distance ${s.x-x}`);assert.equal(s.concordeReheat,0);
 assert(s.throttle>0&&s.throttle<1);assert(s.indicatedSpeed<s.speed);
}
{
 const s=make('supersonic');s.step(1/60,{roll:.5});assert.equal(s.mode,'manual');
 const t=make('supersonic');t.control('throttle',.6);assert.equal(t.mode,'manual');
 const u=make('supersonic');u.control('concordeReheat',1);run(u,1);
 assert.equal(u.concordeReheatTarget,1);assert.equal(u.concordeReheat,0);
}

// Dry-thrust level Mach 2 is feasible across 50–60 kft, with real lift and drag.
for(const alt of [15240,17000,18200]){
 const s=make('supersonic');s.mode='manual';setMach(s,2,alt);
 s.throttle=s.trimThrottle(0);s.engineN1=.22+.78*s.throttle;s.calculateAero();
 assert(s.throttle<1,`dry thrust at ${alt} m`);
 assert(Math.abs(s.thrust-s.drag)/s.drag<.02);
 assert(Math.abs(s.lift-s.weight)/s.weight<.02);
 for(let i=0;i<300*30;i++){
  s.throttle=Math.max(0,Math.min(1,s.trimThrottle(0)+(2*speedOfSound(s.altitude)-s.speed)*.01));
  s.step(1/30,levelInput(s,alt));
 }
 assert(!s.failed&&!s.overspeed);assert(Math.abs(s.mach-2)<.01);
 assert(Math.abs(s.altitude-alt)<100);assert.equal(s.concordeReheat,0);
}

// A level, powered acceleration from transonic/supersonic climb speed reaches
// cruise without reheat at Mach 2; reheat initially produces more thrust.
{
 const s=make('free'),alt=15240;setMach(s,1.6,alt);
 s.throttle=1;s.engineN1=1;s.control('concordeReheat',1);s.updateSystems(.01);s.calculateAero();
 const wet=s.thrust;assert.equal(s.concordeReheat,1);
 s.control('concordeReheat',0);s.updateSystems(.01);s.calculateAero();assert(wet>s.thrust*1.2);
 s.control('concordeReheat',1);
 let reached=false;
 for(let i=0;i<420*30;i++){
  s.step(1/30,levelInput(s,alt));
  if(s.mach>=1.99){reached=true;break;}
 }
 assert(reached,`Mach ${s.mach}`);assert.equal(s.concordeReheat,0);assert.equal(s.concordeReheatTarget,1);
 assert(Math.abs(s.altitude-alt)<100&&!s.failed);
}

// M2.04 protection reduces thrust and warns; it is not an unrealistic hard
// clamp, so a sufficiently steep dive can still exceed the limit.
{
 const s=make('supersonic');s.control('throttle',1);let maxMach=0;
 for(let i=0;i<300*30;i++){s.step(1/30,levelInput(s,17000));maxMach=Math.max(maxMach,s.mach);}
 assert(maxMach<2.06,`protected Mach ${maxMach}`);
 setMach(s,2.05,17000);s.updateWarnings();assert(s.overspeed);
 s.control('concordeReheat',1);s.engineN1=1;s.updateSystems(1);
 assert.equal(s.concordeReheat,0);assert(s.engineN1<.8,'overspeed protection reduces engine power');
 s.altitude=CONCORDE.maxAltitude-1;s.speed=300;s.gamma=.1;s.pitch=7;
 s.integrateAirborne(1,{}, {thrust:0,drag:0,lift:2*s.weight,alpha:0,qbar:0});
 assert.equal(s.altitude,18288);assert.equal(s.gamma,0);
}

// Visor sequencing and nose limits use indicated/equivalent speed, altitude,
// and Mach; moving beyond a placard automatically requests a safe position.
{
 const s=make('manual');s.park=true;
 assert(s.control('concordeNose',10));assert.equal(s.control('concordeNose',12.5),'');
 run(s,2);assert.equal(s.concordeNose,0);assert(s.concordeVisor>0);
 run(s,14);assert.equal(s.concordeVisor,0);assert.equal(s.concordeNose,12.5);
 assert.equal(s.control('concordeNose',0),'');run(s,5);assert.equal(s.concordeVisor,0);
 run(s,10);assert.equal(s.concordeNose,0);assert.equal(s.concordeVisor,1);
 s.speed=275*KNOT;s.updateAirData();assert(s.control('concordeNose',12.5));
 assert.equal(s.control('concordeNose',5),'');run(s,.1);
 s.speed=330*KNOT;s.updateAirData();run(s,.1);assert.equal(s.concordeNoseTarget,0);
 s.altitude=6096;s.speed=100;s.updateAirData();assert(s.control('concordeNose',12.5));
 s.altitude=17000;s.speed=.81*speedOfSound(s.altitude);s.updateAirData();
 assert(s.indicatedSpeed<325*KNOT);assert(s.control('concordeNose',5),'Mach limit applies independently of airspeed');
 assert(s.control('concordeReheat',2));
}

// The guided low-speed demonstrations have delta-wing speeds and no flaps.
{
 const s=make('takeoff');assert.equal(s.concordeNose,5);let lift=null,wet=false;
 for(let i=0;i<150*60;i++){
  const ground=s.onGround;s.step(1/60);wet ||= !!s.concordeReheat;
  if(ground&&!s.onGround&&!lift)lift={speed:s.speed,x:s.x};
  assert.equal(s.flaps,0);assert.equal(s.flapTarget,0);
 }
 assert(lift&&lift.speed>90&&lift.speed<110);assert(lift.x>-1730&&lift.x<0);
 assert(wet&&s.complete&&!s.failed&&s.altitude>580);
 assert(s.control('flaps',30));assert.equal(s.flapTarget,0);
 const l=make('land');assert.equal(l.concordeNose,12.5);run(l,150);
 assert(l.complete&&!l.failed&&l.touchdown.valid);assert(l.touchdown.speed>70&&l.touchdown.speed<95);
 assert.equal(l.flaps,0);assert.equal(l.flapTarget,0);
}

// Reset after changing type restores the original 747 profile and flap controls.
{
 const s=make('land');s.setAircraftType('b747');s.reset('land');
 assert.equal(s.mass,AIRCRAFT.landingMass);assert.equal(s.flaps,20);assert.equal(s.flapTarget,30);
 s.setAircraftType('a380');s.reset('takeoff');assert.equal(s.mass,AIRCRAFT.mass);
 assert.equal(s.control('flaps',5),'');assert.equal(s.flapTarget,5);
 assert(s.control('concordeNose',5));assert(s.control('concordeReheat',1));
 assert(atmosphere(18288)<atmosphere(15240));
}
console.log('Concorde physics: Mach 2 cruise and acceleration, limits, nose/visor, reheat, takeoff/landing and aircraft switching passed.');
