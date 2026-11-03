import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Aircraft} from './aircraft.js';
import {installA380Paint} from './a380-paint.js';
import {A380_STYLE} from './a380-liveries.js';

// FlyByWire A380X, CC BY-NC 4.0. See assets/a380/CREDITS.txt.
const MODEL_ROOT='/747/assets/a380/';
// The 10.44 MB fuselage can take ~90 s on a 117 KB/s public connection.
// This per-part deadline includes transfer and decoding, remains finite, and
// can still be overridden for tests. Parts load serially to bound memory and
// avoid splitting a slow connection among simultaneous large downloads.
const PART_TIMEOUT_MS=180000;
// The converted A380X GLBs have outward vertex normals but predominantly
// inward triangle winding. With double-sided materials Three flips the normal
// on exterior back faces, making upward surfaces respond to ground lighting.
// Correct the winding, not the normals or the global lighting. Preserve all
// vertex/skin attributes and material groups; each shared geometry is fixed once.
function alignWindingToNormals(geometry){
 const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),index=geometry.index;
 if(!p||!n)return;
 const count=index?index.count:p.count,triangles=Math.floor(count/3),step=Math.max(1,Math.floor(triangles/128));
 let same=0,opposite=0;const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),normal=new T.Vector3();
 for(let t=0;t<triangles;t+=step){
  const i=t*3,ia=index?index.getX(i):i,ib=index?index.getX(i+1):i+1,ic=index?index.getX(i+2):i+2;
  a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib).sub(a);c.fromBufferAttribute(p,ic).sub(a);b.cross(c);
  if(b.lengthSq()<1e-14)continue;normal.fromBufferAttribute(n,ia);const dot=b.dot(normal);
  if(dot>0)same++;else if(dot<0)opposite++;
 }
 if(!opposite||opposite/(same+opposite)<.8)return;
 const Index=index?index.array.constructor:(p.count>65535?Uint32Array:Uint16Array),values=new Index(count);
 for(let i=0;i<count;i++)values[i]=index?index.getX(i):i;
 for(let i=0;i+2<count;i+=3){const v=values[i+1];values[i+1]=values[i+2];values[i+2]=v;}
 geometry.setIndex(new T.BufferAttribute(values,1));
}
function disposeObjects(roots){
 const geos=new Set(),mats=new Set(),textures=new Set(),images=new Set();
 for(const root of roots)root?.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of [o.material].flat()){if(!m)continue;mats.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
 for(const t of textures){if(t.source?.data)images.add(t.source.data);t.dispose();}
 geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());images.forEach(image=>image.close?.());
}
// The source wings GLB has left flap skins and right flap bones/animations, but
// omits the matching right flap surfaces. Mirror the left panels and retarget
// their skin weights to the existing right skeleton.
function mirrorFlapGeometryForRight(source,skeletonFrom,skeletonTo){
 const geometry=source.clone();geometry.applyMatrix4(new T.Matrix4().makeScale(-1,1,1));
 const index=geometry.index;if(!index)throw Error('A380 flap surface must use indexed geometry');
 for(let i=0;i+2<index.count;i+=3){const second=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,second);}
 index.needsUpdate=true;
 const skinIndex=geometry.getAttribute('skinIndex'),skinWeight=geometry.getAttribute('skinWeight');
 if(!skinIndex||!skinWeight)throw Error('A380 flap surface is missing skin weights');
 const rightBones=new Map(skeletonTo.bones.map((bone,i)=>[bone.name,i]));
 for(let vertex=0;vertex<skinIndex.count;vertex++)for(let component=0;component<skinIndex.itemSize;component++){
  if(skinWeight.getComponent(vertex,component)<=0)continue;
  const sourceBone=skeletonFrom.bones[skinIndex.getComponent(vertex,component)];
  if(!sourceBone)throw Error('A380 flap surface references an unknown left bone');
  const targetName=sourceBone.name.replace(/L$/,'R'),targetIndex=rightBones.get(targetName);
  if(targetIndex===undefined)throw Error(`Missing right-side flap bone ${targetName}`);
  skinIndex.array[vertex*skinIndex.itemSize+component]=targetIndex;
 }
 skinIndex.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
