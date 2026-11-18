import assert from 'node:assert/strict';
import * as T from 'three';
import {applyCameraMotion,beginCameraTransition,createCameraMotionState,interruptCameraTransition} from '../src/camera-follow.js';

const camera=new T.PerspectiveCamera(43,1,.1,2000),quaternion=new T.Quaternion();
const desired=new T.Vector3(),target=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3();
const sim={mode:'manual',buffet:false,paused:false,touchdown:null,speed:0,altitude:0};
const near=(actual,expected,tolerance=1e-6)=>assert(actual.distanceTo(expected)<tolerance,`${actual.toArray()} vs ${expected.toArray()}`);
const frame=(state,position,look,dt=1/60,mode='orbit',low=false,tablet=false)=>applyCameraMotion(state,camera,position,look,quaternion,mode,sim,dt,false,low,tablet,43);

{
 const state=createCameraMotionState();
 desired.set(0,10,50);target.set(0,0,0);frame(state,desired,target);
 near(camera.position,new T.Vector3(0,10,50));
 beginCameraTransition(state);
 desired.set(100,20,-50);target.set(10,0,-20);frame(state,desired,target);
 assert(camera.position.distanceTo(new T.Vector3(100,20,-50))>10,'preset does not snap to its destination');
 assert(camera.position.distanceTo(new T.Vector3(0,10,50))>0,'preset begins a damped move');
 for(let i=0;i<60;i++){a.copy(desired);b.copy(target);frame(state,a,b);}
 near(camera.position,desired);

 beginCameraTransition(state);
 a.set(-30,5,70);b.set(0,0,0);frame(state,a,b);
 const before=camera.position.clone();
 interruptCameraTransition(state);
 desired.set(-30,5,70);target.set(0,0,0);frame(state,desired,target);
 near(camera.position,desired,1e-6);
 assert(before.distanceTo(camera.position)>1,'direct gesture interrupts the interpolation');
}

{
 const normal=createCameraMotionState(),economy=createCameraMotionState();
 desired.set(0,10,50);target.set(0,0,0);frame(normal,desired,target);frame(economy,desired,target);
 beginCameraTransition(normal);beginCameraTransition(economy);
 desired.set(140,24,-80);target.set(10,0,-30);
 a.copy(desired);b.copy(target);frame(normal,a,b,1/60,'orbit');
 a.copy(desired);b.copy(target);frame(economy,a,b,1/60,'orbit',true);
 assert(normal.position.distanceTo(economy.position)>.01,'low quality caps the transition duration differently');
}

{
 const first=createCameraMotionState(),second=createCameraMotionState();
 sim.speed=70;sim.buffet=true;
 for(let i=0;i<20;i++){
  a.set(0,10,50);b.set(0,0,0);frame(first,a,b,.02,'cockpit');
  a.set(0,10,50);b.set(0,0,0);frame(second,a,b,.02,'cockpit');
 }
 const firstPose=camera.position.clone();
 a.set(0,10,50);b.set(0,0,0);frame(second,a,b,0,'cockpit');
 near(camera.position,firstPose,1e-10);
 sim.paused=true;
 a.set(0,10,50);b.set(0,0,0);frame(first,a,b,.5,'cockpit');const frozen=camera.position.clone();
 for(let i=0;i<5;i++){a.set(0,10,50);b.set(0,0,0);frame(first,a,b,.05,'cockpit');near(camera.position,frozen,1e-10);}
}

{
 sim.paused=false;sim.buffet=false;sim.speed=75;
 const state=createCameraMotionState();
 a.set(0,10,50);b.set(0,0,0);frame(state,a,b,.016,'chase');
 sim.touchdown={rate:2.1,valid:true};
 a.set(0,10,50);b.set(0,0,0);frame(state,a,b,.05,'chase');
 const impact=camera.position.y;
 for(let i=0;i<80;i++){a.set(0,10,50);b.set(0,0,0);frame(state,a,b,.05,'chase');}
 assert(Math.abs(impact-camera.position.y)>.01,'touchdown cue produces a brief settling displacement');
 assert(camera.position.y>9.9&&camera.position.y<10.1,'touchdown cue settles without cumulative drift');
 const tower=createCameraMotionState();
 sim.buffet=true;sim.touchdown={rate:4,valid:false};
 a.set(0,68,-500);b.set(200,20,0);frame(tower,a,b,.03,'tower');
 near(camera.position,new T.Vector3(0,68,-500),1e-10);
}

{
 const state=createCameraMotionState();
 sim.mode='takeoff';sim.speed=42;sim.altitude=0;sim.touchdown=null;
 a.set(0,10,50);b.set(0,0,0);frame(state,a,b,0,'chase');
 assert(camera.position.y>10,'takeoff chase cue raises the framing as the roll develops');
 sim.mode='land';sim.altitude=45;
 a.set(0,10,50);b.set(0,0,0);frame(state,a,b,0,'chase');
 assert(camera.position.y>10,'landing chase cue offsets the framing toward touchdown');
}

console.log('Camera motion passed: damped presets, interrupted gestures, low-cost profiles, paused stability, deterministic cues, touchdown settling, and steady tower.');
