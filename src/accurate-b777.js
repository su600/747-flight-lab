// Adapted FlightGear 777-200LR and 777-200F exterior models (GPL; see
// assets/accurate-b777/CREDITS.txt). Animation and ground contact are visual
// approximations, not certified aircraft data.
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Aircraft, LIVERIES} from './aircraft.js';
import {CARGO_LIVERIES} from './cargo-liveries.js';

import {B777_SOURCE,auditB777AnimationCoverage,extractB777Animations,createB777AnimationRig,CANDIDATE_INDICES,direct,text} from './b777/animation.js';
export {fgToNative,B777_SOURCE,B777_CORE_CHANNELS,auditB777AnimationCoverage,extractB777Animations,evaluateB777Animation,advanceB777Spin,createB777AnimationRig,CANDIDATE_INDICES} from './b777/animation.js';
export function bindB777Candidate(scene,doc,variant){
 if(!scene?.isObject3D||!B777_SOURCE[variant]||!CANDIDATE_INDICES[variant])throw Error('B777 candidate scene/variant required');
 const root=doc?.documentElement||doc;
 if(text(root,'path')!==`Aircraft/777-VMD/${B777_SOURCE[variant].ac}`)throw Error(`B777 ${B777_SOURCE[variant].model} XML source mismatch`);
 const sourceAnimations=direct(root,'animation'),{animations,skipped}=extractB777Animations(root);
 const byName=new Map(),generated=new Map(),nonemptyGroups=new Set(),groupMissing=[],partial=[],unbound=[],ambiguous=[];
 scene.traverse(o=>{const name=o.userData?.fgName;if(name){if(!byName.has(name))byName.set(name,[]);byName.get(name).push(o);}});
 const lookup=name=>generated.has(name)?(nonemptyGroups.has(name)?[generated.get(name)]:[]):(byName.get(name)||[]);
 const uniqueTop=objects=>{
  const all=[...new Set(objects)],set=new Set(all);
  return all.filter(o=>{for(let p=o.parent;p&&p!==scene;p=p.parent)if(set.has(p))return false;return true;});
 };
 // Each source has different generated groups. Missing members are recorded;
 // attach preserves the source's neutral world transform.
 for(const a of sourceAnimations){
  if(text(a,'type')||!text(a,'name'))continue;
  const name=text(a,'name'),names=direct(a,'object-name').map(n=>n.textContent.trim()),members=[];
  for(const n of names){const found=lookup(n);if(!found.length)groupMissing.push({group:name,name:n});members.push(...found);}
  if(generated.has(name)||byName.has(name))throw Error(`B777 candidate duplicate group ${name}`);
  const group=new T.Group();group.name='b777-group:'+name;group.userData.fgGeneratedName=name;scene.add(group);
  for(const o of uniqueTop(members))group.attach(o);
  generated.set(name,group);if(members.length)nonemptyGroups.add(name);
 }
 const selected=animations.filter(a=>CANDIDATE_INDICES[variant].has(a.index)),bindings=[];
 for(const a of selected){
  const objects=[],missing=[];
  for(const name of a.names){const found=lookup(name);if(!found.length)missing.push(name);objects.push(...found);}
  const targets=uniqueTop(objects);
  if(!targets.length){unbound.push({index:a.index,names:a.names});continue;}
  if(missing.length)partial.push({index:a.index,missing});
  if(a.axisCount>1)ambiguous.push(a.index); // candidate uses first axis only
  const wrappers=[];
  for(const target of targets){
   scene.updateWorldMatrix(true,true);
   const parent=target.parent;if(!parent)throw Error(`B777 target detached: ${a.index}`);
   const toParent=new T.Matrix4().copy(parent.matrixWorld).invert().multiply(scene.matrixWorld);
   const pivot=a.center.clone().applyMatrix4(toParent),axis=a.axis.clone().transformDirection(toParent);
   const wrapper=new T.Group();wrapper.name=`b777-hinge:${a.index}:${target.userData.fgName||target.userData.fgGeneratedName||target.name}`;
   wrapper.userData.b777AnimationIndex=a.index;parent.add(wrapper);wrapper.add(target);
   wrappers.push({wrapper,pivot,axis});
  }
  bindings.push({index:a.index,allowAmbiguousAxis:true,targets:wrappers});
 }
 const rig=createB777AnimationRig({scene,animations:selected,bindings});
 return {rig,report:{bound:rig.indices,partial,unbound,groupMissing,ambiguousAxes:ambiguous,
  skipped:skipped.filter(a=>CANDIDATE_INDICES[variant].has(a.index)),
  limitations:['experimental subset','select/conditions/expressions/locked-track not implemented','multi-axis uses first axis','source grouping and pivot order require FlightGear comparison']}};
}
export function bindB777200FCandidate(scene,doc){return bindB777Candidate(scene,doc,'cargo');}

