import * as T from 'three';
import {clamp} from './flight.js';

export const ORBIT_MIN_HEIGHT=1.2;
const yAxis=new T.Vector3(0,1,0),headingRotation=new T.Quaternion();
const offset=new T.Vector3(),lookDir=new T.Vector3(),lookRight=new T.Vector3();
const COCKPIT_EYE=new T.Vector3(24.05,3.8,-.55),COCKPIT_LOOK=new T.Vector3(124.05,-13.83,-.55);
export const A380_WING_POS=new T.Vector3(-6,-1.5,4.2),A380_WING_LOOK=new T.Vector3(-14,-11,40);
const CHASE_LOOK=new T.Vector3(22,4,0),CHASE_POS=new T.Vector3(-115,35,7),WING_POS=new T.Vector3(3,1.3,3.5),WING_LOOK=new T.Vector3(-12,1,35);
const cuePosition=new T.Vector3(),desiredUp=new T.Vector3();

// Write the current world-space pose into the supplied vectors. No previous
// frame or elapsed time is involved, so aircraft translation cannot cause lag.
export function cameraPose({mode,planePosition,planeQuaternion,heading,aircraftType,cockpitScale,orbitAngle,orbitHeight,orbitDistance,focus,lookYaw,lookPitch},position,target){
 if(mode==='orbit'||mode==='chase')headingRotation.setFromAxisAngle(yAxis,(90-heading)*Math.PI/180);
 if(mode==='orbit'){
  offset.set(Math.cos(orbitAngle)*Math.cos(orbitHeight)*orbitDistance,Math.sin(orbitHeight)*orbitDistance,Math.sin(orbitAngle)*Math.cos(orbitHeight)*orbitDistance).applyQuaternion(headingRotation);
  target.copy(focus).applyQuaternion(headingRotation).add(planePosition);position.copy(target).add(offset);
  // The user drags the orbit view freely; keep it above the ground (it does not follow the aircraft's attitude, so this causes no drift).
  position.y=Math.max(position.y,ORBIT_MIN_HEIGHT);
 }else if(mode==='chase'){
  const k=aircraftType==='shuttle'?.55:1;
  target.copy(CHASE_LOOK).multiplyScalar(k).applyQuaternion(headingRotation).add(planePosition);
  position.copy(CHASE_POS).multiplyScalar(k).applyQuaternion(headingRotation).add(planePosition);
 }else if(mode==='cockpit'||mode==='wing'){
  const inside=mode==='cockpit';
  position.copy(inside?COCKPIT_EYE:WING_POS);lookDir.copy(inside?COCKPIT_LOOK:WING_LOOK);
  if(inside){position.multiply(cockpitScale);lookDir.multiply(cockpitScale);}
  // A380: sit at an upper-deck window above the wing root (its root origin is high on the fuselage) and look down along the low wing.
  else if(aircraftType==='a380'){position.copy(A380_WING_POS);lookDir.copy(A380_WING_LOOK);}
  lookDir.sub(position);lookRight.crossVectors(lookDir,yAxis).normalize();
  lookDir.applyAxisAngle(lookRight,lookPitch).applyAxisAngle(yAxis,lookYaw).applyQuaternion(planeQuaternion);
  position.applyQuaternion(planeQuaternion).add(planePosition);target.copy(position).add(lookDir);
 }else if(mode==='tower'){
  position.set(0,68,-500);target.copy(planePosition);
 }
}

export function createCameraMotionState(){
 return {
  initialized:false,transition:false,firstTransition:false,elapsed:0,
  position:new T.Vector3(),target:new T.Vector3(),up:new T.Vector3(0,1,0),previous:new T.Vector3(),previousTarget:new T.Vector3(),
  clock:0,lastTouchdown:null,impactAge:0,impactStrength:0,
  cueX:0,cueY:0,cueZ:0,fov:NaN
 };
}

export function beginCameraTransition(state){
 if(!state.initialized)return;
 state.transition=true;state.firstTransition=true;state.elapsed=0;
}

export function interruptCameraTransition(state){
 state.transition=false;state.initialized=false;state.fov=NaN;
}

// This remains the direct, no-state pose path used by lock tests and callers
// that deliberately do not want camera motion.
export function applyCameraPose(camera,position,target,planeQuaternion,mode){
 camera.position.copy(position);camera.up.set(0,1,0);
 if(mode==='cockpit')camera.up.applyQuaternion(planeQuaternion);
 camera.lookAt(target);
}

// Deterministic, low-frequency motion. Paused motion samples stay frozen and
// touch nothing for the world-fixed tower view.
export function applyCameraBuffet(mode,buffet,paused,position,target,state){
 if(mode==='tower')return;
 if(!state||!Number.isFinite(state.cueX))return;
 if(paused){cuePosition.set(state.cueX,state.cueY,state.cueZ);}
 else{
  const amplitude=buffet?.18:0;
  state.cueX=state.cueX*.65+(amplitude*(Math.sin(state.clock*1.7)+.28*Math.sin(state.clock*4.1)))*.35;
  state.cueY=state.cueY*.65+(amplitude*(Math.sin(state.clock*1.27+1.4)+.2*Math.sin(state.clock*3.6)))*.35;
  state.cueZ=state.cueZ*.65+(amplitude*.42*Math.sin(state.clock*1.02+.7))*.35;
  cuePosition.set(state.cueX,state.cueY,state.cueZ);
 }
 position.add(cuePosition);target.add(cuePosition);
}

