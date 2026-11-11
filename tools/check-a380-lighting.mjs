// Run with: node tools/check-a380-lighting.mjs
// Parse the real local GLBs with Three's GLTFLoader/MeshoptDecoder, without a
// server or WebGL. Node stubs image decoding only; all geometry, materials,
// skeletons, hierarchy and the aircraft's load/centering path are real.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {A380Aircraft} from '../src/a380-aircraft.js';
import {addCabinLights,updateCabinLights,removeCabinLights} from '../src/aircraft-lighting.js';

// GLTFLoader's browser image decoder is irrelevant to geometric projection.
globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,props){this.type=type;Object.assign(this,props);}};
const requested=[];
const fetchImpl=async(url,{signal}={})=>{
 assert.match(url,/^\/assets\/a380\/[\w-]+\.glb$/);
 assert(signal instanceof AbortSignal,'loader provides an abort signal');
 const filename=url.split('/').pop();requested.push(filename);
 const data=await readFile(new URL('../assets/a380/'+filename,import.meta.url),{signal});
 return {ok:true,status:200,async arrayBuffer(){
  signal.throwIfAborted();
  return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
 }};
};

const started=performance.now();
const aircraft=await new A380Aircraft({fetchImpl}).load();
const loadMs=performance.now()-started;
assert.deepEqual(requested,['fuselage.glb','wings.glb','nose.glb','wing-left.glb','wing-right.glb','body-left.glb','body-right.glb']);
assert.equal(aircraft.discarded.length,0,'successful A380 load releases detached viewer-only meshes');
const root=aircraft.root;
root.updateMatrixWorld(true);
const tireMeshes=[];root.traverse(o=>{if(o.isMesh&&[o.material].flat().some(m=>m?.name==='A380_EXTERIOR_TYRES'))tireMeshes.push(o);});
assert.equal(tireMeshes.length,14,'all A380 tires use the real exterior tire material');
for(const tire of tireMeshes){
 const material=[tire.material].flat().find(m=>m?.name==='A380_EXTERIOR_TYRES'),uv=tire.geometry.getAttribute('uv');
 assert(material?.map,'tire base-color texture is retained');
 assert(Math.abs(material.map.repeat.x-1/16383)<1e-12&&Math.abs(material.map.repeat.y-1/16383)<1e-12,'14-bit tire UVs are dequantized for the texture');
 assert(uv.getX(0)>100,'source tire UVs remain quantized and depend on the texture scale');
}
assert.equal(aircraft.wingtipPoints.length,2,'A380 wingtip emitters discovered');
assert(aircraft.wingSurface,'A380 wing surface retained for placement checks');
const wingBounds=new T.Box3().setFromObject(aircraft.wingSurface,true),ray=new T.Raycaster(),down=new T.Vector3(0,-1,0),wingtipClearances=[];
for(let i=0;i<2;i++){
 const point=aircraft.wingtipPoints[i],light=aircraft.lights[i];
 assert(light?.isMesh,'visible wingtip light exists');
 assert(light.getWorldPosition(new T.Vector3()).distanceTo(point)<1e-6,'light and airflow share a root-local point');
 ray.set(new T.Vector3(point.x,wingBounds.max.y+2,point.z),down);
 const hit=ray.intersectObject(aircraft.wingSurface,true)[0];assert(hit,`wingtip ${i} ray intersects wing`);
 const clearance=point.y-hit.point.y;assert(clearance>=.14&&clearance<=.18,`wingtip ${i} stays just above the surface: ${clearance}`);
 wingtipClearances.push(+clearance.toFixed(3));
}
assert(Math.abs(wingtipClearances[0]-wingtipClearances[1])<.02,'left/right wingtip heights are symmetric');
const roof=root.getObjectByName('MAIN_FUSELAGE'),roofLight=aircraft.lights[2];assert(roof&&roofLight,'fuselage beacon surface and light exist');
assert(roofLight.position.distanceTo(aircraft.beaconPoint)<1e-6,'top beacon uses its projected fuselage point');
const roofBounds=new T.Box3().setFromObject(roof,true);ray.set(new T.Vector3(roofLight.position.x,roofBounds.max.y+2,roofLight.position.z),down);
const roofHit=ray.intersectObject(roof,true)[0];assert(roofHit,'top beacon ray intersects the cabin roof');
const roofClearance=roofLight.position.y-roofHit.point.y;assert(roofClearance>=.10&&roofClearance<=.14,`top beacon sits on the fuselage skin: ${roofClearance}`);
const windshieldMeshes=[];root.traverse(o=>{if(o.isMesh&&[o.material].flat().some(m=>m?.name==='A380_COCKPIT_WINDSCREEN'))windshieldMeshes.push(o);});
assert(windshieldMeshes.length>0&&windshieldMeshes.every(o=>o.visible),'windshield source material resolves to visible physical glass meshes');
const windshieldMaterial=[...new Set(windshieldMeshes.flatMap(o=>[o.material].flat()))].find(m=>m?.name==='A380_COCKPIT_WINDSCREEN');
assert(windshieldMaterial?.isMeshBasicMaterial,'cockpit windshield is an unlit dark material');
assert.equal(windshieldMaterial.transparent,false);assert.equal(windshieldMaterial.color.getHex(),0x0a1a28);
const passengerWindows=[];root.traverse(o=>{if(o.isMesh&&[o.material].flat().some(m=>m?.name==='A380_PAX_WINDOW'))passengerWindows.push(o);});
assert.equal(passengerWindows.length,18,'passenger glazing is retained');assert(passengerWindows.every(o=>o.visible),'passenger glass meshes are visible');
const passengerMaterial=[...new Set(passengerWindows.flatMap(o=>[o.material].flat()))][0],uv=passengerWindows[0].geometry.getAttribute('uv');
assert(passengerMaterial?.map,'passenger panes retain their alpha glass texture');assert(Math.abs(passengerMaterial.map.repeat.x-1/32767)<1e-12&&Math.abs(passengerMaterial.map.repeat.y-1/32767)<1e-12,'raw 16-bit window UVs are scaled back into the glass texture');
assert(uv.getX(0)*passengerMaterial.map.repeat.x>.35&&uv.getX(0)*passengerMaterial.map.repeat.x<.66,'scaled passenger UV samples the dark glass region, not a transparent texture edge');
const compression=aircraft.bindings.find(b=>b.control==='gearCompression');
assert(compression,'A380 nose-gear compression clip is bound');assert.equal(compression.action.getClip().name,'c_gear_comp');
const gearTilts=aircraft.bindings.filter(b=>b.control==='gearTilt');assert.equal(gearTilts.length,4,'all main-gear bogie tilt clips are bound');
const bodyTire=root.getObjectByName('HP_Tyre005_HP_Tyre015');assert(bodyTire,'A380 body-gear tire exists');
const lowerStrut=root.getObjectByName('NLG_LOWER_STRUT'),noseWheel=root.getObjectByName('NLG_RH_Wheel001');assert(lowerStrut&&noseWheel,'nose gear strut and wheel exist');
aircraft.update({gear:1,flaps:0,engine:0,onGround:false},0);assert(gearTilts.every(b=>b.action.time>b.duration*.99),'deployed airborne gear keeps the tilted flight pose');
root.updateMatrixWorld(true);const airborneBodyTireY=new T.Box3().setFromObject(bodyTire,true).min.y,extended=lowerStrut.position.clone();
const airborneNoseWheelBox=new T.Box3().setFromObject(noseWheel,true);assert(Math.abs(airborneNoseWheelBox.min.y+aircraft.contact)<.02,'deployed nose tyres align with the leveled gear geometry');
aircraft.update({gear:1,flaps:0,engine:0,onGround:false},.1);assert.equal(aircraft.gearCompression,0);assert(gearTilts.every(b=>b.action.time>b.duration*.99));
for(let i=0;i<20;i++)aircraft.update({gear:1,flaps:0,engine:0,onGround:true},.1);
assert(gearTilts.every(b=>b.action.time<.01),'touchdown levels all four bogies');
root.updateMatrixWorld(true);const groundBodyTireBox=new T.Box3().setFromObject(bodyTire,true);
assert(groundBodyTireBox.min.y>airborneBodyTireY+.2,'body bogie rotates from its airborne tilt to the level landing pose');
const contactTireGaps=[];root.traverse(o=>{if(o.isMesh&&(/HP_Tyre/.test(o.name)||/^NLG_RH_Wheel/.test(o.name))){contactTireGaps.push(Math.abs(new T.Box3().setFromObject(o,true).min.y+aircraft.contact));}});
assert(contactTireGaps.length>=14&&Math.max(...contactTireGaps)<.06,'all main and nose tyres settle within 6 cm of the runway');
const noseWheelBox=new T.Box3().setFromObject(noseWheel,true);assert(Math.abs(noseWheelBox.min.y+aircraft.contact)<.05,'loaded nose tyre remains close to the runway');
assert(aircraft.gearCompression>.075&&aircraft.gearCompression<.085,'nose strut uses realistic partial loaded compression');assert(compression.action.time>compression.duration*.075&&compression.action.time<compression.duration*.085);
assert(lowerStrut.position.distanceTo(extended)>.02&&lowerStrut.position.distanceTo(extended)<.08,'nose strut compresses slightly after touchdown without lifting its tyre off the runway');
const loadedNoseWheelBox=new T.Box3().setFromObject(noseWheel,true);assert(Math.abs(loadedNoseWheelBox.min.y+aircraft.contact)<.05,'loaded nose tyre remains close to the runway');
for(let i=0;i<20;i++)aircraft.update({gear:1,flaps:0,engine:0,onGround:false},.1);
assert(aircraft.gearCompression<.01,'gear strut re-extends after liftoff');assert(lowerStrut.position.distanceTo(extended)<.02);
const fuselage=root.getObjectByName('MAIN_FUSELAGE');
assert(fuselage,'real GLTFLoader node name');
// Current GLB is multi-primitive: the semantic name belongs to a Group,
// while GLTFLoader gives its three children generated mesh names.
const hull=[];
fuselage.traverse(o=>{if(o.isMesh&&/^A380X_FUSE[123]$/.test(o.material?.name))hull.push(o);});
assert.equal(hull.length,3,'real fuselage primitives');
const geometry=hull.map(o=>o.geometry),materials=hull.map(o=>o.material);