// Track all parser-created, exclusively owned resources, including dependencies
// that finish after a rejected parse. ImageBitmap.close is separate from texture
// dispose; cloned textures can share a bitmap. Never use this tracker for shared
// externally owned resources.
function candidateResourceTracker(){
 const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();let released=false;
 const disposed=new WeakSet();
 function disposeOne(o){if(!o||disposed.has(o))return;disposed.add(o);try{o.dispose?.();}catch{};}
 function flush(){
  for(const g of geometries)disposeOne(g);for(const m of materials)disposeOne(m);for(const t of textures)disposeOne(t);
  for(const image of images)if(image&&typeof image.close==='function'&&!disposed.has(image)){disposed.add(image);try{image.close();}catch{}}
  geometries.clear();materials.clear();textures.clear();images.clear();
 }
 function addTexture(t){if(!t?.isTexture)return;textures.add(t);const image=t.source?.data||t.image;if(image)images.add(image);}
 function addMaterial(m){if(!m?.isMaterial)return;materials.add(m);for(const v of Object.values(m))if(v?.isTexture)addTexture(v);}
 function collect(o){
  if(!o)return;
  if(o.isTexture)addTexture(o);
  if(o.isMaterial)addMaterial(o);
  if(o.isBufferGeometry)geometries.add(o);
  if(o.isObject3D)o.traverse(x=>{if(x.geometry)geometries.add(x.geometry);for(const m of [x.material].flat())addMaterial(m);});
  if(released)flush();
 }
 return {collect,dispose(){released=true;flush();}};
}
async function decodeCandidateImage(blob){
 if(typeof createImageBitmap==='function')return createImageBitmap(blob,{colorSpaceConversion:'none'});
 if(typeof Image==='undefined'||typeof URL==='undefined')throw Error('No browser image decoder for B777 candidate');
 const url=URL.createObjectURL(blob);
 try{return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('B777 image decode failed'));image.src=url;});}
 finally{URL.revokeObjectURL(url);}
}
function installCandidateTracking(loader,tracker,decodeImage){
 loader.register(parser=>{
  const get=parser.getDependency.bind(parser);
  parser.getDependency=(type,index)=>Promise.resolve(get(type,index)).then(value=>{tracker.collect(value);return value;});
  // Avoid GLTFLoader's object-URL leak on image decode failure. Candidate images
  // must be embedded. Preserve parser texture cloning/sampler handling.
  const sources=new Map();
  parser.loadImageSource=index=>{
   if(!sources.has(index))sources.set(index,(async()=>{
    const image=parser.json.images[index];
    if(!image||image.bufferView===undefined||image.uri!==undefined)throw Error('B777 candidate requires embedded images');
    const bytes=await parser.getDependency('bufferView',image.bufferView);
    const bitmap=await decodeImage(new Blob([bytes],{type:image.mimeType}));
    const texture=new T.Texture(bitmap);texture.needsUpdate=true;tracker.collect(texture);return texture;
   })());
   return sources.get(index).then(texture=>{const clone=texture.clone();tracker.collect(clone);return clone;});
  };
  return {name:'B777_research_resource_tracker'};
 });
}
function validateCandidateTextures(scene){
 let textured=0;
 scene.traverse(o=>{for(const m of [o.material].flat()){
  if(!m?.userData?.sourceTexture)continue;textured++;
  const image=m.map?.image;
  if(!m.map||!image||!(image.naturalWidth??image.width)||!(image.naturalHeight??image.height))throw Error(`B777 texture failed: ${m.userData.sourceTexture}`);
 }});
 if(!textured)throw Error('B777 candidate has no source texture bindings');
}
function candidateGroundMetrics(scene){
 scene.updateWorldMatrix(true,true);
 const names=['FrtWheel','LHwheel.1','LHwheel.2','LHwheel.3','RHwheel.1','RHwheel.2','RHwheel.3'],wheels=new Map();let frontGear;
 scene.traverse(o=>{
  const name=o.userData?.fgName;if(names.includes(name)){if(wheels.has(name))throw Error(`Duplicate B777 wheel ${name}`);wheels.set(name,o);}
  if(o.userData?.fgGeneratedName==='Frontgear'){if(frontGear)throw Error('Duplicate B777 front gear group');frontGear=o;}
 });
 if(names.some(n=>!wheels.has(n))||!frontGear?.parent)throw Error('B777 candidate wheel/bounds missing');
 function measure(){
  scene.updateWorldMatrix(true,true);const result={};
  for(const [name,wheel] of wheels){const box=new T.Box3().setFromObject(wheel,true);if(box.isEmpty()||!Number.isFinite(box.min.y))throw Error(`B777 wheel bounds invalid: ${name}`);result[name]=box.min.y;}
  return result;
 }
 const originalWheelMinY=measure(),mainMin=Math.min(...names.slice(1).map(n=>originalWheelMinY[n]));
 // Cosmetic ground calibration: translate the whole nose gear down/up so its
 // tyres touch the same level as the main tyres. No airframe scaling/tilt;
 // retracting pivots remain source-based. This is not a suspension simulation.
 const noseCorrectionM=mainMin-originalWheelMinY.FrtWheel;
 if(!Number.isFinite(noseCorrectionM)||Math.abs(noseCorrectionM)>.35)throw Error('B777 candidate nose gear calibration out of range');
 const toParent=new T.Matrix4().copy(frontGear.parent.matrixWorld).invert().multiply(scene.matrixWorld);
 frontGear.position.add(new T.Vector3(0,noseCorrectionM,0).applyMatrix3(new T.Matrix3().setFromMatrix4(toParent)));
 const wheelMinY=measure(),minY=Math.min(...Object.values(wheelMinY));
 if(!Number.isFinite(minY)||minY>=0)throw Error('B777 candidate wheel contact unavailable');
 const wheelGapM=Object.fromEntries(Object.entries(wheelMinY).map(([name,y])=>[name,y-minY]));
 const bounds=new T.Box3().setFromObject(scene,true);if(bounds.isEmpty())throw Error('B777 candidate bounds missing');
 return {contact:-minY,dimensions:bounds.getSize(new T.Vector3()),groundReport:{originalWheelMinY,noseCorrectionM,wheelMinY,wheelGapM,missingWheelNames:[],maxWheelGapM:Math.max(...Object.values(wheelGapM)),provisional:true}};
}

