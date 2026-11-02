// CPU-only integration with the existing candidate. No image decoding or GPU.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createB777LiveryController} from '../src/b777-livery.js';

const path='assets/accurate-b777/777-200F-refined.candidate.glb';
if (!fs.existsSync(path)) throw Error('200F candidate unavailable');
const available=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1]);
if (!available || available<450*1024) throw Error('Less than 450 MiB available; refusing candidate test');
const file=fs.readFileSync(path), jsonLength=file.readUInt32LE(12);
assert.equal(file.toString('ascii',0,4),'glTF');
const meta=JSON.parse(file.toString('utf8',20,20+jsonLength));
assert.equal(meta.asset.extras.sourceIdentity,'FlightGear Boeing 777-200F');
const loader=new GLTFLoader().register(()=>({name:'TEXTURE_STUB',loadTexture(){return Promise.resolve(new T.Texture());}}));
const gltf=await loader.parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
const src='Liveries-F/AFR1blanc.png';
const matches=[], untouched=[];let seal,door,window=false;
gltf.scene.traverse(o=>{
 if(o.userData.fgName==='hublot')seal=o;
 if(o.userData.fgName==='entry11l')door=o;
 if(o.userData.fgName==='glassehublot')window=true;
 if(!o.isMesh)return;
 if([o.material].flat().some(m=>m?.userData?.sourceTexture===src)) matches.push({mesh:o,material:o.material});
 else untouched.push({mesh:o,material:o.material});
});
assert.ok(matches.length>5);assert.ok(door);assert.equal(seal.userData.role,'cargo-window-seal');assert.equal(window,false);
assert.ok(matches.some(x=>x.mesh===seal || x.mesh.parent===seal));
assert.ok(matches.some(x=>x.mesh===door || x.mesh.parent===door));
let released=0;const paint=createB777LiveryController(gltf.scene,{variant:'cargo',
 manifestFor:({id})=>({id,variant:'cargo',maps:[{sourceTexture:src,url:'/test-only.png'}]}),
 loadTexture:()=>({texture:new T.Texture(),dispose(){released++;}})});
assert.equal(await paint.setLivery('fedex'),true);
for(const {mesh,material} of matches)assert.notEqual(mesh.material,material);
for(const {mesh,material} of untouched)assert.equal(mesh.material,material);
assert.equal(seal.visible,true);assert.equal(door.visible,true);
paint.dispose();assert.equal(released,1);
for(const {mesh,material} of matches)assert.equal(mesh.material,material);
// Probe just the actual Fuselage skin from both sides in native Y-up metres.
// This reveals a UV-island discontinuity; do not extend these samples to
// cargo doors, tail, nose taper, or other animated objects without probing.
let hull;gltf.scene.traverse(o=>{if(o.userData.fgName==='Fuselage')hull=o;});assert.ok(hull);
hull.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())m.side=T.DoubleSide;});
gltf.scene.updateMatrixWorld(true);
const ray=new T.Raycaster(), samples=[];ray.far=5;
const expected=[[-20,.122015,.054780,.180085],[-10,.390214,.054780,.180085],
 [0,.658425,.054781,.180085],[10,.165094,.555753,.679600],
 [20,.433299,.555753,.679600],[30,.701501,.555753,.679599]];
for(const [x,u,vLeft,vRight] of expected)for(const sign of [-1,1]){
 ray.set(new T.Vector3(x,.3,sign*5),new T.Vector3(0,0,-sign));
 const hit=ray.intersectObject(hull,true)[0];assert.ok(hit?.uv);
 assert.equal(hit.object.material.userData.sourceTexture,src);
 assert.ok(Math.abs(hit.uv.x-u)<.0005 && Math.abs(hit.uv.y-(sign<0?vLeft:vRight))<.0005);
 samples.push({x,side:sign,uv:hit.uv.toArray().map(n=>Number(n.toFixed(6)))});
}
console.log(JSON.stringify({candidate:path,changedMeshCount:matches.length,sourceTexture:src,door:'entry11l',seal:'cargo-window-seal',samples,peakRssKiB:process.resourceUsage().maxRSS,note:'Stub texture and sparse skin probes: no livery, full UV, sealing, animation or visual validation.'},null,2));
