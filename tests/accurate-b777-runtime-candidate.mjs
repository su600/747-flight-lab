// One real 200LR or 200F candidate per CPU process; stub image decoding, no GPU.
// This does not validate appearance, FG equivalence, topology or certification.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseXml} from './xml-fixture-parser.mjs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Aircraft} from '../src/aircraft.js';
import {AccurateB777Candidate,createB777CandidateGeometryLoader,B777_SOURCE,b777CandidatePaintSlots} from '../src/accurate-b777.js';
import {createB777LiveryController,createB777LiveryLoader} from '../src/b777-livery.js';
const variant=process.argv[2]||'cargo';assert.ok(['passenger','cargo'].includes(variant));
const available=Number(readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1]);
if(!available||available<512*1024)throw Error('Less than 512 MiB available; refusing candidate CPU load');
const dir=fileURLToPath(new URL('../assets/accurate-b777/',import.meta.url));
const parseXML=xml=>parseXml(xml);
let fetches=[],failNext=true;
const fetchFn=async url=>{
 const name=url.startsWith(dir)?url.slice(dir.length):url;fetches.push(name);
 if(failNext){failNext=false;return {ok:false,status:503};}
 const file=readFileSync(dir+name);
 const hashes={
  'source-alternatives/2048/777-200LR-v2.xml':'6bf3619544cadf4252c9f8e326fcd101168478d059e6565dcd1bc1cd35da974a',
  '777-200LR-2048.candidate.glb':'884f9ed9277080d5c08fb12d26c0447e42a97491044e6095be41034f5916848d',
  '777-200F-v2.xml':'49d9d98c49179de7c6979bbdbdfbaa4485c85429b55021e14ac2caeeda978e45',
  '777-200F-refined.candidate.glb':'0db396d09aeea164ca56ba77863d26e559f49abb64cd56ba7260694dfbc9be54',
 };
 assert.equal(createHash('sha256').update(file).digest('hex'),hashes[name],`source hash ${name}`);
 return {ok:true,status:200,text:async()=>file.toString('utf8'),arrayBuffer:async()=>file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength)};
};
let textureDisposes=0,imageDisposes=0;
// The checked-in candidate GLBs use EXT_texture_webp. Stub only the browser
// capability probe and bitmap close lifecycle; no pixels are decoded in this CPU test.
if(typeof globalThis.Image==='undefined')globalThis.Image=class{
 constructor(){this.width=1;this.height=1;}
 set src(_){queueMicrotask(()=>this.onload?.());}
};
const decodeCpuImage=async()=>({width:1,height:1,close(){imageDisposes++;}});
const loaderFactory=()=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(()=>({name:'B777_CPU_TEXTURE_STUB',loadTexture(){
 const t=new T.Texture({width:1,height:1});t.addEventListener('dispose',()=>textureDisposes++);return Promise.resolve(t);
}}));
// Unresolved source overrides are reported; failed embedded texture decoding remains a hard error.
const geometryLoader=createB777CandidateGeometryLoader({baseURL:dir,fetchFn,parseXML,loaderFactory,decodeImage:decodeCpuImage});
await assert.rejects(geometryLoader({variant:'wrong'}),/Unknown B777 candidate/);assert.deepEqual(fetches,[]);
await assert.rejects(geometryLoader({variant}),/HTTP 503/);
const bundle=await geometryLoader({variant,source:B777_SOURCE[variant]});
assert.deepEqual(fetches,[B777_SOURCE[variant].xml,B777_SOURCE[variant].xml,B777_SOURCE[variant].asset]);
assert.equal(bundle.model,B777_SOURCE[variant].model);assert.equal(bundle.sourceRevision,B777_SOURCE[variant].revision);
let solidMeshes=0;bundle.scene.traverse(o=>{if(!o.isMesh)return;const opaque=[o.material].flat().some(m=>m&&!m.transparent&&(m.opacity??1)>=1);assert.equal(o.castShadow,opaque);assert.equal(o.receiveShadow,opaque);if(opaque)solidMeshes++;});
assert(solidMeshes>100,'777 exterior must cast shadows');
assert.ok(bundle.contact>4&&bundle.contact<7,`candidate contact: ${bundle.contact}`);
assert.ok(bundle.dimensions.x>60&&bundle.dimensions.x<70&&bundle.dimensions.z>60&&bundle.dimensions.z<70);
assert.ok(bundle.animationIndices.includes(variant==='cargo'?61:67));assert.ok(bundle.animationIndices.includes(variant==='cargo'?228:301));
assert.ok(bundle.animationIndices.includes(variant==='cargo'?338:412));assert.ok(bundle.animationReport.ambiguousAxes.includes(variant==='cargo'?223:296));
const allByName=name=>{const out=[];bundle.scene.traverse(o=>{if(o.userData?.fgName===name)out.push(o);});return out;};
const byName=name=>{const out=allByName(name);assert.equal(out.length,1,'missing or duplicate '+name);return out[0];};
const door=byName(variant==='cargo'?'entry11l':'entry5r'),flap=byName('Rflap1'),wheel=byName('FrtWheel'),rudder=byName('Rudder'),fan=byName('Lfan'),rightFan=byName('Rfan');
if(variant==='cargo'){
 assert.equal(bundle.cabinWindows.length,0);assert.equal(byName('hublot').userData.role,'cargo-window-seal');
 assert.ok(bundle.animationIndices.includes(209));assert.deepEqual(bundle.groundReport.missingWheelNames,[]);
}else{
 assert.ok(bundle.cabinWindows.length>0);assert.equal(allByName('RHwheel.1').length,1);
 assert.deepEqual(bundle.groundReport.missingWheelNames,[]);assert.ok(bundle.animationIndices.includes(126));
 assert.ok(bundle.animationReport.unresolvedTextures.some(x=>x.texture==='Liveries-200LR/windowmix.png'));
 assert.equal(bundle.scene.getObjectByName('b777-approximate-mirrored-right-gear'),undefined);
}
const slots=b777CandidatePaintSlots(bundle.scene),body=slots.get('sim/model/fuselage');
assert.ok(body?.some(entry=>entry.fgName==='Fuselage'));
if(variant==='cargo')assert.ok(body?.some(entry=>entry.fgName==='hublot'&&entry.role==='cargo-window-seal'));
assert.ok([...slots.keys()].length>=8);
// Independently recompute each present wheel's ground-level minimum in the
// gear-down candidate pose. Gaps and missing wheels are not calibration.
bundle.scene.updateWorldMatrix(true,true);
for(const [name,y] of Object.entries(bundle.groundReport.wheelMinY)){
 const measured=new T.Box3().setFromObject(byName(name),true).min.y;assert.ok(Math.abs(y-measured)<1e-6,name);
 assert.ok(Math.abs(bundle.groundReport.wheelGapM[name]-(measured+bundle.contact))<1e-6,name+' gap');
}
assert.ok(Math.abs(Math.min(...Object.values(bundle.groundReport.wheelMinY))+bundle.contact)<1e-6);
assert.ok(bundle.groundReport.maxWheelGapM<.002,'calibrated gear wheels must touch the same ground');
assert.ok(Math.abs(bundle.groundReport.noseCorrectionM)>.01&&Math.abs(bundle.groundReport.noseCorrectionM)<.35);
const position=o=>{bundle.scene.updateWorldMatrix(true,true);return o.getWorldPosition(new T.Vector3());};
const leftWheel=byName('LHwheel.1'),rightWheel=byName('RHwheel.1');
const beforeLeftWheel=position(leftWheel),beforeRightWheel=position(rightWheel);
const beforeDoor=position(door),beforeFlap=position(flap),beforeWheel=position(wheel),beforeRudder=position(rudder),beforeFan=fan.getWorldQuaternion(new T.Quaternion()),beforeRightFan=rightFan.getWorldQuaternion(new T.Quaternion());
bundle.update({'gear/gear[0]/position-norm':0,'gear/gear[1]/position-norm':0,'gear/gear[2]/position-norm':0,
 'surface-positions/flap-pos-norm':1,'sim/multiplay/generic/float[52]':1,'sim/multiplay/generic/float[26]':1,
 'fcs/rudder/final-deg':20,'engines/engine[0]/rpm':20,'engines/engine[1]/rpm':20},.01);
