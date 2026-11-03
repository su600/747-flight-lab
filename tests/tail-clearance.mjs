// Real-geometry tail clearance check. Run: node tests/tail-clearance.mjs
// Uses the A380 fuselage GLB (no browser or GPU). The fin tip identifies the aft end.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Flight,groundLift} from '../src/flight.js';
import {tailSamples,makePitchLimit,TAIL_CLEARANCE_M} from '../src/tail-clearance.js';

async function geometryOnly(buffer){
 const size=buffer.readUInt32LE(12),json=JSON.parse(buffer.toString('utf8',20,20+size).trim());
 for(const m of json.materials||[]){delete m.normalTexture;delete m.emissiveTexture;delete m.occlusionTexture;if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}}
 delete json.images;delete json.textures;delete json.samplers;
 const text=Buffer.from(JSON.stringify(json)),length=(text.length+3)&~3,bin=buffer.subarray(20+size),glb=Buffer.alloc(20+length+bin.length,0x20);
 glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(length,12);glb.write('JSON',16);text.copy(glb,20);bin.copy(glb,20+length);
 return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
}

// Build a root whose origin sits on the ground at rest, like the renderer.
const gltf=await geometryOnly(await readFile(new URL('../assets/a380/fuselage.glb',import.meta.url)));
// Same placement as A380Aircraft.load(): rotate, centre in x/z, rest on y=0.
// GLB units are metres and the loader's scale is ~1 (it scales by wingspan, not
// by this fuselage-only box), so no extra scale is applied here.
const root=new T.Group();
const model=gltf.scene;model.rotation.y=Math.PI/2;root.add(model);
// Drop the same helper meshes A380Aircraft.load() removes before measuring.
const hidden=[];model.traverse(o=>{if(o.isMesh&&[o.material].flat().every(m=>m.userData.viewerInvisible||/^Material\.00[12]$/.test(m.name)))hidden.push(o);});
hidden.forEach(o=>o.removeFromParent());
root.updateMatrixWorld(true);
let box=new T.Box3().setFromObject(root,true);
model.position.sub(box.getCenter(new T.Vector3()));
root.updateMatrixWorld(true);box=new T.Box3().setFromObject(root,true);
const contact=-box.min.y;

const samples=tailSamples(root);
assert(samples.length>100,`tail samples ${samples.length}`);
const fs=samples.map(s=>s.f);
let minF=Infinity,maxF=-Infinity;for(const f of fs){if(f<minF)minF=f;if(f>maxF)maxF=f;}
// The aft quarter of a ~73 m fuselage spans roughly 18 m.
const spread=maxF-minF;
console.log(`tail samples ${samples.length}, span ${spread.toFixed(1)} m`);
assert(spread>12&&spread<22,`tail span ${spread} m is about a quarter of the ~73 m fuselage`);

const limit=makePitchLimit(samples,contact);
const p0=limit(0),p5=limit(5),p20=limit(20);
console.log(`pitch limit deg: ground ${p0.toFixed(2)}, 5 m ${p5.toFixed(2)}, 20 m ${p20.toFixed(2)}`);
assert(p0>0&&p0<=40,`ground limit ${p0}`);
assert(p0<=p5&&p5<=p20,'limit grows with altitude');

// At the limit, the lowest tail point is above clearance; one step beyond it is not.
function tailHeight(deg,alt){
 const s=Math.sin(deg*Math.PI/180),c=Math.cos(deg*Math.PI/180);let m=Infinity;
 for(const p of samples){const y=p.f*s+p.y*c;if(y<m)m=y;}
 return contact+alt+groundLift(deg,alt)+m;
}
for(const alt of [0,0.5,5]){
 const lim=limit(alt);
 assert(tailHeight(lim,alt)>=TAIL_CLEARANCE_M-1e-6,`clearance at limit alt=${alt}`);
 if(lim<40)assert(tailHeight(lim+1,alt)<TAIL_CLEARANCE_M,`limit is tight alt=${alt}`);
}

// Ground lift is continuous and fades out by 2 m.
assert.equal(groundLift(10,0),Math.max(0,Math.sin(10*Math.PI/180)*4));
assert.equal(groundLift(10,2),0);
assert(groundLift(10,1)>0&&groundLift(10,1)<groundLift(10,0));

// The flight model never pitches past the tail limit during a takeoff run.
const sim=new Flight();
sim.pitchLimit=limit;
sim.reset('takeoff');
let maxRatio=0;
for(let i=0;i<60*120&&!sim.failed;i++){
 sim.step(1/60,{});
 const cap=limit(sim.altitude);
 assert(sim.pitch<=cap+1e-9,`pitch ${sim.pitch.toFixed(3)} exceeds tail limit ${cap.toFixed(3)} at alt ${sim.altitude.toFixed(2)}`);
 if(sim.altitude<2)maxRatio=Math.max(maxRatio,sim.pitch/Math.max(cap,1e-6));
}
console.log(`takeoff run: pitch stayed within tail limit (low-altitude max ratio ${maxRatio.toFixed(3)})`);
console.log('tail clearance passed: real A380 tail geometry limits pitch by altitude and never exceeds it in flight.');
