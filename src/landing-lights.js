import * as T from 'three';

// Aircraft landing lights: one forward spotlight that paints a pool of light on the runway at dusk and night.
// It stays in the scene permanently (intensity 0 by day) so switching time of day never recompiles materials.
export const LANDING_LIGHT_CEILING=900;
export const LANDING_LIGHT_CANDELA=420;
const BEAM_ANGLE=Math.PI/13;
export function landingLightLevel(sim,time){
 if(time==='day'||!sim||sim.mode==='inspect'||sim.failed)return 0;
 const airborneLow=!sim.onGround&&sim.altitude<LANDING_LIGHT_CEILING&&(sim.gear??1)>.5;
 const rolling=sim.onGround&&sim.speed>8;
 return (airborneLow||rolling?1:0)*(time==='night'?1:.45);
}

export class LandingLights{
 constructor(scene){
  this.light=new T.SpotLight(0xfff1dc,0,1100,BEAM_ANGLE,.55,1);
  this.light.castShadow=false;this.target=this.light.target;
  scene.add(this.light,this.target);this.level=0;this._p=new T.Vector3();
 }
 // Light sits a few metres above the wheels near the nose and aims ~11 degrees below the fuselage axis,
 // so on a 3-degree approach the beam reaches the runway a couple of hundred metres ahead.
 update(sim,time,plane,dt=.016){
  const want=landingLightLevel(sim,time);
  this.level+=(want-this.level)*Math.min(1,dt*4);
  this.light.intensity=this.level*LANDING_LIGHT_CANDELA;this.light.visible=this.level>.002;
  if(!this.light.visible||!plane?.root)return;
  const c=plane.contact??5,root=plane.root;root.updateMatrixWorld();
  this.light.position.copy(root.localToWorld(this._p.set(14,-c+3.2,0)));
  this.target.position.copy(root.localToWorld(this._p.set(300,-c-58,0)));
  this.target.updateMatrixWorld();
 }
}