assert.ok(position(door).distanceTo(beforeDoor)>.1,'door did not move');
assert.ok(position(flap).distanceTo(beforeFlap)>.1,'flap did not move');
assert.ok(position(wheel).distanceTo(beforeWheel)>1,'nose wheel did not retract');
assert.ok(position(leftWheel).distanceTo(beforeLeftWheel)>1,'left main wheel did not retract');
assert.ok(position(rightWheel).distanceTo(beforeRightWheel)>1,'right main wheel did not retract');
assert.ok(position(rudder).distanceTo(beforeRudder)>.1,'rudder did not rotate');
bundle.scene.updateWorldMatrix(true,true);assert.ok(fan.getWorldQuaternion(new T.Quaternion()).angleTo(beforeFan)>.1,'left fan did not rotate');
assert.ok(rightFan.getWorldQuaternion(new T.Quaternion()).angleTo(beforeRightFan)>.1,'right fan did not rotate');
bundle.update({'gear/gear[0]/position-norm':1,'gear/gear[1]/position-norm':1,'gear/gear[2]/position-norm':1,
 'surface-positions/flap-pos-norm':0,'sim/multiplay/generic/float[52]':0,'sim/multiplay/generic/float[26]':0,
 'fcs/rudder/final-deg':0,'engines/engine[0]/rpm':0,'engines/engine[1]/rpm':0},0);
