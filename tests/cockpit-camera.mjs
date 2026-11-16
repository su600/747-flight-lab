// The cockpit camera stays at the scaled eye point, even when the aircraft moves.
// Run: node tests/cockpit-camera.mjs.
import assert from 'node:assert/strict';
import * as T from 'three';
import {cameraPose,applyCameraPose} from '../src/camera-follow.js';

const camera=new T.PerspectiveCamera(),position=new T.Vector3(),target=new T.Vector3();
const planePosition=new T.Vector3(100,300,-50),planeQuaternion=new T.Quaternion().setFromEuler(new T.Euler(.1,.7,-.2));
const cockpitScale=new T.Vector3(1.1,.9,1.2);
const options={mode:'cockpit',planePosition,planeQuaternion,cockpitScale,lookYaw:0,lookPitch:0};
for(const distance of [0,130/60,130/240]){
 planePosition.x+=distance;
 cameraPose(options,position,target);applyCameraPose(camera,position,target,planeQuaternion,'cockpit');
 const eye=new T.Vector3(24.05,3.8,-.55).multiply(cockpitScale).applyQuaternion(planeQuaternion).add(planePosition);
 assert(camera.position.distanceTo(eye)<1e-9,'cockpit camera stays locked to the scaled eye');
 const up=new T.Vector3(0,1,0).applyQuaternion(planeQuaternion);
 assert(camera.up.distanceTo(up)<1e-9,'cockpit up follows aircraft attitude');
}
console.log('Cockpit camera passed: scaled eye and up are locked to the airframe.');
