import assert from 'node:assert/strict';
import * as T from 'three';
import {LandingLights,landingLightLevel,landingLightsWanted,LANDING_LIGHT_CEILING,touchdownLightPulse} from '../src/landing-lights.js';
const approach={mode:'land',onGround:false,altitude:200,gear:1,speed:75,time:10,landingLights:false};
// Switch → output.
assert.equal(landingLightLevel({...approach,landingLights:true},'day'),0,'no beam by day');
assert.equal(landingLightLevel({...approach,landingLights:true},'night'),1);
assert(landingLightLevel({...approach,landingLights:true},'dusk')>0&&landingLightLevel({...approach,landingLights:true},'dusk')<1);
assert.equal(landingLightLevel(approach,'night'),0,'switch off means dark');
assert.equal(landingLightLevel({mode:'inspect',landingLights:true},'night'),1,'manual switch works for a parked aircraft too');
// When the automatic switch wants the lights.
assert(landingLightsWanted(approach,'night')&&landingLightsWanted(approach,'dusk'));
assert(!landingLightsWanted(approach,'day'));
assert(!landingLightsWanted({...approach,mode:'manual',altitude:LANDING_LIGHT_CEILING+10},'night'),'not at cruise');
assert(!landingLightsWanted({...approach,mode:'manual',gear:0},'night'),'tied to gear down outside the demo');
assert(landingLightsWanted({...approach,mode:'manual'},'night'),'manual night approach with gear down');
assert(!landingLightsWanted({...approach,mode:'inspect',onGround:true,altitude:0},'night'),'ground observation is not an approach');

const scene=new T.Scene(),lights=new LandingLights(scene),plane={root:new T.Group(),contact:5};plane.root.position.set(-2400,40,0);
assert(scene.children.includes(lights.light),'light lives in the scene permanently');
const sim={...approach};
lights.update(sim,'day',plane,.05);assert.equal(sim.landingLights,false,'daytime approach leaves the switch alone');
for(let i=0;i<60;i++){sim.time+=.05;lights.update(sim,'night',plane,.05);}
assert.equal(sim.landingLights,true,'night landing turns the lights on automatically');
assert(lights.light.visible&&lights.light.intensity>0);
assert(lights.target.position.x>lights.light.position.x+200&&lights.target.position.y<lights.light.position.y-40,'beam aims ahead and down at the runway');
sim.landingLights=false;for(let i=0;i<60;i++){sim.time+=.05;lights.update(sim,'night',plane,.05);}
assert.equal(sim.landingLights,false,'pilot can switch them off during the same approach');assert(!lights.light.visible);
sim.time=0;lights.update(sim,'night',plane,.05);assert.equal(sim.landingLights,true,'a restarted landing re-arms the automatic switch');
const dry=lights.light.intensity;lights.update(sim,'night',plane,.05,'heavy');assert(lights.light.intensity>dry&&lights.light.angle>Math.PI/13,'rain makes the wet runway pool brighter and slightly broader');
assert(touchdownLightPulse(.1,.8)>touchdownLightPulse(1,.8));assert.equal(touchdownLightPulse(-1,1),0);
lights.setReducedMotion(true);lights.lastTouchdown=null;sim.touchdown={valid:true,rate:3,time:sim.time};lights.update(sim,'night',plane,.02,'off');assert.equal(lights.light.visible,true,'actual landing-light switch remains active with reduced motion');
sim.landingLights=false;lights.setReducedMotion(false);lights.level=0;lights.lastTouchdown=sim.touchdown;sim.touchdown=null;
lights.update(sim,'night',plane,.02,'off');assert.equal(lights.touchdownStrength,0,'clearing touchdown state must cancel the pulse');
assert.equal(lights.light.visible,false,'resetting a completed landing must not flash the runway light');
console.log('Landing lights: menu switch, automatic on for dusk/night approaches, pilot override, beam aimed at the runway.');
