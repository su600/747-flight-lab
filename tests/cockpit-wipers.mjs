// The windshield blades are real meshes attached to the cockpit/aircraft root.
// Run: node tests/cockpit-wipers.mjs.
import assert from 'node:assert/strict';
import * as T from 'three';
import {createCockpitWipers} from '../src/cockpit-wipers.js';
import {cockpitWiperSweepAngle} from '../src/cockpit-view.js';

const cockpitRoot=new T.Group();
const scale=new T.Vector3(.99,.97,.98);
const wipers=createCockpitWipers(cockpitRoot,scale);
assert.equal(wipers.root.parent,cockpitRoot,'wiper assembly is attached to the cockpit aircraft root');
assert.equal(wipers.root.name,'cockpit-wiper-blades');
const meshes=[];wipers.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
assert.equal(meshes.length,6,'two arms, two blades and two pivots are actual 3D meshes');
assert(meshes.every(m=>m.geometry&&m.material),'all wiper parts have geometry and materials');

// Parked: both assemblies at rest, pivots on the windshield centre line, blades inboard and level.
wipers.update({wipers:false,time:0});
assert.equal(Math.abs(wipers.left.rotation.x),0,'left blade rests flat when switched off');
assert.equal(Math.abs(wipers.right.rotation.x),0,'right blade rests flat when switched off');
assert(wipers.left.position.z<wipers.right.position.z,'left pivot is on the left of the right pivot');
const parkedTip=wipers.left.children.find(c=>c.name==='wiper-blade-left');
assert(Math.abs(parkedTip.position.y)<.05,'parked blade lies near the windshield base, not standing up');

// Active: mirrored sweep that rises from parked and stays within the windshield band.
const angles=[];for(let t=0;t<2*Math.PI;t+=.05){wipers.update({wipers:true,time:t});angles.push(wipers.left.rotation.x);}
assert(Math.max(...angles.map(Math.abs))<=50*Math.PI/180+1e-9,'sweep stays within 50 degrees');
wipers.update({wipers:true,time:Math.PI/6});
const a=cockpitWiperSweepAngle(Math.PI/6)*Math.PI/180;
assert(Math.abs(a-25*Math.PI/180)<1e-10,'sweep follows simulation time');
assert(Math.abs(wipers.left.rotation.x+a)<1e-10,'left blade sweeps up');
assert(Math.abs(wipers.right.rotation.x-a)<1e-10,'right blade mirrors the left');
wipers.update({wipers:false,time:Math.PI/6});
assert.equal(Math.abs(wipers.left.rotation.x),0,'left blade parks when switched off');
assert.equal(Math.abs(wipers.right.rotation.x),0,'right blade parks when switched off');
console.log('Cockpit wipers passed: six aircraft-bound 3D parts, parked flat, mirrored sweep up the glass.');
