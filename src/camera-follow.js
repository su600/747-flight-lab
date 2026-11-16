import * as T from 'three';

export const ORBIT_MIN_HEIGHT=1.2;
const yAxis=new T.Vector3(0,1,0),headingRotation=new T.Quaternion();
const offset=new T.Vector3(),lookDir=new T.Vector3(),lookRight=new T.Vector3();
const COCKPIT_EYE=new T.Vector3(24.05,3.8,-.55),COCKPIT_LOOK=new T.Vector3(124.05,-13.83,-.55);
export const A380_WING_POS=new T.Vector3(-6,-1.5,4.2),A380_WING_LOOK=new T.Vector3(-14,-11,40);
const CHASE_LOOK=new T.Vector3(22,4,0),CHASE_POS=new T.Vector3(-115,35,7),WING_POS=new T.Vector3(3,1.3,3.5),WING_LOOK=new T.Vector3(-12,1,35);

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

// Buffet is a local airborne cue; the world-fixed tower remains steady and tracks exactly.
export function applyCameraBuffet(mode,buffet,paused,position,target,random=Math.random){
 if(mode==='tower'||!buffet||paused)return;
 const shake=.28;
 position.x+=(random()-.5)*shake;position.y+=(random()-.5)*shake;
 target.x+=(random()-.5)*shake;target.y+=(random()-.5)*shake;
}

// Snap even on a view switch; the target must not retain last frame's lag.
export function applyCameraPose(camera,position,target,planeQuaternion,mode){
 camera.position.copy(position);camera.up.set(0,1,0);
 if(mode==='cockpit')camera.up.applyQuaternion(planeQuaternion);
 camera.lookAt(target);
}
