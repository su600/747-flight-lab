// The centenary A380 ships the paint shop's own A380X UV atlas instead of the
// side-projected artwork. This checks that selecting it swaps the fuselage and
// fin materials onto that atlas, that the stabilizers keep their flat colour,
// and that switching back restores the projection.
// Run: node tests/a380-native-livery.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {A380Aircraft,keepBaseColorMapsOnly} from '../src/a380-aircraft.js';
import {A380_NATIVE} from '../src/a380-liveries.js';

globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,props){this.type=type;Object.assign(this,props);}};

const names=['fuselage','wings','nose','wing-left','wing-right','body-left','body-right'];
const files={};for(const f of names)files[f]=await readFile(new URL(`../assets/a380/${f}.glb`,import.meta.url));
const loader={parseAsync:(data,path)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(keepBaseColorMapsOnly(data),path)};
const fetchImpl=async url=>{const b=files[url.split('/').pop().replace(/\.glb$/,'')];return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};

// Every native file must exist and be a real WebP, not a placeholder.
for(const [material,file] of Object.entries(A380_NATIVE.DLH100)){
 const bytes=await readFile(new URL(`../assets/a380-liveries/native/${file}`,import.meta.url));
 assert(bytes.length>20000,`${file} is a real texture (${bytes.length} bytes)`);
 assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF',`${file} is a WebP container`);
 assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP',`${file} is a WebP container`);
 assert(/^A380X_FUSE[1-5]$/.test(material),`${material} is a fuselage material`);
}

const loaded=[];
const loadTexture=async url=>{
 loaded.push(url);
 const texture=new T.Texture();
 texture.name=url;
 return texture;
};
const aircraft=await new A380Aircraft({loader,fetchImpl,timeoutMs:600000,loadTexture}).load();
const paint=aircraft.paint;

const fuselageMeshes=[];
aircraft.root.traverse(o=>{
 if(!o.isMesh)return;
 const names=[o.material].flat().map(m=>m?.name);
 if(names.some(n=>/^A380X_FUSE[1-5]$/.test(n)))fuselageMeshes.push(o);
});
assert(fuselageMeshes.length>0,'the model exposes fuselage meshes');

const before=fuselageMeshes.map(o=>o.material);
assert(await paint.apply('DLH100',{stabilizer:'#f4f5f6',nacelle:'#f4f5f6',winglet:'#f4f5f6'}),'DLH100 applies');
assert(loaded.some(url=>url.includes('/native/DLH100-FUSE1.webp')),'the native atlas is requested');

// FUSE4 is shared by the fin and the stabilizers, so it is checked separately below.
let mapped=0;
for(const mesh of fuselageMeshes){
 for(const m of [mesh.material].flat()){
  if(!/^A380X_FUSE[1235]$/.test(m.name))continue;
  assert(m.map,`${m.name} samples the native atlas`);
  assert(m.map.name.includes(`/native/DLH100-${m.name.replace(/^A380X_/,'')}.webp`),`${m.name} samples its own atlas file`);
  // The GLB UVs are quantized int16: without this transform the atlas samples
  // an all-white corner and the aircraft would render blank.
  if(m.map.needsUpdate===false)m.map.needsUpdate=true;
  assert(Math.abs(m.map.repeat.x-1/65535)<1e-9,`${m.name} quantized-U repeat is set`);
  assert.equal(m.map.flipY,true,`${m.name} observes the GLB's OpenGL V origin`);
  assert(Math.abs(m.map.offset.x-.5)<1e-9,`${m.name} quantized-U offset is set`);
  assert.equal(m.userData.livery,'native',`${m.name} is in native mode`);
  mapped++;
 }
}
assert(mapped>0,'at least one fuselage material took the native atlas');

// The fin takes the atlas; the horizontal stabilizers must not, or they would
// repeat the fin's crane roundel.
const finMeshes=[],stabilizerMeshes=[];
aircraft.root.traverse(o=>{
 if(!o.isMesh)return;
 if(![o.material].flat().some(m=>m?.name==='A380X_FUSE4'))return;
 let inFin=false;for(let p=o;p&&p!==aircraft.root;p=p.parent)if(p.name==='VTP'){inFin=true;break;}
 if(!inFin){const centre=new T.Box3().setFromObject(o).getCenter(new T.Vector3());inFin=centre.y>0&&centre.x<-20;}
 (inFin?finMeshes:stabilizerMeshes).push(o);
});
assert(finMeshes.length>0,'the fin is present');
for(const mesh of finMeshes)for(const m of [mesh.material].flat())if(m.name==='A380X_FUSE4')assert.equal(m.userData.livery,'native','the fin samples the native atlas');
for(const mesh of stabilizerMeshes)for(const m of [mesh.material].flat())if(m.name==='A380X_FUSE4')assert.equal(m.userData.livery,'stabilizer','the stabilizers stay flat');

// Switching to a projected livery must put the projection materials back.
assert(await paint.apply('BAW',{stabilizer:'#f4f5f6',nacelle:'#1f2a6b',winglet:'#1f2a6b'}),'BAW applies');
for(const mesh of fuselageMeshes)for(const m of [mesh.material].flat())if(/^A380X_FUSE[1235]$/.test(m.name))assert.equal(m.userData.livery,'projected','the projection is restored');

console.log(`A380 native livery passed: ${mapped} fuselage materials sample the D-AIMH atlas, the fin follows it and the stabilizers stay flat.`);
