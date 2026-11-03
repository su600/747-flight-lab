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
// omits the matching right flap surfaces. Mirror the skin and its inverse-bind
// matrices, then bind the copy to the existing right-side bone nodes.
function addMissingRightFlaps(model){
 const left=model.getObjectByName('WING_ARMATURE_LH'),right=model.getObjectByName('WING_ARMATURE_RH');if(!left||!right)return;
 const mirrorX=new T.Matrix4().makeScale(-1,1,1),rightNodes=new Map();right.traverse(o=>rightNodes.set(o.name,o));
 for(const section of ['IN','MID','OUT']){
  const name=`FLAPS_SURFACE_RH_${section}`;if(model.getObjectByName(name))continue;
  const source=model.getObjectByName(`FLAPS_SURFACE_LH_${section}`);if(!source?.isSkinnedMesh||source.parent!==left)continue;
  const geometry=source.geometry.clone();geometry.applyMatrix4(mirrorX);
  if(!geometry.index)throw Error('A380 flap surface must use indexed geometry');
  for(let i=0;i+2<geometry.index.count;i+=3){const second=geometry.index.getX(i+1);geometry.index.setX(i+1,geometry.index.getX(i+2));geometry.index.setX(i+2,second);}
  geometry.index.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const bones=[],inverses=[],active=new Set(),skinIndex=source.geometry.getAttribute('skinIndex'),skinWeight=source.geometry.getAttribute('skinWeight');
  if(!skinIndex||!skinWeight)throw Error('A380 flap surface is missing skin weights');
  for(let v=0;v<skinIndex.count;v++)for(let c=0;c<skinIndex.itemSize;c++)if(skinWeight.getComponent(v,c)>0)active.add(skinIndex.getComponent(v,c));
  for(let i=0;i<source.skeleton.bones.length;i++){
   const bone=source.skeleton.bones[i],targetName=bone.name==='WING_ARMATURE_LH'?'WING_ARMATURE_RH':bone.name==='Viewer_Identity_1'?'Viewer_Identity_0':bone.name.replace(/L$/,'R');
   const target=rightNodes.get(targetName)||model.getObjectByName(targetName);
   if(active.has(i)&&bone.name.endsWith('L')&&!target)throw Error(`Missing right-side flap bone ${targetName}`);
   bones.push(target||bone);const inverse=source.skeleton.boneInverses[i].clone();
   inverses.push(target&&target!==bone?mirrorX.clone().multiply(inverse).multiply(mirrorX):inverse);
  }
  const skeleton=new T.Skeleton(bones,inverses),surface=source.clone(false);surface.name=name;surface.geometry=geometry;surface.skeleton=skeleton;
  surface.userData={...surface.userData,mirroredFrom:source.name};surface.frustumCulled=false;right.add(surface);
  const bindMatrix=mirrorX.clone().multiply(source.bindMatrix).multiply(mirrorX);model.updateMatrixWorld(true);surface.bind(skeleton,bindMatrix);
 }
}
// simplify() keeps only each material's base-colour map. Normal, emissive,
// occlusion and metal/roughness maps were decoded and then thrown away, which
// was about half of the embedded texture bytes. Drop those references from the
// JSON chunk before parsing so the loader never fetches or decodes them. The
// binary chunk, geometry and base-colour maps are left untouched.
export function keepBaseColorMapsOnly(buffer){
 const view=new DataView(buffer);
 if(buffer.byteLength<20||view.getUint32(0,true)!==0x46546C67||view.getUint32(16,true)!==0x4E4F534A)return buffer;
 const jsonLength=view.getUint32(12,true),binStart=20+jsonLength;
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength)));
 for(const material of json.materials||[]){
  delete material.normalTexture;delete material.emissiveTexture;delete material.occlusionTexture;
  if(material.pbrMetallicRoughness)delete material.pbrMetallicRoughness.metallicRoughnessTexture;
 }
 const text=new TextEncoder().encode(JSON.stringify(json));
 const padded=(text.length+3)&~3,rest=new Uint8Array(buffer,binStart);
 const out=new Uint8Array(20+padded+rest.length),outView=new DataView(out.buffer);
 outView.setUint32(0,0x46546C67,true);outView.setUint32(4,2,true);outView.setUint32(8,out.length,true);
 outView.setUint32(12,padded,true);outView.setUint32(16,0x4E4F534A,true);
 out.set(text,20);out.fill(0x20,20+text.length,20+padded);out.set(rest,20+padded);
 return out.buffer;
}
// The left wing has no spoiler-driven skin: its spoiler surfaces stay on the wing.
// The right side has one skin (Cylinder234) partly bound to WING_SPOILER bones, so
// its middle section lifted about 2 m off the wing when spoilers deployed. Rebind
// every vertex that has any spoiler weight to the bones of its nearest vertex that
// has none, so that skin stays on the wing like the left side.
export function pinSpoilerSkinToNeighbours(mesh){
 if(!mesh.isSkinnedMesh||!mesh.skeleton)return false;
 const spoiler=new Set();mesh.skeleton.bones.forEach((bone,i)=>{if(/^WING_SPOILER/.test(bone.name))spoiler.add(i);});
 if(!spoiler.size)return false;
 const geometry=mesh.geometry,index=geometry.getAttribute('skinIndex'),weight=geometry.getAttribute('skinWeight'),position=geometry.getAttribute('position');
 const count=index.count,affected=new Uint8Array(count);
 for(let v=0;v<count;v++)for(let c=0;c<4;c++)if(spoiler.has(index.getComponent(v,c))&&weight.getComponent(v,c)>0){affected[v]=1;break;}
 const donors=[];for(let v=0;v<count;v++)if(!affected[v])donors.push(v);
 if(!donors.length||donors.length===count)return false;
 const newIndex=new Uint16Array(count*4),newWeight=new Float32Array(count*4);
 for(let v=0;v<count;v++){
  let source=v;
  if(affected[v]){
   let best=Infinity;const px=position.getX(v),py=position.getY(v),pz=position.getZ(v);
   for(const d of donors){const dx=position.getX(d)-px,dy=position.getY(d)-py,dz=position.getZ(d)-pz,dist=dx*dx+dy*dy+dz*dz;if(dist<best){best=dist;source=d;}}
  }
  for(let c=0;c<4;c++){newIndex[v*4+c]=index.getComponent(source,c);newWeight[v*4+c]=weight.getComponent(source,c);}
 }
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(newIndex,4));
 geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(newWeight,4));
 return true;
}
// The source file has the right-hand flap skins (Cylinder233/234/235) bound to
// WING_SLAT_*R bones, so they never move with the flaps. right-hand flap surfaces
// are rebuilt from the left side (bound to the flap bones), so these originals
// are removed to stop them from z-fighting with the moving copies.
const SOURCE_RIGHT_FLAP_SKINS=new Set(['Cylinder233','Cylinder234','Cylinder235']);
export function isSourceRightFlapSkin(mesh){
 return mesh.isSkinnedMesh&&SOURCE_RIGHT_FLAP_SKINS.has(mesh.name)&&mesh.parent?.name==='WING_ARMATURE_RH';
}
// Passenger door panels are flush copies of the fuselage skin (same material, the
// curved skin lies about 6 mm in front of them). Phones often have only 16 bits of
// depth, about 2 cm of precision at 100 m, so the panel and the skin win the depth
// test in turn and the cabin shimmers, day and night. The panels add no detail
// beyond the skin texture, so they are hidden rather than lifted. The scene nodes
// stay in place because the cabin light code uses them to find door positions.
export function isHiddenDoorPanel(mesh){
 return /^(PAX|Pax)_DOOR_/.test(mesh.name)&&!/HANDLE/i.test(mesh.name);
}
// Door handles stand off the skin; lift them outward along their normals, so they
// stay clear of the depth precision of 16-bit phone buffers.
export function liftFlushSurface(mesh){
 if(!/HANDLE/i.test(mesh.name)||!/PAX_DOOR|Pax_DOOR/i.test(mesh.name))return false;
 const geometry=mesh.geometry,normal=geometry.getAttribute('normal'),position=geometry.getAttribute('position');
 if(!normal||!position||geometry.userData.flushLifted)return false;
 const distance=.07;
 for(let i=0;i<position.count;i++){
  position.setXYZ(i,position.getX(i)+normal.getX(i)*distance,position.getY(i)+normal.getY(i)*distance,position.getZ(i)+normal.getZ(i)*distance);
 }
 position.needsUpdate=true;geometry.computeBoundingSphere();geometry.computeBoundingBox();geometry.userData.flushLifted=true;
 return true;
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
  return loader.parseAsync(keepBaseColorMapsOnly(data),MODEL_ROOT);
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
     if(!fixedGeometry.has(o.geometry)){if(o.isSkinnedMesh)pinSpoilerSkinToNeighbours(o);alignWindingToNormals(o.geometry);if(!o.isSkinnedMesh)liftFlushSurface(o);fixedGeometry.add(o.geometry);}
     if(mats.every(m=>m.userData.viewerInvisible||/^Material\.00[12]$/.test(m.name))||isSourceRightFlapSkin(o)){invisible.push(o);return;}
     if(isHiddenDoorPanel(o))o.visible=false;
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
      // Spoiler clips also keyframe the main flap track fairings (WING_MFTF_*). Those
      // fairings follow the flaps only; a second clip on the same track is blended
      // by three.js and leaves the fairing between its flap and spoiler poses.
      if(/spoiler/.test(name))clip.tracks=clip.tracks.filter(t=>!/WING_MFTF/i.test(t.name));
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
