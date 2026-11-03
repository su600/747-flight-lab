// Run: node tests/a380-paint.mjs  (CPU only: real A380 geometry, stubbed textures)
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Aircraft,LIVERIES} from '../src/aircraft.js';
import {installA380Paint,A380_ATLAS} from '../src/a380-paint.js';
import {A380_STYLE} from '../src/a380-liveries.js';
import {A380_REALITY} from '../src/reality-a380.js';

async function geometryOnlyGLB(name){
 const data=await readFile(new URL(`../assets/a380/${name}.glb`,import.meta.url));
 const size=data.readUInt32LE(12),json=JSON.parse(data.subarray(20,20+size).toString());
 for(const m of json.materials||[]){delete m.normalTexture;delete m.emissiveTexture;delete m.occlusionTexture;if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}}
 delete json.images;delete json.textures;delete json.samplers;
 const text=Buffer.from(JSON.stringify(json)),n=(text.length+3)&~3,bin=data.subarray(20+size),out=Buffer.alloc(20+n+bin.length,0x20);
 out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(n,12);out.write('JSON',16);text.copy(out,20);bin.copy(out,20+n);
 return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');
}
// Catalog, atlas files and reality table agree.
for(const l of LIVERIES){
 assert(A380_STYLE[l.id],`style for ${l.id}`);assert(A380_REALITY[l.id],`reality for ${l.id}`);
 assert(['real','family','none'].includes(A380_REALITY[l.id].status));assert(A380_REALITY[l.id].note.length<=70,`${l.id} note length`);
 for(const side of ['port','starboard'])await access(new URL(`../assets/a380-liveries/${l.id}-${side}.webp`,import.meta.url));
}
assert.deepEqual(Object.keys(A380_REALITY).sort().join(),['AF1_2026','AF1_CLASSIC','BAW','BOE','CCA','CEA','CHH','CSN','DLH','DLH100','KLM','UAE','fedex','sf'].sort().join());
assert.deepEqual(Object.entries(A380_REALITY).filter(([,v])=>v.status==='real').map(([k])=>k).sort(),['BAW','BOE','CSN','DLH','DLH100','UAE'],'only operators with a real A380 are marked real');
assert.match(A380_REALITY.DLH100.note,/D-AIMH.*47 米.*鹤标.*“100”及“1926 \| 2026”/);
assert.equal(A380_STYLE.DLH100.nacelle,'#f4f5f6','D-AIMH anniversary engines remain white');
assert.equal(A380_STYLE.DLH100.stabilizer,'#f4f5f6','D-AIMH anniversary horizontal stabilizers remain white');

const aircraft=new Aircraft();aircraft.type='a380';
const model=new T.Group();model.rotation.y=Math.PI/2;aircraft.root.add(model);
for(const name of ['fuselage','wings','nose','wing-left','wing-right','body-left','body-right']){
 const gltf=await geometryOnlyGLB(name);model.add(gltf.scene);const invisible=[];
 gltf.scene.traverse(o=>{if(o.isMesh&&[o.material].flat().every(m=>m.userData.viewerInvisible||/^Material\.00[12]$/.test(m.name)))invisible.push(o);});invisible.forEach(o=>o.removeFromParent());
}
aircraft.root.updateMatrixWorld(true);let box=new T.Box3().setFromObject(aircraft.root,true),size=box.getSize(new T.Vector3());model.scale.setScalar(79.8/size.z);
aircraft.root.updateMatrixWorld(true);box.setFromObject(aircraft.root,true);model.position.sub(box.getCenter(new T.Vector3()));aircraft.root.updateMatrixWorld(true);

const loads=[],gates=new Map();
const loadTexture=url=>new Promise(resolve=>{const t=new T.Texture();t.url=url;loads.push(url);gates.set(url,()=>resolve(t));});
const paint=installA380Paint(aircraft,{loadTexture,timeoutMs:200});