// Concrete per-variant GLB adapter. No 300F substitution; each uses its own
// XML, scene, window targets, animation graph and provisional ground metrics.
export function createB777CandidateGeometryLoader({baseURL='/assets/accurate-b777/',fetchFn=globalThis.fetch,
 loaderFactory=()=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),parseXML=xml=>new DOMParser().parseFromString(xml,'application/xml'),decodeImage=decodeCandidateImage,
 allowUnresolvedTextures=true}={}){
 if(typeof fetchFn!=='function'||typeof loaderFactory!=='function'||typeof parseXML!=='function'||typeof decodeImage!=='function'||typeof allowUnresolvedTextures!=='boolean')throw Error('Invalid B777 candidate loader options');
 return async ({variant,signal})=>{
  if(variant!=='cargo'&&variant!=='passenger')throw Error('Unknown B777 candidate variant');
  const source=B777_SOURCE[variant];
  let tracker,scene,rig,completed=false;
  try{
   const fetchResource=async name=>{const response=await fetchFn(baseURL+name,{signal});if(!response.ok)throw Error(`B777 ${name}: HTTP ${response.status}`);return response;};
   const xml=await (await fetchResource(source.xml)).text();
   if(signal?.aborted)throw abortError();
   const doc=parseXML(xml);const root=doc?.documentElement||doc;
   if(root?.tagName!=='PropertyList'||root.querySelector?.('parsererror')||text(root,'path')!==`Aircraft/777-VMD/${source.ac}`)throw Error(`Invalid B777 ${source.model} XML`);
   const bytes=await (await fetchResource(source.asset)).arrayBuffer();
   if(signal?.aborted)throw abortError();
   const loader=loaderFactory();if(typeof loader?.register!=='function'||typeof loader?.parseAsync!=='function')throw Error('B777 GLTFLoader required');
   tracker=candidateResourceTracker();installCandidateTracking(loader,tracker,decodeImage);
   const gltf=await loader.parseAsync(bytes,baseURL);scene=gltf.scene;tracker.collect(scene);
   if(signal?.aborted)throw abortError();
   const extras=gltf.parser?.json?.asset?.extras;
   if(!scene?.isObject3D||extras?.upstreamRevision!==source.revision||extras?.sourceIdentity!==source.identity)throw Error('B777 candidate GLB identity mismatch');
   validateCandidateTextures(scene);
   // Solid exterior surfaces cast a ground shadow in the high-quality mode;
   // transparent cockpit/passenger glazing should not cast opaque silhouettes.
   scene.traverse(o=>{if(o.isMesh){const opaque=[o.material].flat().some(m=>m&&!m.transparent&&(m.opacity??1)>=1);o.castShadow=opaque;o.receiveShadow=opaque;}});
   const unresolvedTextures=[];scene.traverse(o=>{if(o.userData?.unresolvedTextureOverride)unresolvedTextures.push({name:o.userData.fgName??o.name,texture:o.userData.unresolvedTextureOverride});});
   if(unresolvedTextures.length&&!allowUnresolvedTextures)throw Error(`B777 unresolved source texture override: ${unresolvedTextures.map(x=>x.texture).join(', ')}`);
   const bound=bindB777Candidate(scene,doc,variant);rig=bound.rig;
   rig.update(b777PropertiesFromState({gear:1},variant),0);
   const {contact,dimensions,groundReport}=candidateGroundMetrics(scene);
   const cabinWindows=variant==='passenger'?findB777PassengerWindows(scene):[];
   // Darken the real passenger glazing (material 7).
   if(variant==='passenger')darkenB777PassengerGlass(cabinWindows);
   bound.report.unresolvedTextures=unresolvedTextures;
   if(signal?.aborted)throw abortError();
   let disposed=false;
   const bundle={scene,model:source.model,sourceRevision:source.revision,contact,dimensions,cabinWindows,groundReport,
    animationIndices:rig.indices,animationReport:bound.report,metricsKind:'unfiltered candidate bounds; cosmetic nose-gear ground adjustment',
    update(properties,dt){rig.update(properties,dt);},
    dispose(){if(disposed)return;disposed=true;try{rig.dispose();}finally{scene.removeFromParent();try{tracker.dispose();}finally{scene.clear();}}}};
   completed=true;return bundle;
  }finally{if(!completed){try{rig?.dispose();}finally{scene?.removeFromParent();try{tracker?.dispose();}finally{scene?.clear();}}}}
 };
}

