// The DLH100 profile projection follows Lufthansa's published 47 m crane length.
// This guards the active art path and verifies that the teaser-era native atlas
// is not applied to the A380 model.
// Run: node tests/a380-centenary-livery.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {A380Aircraft,keepBaseColorMapsOnly} from '../src/a380-aircraft.js';
import {A380_NATIVE,A380_STYLE,DLH100_CRANE_CENTER_X_METERS,DLH100_CRANE_CENTER_Y_METERS,DLH100_CRANE_LENGTH_METERS,DLH100_CRANE_HEIGHT_METERS} from '../src/a380-liveries.js';
import {A380_ATLAS_VERSION} from '../src/a380-paint.js';

globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,props){this.type=type;Object.assign(this,props);}};

assert.equal(DLH100_CRANE_LENGTH_METERS,47,'Lufthansa publishes a 47 m crane length');
assert.equal(DLH100_CRANE_HEIGHT_METERS,6.1,'the side photo sets the crane height');
assert.equal(DLH100_CRANE_CENTER_X_METERS,6.2,'the crane center is shifted forward to match the real profile');
assert.equal(DLH100_CRANE_CENTER_Y_METERS,-4.25,'the crane center keeps its upper edge on the fuselage crown');
assert(DLH100_CRANE_CENTER_Y_METERS+DLH100_CRANE_HEIGHT_METERS/2<-1.06,'the crane stays below the measured fuselage roofline');
assert.equal(A380_NATIVE.DLH100,undefined,'the teaser-era atlas is not used for the revealed D-AIMH livery');

const artwork=await readFile(new URL('../assets/a380-liveries/liveries.mjs',import.meta.url),'utf8');
const dlhBlock=artwork.match(/DLH:\{real:true,draw\(s\)\{([\s\S]*?)\n \}\},\n DLH100:/)?.[1];
assert(dlhBlock,'standard Lufthansa artwork block exists');
assert.match(dlhBlock,/s\.imageFacing\('lufthansa\.png',cx,cy,6\.9,6\.9,\{flip:true\}\)/,'standard DLH tail crane faces the nose on both side atlases');
assert.match(artwork,/DLH100:\{real:true,draw\(s\)\{[\s\S]*?s\.imageFacing\('lufthansa-white\.png',cx,cy,6\.9,6\.9,\{flip:true\}\)/,'DLH100 tail crane keeps its correct forward-facing orientation');

const names=['fuselage','wings','nose','wing-left','wing-right','body-left','body-right'];
const files={};for(const f of names)files[f]=await readFile(new URL(`../assets/a380/${f}.glb`,import.meta.url));
const loader={parseAsync:(data,path)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(keepBaseColorMapsOnly(data),path)};
const fetchImpl=async url=>{const b=files[url.split('/').pop().replace(/\.glb$/,'')];return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};

for(const side of ['port','starboard']){
 const bytes=await readFile(new URL(`../assets/a380-liveries/DLH100-${side}.webp`,import.meta.url));
 assert(bytes.length>20000,`${side} profile artwork is a real WebP texture`);
 assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF');
 assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP');
}

const loaded=[];
const loadTexture=async url=>{loaded.push(url);const texture=new T.Texture();texture.name=url;return texture;};
const aircraft=await new A380Aircraft({loader,fetchImpl,timeoutMs:600000,loadTexture}).load();
const paint=aircraft.paint;
assert(await paint.apply('DLH100',A380_STYLE.DLH100),'DLH100 profile projection applies');

const centenaryLoads=loaded.filter(url=>url.includes('/DLH100-'));
assert.deepEqual(centenaryLoads.map(url=>new URL(url,'http://localhost').pathname.split('/').pop()).sort(),['DLH100-port.webp','DLH100-starboard.webp']);
assert(centenaryLoads.every(url=>new URL(url,'http://localhost').searchParams.get('v')===A380_ATLAS_VERSION),'DLH100 URLs use the bumped cache version');
assert(!loaded.some(url=>url.includes('/native/')),'the old native atlas is not requested');

let projected=0;
aircraft.root.traverse(o=>{
 if(!o.isMesh)return;
 for(const material of [o.material].flat()){
  if(!/^A380X_FUSE[1235]$/.test(material?.name||''))continue;
  assert.equal(material.userData.livery,'projected',`${material.name} uses the measured side artwork`);
  assert.equal(material.map,null,`${material.name} samples the shared profile projection shader`);
  projected++;
 }
});
assert(projected>0,'A380 fuselage material slots use the projected livery');

const finMeshes=[],stabilizerMeshes=[];
aircraft.root.traverse(o=>{
 if(!o.isMesh||![o.material].flat().some(m=>m?.name==='A380X_FUSE4'))return;
 let inFin=false;for(let p=o;p&&p!==aircraft.root;p=p.parent)if(p.name==='VTP'){inFin=true;break;}
 if(!inFin){const centre=new T.Box3().setFromObject(o).getCenter(new T.Vector3());inFin=centre.y>0&&centre.x<-20;}
 (inFin?finMeshes:stabilizerMeshes).push(o);
});
assert(finMeshes.length>0&&stabilizerMeshes.length>0,'the fin and horizontal stabilizers are identified separately');
for(const mesh of finMeshes)for(const m of [mesh.material].flat())if(m.name==='A380X_FUSE4')assert.equal(m.userData.livery,'projected','the fin uses the measured projection');
for(const mesh of stabilizerMeshes)for(const m of [mesh.material].flat())if(m.name==='A380X_FUSE4')assert.equal(m.userData.livery,'stabilizer','the stabilizers retain their flat color');

assert(await paint.apply('BAW',A380_STYLE.BAW),'switching back to a projected airline livery works');
for(const mesh of finMeshes)for(const m of [mesh.material].flat())if(m.name==='A380X_FUSE4')assert.equal(m.userData.livery,'projected','switching away keeps the fin in projected mode');
paint.dispose();
console.log(`A380 centenary livery passed: ${projected} fuselage slots use the 47 m profile artwork; the native atlas is not requested and flat stabilizers are preserved.`);