// The original naming and arbitrary child names must both work. Decoys with
// fuselage materials elsewhere in the scene must not receive the projection.
const decoy=new T.Mesh(new T.BoxGeometry(100,30,1),new T.MeshBasicMaterial({name:'A380X_FUSE1',side:T.DoubleSide}));
decoy.name='unrelated-fuselage-material';decoy.position.z=8;root.add(decoy);
const names=hull.map(o=>o.name);
hull.forEach((o,i)=>o.name='renamed-primitive-'+i);
fuselage.name='MAIN FUSELAGE';
const startLights=performance.now();
assert.equal(addCabinLights(aircraft),true,'named node + arbitrary primitive names');
const createMs=performance.now()-startLights;
const lights=root.getObjectByName('cabin-window-lights');
assert(lights?.isInstancedMesh);
assert(lights.count>=150,`expected populated decks, got ${lights.count}`);
assert.equal(lights.visible,false,'new lights start off');
assert.equal(addCabinLights(aircraft),true);
assert.equal(root.getObjectByName('cabin-window-lights'),lights,'idempotent add');
let counts=[0,0,0,0],minX=Infinity,maxX=-Infinity;
const positions=[],matrix=new T.Matrix4(),point=new T.Vector3();
for(let i=0;i<lights.count;i++){
 lights.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);positions.push(point.clone());
 assert(Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z));
 assert(Math.abs(point.z)<4.5,'window must be on fuselage, not the decoy');
 counts[(point.y>-4?2:0)+(point.z>0?1:0)]++;
 minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);
}
assert(counts.every(n=>n>30),`both decks and sides must be populated: ${counts}`);
assert(minX< -18&&maxX>27,`row follows current nose-positive mounting: ${minX}, ${maxX}`);
for(const [mode,visible] of [['night',true],['day',false],['dusk',false],['night',true]]){
 updateCabinLights(aircraft,mode);assert.equal(lights.visible,visible,mode);
}
aircraft.livery='fedex';updateCabinLights(aircraft,'night');assert.equal(lights.visible,false,'freighter');
aircraft.livery='BOE';updateCabinLights(aircraft,'night');assert.equal(lights.visible,true,'passenger');
let geometryDisposed=0,materialDisposed=0;
lights.geometry.addEventListener('dispose',()=>geometryDisposed++);
lights.material.addEventListener('dispose',()=>materialDisposed++);
removeCabinLights(aircraft);removeCabinLights(aircraft);
assert.equal(lights.parent,null);assert.equal(geometryDisposed,1);assert.equal(materialDisposed,1);
assert.deepEqual(hull.map(o=>o.geometry),geometry,'no source geometry replacement');
assert.deepEqual(hull.map(o=>o.material),materials,'no source material replacement');

// Single-primitive GLTFLoader versions may assign the semantic node name
// directly to the Mesh, with no named Group parent.
fuselage.name='unrelated-parent';hull.forEach(o=>o.name='MAIN_FUSELAGE');
root.position.set(130,20,-42);root.rotation.set(.1,.4,-.05);
assert.equal(addCabinLights(aircraft),true,'semantic name on mesh');
const second=root.getObjectByName('cabin-window-lights');
assert.equal(second.count,lights.count,'transform and naming do not change row coverage');
for(let i=0;i<second.count;i++){
 second.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);
 assert(point.distanceTo(positions[i])<.001,'projection remains in aircraft-local space after transform');
}
updateCabinLights(aircraft,'night');assert(second.visible);
removeCabinLights(aircraft);
fuselage.name='MAIN_FUSELAGE';hull.forEach((o,i)=>o.name=names[i]);
root.remove(decoy);decoy.geometry.dispose();decoy.material.dispose();
console.log(JSON.stringify({ok:true,glbs:requested.length,loadMs:Math.round(loadMs),createMs:Math.round(createMs),windows:lights.count,wingtipClearances,byDeckAndSide:counts,rangeX:[minX,maxX],runtimeHullNames:names},null,2));
