import * as T from 'three';

// Aircraft landing lights: one forward spotlight that paints a pool of light on the runway at dusk and night.
// The switch is sim.landingLights (parts menu). It turns itself on when a dusk/night approach begins;
// the pilot can still switch it off afterwards. The light stays in the scene permanently (intensity 0 when off)
// so toggling never recompiles materials.
export const LANDING_LIGHT_CEILING=900;
export const LANDING_LIGHT_CANDELA=420;
const BEAM_ANGLE=Math.PI/13;

// Below the ceiling with the gear down (or flying the landing demo), at dusk or night.
export function landingLightsWanted(sim,time){
 if(time==='day'||!sim||sim.mode==='inspect'||sim.failed)return false;
 return sim.mode==='land'&&!sim.complete||!sim.onGround&&sim.altitude<LANDING_LIGHT_CEILING&&(sim.gear??1)>.5;
}
export function landingLightLevel(sim,time){
 if(!sim?.landingLights||time==='day')return 0;
 return time==='night'?1:.45;
}
export function touchdownLightPulse(age,strength=0){
 if(!Number.isFinite(age)||age<0)return 0;
 return Math.max(0,Math.min(1,strength))*Math.exp(-age*6)*Math.max(0,1-age/.9);
}

export class LandingLights{
 constructor(scene){
  this.light=new T.SpotLight(0xfff1dc,0,1100,BEAM_ANGLE,.55,1);
  this.light.castShadow=false;this.target=this.light.target;
  scene.add(this.light,this.target);this.level=0;this.armed=true;this.lastTime=0;this._p=new T.Vector3();this.lastTouchdown=null;this.touchdownAge=9;this.touchdownStrength=0;this.reducedMotion=!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 }
 // Rising edge of "approach at dusk/night" switches the lights on once; a reset (sim time going backwards) re-arms it.
 autoSwitch(sim,time){
  if((sim.time??0)<this.lastTime)this.armed=true;
  this.lastTime=sim.time??0;
  const wanted=landingLightsWanted(sim,time);
  if(wanted&&this.armed){sim.landingLights=true;this.armed=false;}
  else if(!wanted)this.armed=true;
 }
 // Light sits a few metres above the wheels near the nose and aims ~11 degrees below the fuselage axis,
 // so on a 3-degree approach the beam reaches the runway a couple of hundred metres ahead.
 setReducedMotion(reduced){this.reducedMotion=!!reduced;}
 update(sim,time,plane,dt=.016,rain='off'){
  this.autoSwitch(sim,time);
  if(sim.touchdown!==this.lastTouchdown){
   this.lastTouchdown=sim.touchdown;this.touchdownAge=0;
   this.touchdownStrength=sim.touchdown&&sim.touchdown.valid!==false?Math.min(.8,Math.max(.35,(sim.touchdown.rate??0)*.12)):0;
  }
  if(!sim.paused)this.touchdownAge+=Math.max(0,dt);
  const want=landingLightLevel(sim,time);
  this.level+=(want-this.level)*Math.min(1,dt*4);
  const wet=rain!=='off',pulse=this.reducedMotion||time==='day'?0:touchdownLightPulse(this.touchdownAge,this.touchdownStrength);
  this.light.angle=BEAM_ANGLE*(wet?1.08:1);
  this.light.intensity=this.level*LANDING_LIGHT_CANDELA*(wet?1.14:1)+pulse*130;this.light.visible=this.level>.002||pulse>.01;
  if(!this.light.visible||!plane?.root)return;
  const c=plane.contact??5,root=plane.root;root.updateMatrixWorld();
  this.light.position.copy(root.localToWorld(this._p.set(14,-c+3.2,0)));
  this.target.position.copy(root.localToWorld(this._p.set(300,-c-58,0)));
  this.target.updateMatrixWorld();
 }
}