function addMissingRightFlaps(model){
 const left=model.getObjectByName('WING_ARMATURE_LH'),right=model.getObjectByName('WING_ARMATURE_RH');
 let rightReference;right?.traverse(o=>{if(!rightReference&&o.isSkinnedMesh&&o.skeleton?.bones.some(b=>b.name==='WING_FLAP_11R'))rightReference=o;});
 if(!left||!right||!rightReference)return;
 for(const section of ['IN','MID','OUT']){
  const name=`FLAPS_SURFACE_RH_${section}`;if(model.getObjectByName(name))continue;
  const source=model.getObjectByName(`FLAPS_SURFACE_LH_${section}`);if(!source?.isSkinnedMesh||source.parent!==left)continue;
  const surface=source.clone(false);surface.name=name;surface.geometry=mirrorFlapGeometryForRight(source.geometry,source.skeleton,rightReference.skeleton);surface.skeleton=rightReference.skeleton;
  surface.userData={...surface.userData,mirroredFrom:source.name};surface.frustumCulled=false;right.add(surface);
  model.updateMatrixWorld(true);surface.bind(rightReference.skeleton,rightReference.bindMatrix);
 }
}
// Limit both transfer and asynchronous glTF decoding. An aborted fetch is
// cancelable; parsing may finish later, in which case its resources are freed.
export async function loadA380Part(loader,part,{timeoutMs=PART_TIMEOUT_MS,fetchImpl=globalThis.fetch}={}){
 const controller=new AbortController();let expired=false,timer;
 const work=(async()=>{
  const response=await fetchImpl(MODEL_ROOT+part+'.glb',{signal:controller.signal});
  if(controller.signal.aborted)throw Error('A380 '+part+' 载入已取消');
  if(!response.ok)throw Error('A380 '+part+' 载入失败 (HTTP '+response.status+')');
  const data=await response.arrayBuffer();if(controller.signal.aborted)throw Error('A380 '+part+' 载入已取消');
  return loader.parseAsync(data,MODEL_ROOT);
 })();
 work.then(gltf=>{if(expired)disposeObjects(gltf.scenes?.length?gltf.scenes:[gltf.scene]);},()=>{});
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;controller.abort();reject(Error('A380 '+part+' 载入超时，请重试'));},timeoutMs);});
 try{return await Promise.race([work,deadline]);}catch(error){if(expired)throw Error('A380 '+part+' 载入超时，请重试');throw error;}finally{clearTimeout(timer);}
}
export class A380Aircraft extends Aircraft {
 constructor(options={}){super();this.type='a380';this.bindings=[];this.mixers=[];this.fanPhase=0;this.loadOptions=options;this.discarded=[];}
 async load(){
  const loader=this.loadOptions.loader||new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),materials=new Map(),fixedGeometry=new WeakSet();
  // Source nose points toward -Z; rotate it to this simulator's +X heading.
  const model=new T.Group();model.rotation.y=Math.PI/2;this.root.add(model);
  try{
   for(const part of ['fuselage','wings','nose','wing-left','wing-right','body-left','body-right']){
    const gltf=await loadA380Part(loader,part,{timeoutMs:this.loadOptions.timeoutMs,fetchImpl:this.loadOptions.fetchImpl});model.add(gltf.scene);
    const invisible=[];gltf.scene.traverse(o=>{
     if(!o.isMesh)return;const mats=[o.material].flat();
     if(!fixedGeometry.has(o.geometry)){alignWindingToNormals(o.geometry);fixedGeometry.add(o.geometry);}
     if(mats.every(m=>m.userData.viewerInvisible||/^Material\.00[12]$/.test(m.name))){invisible.push(o);return;}
     o.castShadow=o.receiveShadow=true;o.frustumCulled=false;
     // Lambert ignores scene.environment and leaves the unlit side almost black.
     // Standard uses the world's day/dusk/night environment for natural indirect
     // light, without emissive paint or changing shadows or other aircraft.
     // Keep the portable source colours, diffuse UVs and PBR factors; omit the
     // converted normal maps to retain the lower-cost material path.
     const simplify=m=>{if(!materials.has(m)){const simple=new T.MeshStandardMaterial({name:m.name,color:m.color,map:m.map,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,side:m.side,depthWrite:m.depthWrite,roughness:m.roughness??.5,metalness:m.metalness??.1});materials.set(m,simple);m.normalMap?.dispose();m.dispose();}return materials.get(m);};
     o.material=Array.isArray(o.material)?mats.map(simplify):simplify(mats[0]);
     for(const m of [o.material].flat())if(m.map)m.map.anisotropy=4;
    });invisible.forEach(o=>{o.removeFromParent();this.discarded.push(o);});
    const mixer=new T.AnimationMixer(gltf.scene);this.mixers.push(mixer);
    for(const clip of gltf.animations){const name=clip.name.toLowerCase();let control;
     if(/rudder.*key/.test(name))control='rudder';else if(/flap_percent|slat_percent/.test(name))control='flaps';
     else if(/spoiler.*key/.test(name))control='spoiler';else if(/^n1_\d_anim/.test(name))control='engine';
     else if(/^(?:door_cargo|fwd_door_cargo|aft_door_cargo)$/.test(name))control='door';
     else if(/gear|blg_inner_door/.test(name)&&!/comp|wheel|tire/.test(name))control='gear';
     else if(/elevator.*deflection|trimtab_elevator/.test(name))control='elevator';
     else if(/aileron.*percent/.test(name))control='aileron';
     if(control){const action=mixer.clipAction(clip);action.play();action.paused=true;this.bindings.push({action,duration:clip.duration,control});}
    }
   }
   addMissingRightFlaps(model);
   this.update({gear:1,flaps:0,engine:0},0);this.root.updateMatrixWorld(true);
   const source=new T.Box3().setFromObject(this.root,true),size=source.getSize(new T.Vector3());model.scale.setScalar(79.8/size.z);
   this.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(this.root,true),centre=box.getCenter(new T.Vector3());model.position.sub(centre);
   this.root.updateMatrixWorld(true);box.setFromObject(this.root,true);this.contact=-box.min.y;this.dimensions=box.getSize(new T.Vector3());this.rawDimensions=this.dimensions.clone();
   this.paint=installA380Paint(this,{sideY:-4.2,loadTexture:this.loadOptions.loadTexture,timeoutMs:this.liveryTimeoutMs});
   this.paintLivery=livery=>this.setLivery(livery.id);
   for(const [pos,color] of [[[-16,0,-39.8],0xff3333],[[-16,0,39.8],0x33ff99],[[0,5,0],0xff4422]]){const m=new T.Mesh(new T.SphereGeometry(.19,8,8),new T.MeshBasicMaterial({color}));m.position.fromArray(pos);this.root.add(m);this.lights.push(m);}
   return this;
  }catch(error){this.dispose();throw error;}
 }
 update(s,dt){
  super.update(s,dt);this.fanPhase=(this.fanPhase+(s.engine||0)*dt*1.8)%1;
  // Source clips are centred at 50%. Left/right aileron clips already encode
  // opposite deflections. Elevator clip direction is reversed relative to the
  // simulation: negative elevator (pull up) raises the trailing edge.
  for(const b of this.bindings){let v=b.control==='engine'?this.fanPhase:b.control==='elevator'?(1-(s.elevator||0))/2:['rudder','aileron'].includes(b.control)?((s[b.control]||0)+1)/2:b.control==='flaps'?(s.flaps||0)/30:(s[b.control]||0);b.action.time=T.MathUtils.clamp(v,0,1)*b.duration;}
  for(const mixer of this.mixers)mixer.update(0);
 }
 // Textures load asynchronously; a newer request supersedes an older one.
 async setLivery(id){
  const livery=Aircraft.liveryForModel(id,this.type);if(!livery)return false;
  const request=++this.liveryRequest;
  const applied=await this.paint.apply(id,A380_STYLE[id]||A380_STYLE.BOE);
  if(!applied||request!==this.liveryRequest)return false;
  this.livery=id;return true;
 }
 // Only called on failed loads. Successfully loaded models are cached for the session.
 dispose(){this.paint?.dispose();for(const mixer of this.mixers)mixer.stopAllAction();disposeObjects([this.root,...this.discarded]);this.discarded=[];this.root.removeFromParent();}
}
