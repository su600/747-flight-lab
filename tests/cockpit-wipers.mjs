// The windshield blades are real meshes attached to the cockpit/aircraft root.
// Run: node tests/cockpit-wipers.mjs.
import assert from 'node:assert/strict';
import * as T from 'three';
import {createCockpitWipers} from '../src/cockpit-wipers.js';

const cockpitRoot=new T.Group();
const scale=new T.Vector3(.99,.97,.98);
const wipers=createCockpitWipers(cockpitRoot,scale);
assert.equal(wipers.root.parent,cockpitRoot,'wiper assembly is attached to the cockpit aircraft root');
assert.equal(wipers.root.name,'cockpit-wiper-blades');
const meshes=[];wipers.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
assert.equal(meshes.length,6,'two arms, two blades and two pivots are actual 3D meshes');
assert(meshes.every(m=>m.geometry&&m.material),'all wiper parts have geometry and materials');

wipers.update({wipers:true,time:Math.PI/6});
const activeAngle=26*Math.PI/180;
assert(Math.abs(wipers.left.rotation.x-activeAngle)<1e-10,'left blade sweeps with simulation time');
assert(Math.abs(wipers.right.rotation.x+activeAngle)<1e-10,'right blade sweeps in the opposite direction');
wipers.update({wipers:false,time:Math.PI/6});
assert(Math.abs(wipers.left.rotation.x)<1e-10,'left blade parks when switched off');
assert(Math.abs(wipers.right.rotation.x)<1e-10,'right blade parks when switched off');
console.log('Cockpit wipers passed: six aircraft-bound 3D parts, synchronized sweep and park behavior.');