// Paint adapter: identify real GLTF mesh/material slots without changing or
// disposing them. The paint module owns any clones and replacement textures.
// A slot includes mechanical parts; the painter must filter per source object.
export function b777CandidatePaintSlots(scene){
 if(!scene?.isObject3D)throw Error('B777 paint scene required');
 const slots=new Map();
 scene.traverse(mesh=>{
  if(!mesh.isMesh)return;
  let fgName=null,role=null;
  for(let p=mesh;p&&p!==scene;p=p.parent){fgName??=p.userData?.fgName??null;role??=p.userData?.role??null;}
  for(const [materialIndex,material] of [mesh.material].flat().entries()){
   const slot=material?.userData?.textureSlot;if(!slot)continue;
   if(!slots.has(slot))slots.set(slot,[]);
   slots.get(slot).push({mesh,materialIndex,material,fgName,role,sourceTexture:material.userData.sourceTexture??null});
  }
 });
 return slots;
}

// Candidate-converter contract: node extras.fgName and material extras.sourceMaterial.
// On 200LR AC, glassehublot uses source material 7; do not infer from node.name
// or apply this to the 200F hublot (which needs physical sealing). The provider
// still has to check source provenance, topology and actual browser appearance.
export function findB777PassengerWindows(scene){
 if(!scene?.isObject3D)throw Error('B777 passenger scene required');
 const targets=[];
 scene.traverse(mesh=>{
  if(!mesh.isMesh)return;
  let p=mesh;while(p&&p!==scene&&p.userData?.fgName!=='glassehublot')p=p.parent;
  if(!p||p===scene)return;
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material],indices=[];
  mats.forEach((m,i)=>{if(m?.userData?.sourceMaterial===7)indices.push(i);});
  if(indices.length)targets.push({mesh,indices});
 });
 if(!targets.length)throw Error('B777 200LR glassehublot/material 7 not found');
 return targets;
}

