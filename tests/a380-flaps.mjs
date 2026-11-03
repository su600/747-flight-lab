// CPU regression for the missing right-side A380 flap skins in the source GLB.
// Run: node tests/a380-flaps.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {A380Aircraft} from '../src/a380-aircraft.js';

globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,props){this.type=type;Object.assign(this,props);}};

async function geometryOnly(buffer){
 const size=buffer.readUInt32LE(12),json=JSON.parse(buffer.toString('utf8',20,20+size).trim());
 for(const material of json.materials||[]){delete material.normalTexture;delete material.emissiveTexture;delete material.occlusionTexture;if(material.pbrMetallicRoughness){delete material.pbrMetallicRoughness.baseColorTexture;delete material.pbrMetallicRoughness.metallicRoughnessTexture;}}
 delete json.images;delete json.textures;delete json.samplers;
 const text=Buffer.from(JSON.stringify(json)),length=(text.length+3)&~3,bin=buffer.subarray(20+size),glb=Buffer.alloc(20+length+bin.length,0x20);
 glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(length,12);glb.write('JSON',16);text.copy(glb,20);bin.copy(glb,20+length);
 return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
}

const wings=await readFile(new URL('../assets/a380/wings.glb',import.meta.url));
const fetchImpl=async url=>({ok:true,arrayBuffer:async()=>{
 const bytes=url.endsWith('/wings.glb')?wings:Buffer.alloc(0);
 return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}});
const loader={parseAsync:async data=>data.byteLength>1000?geometryOnly(Buffer.from(data)):{scene:new T.Group(),animations:[]}};
const aircraft=await new A380Aircraft({loader,fetchImpl,timeoutMs:5000}).load();
try{
 const sections=['IN','MID','OUT'];
 for(const section of sections){
  const left=aircraft.root.getObjectByName(`FLAPS_SURFACE_LH_${section}`),right=aircraft.root.getObjectByName(`FLAPS_SURFACE_RH_${section}`);
  assert(left?.isSkinnedMesh,`left flap surface ${section} exists`);assert(right?.isSkinnedMesh,`right flap surface ${section} exists`);
  assert.equal(right.parent.name,'WING_ARMATURE_RH');assert.equal(right.userData.mirroredFrom,left.name);
  const leftPositions=left.geometry.getAttribute('position'),rightPositions=right.geometry.getAttribute('position');
  for(let vertex=0;vertex<leftPositions.count;vertex++){
   assert(Math.abs(rightPositions.getX(vertex)+leftPositions.getX(vertex))<1e-6,`${section}: right panel is mirrored across the centerline`);
   assert(Math.abs(rightPositions.getY(vertex)-leftPositions.getY(vertex))<1e-6&&Math.abs(rightPositions.getZ(vertex)-leftPositions.getZ(vertex))<1e-6,`${section}: mirrored panel keeps the flap profile`);
  }
  const indices=right.geometry.getAttribute('skinIndex'),weights=right.geometry.getAttribute('skinWeight');
  for(let vertex=0;vertex<indices.count;vertex++)for(let component=0;component<indices.itemSize;component++){
   if(weights.getComponent(vertex,component)<=0)continue;
   const bone=right.skeleton.bones[indices.getComponent(vertex,component)];
   assert(bone&&bone.name.endsWith('R'),`${section}: skin weight must target the right rig (${bone?.name})`);
  }
 }
 assert(aircraft.bindings.some(b=>b.control==='flaps'&&b.action.getClip().name==='r_flap_percent_key'),'right flap animation is loaded');
 assert(aircraft.bindings.some(b=>b.control==='flaps'&&b.action.getClip().name==='l_flap_percent_key'),'left flap animation is preserved');
 const left=aircraft.root.getObjectByName('FLAPS_SURFACE_LH_OUT'),right=aircraft.root.getObjectByName('FLAPS_SURFACE_RH_OUT');
 function drivenVertex(mesh,boneName){
  const boneIndex=mesh.skeleton.bones.findIndex(b=>b.name===boneName);assert(boneIndex>=0,boneName);
  const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');let best=-1,bestWeight=0;
  for(let vertex=0;vertex<indices.count;vertex++)for(let component=0;component<indices.itemSize;component++)if(indices.getComponent(vertex,component)===boneIndex){const w=weights.getComponent(vertex,component);if(w>bestWeight){best=vertex;bestWeight=w;}}
  assert(best>=0&&bestWeight>.5,`${boneName} has flap-surface vertices`);return best;
 }
 function vertexWorld(mesh,index){
  aircraft.root.updateMatrixWorld(true);mesh.skeleton.update();
  const point=new T.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),index);
  mesh.applyBoneTransform(index,point);return mesh.localToWorld(point);
 }
 const leftIndex=drivenVertex(left,'WING_FLAP_11L'),rightIndex=drivenVertex(right,'WING_FLAP_11R');
 aircraft.update({gear:1,flaps:0,engine:0},0);const leftClean=vertexWorld(left,leftIndex),rightClean=vertexWorld(right,rightIndex);
 aircraft.update({gear:1,flaps:30,engine:0},0);const leftDown=vertexWorld(left,leftIndex),rightDown=vertexWorld(right,rightIndex);
 assert(leftDown.distanceTo(leftClean)>.1,'left flap surface responds to flap input');
 assert(rightDown.distanceTo(rightClean)>.1,'right flap surface responds to flap input');
 const leftTravel=leftDown.y-leftClean.y,rightTravel=rightDown.y-rightClean.y;
 assert(Math.abs(leftTravel-rightTravel)<.05,'left and right flap vertical travel is symmetric');
 aircraft.dispose();
 console.log('A380 right flap regression passed: RH surfaces are present, driven by the right rig, and travel symmetrically.');
}catch(error){aircraft.dispose();throw error;}
