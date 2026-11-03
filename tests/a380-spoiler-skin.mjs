// CPU regression: the right wing skin must not lift off the wing when spoilers
// deploy. The left wing has no spoiler-driven skin, so both sides should stay put.
// Run: node tests/a380-spoiler-skin.mjs.
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

const skinned=[];aircraft.root.traverse(o=>{if(o.isSkinnedMesh)skinned.push(o);});
for(const mesh of skinned){
 const spoilerBones=new Set(mesh.skeleton.bones.map((b,i)=>/^WING_SPOILER/.test(b.name)?i:-1).filter(i=>i>=0));
 const index=mesh.geometry.getAttribute('skinIndex'),weight=mesh.geometry.getAttribute('skinWeight');
 for(let v=0;v<index.count;v++)for(let c=0;c<4;c++){
  if(spoilerBones.has(index.getComponent(v,c)))assert.equal(weight.getComponent(v,c),0,`${mesh.name}: spoiler bone carries no weight`);
 }
}

// Deploy spoilers and check that no skinned vertex moves relative to spoilers retracted.
const v=new T.Vector3();
function skinSnapshot(spoiler){
 aircraft.update({gear:0,flaps:0,engine:.2,elevator:.5,aileron:.5,rudder:.5,spoiler},0);
 aircraft.root.updateMatrixWorld(true);
 return skinned.map(mesh=>{mesh.skeleton.update();const p=mesh.geometry.getAttribute('position');const out=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){mesh.getVertexPosition(i,v);out.set([v.x,v.y,v.z],i*3);}return out;});
}
const retracted=skinSnapshot(0),deployed=skinSnapshot(1);
skinned.forEach((mesh,k)=>{
 let worst=0;const a=retracted[k],b=deployed[k];
 for(let i=0;i<a.length;i++)worst=Math.max(worst,Math.abs(a[i]-b[i]));
 assert(worst<1e-4,`${mesh.name}: skin stays on the wing when spoilers deploy (moved ${worst.toFixed(3)} m)`);
});
console.log('A380 spoiler skin passed: no skinned surface follows the spoiler bones; both wings stay attached when spoilers deploy.');