// Use the original passenger-window triangles for a separate, warm, unlit
// overlay. It is actually invisible by day; original glass is never modified.
// This avoids the source glass's 0.2 opacity dimming emissive light. Rendering,
// coplanar depth behaviour and appearance still require browser verification.
export function createB777CabinLighting(scene,targets){
 if(!scene?.isObject3D||!Array.isArray(targets)||!targets.length)throw Error('B777 passenger cabin window targets required');
 const seen=new Set(),prepared=[];
 for(const {mesh,indices} of targets){
  if(!mesh?.isMesh||mesh.isSkinnedMesh||mesh.isInstancedMesh||!mesh.geometry?.isBufferGeometry||seen.has(mesh))throw Error('B777 cabin mesh invalid or duplicated');
  let p=mesh;while(p&&p!==scene)p=p.parent;if(p!==scene)throw Error('B777 cabin mesh outside scene');
  seen.add(mesh);const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  if(!Array.isArray(indices)||!indices.length||new Set(indices).size!==indices.length)throw Error('B777 cabin material indices required');
  for(const i of indices)if(!Number.isInteger(i)||i<0||i>=materials.length||!materials[i]?.isMaterial)throw Error('B777 cabin material index invalid');
  prepared.push({mesh,materials,indices});
 }
 const light=new T.MeshBasicMaterial({color:0xffca80,side:T.DoubleSide,transparent:true,opacity:.88,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false,forceSinglePass:true});
 const blank=new T.MeshBasicMaterial({visible:false}),overlays=[];
 try{
  for(const {mesh,materials,indices} of prepared){
   const selected=new Set(indices),material=Array.isArray(mesh.material)?materials.map((_,i)=>selected.has(i)?light:blank):light;
   const overlay=new T.Mesh(mesh.geometry,material);overlay.name='cabin-window-lights';overlay.userData.role='b777-cabin-window-light';
   overlay.visible=false;overlay.castShadow=false;overlay.receiveShadow=false;overlay.renderOrder=mesh.renderOrder+1;overlay.raycast=()=>{};
   mesh.add(overlay);overlays.push(overlay);
  }
 }catch(error){for(const o of overlays)o.removeFromParent();light.dispose();blank.dispose();throw error;}
 let disposed=false;
 return {
  set(on){if(disposed)throw Error('B777 cabin lights disposed');for(const o of overlays)o.visible=!!on;},
  dispose(){if(disposed)return;disposed=true;for(const o of overlays)o.removeFromParent();light.dispose();blank.dispose();overlays.length=0;},
 };
}