// Use the separate cargo paint controller and real local atlas files, but no
// image decode/GPU. Switching controller paints on the real candidate scene.
let paintLeases=0;const loadTexture=async({url})=>{
 const name=url.split('/').at(-1);assert.match(name,/^(?:fedex|sf)-(?:body|fin|doors|belly|eng)\.webp$/);
 const webp=readFileSync(new URL('../assets/b777-liveries/cargo/'+name,import.meta.url));assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.toString('ascii',8,12),'WEBP');
 const texture=new T.Texture({width:2048,height:2048});let disposed=false;
 return {texture,dispose(){if(!disposed){disposed=true;paintLeases++;texture.dispose();}}};
};
if(variant==='cargo'){
 const fuselage=body.find(entry=>entry.fgName==='Fuselage').mesh,original=fuselage.material;
 const painter=createB777LiveryController(bundle.scene,{variant,loadTexture});
 assert.equal(await painter.setLivery('fedex'),true);const fedex=fuselage.material;assert.notEqual(fedex,original);
 assert.equal(await painter.setLivery('sf'),true);assert.notEqual(fuselage.material,fedex);assert.ok(byName('hublot').visible);
 painter.dispose();assert.equal(fuselage.material,original);assert.equal(paintLeases,10);
}
let mesh;bundle.scene.traverse(o=>{if(!mesh&&o.isMesh&&o.material?.map)mesh=o;});assert.ok(mesh);
let geoDisposes=0,materialDisposes=0;mesh.geometry.addEventListener('dispose',()=>geoDisposes++);mesh.material.addEventListener('dispose',()=>materialDisposes++);
let disposedLease=0;const cargoLiveryLoader=createB777LiveryLoader({loadTexture});
const plane=new AccurateB777Candidate({initialLivery:variant==='cargo'?'fedex':'BOE',geometryLoader:async()=>bundle,
 liveryLoader:async args=>{const lease=variant==='cargo'?await cargoLiveryLoader(args):{dispose(){}};return {dispose(){disposedLease++;lease.dispose();}};}}); // Passenger uses a test stub.
assert.ok(plane instanceof Aircraft);plane.setCabinLights(true);await plane.load();assert.equal(plane.native.children[0],bundle.scene);
assert.equal(plane.contact,bundle.contact);assert.deepEqual(plane.dimensions.toArray(),bundle.dimensions.toArray());
assert.equal(plane.groundReport,bundle.groundReport);assert.ok(plane.candidateReport.bound.length);assert.ok(plane.animationCoverage);
let windowMesh,originalGlass,lamp,glassMatDisposals=0,lampDisposals=0;
if(variant==='passenger'){
 windowMesh=byName('glassehublot');assert.ok(windowMesh.isMesh);originalGlass=windowMesh.material;
 const unrelated=byName('entry1lG'),unrelatedMaterial=unrelated.material;
 lamp=windowMesh.children.find(x=>x.userData.role==='b777-cabin-window-light');assert.ok(lamp?.visible);assert.equal(lamp.geometry,windowMesh.geometry);
 assert.equal(windowMesh.material,originalGlass);assert.equal(unrelated.material,unrelatedMaterial);assert.ok(!unrelated.children.some(x=>x.userData.role==='b777-cabin-window-light'));
 let lights=0;bundle.scene.traverse(o=>{if(o.userData?.role==='b777-cabin-window-light')lights++;});assert.equal(lights,bundle.cabinWindows.length);
 originalGlass.addEventListener('dispose',()=>glassMatDisposals++);lamp.material.addEventListener('dispose',()=>lampDisposals++);
 plane.setCabinLights(false);assert.equal(lamp.visible,false);assert.equal(windowMesh.material,originalGlass);assert.equal(unrelated.material,unrelatedMaterial);
 plane.setCabinLights(true);assert.equal(lamp.visible,true);
}else{
 let lights=0;bundle.scene.traverse(o=>{if(o.userData?.role==='b777-cabin-window-light')lights++;});assert.equal(lights,0);plane.setCabinLights(true);
}
plane.update({gear:1,door:1},0);assert.ok(position(door).distanceTo(beforeDoor)>.1);
// Main program places aircraft.root at y=contact. All seven tyres must be
// within 2 mm of the horizontal ground, even after retract/extend.
plane.root.position.y=plane.contact;plane.root.updateWorldMatrix(true,true);
for(const name of Object.keys(bundle.groundReport.wheelMinY)){
 const y=new T.Box3().setFromObject(byName(name),true).min.y;assert.ok(Math.abs(y)<.002,`${variant} ${name} floats/sinks ${y}`);
}
const summary={variant,dimensions:bundle.dimensions.toArray(),contact:bundle.contact,ground:bundle.groundReport,bound:bundle.animationIndices.length,
 partial:bundle.animationReport.partial.length,unbound:bundle.animationReport.unbound.length,
 ambiguousAxes:bundle.animationReport.ambiguousAxes.length,groupMissing:bundle.animationReport.groupMissing.length,
 unresolvedTextures:bundle.animationReport.unresolvedTextures,skipped:bundle.animationReport.skipped.length,missingCore:plane.animationCoverage.missing};
plane.dispose();plane.dispose();assert.equal(disposedLease,1);assert.equal(geoDisposes,1);assert.equal(materialDisposes,1);assert.ok(imageDisposes>0,'candidate image resources were not closed');
if(windowMesh){assert.equal(lamp.parent,null);assert.equal(windowMesh.material,originalGlass);assert.equal(glassMatDisposals,1);assert.equal(lampDisposals,1);}
console.log(JSON.stringify({summary,textureDisposes,note:'CPU stub textures, candidate only; appearance/FG equivalence not validated'},null,2));