function cinematicPose(mode,sim,position,target){
 const landing=sim.mode==='land',takeoff=sim.mode==='takeoff';
 if(mode!=='chase'||(!landing&&!takeoff))return;
 if(landing){
  const close=1-clamp(sim.altitude/90,0,1);
  position.y+=3.2*close;target.y+=.8*close;
 }else{
  const roll=clamp((sim.speed-15)/55,0,1);
  position.y+=2.4*roll;target.y+=.7*roll;
 }
}

function cameraCue(mode,sim,state,dt,reducedMotion,lowQuality,tablet){
 if(mode==='tower'){
  state.cueX=state.cueY=state.cueZ=0;
  state.lastTouchdown=sim.touchdown;
  if(!sim.paused)state.impactAge+=dt;
  return;
 }
 if(sim.touchdown!==state.lastTouchdown){
  state.lastTouchdown=sim.touchdown;
  state.impactAge=0;
  state.impactStrength=sim.touchdown?Math.min(.32,Math.max(.08,sim.touchdown.rate*.065)):0;
 }
 if(sim.paused)return;
 state.clock+=dt;
 state.impactAge+=dt;
 const attached=mode==='cockpit'||mode==='wing',quality=reducedMotion?.22:lowQuality?.42:tablet?.62:1;
 const base=sim.buffet?.15:(sim.speed>20?(attached?.018:mode==='orbit'?.006:.012):0);
 if(!base&&state.impactStrength===0){state.cueX=state.cueY=state.cueZ=0;return;}
 const amplitude=base*quality*(sim.buffet?1:.7+Math.min(1,sim.speed/150)*.3);
 const layered=!lowQuality&&!tablet&&!reducedMotion;
 state.cueX=amplitude*(Math.sin(state.clock*1.31)+(layered?.24*Math.sin(state.clock*3.4+.9):0));
 state.cueY=amplitude*.72*(Math.sin(state.clock*1.08+1.2)+(layered?.18*Math.sin(state.clock*3.8):0));
 state.cueZ=amplitude*.2*Math.sin(state.clock*.91+.4);
 const landingCue=state.impactStrength*Math.exp(-state.impactAge*3.1)*Math.sin(state.impactAge*10.5);
 state.cueY-=landingCue*quality;
}

// Smooth only preset changes. Normal frame-to-frame camera motion stays exact,
// so translation, heading and attitude never acquire follow lag.
export function applyCameraMotion(state,camera,position,target,planeQuaternion,mode,sim,dt,reducedMotion=false,lowQuality=false,tablet=false,fovTarget=camera.fov){
 cinematicPose(mode,sim,position,target);
 const safeDt=Math.max(0,Math.min(.05,dt||0));
 desiredUp.set(0,1,0);
 if(mode==='cockpit')desiredUp.applyQuaternion(planeQuaternion);
 if(!state.initialized||!state.transition){
  state.position.copy(position);state.target.copy(target);state.up.copy(desiredUp);
  state.transition=false;
 }else{
  const first=state.firstTransition;
  state.firstTransition=false;
  if(!first){
   state.position.x+=position.x-state.previous.x;
   state.position.y+=position.y-state.previous.y;
   state.position.z+=position.z-state.previous.z;
   state.target.x+=target.x-state.previousTarget.x;
   state.target.y+=target.y-state.previousTarget.y;
   state.target.z+=target.z-state.previousTarget.z;
  }
  const duration=reducedMotion?.16:lowQuality||tablet?.42:.72;
  state.elapsed+=safeDt;
  const alpha=1-Math.exp(-safeDt/(duration*.24));
  state.position.lerp(position,alpha);state.target.lerp(target,alpha);
  state.up.lerp(desiredUp,alpha).normalize();
  if(state.elapsed>=duration||state.position.distanceToSquared(position)<.0001){
   state.position.copy(position);state.target.copy(target);state.up.copy(desiredUp);state.transition=false;
  }
 }
 state.previous.copy(position);state.previousTarget.copy(target);state.initialized=true;
 position.copy(state.position);target.copy(state.target);

 if(!Number.isFinite(state.fov)||!state.transition&&mode!=='chase'){
  camera.fov=fovTarget;state.fov=fovTarget;
 }else if(state.transition){
  state.fov+=(fovTarget-state.fov)*(1-Math.exp(-safeDt*.75/(lowQuality||tablet?.18:.28)));
  camera.fov=state.fov;
 }else{
  state.fov=fovTarget;camera.fov=fovTarget;
 }

 cameraCue(mode,sim,state,safeDt,reducedMotion,lowQuality,tablet);
 cuePosition.set(state.cueX,state.cueY,state.cueZ);
 position.add(cuePosition);target.add(cuePosition);
 camera.position.copy(position);camera.up.copy(state.up);camera.lookAt(target);
}