// Darken the source passenger glazing (material 7). The warm cabin-light overlay
// is drawn on top of it, so night lighting still shows through.
export function darkenB777PassengerGlass(targets){
 if(!Array.isArray(targets))return 0;let count=0;
 for(const {mesh,indices} of targets){
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  for(const i of indices){const m=materials[i];if(!m?.color)continue;m.color.setRGB(.05,.09,.13);m.opacity=.6;m.transparent=true;m.needsUpdate=true;count++;}
 }
 return count;
}

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const norm=(v,def=0)=>Number.isFinite(v)?clamp(v,0,1):def;
// Simulator -> tentative subset of FG properties. No invented engine RPM,
// wheel RPM, control-surface degrees, spoiler angles, slats, trim or gear
// compression: the caller must provide them via state.fgProperties. Flap and
// door correspondences are visual approximations, not the upstream FDM.
export function b777PropertiesFromState(s={},variant='passenger',visualMappings=[]){
 if(!Array.isArray(visualMappings))throw Error('B777 visualMappings must be an array');
 if(variant!=='passenger'&&variant!=='cargo')throw Error('Unknown B777 variant');
 const p={},gear=norm(s.gear,1),flap=norm((s.flaps??0)/30),reverse=norm(s.reverse),lowerDoor=norm(s.lowerCargoDoor??s.door),mainDoor=norm(s.mainCargoDoor??s.door);
 for(let i=0;i<3;i++)p[`gear/gear[${i}]/position-norm`]=gear;
 p['surface-positions/flap-pos-norm']=flap;
 p['sim/multiplay/generic/float[6]']=reverse;
 p['sim/multiplay/generic/float[76]']=reverse;
 p['sim/multiplay/generic/float[26]']=lowerDoor; // forward lower-deck door
 if(variant==='cargo')p['sim/multiplay/generic/float[52]']=mainDoor; // main-deck cargo door
 // Optional, explicit per-variant visual gains. No implied real-world FDM.
 // Multiple mappings may read the same normalized input for left/right surfaces.
 for(const m of visualMappings){
  if(!m||typeof m.state!=='string'||!m.state||typeof m.property!=='string'||!m.property||![m.gain,m.min,m.max].every(Number.isFinite)||m.min>m.max||!Number.isFinite(m.offset??0))throw Error('Invalid B777 visual mapping');
  const value=s[m.state];if(value===undefined)continue;
  if(!Number.isFinite(value))throw Error(`Non-finite visual input: ${m.state}`);
  p[m.property]=clamp(value,m.min,m.max)*m.gain+(m.offset??0);
 }
 return Object.assign(p,s.fgProperties||{});
}

/* Research loader contract; model/source identity is a routing check, NOT proof.
 * geometryLoader({variant, source, signal}) => fresh bundle:
 *  {scene, model, sourceRevision, contact, dimensions, cabinWindows, update, dispose}
 * scene is detached, AC Y-up metres. model and revision match the chosen
 * B777_SOURCE variant. contact and dimensions belong to THIS variant.
 * cabinWindows is [{mesh, indices}] for passenger, [] for cargo; only real cabin
 * window slots, no cockpit glass, cargo patch or arbitrary shared fuselage material.
 * update(properties,dt) drives the provided FG-aware rig and never changes cabin
 * materials. Optional animationIndices (e.g. rig.indices) reports only selected
 * source channels; it does not prove a correct or complete rig. dispose releases
 * all owned geometry/materials/textures/rig. Loader
 * cleans partial work on rejection. Cargo must have no cabin windows or emissive
 * cabin-window geometry; this cannot be proven from a string or material list.
 * liveryLoader({bundle,livery,variant,signal}) stages paint on detached bundle,
 * returns a lease {dispose()}, cleans partial resources on failure. No shared GPU
 * resource is released without provider refcounting. Late completions are cleaned.
 * Fresh bundle/lease/scene per request. A whole staged switch may temporarily
 * double model/texture memory. No implicit GLB URLs, scaling or fake fallback.
 */