// Fuselage and fin skins are projected; stabilizers, cowls and fences are flat colours.
let projectedMeshes=0,flatTail=0;
aircraft.root.traverse(o=>{
 if(!o.isMesh)return;
 for(const m of [o.material].flat()){
  if(m.userData.livery==='projected'){projectedMeshes++;assert.equal(m.map,null);assert(typeof m.onBeforeCompile==='function');assert.match(m.name,/^A380X_FUSE[1-5]$/,'material names stay recognisable for the lighting module');}
  if(m.userData.livery==='stabilizer')flatTail++;
 }
});
assert(projectedMeshes>100,`projected skin meshes ${projectedMeshes}`);assert(flatTail>0,'horizontal stabilizer kept separate from the projected fin');
assert(paint.flatByRole.nacelle.length>0&&paint.flatByRole.fence.length>0);
assert(paint.caps.length===3&&paint.caps.every(c=>!c.visible),'window caps exist and stay hidden for airliners');
assert(paint.windows.length===18&&paint.windows.every(([o])=>o.visible));
const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <map_fragment>'};
[...paint.projected.values()][0].onBeforeCompile(shader);
assert(shader.vertexShader.includes('vLiveryPosition')&&shader.fragmentShader.includes('textureGrad'));
assert(shader.uniforms.uLiveryPort&&shader.uniforms.uLiveryStarboard&&shader.uniforms.uLiveryAtlas&&shader.uniforms.uLiveryInverseRoot);
assert.deepEqual(shader.uniforms.uLiveryAtlas.value.toArray().map(v=>+v.toFixed(5)),[A380_ATLAS.x0,+(1/(A380_ATLAS.x1-A380_ATLAS.x0)).toFixed(5),A380_ATLAS.y1,+(1/(A380_ATLAS.y1-A380_ATLAS.y0)).toFixed(5)]);

// A newer selection supersedes an older one; both sides load; styles apply.
const first=paint.apply('UAE',A380_STYLE.UAE),second=paint.apply('BAW',A380_STYLE.BAW);
assert.deepEqual(loads.slice(0,4).map(u=>u.split('/').pop()),['UAE-port.webp','UAE-starboard.webp','BAW-port.webp','BAW-starboard.webp']);
for(const u of loads)gates.get(u)();
assert.equal(await first,false,'older request must not apply');assert.equal(await second,true);assert.equal(paint.current,'BAW');
assert.equal(paint.uniforms.uLiveryPort.value.url.split('/').pop(),'BAW-port.webp');
assert.equal(paint.flatByRole.nacelle[0].color.getHexString(),'1f2a6b','BA navy nacelles');
// Freight closes the cabin windows and shows the caps; an airliner reopens them.
const f=paint.apply('fedex',A380_STYLE.fedex);for(const u of loads.slice(4))gates.get(u)?.();assert.equal(await f,true);
assert(paint.caps.every(c=>c.visible)&&paint.windows.every(([o])=>!o.visible),'freighter windows closed');
const total=paint.caps.reduce((n,c)=>n+c.userData.windowCenters.length,0);assert(total>100,`window caps ${total}`);
const back=paint.apply('UAE',A380_STYLE.UAE);for(const u of loads.slice(6))gates.get(u)?.();assert.equal(await back,true);
assert(paint.caps.every(c=>!c.visible)&&paint.windows.every(([o])=>o.visible),'passenger windows restored');
// A stalled download fails with a retryable error and does not poison later requests.
await assert.rejects(paint.apply('CSN',A380_STYLE.CSN),/超时/);
const retry=paint.apply('CSN',A380_STYLE.CSN);for(const u of loads.slice(8))gates.get(u)?.();assert.equal(await retry,true);
paint.dispose();
console.log(`A380 paint: ${projectedMeshes} projected skin meshes, ${total} window caps, ${LIVERIES.length} liveries with atlas files, status table consistent.`);
