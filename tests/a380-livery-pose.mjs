// CPU regression for the shimmering British Airways livery. The livery projection
// uses the inverse aircraft root transform. It must match the current frame's pose
// after every update, or parts drawn earlier in a frame show last frame's livery.
// Run: node tests/a380-livery-pose.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {A380Aircraft,keepBaseColorMapsOnly} from '../src/a380-aircraft.js';

globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,props){this.type=type;Object.assign(this,props);}};

const names=['fuselage','wings','nose','wing-left','wing-right','body-left','body-right'];
const files={};for(const f of names)files[f]=await readFile(new URL(`../assets/a380/${f}.glb`,import.meta.url));
const loader={parseAsync:(data,path)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(keepBaseColorMapsOnly(data),path)};
const fetchImpl=async url=>{const b=files[url.split('/').pop().replace(/\.glb$/,'')];return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
const aircraft=await new A380Aircraft({loader,fetchImpl,timeoutMs:600000}).load();
const state={gear:1,flaps:0,engine:0,elevator:.5,aileron:.5,rudder:.5,spoiler:0};
const uniform=aircraft.paint.uniforms.uLiveryInverseRoot.value;

function expectedInverse(){
 aircraft.root.updateWorldMatrix(true,false);
 return new T.Matrix4().copy(aircraft.root.matrixWorld).invert();
}
function assertMatches(label){
 const expected=expectedInverse();
 for(let i=0;i<16;i++)assert(Math.abs(uniform.elements[i]-expected.elements[i])<1e-6,`${label}: livery inverse root matches this frame's pose`);
}

for(const pitch of [0,11,-4]){
 aircraft.root.quaternion.setFromEuler(new T.Euler(0,0,T.MathUtils.degToRad(pitch)));
 aircraft.update(state,0);
 assertMatches(`pitch ${pitch}`);
}
console.log('A380 livery pose passed: the livery projection follows the aircraft pose in every update.');
