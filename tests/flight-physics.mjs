// Physics regression checks for the simplified flight model. Run: node tests/flight-physics.mjs
import assert from 'node:assert/strict';
import {Flight,atmosphere,AIRCRAFT} from '../src/flight.js';

const KNOT=.514444;
const run=(sim,seconds,input={})=>{for(let i=0;i<seconds*120;i++)sim.step(1/120,input);};

// 1. ISA stratosphere: above 11 km temperature is constant but pressure (and so
//    density) must keep falling exponentially. ISA density at 12.5 km is 0.2880 kg/m3.
{
 const rho11=atmosphere(11000),rho125=atmosphere(12500);
 assert.ok(Math.abs(rho11-.3639)<.002,`ISA 11 km density ${rho11}`);
 assert.ok(Math.abs(rho125-.2880)<.002,`ISA 12.5 km density ${rho125}`);
}

// 2. Speed limits are indicated (equivalent) airspeeds: a normal M0.84 cruise at
//    10.7 km is about 290 KIAS and must not trigger the 365 kt VMO warning.
{
 const sim=new Flight();sim.reset('free');
 sim.altitude=10700;sim.speed=.84*295.1;sim.gamma=0;sim.updateAirData();sim.updateWarnings();
 assert.equal(sim.overspeed,false,`cruise M${sim.mach.toFixed(2)} at ${Math.round(sim.indicatedSpeed/KNOT)} KIAS is not an overspeed`);
 sim.altitude=1000;sim.speed=210;sim.updateAirData();sim.updateWarnings();
 assert.equal(sim.overspeed,true,'about 390 KIAS at low level is an overspeed');
 // Gear may be raised at 250 KIAS even though the true airspeed is higher at altitude.
 sim.altitude=6000;sim.speed=250*KNOT/Math.sqrt(atmosphere(6000)/AIRCRAFT.rho0);sim.gear=1;sim.gearTarget=1;sim.updateAirData();
 assert.equal(sim.control('gear',0),'','gear retraction uses indicated airspeed');
}

// 3. Leaving the runway and immediately sinking must touch down again, never fly
//    beneath the ground.
{
 const sim=new Flight();sim.reset('free');
 sim.altitude=0;sim.onGround=false;sim.gear=1;sim.gearTarget=1;sim.speed=80;sim.gamma=-.02;sim.pitch=0;sim.flaps=20;sim.flapTarget=20;
 run(sim,2,{pitch:-1});
 assert.ok(sim.altitude>=0,`altitude stays above ground (got ${sim.altitude.toFixed(2)} m)`);
 assert.ok(sim.onGround||sim.failed,'the aircraft is back on the ground (or has crashed)');
}

// 4. On the ground the wings level out: a 10 degree bank at touchdown does not stay frozen.
{
 const sim=new Flight();sim.reset('free');
 sim.altitude=.5;sim.gear=1;sim.gearTarget=1;sim.flaps=30;sim.flapTarget=30;sim.speed=72;sim.x=-1200;sim.z=0;sim.heading=90;
 sim.gamma=-1.2*Math.PI/180;sim.pitch=3;sim.bank=10;sim.rollRate=0;
 run(sim,.5);
 assert.ok(sim.onGround&&!sim.failed,`touchdown accepted (${sim.message})`);
 run(sim,3);
 assert.ok(Math.abs(sim.bank)<.5,`bank returns to level on the ground (got ${sim.bank.toFixed(2)} deg)`);
}

// 5. Nose-wheel steering cannot generate fighter-jet side loads at speed: full
//    rudder at 80 m/s stays within about 0.3 g of lateral acceleration.
{
 const sim=new Flight();sim.reset('takeoff');sim.mode='manual';sim.park=false;sim.speed=80;sim.throttle=0;
 const h0=sim.heading;run(sim,1,{yaw:1});
 const yawRate=((sim.heading-h0+540)%360-180)*Math.PI/180;
 const lateral=Math.abs(yawRate)*sim.speed;
 assert.ok(lateral<.35*9.81,`ground lateral acceleration ${lateral.toFixed(1)} m/s2`);
 // Low-speed taxi still turns tightly.
 const taxi=new Flight();taxi.reset('takeoff');taxi.mode='manual';taxi.park=false;taxi.speed=5;taxi.throttle=0;
 const t0=taxi.heading;run(taxi,1,{yaw:1});
 assert.ok(Math.abs((taxi.heading-t0+540)%360-180)>5,'taxi steering keeps its tight turn');
}

console.log('Flight physics: stratosphere density, indicated-speed limits, ground contact, wing levelling and steering limits passed.');