function validateBundle(b,variant){
 if(!b?.scene?.isObject3D||b.scene.parent||typeof b.dispose!=='function'||typeof b.update!=='function')throw Error('B777 bundle contract: detached scene, update and dispose required');
 if(b.model!==B777_SOURCE[variant].model||b.sourceRevision!==B777_SOURCE[variant].revision)throw Error('B777 model/source mismatch');
 if(!Array.isArray(b.cabinWindows)||(variant==='cargo'?b.cabinWindows.length!==0:b.cabinWindows.length===0))throw Error('B777 cabin window targets mismatch');
 const d=b.dimensions?.isVector3?b.dimensions.clone():Array.isArray(b.dimensions)?new T.Vector3().fromArray(b.dimensions):null;
 if(!d||!d.toArray().every(x=>Number.isFinite(x)&&x>0)||!Number.isFinite(b.contact)||b.contact<0)throw Error('B777 calibrated contact/dimensions required');
 return d;
}
const abortError=()=>Object.assign(new Error('B777 operation cancelled'),{name:'AbortError'});

export class AccurateB777Research extends Aircraft{
 constructor({geometryLoader,liveryLoader,timeoutMs=30000,initialLivery='BOE',visualMappings={}}={}){
  super();this.type='b777';this.geometryLoader=geometryLoader;this.liveryLoader=liveryLoader;
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw Error('Invalid B777 timeout');
  this.timeoutMs=timeoutMs;this.initialLivery=initialLivery;this.livery=null;
  this.visualMappings={passenger:visualMappings.passenger??[],cargo:visualMappings.cargo??[]};
  for(const variant of ['passenger','cargo'])b777PropertiesFromState({},variant,this.visualMappings[variant]);
  this._current=null;this._pending=null;this._disposed=false;this._state={};this._night=false;this.releaseErrors=[];this.cargoMode=false;this.modelLabel='Boeing 777-200LR';this.liveryInfo=null;
 }
 get animationCoverage(){
  const c=this._current;if(!c||!Array.isArray(c.bundle.animationIndices))return null;
  return auditB777AnimationCoverage(c.variant,c.bundle.animationIndices);
 }
 get candidateReport(){return this._current?.bundle.animationReport??null;}
 get groundReport(){return this._current?.bundle.groundReport??null;}
 async load(){
  if(this._disposed)throw Error('B777 disposed');
  if(this._current)return this;
  const ok=await this.setLivery(this.initialLivery);
  if(!ok)throw Error('B777 initial load cancelled or unknown livery');
  return this;
 }
 _release(bundle,lease,lighting){
  // Restore cabin slots before paint and geometry resources are released.
  for(const resource of [lighting,lease,bundle])try{resource?.dispose?.();}catch(e){this.releaseErrors.push(e);}
 }
 // Lighting is explicit, never inferred from generic navigation/strobe lights.
 // It is always forced off for cargo, including after switching variants.
 setCabinLights(on){this._night=!!on;this._current?.lighting?.set(this._night);}
 setCabinTime(time){this.setCabinLights(time==='night');}
 update(state={},dt=0){
  this._state=state;
  if(this._current)this._current.bundle.update(b777PropertiesFromState(state,this._current.variant,this.visualMappings[this._current.variant]),Number.isFinite(dt)?Math.max(0,dt):0);
 }
 async setLivery(id){
  if(this._disposed)throw Error('B777 disposed');
  const livery=LIVERIES.find(x=>x.id===id);
  // Even an unknown request invalidates earlier in-flight selections.
  if(this._pending){this._pending.cancel('superseded');this._pending=null;}
  if(!livery)return false;
  if(typeof this.geometryLoader!=='function'||typeof this.liveryLoader!=='function')throw Error('B777 research loaders not configured');
  const variant=CARGO_LIVERIES.some(x=>x.id===id)?'cargo':'passenger';
  // The coordinator deliberately reissues the selected livery to invalidate
  // stale requests. Once those are cancelled, an already-current paint does
  // not need another image fetch and decode.
  if(this._current?.variant===variant&&this.livery===id)return true;
  const controller=new AbortController();let cancelled=false,reason='',rejectCancel;
  const cancellation=new Promise((_,reject)=>{rejectCancel=reject;});
  const op={cancel(why){if(cancelled)return;cancelled=true;reason=why;controller.abort();rejectCancel(abortError());}};
  this._pending=op;
  const timer=setTimeout(()=>op.cancel('timeout'),this.timeoutMs);
  const work=(async()=>{
   let bundle,lease,lighting,committed=false;
   try{
    // Repaint an already-loaded variant in place. The paint controller stages
    // its textures and commits atomically; switching airlines must not parse
    // the same 24–33 MB aircraft again.
    const existing=this._current;
    if(existing?.variant===variant&&typeof existing.lease?.setLivery==='function'){
     const applied=await existing.lease.setLivery(livery,{signal:controller.signal});
     if(cancelled||this._current!==existing)throw abortError();
     if(!applied)return false;
     this.livery=id;this.cargoMode=variant==='cargo';return true;
    }
    bundle=await this.geometryLoader({variant,source:B777_SOURCE[variant],signal:controller.signal});
    if(cancelled)throw abortError();
    const dimensions=validateBundle(bundle,variant);
    lease=await this.liveryLoader({bundle,livery,variant,signal:controller.signal});
    if(cancelled)throw abortError();
    if(!lease||typeof lease.dispose!=='function')throw Error('B777 paint lease dispose required');
    // Prepare fully before attaching; old scene remains live on failure.
    if(variant==='passenger'){lighting=createB777CabinLighting(bundle.scene,bundle.cabinWindows);lighting.set(this._night);}
    bundle.update(b777PropertiesFromState(this._state,variant,this.visualMappings[variant]),0);
    if(cancelled)throw abortError();
    const previous=this._current;
    this.native.add(bundle.scene);
    this._current={bundle,lease,lighting,variant};this.contact=bundle.contact;this.dimensions=dimensions;this.rawDimensions=dimensions.clone();this.livery=id;
    this.cargoMode=variant==='cargo';this.modelLabel=variant==='cargo'?'Boeing 777F':'Boeing 777-200LR';committed=true;
    if(previous){this.native.remove(previous.bundle.scene);this._release(previous.bundle,previous.lease,previous.lighting);}
    return true;
   }finally{
    if(!committed)this._release(bundle,lease,lighting);
   }
  })();
  try{return await Promise.race([work,cancellation]);}
  catch(error){if(cancelled&&reason!=='timeout')return false;if(cancelled)throw Error('B777 resource load timed out; retry');throw error;}
  finally{clearTimeout(timer);if(this._pending===op)this._pending=null;}
 }
 dispose(){
  if(this._disposed)return;this._disposed=true;
  if(this._pending){this._pending.cancel('disposed');this._pending=null;}
  const c=this._current;this._current=null;
  if(c){this.native.remove(c.bundle.scene);this._release(c.bundle,c.lease,c.lighting);}
 }
}

// Passenger/cargo model; a model-specific paint loader is injected and required.
export class AccurateB777Candidate extends AccurateB777Research{
 constructor(options={}){
  const geometryLoader=options.geometryLoader??createB777CandidateGeometryLoader(options.candidateLoaderOptions);
  super({...options,geometryLoader});
 }
}
