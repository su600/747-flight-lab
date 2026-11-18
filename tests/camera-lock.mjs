// Exercise the same pose and snap path as updateCamera, without a browser.
import assert from 'node:assert/strict';
import * as T from 'three';
import {cameraPose,applyCameraBuffet,applyCameraPose} from '../src/camera-follow.js';

const camera=new T.PerspectiveCamera(),position=new T.Vector3(),target=new T.Vector3();
const planePosition=new T.Vector3(300,1200,-400);
const planeQuaternion=new T.Quaternion().setFromEuler(new T.Euler(.12,.7,-.08,'YZX'));
const options={mode:'orbit',planePosition,planeQuaternion,heading:50,aircraftType:'b747',cockpitScale:new T.Vector3(1,1,1),orbitAngle:.87,orbitHeight:.25,orbitDistance:125,focus:new T.Vector3(0,2,0),lookYaw:.2,lookPitch:-.1};
const near=(actual,expected,message)=>assert(actual.distanceTo(expected)<1e-8,`${message}: ${actual.toArray()} vs ${expected.toArray()}`);
const apply=()=>{cameraPose(options,position,target);applyCameraPose(camera,position,target,planeQuaternion,options.mode);};
const aircraftFrame=v=>v.clone().sub(planePosition).applyQuaternion(planeQuaternion.clone().invert());

for(const aircraftType of ['b747','a380','a330','b777','shuttle']){
 options.aircraftType=aircraftType;
 for(const mode of aircraftType==='shuttle'?['orbit','chase','tower']:['orbit','chase','cockpit','wing','tower']){
  options.mode=mode;
  for(const playback of [1,2,4]){
   planePosition.set(300,1200,-400);
   // Start at an unrelated pose to verify that switching views snaps immediately.
   camera.position.set(-900,20,800);apply();
   near(camera.position,position,`${aircraftType} ${mode} first frame`);
   const initialPosition=aircraftFrame(camera.position),initialTarget=aircraftFrame(target);
   const initialDirection=camera.getWorldDirection(new T.Vector3());
   if(mode==='wing')near(initialPosition,aircraftType==='a380'?new T.Vector3(-6,-1.5,4.2):new T.Vector3(3,1.3,3.5),`${aircraftType} wing anchor`);
   for(let frame=0;frame<120;frame++){
    const dt=playback/60;
    planePosition.addScaledVector(new T.Vector3(.6,.1,-Math.sqrt(.63)),130*dt);
    apply();
    if(mode==='tower'){
     near(camera.position,new T.Vector3(0,68,-500),'tower remains world-fixed');
     near(target,planePosition,'tower target tracks the aircraft exactly');
    }else{
     near(aircraftFrame(camera.position),initialPosition,`${aircraftType} ${mode} ${playback}x position`);
     near(aircraftFrame(target),initialTarget,`${aircraftType} ${mode} ${playback}x target`);
     near(camera.getWorldDirection(new T.Vector3()),initialDirection,`${aircraftType} ${mode} ${playback}x direction`);
    }
    near(camera.getWorldDirection(new T.Vector3()),target.clone().sub(camera.position).normalize(),`${mode} looks at current target`);
   }
  }
 }
}
// Heading and user-controlled orbit changes take effect immediately.
options.aircraftType='b747';options.mode='orbit';options.heading=90;apply();
const oldPosition=position.clone(),oldTarget=target.clone();
options.heading=30;apply();assert(position.distanceTo(oldPosition)>1,'orbit follows current heading');
options.focus.set(5,3,-7);options.orbitAngle+=.3;options.orbitDistance=90;apply();
assert(target.distanceTo(oldTarget)>1&&Math.abs(position.distanceTo(target)-90)<1e-8,'orbit pan, rotation, and zoom update the pose');
options.mode='chase';options.heading=90;apply();const oldChase=position.clone();options.heading=30;apply();
assert(position.distanceTo(oldChase)>1,'chase follows current heading');
// Rotating an airframe changes the wing/cockpit pose immediately, not one frame later.
for(const mode of ['wing','cockpit']){
 options.mode=mode;options.aircraftType='b747';apply();
 planeQuaternion.setFromEuler(new T.Euler(-.3,1.3,.25,'YZX'));apply();
 const eye=(mode==='wing'?new T.Vector3(3,1.3,3.5):new T.Vector3(24.05,3.8,-.55)).applyQuaternion(planeQuaternion).add(planePosition);
 near(camera.position,eye,`${mode} follows current attitude`);
}
// Legacy buffet calls without a motion state are inert; tower and paused views remain steady.
options.mode='cockpit';apply();
const cleanPosition=position.clone(),cleanTarget=target.clone();
applyCameraBuffet('cockpit',true,false,position,target);
near(position,cleanPosition,'standalone buffet is inert without state');
near(target,cleanTarget,'standalone buffet target is inert without state');
for(const [mode,buffet,paused] of [['cockpit',true,true],['wing',false,false],['tower',true,false]]){
 applyCameraBuffet(mode,buffet,paused,position,target);
 near(position,cleanPosition,`${mode} steady position`);near(target,cleanTarget,`${mode} steady target`);
}
{
 const {cameraPose:pose,ORBIT_MIN_HEIGHT:minY}=await import('../src/camera-follow.js');
 const P=new T.Vector3(),Q=new T.Vector3();
 pose({mode:'orbit',planePosition:new T.Vector3(0,0,0),planeQuaternion:new T.Quaternion(),heading:90,orbitAngle:.9,orbitHeight:-1,orbitDistance:80,focus:new T.Vector3(0,2,0)},P,Q);
 assert(P.y>=minY,'orbit view never goes below the ground when dragged downward');
}
console.log('Camera lock passed: all views, airframes, translations, attitude, inactive legacy buffet, and 1x/2x/4x playback.');
