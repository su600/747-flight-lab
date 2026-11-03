// CPU regression: the source file's right-hand flap skins (Cylinder233/234/235)
// are bound to slat bones, so they stay put while the flaps move. They are removed
// because the mirrored flap surfaces (bound to flap bones) replace them.
// Run: node tests/a380-right-flap-skins.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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

for(const name of ['Cylinder233','Cylinder234','Cylinder235']){
 assert.equal(aircraft.root.getObjectByName(name),undefined,`${name} is removed`);
}
for(const section of ['IN','MID','OUT']){
 const right=aircraft.root.getObjectByName(`FLAPS_SURFACE_RH_${section}`);
 assert(right?.isSkinnedMesh,`mirrored right flap ${section} is present`);
 assert.equal(right.parent.name,'WING_ARMATURE_RH');
}
console.log('A380 right flap skins passed: source slat-bound flap skins removed; mirrored flap surfaces present.');
