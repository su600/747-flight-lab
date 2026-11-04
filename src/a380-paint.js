import * as T from 'three';
import {closeA380Windows} from './model-paint.js';
import {A380_NATIVE} from './a380-liveries.js';

// Full-aircraft side-profile livery for the A380X model. A pre-rendered
// atlas (one image per side, see assets/a380-liveries/lib.mjs) is projected
// onto the fuselage and fin from the side, in aircraft-root coordinates, so a
// livery switch only swaps two textures: no decals, geometry, canvas drawing
// or per-frame work beyond one matrix upload.
export const A380_ATLAS={x0:-37.5,x1:37.0,y0:-9.8,y1:12.6};
const ROOT='/747/assets/a380-liveries/';
// Bump when generated atlases change: the server gives /assets/* a 24-hour browser cache.
export const A380_ATLAS_VERSION='20261104-6';
const FIN_BASE_Y=-1.4;

const BODY_MATERIAL=/^A380X_FUSE[1235]$/;
const FIN_MATERIAL='A380X_FUSE4';
// Materials a livery may supply as a native A380X UV atlas instead of the
// side-projected artwork. The atlas is the paint shop's own texture, so the
// crane, the dates and the door/window stencils land exactly where the real
// aircraft carries them.
const NATIVE_MATERIAL=/^A380X_FUSE[1-5]$/;

const VERTEX_DECL='varying vec3 vLiveryPosition;\nuniform mat4 uLiveryInverseRoot;\n';
const VERTEX_BODY='vLiveryPosition=(uLiveryInverseRoot*modelMatrix*vec4(transformed,1.0)).xyz;\n';
const FRAGMENT_DECL=`varying vec3 vLiveryPosition;
uniform sampler2D uLiveryPort;
uniform sampler2D uLiveryStarboard;
uniform vec4 uLiveryAtlas;
`;
// Natural side views: the port image has the nose on the right, the starboard
// image has it on the left. Gradients come from the unmirrored coordinates so
// the seam on the aircraft centreline never selects a wrong mip level.
const FRAGMENT_MAP=`{
 vec2 liveryUv=vec2((vLiveryPosition.x-uLiveryAtlas.x)*uLiveryAtlas.y,(uLiveryAtlas.z-vLiveryPosition.y)*uLiveryAtlas.w);
 vec2 liveryDx=dFdx(liveryUv),liveryDy=dFdy(liveryUv);
 liveryUv=clamp(liveryUv,vec2(0.0005),vec2(0.9995));
 vec4 liveryColor;
 if(vLiveryPosition.z>=0.0)liveryColor=textureGrad(uLiveryPort,liveryUv,liveryDx,liveryDy);
 else liveryColor=textureGrad(uLiveryStarboard,vec2(1.0-liveryUv.x,liveryUv.y),vec2(-liveryDx.x,liveryDx.y),vec2(-liveryDy.x,liveryDy.y));
 diffuseColor.rgb*=liveryColor.rgb;
}`;

function timeout(ms,message){let timer;const promise=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);});return {promise,cancel:()=>clearTimeout(timer)};}

function defaultLoadTexture(url){
 return new Promise((resolve,reject)=>{
  const texture=new T.TextureLoader().load(url,()=>resolve(texture),undefined,()=>reject(Error('A380 涂装载入失败，请重试')));
  texture.colorSpace=T.SRGBColorSpace;texture.flipY=false;texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;texture.anisotropy=8;
 });
}
// The converted A380X GLBs were produced with gltf-transform meshopt() using
// quantizeTexcoord:14, so TEXCOORD_0 is stored as int16 in a 14-bit range
// (round(u * 16383)) and Three r170's quantization extension is a no-op, leaving
// the raw values in the runtime buffer. A native atlas therefore samples its own
// pixels only when the texture is scaled by repeat=1/16383: that maps [0,16383]
// back to the authored [0,1] UVs. Any 16-bit scale (1/32767) compresses the map
// to half size, which is the visible misalignment of the crane and dates. glTF
// also uses the OpenGL bottom-left origin, so the map keeps flipY=true. The
// side-projected liveries ignore mesh UVs and are unaffected.
function configureNative(texture){
 texture.flipY=true;
 texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;
 texture.repeat.set(1/16383,1/16383);texture.offset.set(0,0);
 texture.anisotropy=8;texture.needsUpdate=true;
}

/**
 * Takes over the A380 exterior skin: fuselage/fin materials sample the livery
 * atlas, stabilizers/nacelles/winglet fence become flat per-livery colours, and
 * freighter schemes close the cabin windows.
 */
export function installA380Paint(aircraft,{sideY=-4.2,loadTexture=defaultLoadTexture,timeoutMs=60000}={}){
 const root=aircraft.root;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
 const blank=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);blank.needsUpdate=true;blank.colorSpace=T.SRGBColorSpace;
 const uniforms={
  uLiveryInverseRoot:{value:new T.Matrix4()},
  uLiveryPort:{value:blank},uLiveryStarboard:{value:blank},
  uLiveryAtlas:{value:new T.Vector4(A380_ATLAS.x0,1/(A380_ATLAS.x1-A380_ATLAS.x0),A380_ATLAS.y1,1/(A380_ATLAS.y1-A380_ATLAS.y0))},
 };
 const projected=new Map(),flat=new Map(),flatByRole={stabilizer:[],nacelle:[],fence:[]};
 const originals=new Map(),native=new Map(),nativeSlots=[];
 function projectedFor(original){
  if(!projected.has(original)){
   const m=original.clone();m.map=null;m.color.set(0xffffff);m.userData.livery='projected';
   m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=VERTEX_DECL+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n'+VERTEX_BODY);
    shader.fragmentShader=FRAGMENT_DECL+shader.fragmentShader.replace('#include <map_fragment>',FRAGMENT_MAP);
   };
   m.customProgramCacheKey=()=>'a380-livery-1';
   projected.set(original,m);originals.set(m,original);
  }
  return projected.get(original);
 }
 // A native-UV twin of a projected material: same PBR settings, no projection
 // shader, and a map slot the livery's own atlas fills in.
 function nativeFor(projectedMaterial){
  if(!native.has(projectedMaterial)){
   const m=projectedMaterial.clone();m.map=null;m.color.set(0xffffff);m.userData.livery='native';
   m.onBeforeCompile=()=>{};m.customProgramCacheKey=()=>'a380-native';
   native.set(projectedMaterial,m);originals.set(m,originals.get(projectedMaterial)??projectedMaterial);
  }
  return native.get(projectedMaterial);
 }
 function recordNative(mesh){
  const mats=[mesh.material].flat();
  if(!mats.some(m=>m&&NATIVE_MATERIAL.test(m.name)))return;
  const twins=mats.map(m=>m&&NATIVE_MATERIAL.test(m.name)?nativeFor(m):m);
  nativeSlots.push({mesh,projected:mesh.material,native:Array.isArray(mesh.material)?twins:twins[0]});
 }
 function flatFor(original,role){
  const key=original.uuid+':'+role;
  if(!flat.has(key)){
   const m=original.clone();m.map=null;m.userData.livery=role;flat.set(key,m);flatByRole[role].push(m);originals.set(m,original);
  }
  return flat.get(key);
 }
 const swap=(mesh,fn)=>{mesh.material=Array.isArray(mesh.material)?mesh.material.map(fn):fn(mesh.material);};
 const body=[],windows=[],fairings=[];
 root.traverse(o=>{
  if(!o.isMesh)return;
  const names=[o.material].flat().map(m=>m?.name);
  const paxWindow=names.length&&names.every(n=>n==='A380_PAX_WINDOW');
  if(paxWindow)windows.push([o,o.visible]);
  if(names.some(n=>BODY_MATERIAL.test(n))){
   if(o.isSkinnedMesh&&names.some(n=>/^A380X_FUSE[123]$/.test(n)))body.push(o);
   swap(o,m=>BODY_MATERIAL.test(m.name)?projectedFor(m):m);
   recordNative(o);
  }else if(names.includes(FIN_MATERIAL)){
   let inFin=false;for(let p=o;p&&p!==root;p=p.parent)if(p.name==='VTP'){inFin=true;break;}
   // A few fin parts (the tip antenna, for one) hang off the aft-fuselage flex
   // group instead of VTP. Anything above the roofline that far aft is fin, not
   // stabilizer, or it would take the flat stabilizer colour on the navy fin.
   if(!inFin){const centre=new T.Box3().setFromObject(o).getCenter(new T.Vector3());inFin=centre.y>0&&centre.x<-20;}
   swap(o,m=>m.name!==FIN_MATERIAL?m:inFin?projectedFor(m):flatFor(m,'stabilizer'));
   // Only the fin itself takes the native atlas; the stabilizers stay flat.
   if(inFin)recordNative(o);
  }else if(/^(?:FrontCase0(?:40|42|44|46)|Bucket0(?:28|29|30|31))$/.test(o.name)&&names.some(n=>/^A380_EXTERIOR_ENG_/.test(n))){
   swap(o,m=>/^A380_EXTERIOR_ENG_/.test(m.name)?flatFor(m,'nacelle'):m);
  }else if(/^WINGTIP_[LR]H$/.test(o.name)){
   swap(o,m=>flatFor(m,'fence'));
  }
 });
 // Freighters close the cabin-window openings with caps painted by the same atlas.
 const caps=[];
 {
  const inverseRoot=new T.Matrix4().copy(root.matrixWorld).invert(),baked=new Map();
  for(const source of body){
   const original=source.geometry,positions=original.attributes.position,values=new Float32Array(positions.count*3),vertex=new T.Vector3();
   for(let i=0;i<positions.count;i++){source.getVertexPosition(i,vertex);vertex.toArray(values,i*3);}
   const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(values,3));geometry.setIndex(original.index);baked.set(source,geometry);
  }
  const plugged=[];
  for(const source of body){
   const geometry=baked.get(source);if(geometry.attributes.position.count>=5000)continue;
   const matrix=new T.Matrix4().multiplyMatrices(inverseRoot,source.matrixWorld),existing=closeA380Windows(source,geometry,matrix,sideY,[],0);
   if(existing){plugged.push(...existing.userData.windowCenters);existing.geometry.dispose();}
  }
  for(const source of body){
   const geometry=baked.get(source),matrix=new T.Matrix4().multiplyMatrices(inverseRoot,source.matrixWorld),cap=closeA380Windows(source,geometry,matrix,sideY,plugged);
   // The caps reuse the skin material, so they must follow it into native mode too.
   if(cap){cap.material=source.material;root.add(cap);caps.push(cap);recordNative(cap);}
  }
  baked.forEach(g=>g.dispose());
 }
 // The inverse root transform is the only per-frame input of the shader. It must
 // match the aircraft pose of the current frame for every part. Refreshing it from
 // one part's onBeforeRender left parts drawn earlier in the frame on last frame's
 // pose, so the livery shimmered while the aircraft moved. sync() runs once per
 // frame from the aircraft update, before any part is drawn.
 function sync(){root.updateWorldMatrix(true,false);uniforms.uLiveryInverseRoot.value.copy(root.matrixWorld).invert();}
 sync();

 const atlases=new Map(),nativeSets=new Map();let current=null,version=0,disposed=false;
 function nativeSetFor(id){
  if(!nativeSets.has(id)){
   const files=A380_NATIVE[id],entry={textures:{}};
   entry.promise=Promise.all(Object.entries(files).map(([material,file])=>loadTexture(`${ROOT}native/${file}?v=${A380_ATLAS_VERSION}`).then(texture=>{configureNative(texture);entry.textures[material]=texture;}))).then(()=>entry,error=>{nativeSets.delete(id);throw error;});
   entry.promise.catch(()=>{});
   nativeSets.set(id,entry);
  }
  return nativeSets.get(id);
 }
 function atlasFor(id){
  if(!atlases.has(id)){
   const entry={};
   entry.promise=Promise.all([loadTexture(`${ROOT}${id}-port.webp?v=${A380_ATLAS_VERSION}`),loadTexture(`${ROOT}${id}-starboard.webp?v=${A380_ATLAS_VERSION}`)]).then(([port,starboard])=>{
    entry.port=port;entry.starboard=starboard;return entry;
   },error=>{atlases.delete(id);throw error;});
   entry.promise.catch(()=>{});
   atlases.set(id,entry);
  }
  return atlases.get(id);
 }
 function evict(keep){
  for(const [id,entry] of atlases)if(!keep.includes(id)&&entry.port){entry.port.dispose();entry.starboard.dispose();atlases.delete(id);}
 }
 const style={};
 function applyStyle(s){
  const set=(list,color)=>list.forEach(m=>m.color.set(color));
  set(flatByRole.stabilizer,s.stabilizer??s.base??'#f4f5f6');
  set(flatByRole.nacelle,s.nacelle??'#f4f5f6');
  set(flatByRole.fence,s.winglet??'#f4f5f6');
  for(const [mesh,visible] of windows)mesh.visible=visible&&!s.freight;
  for(const cap of caps)cap.visible=!!s.freight;
  const lights=root.getObjectByName('cabin-window-lights');
  if(s.freight){
   if(lights)lights.visible=false;
   for(const [mesh] of windows)if(mesh.isInstancedMesh&&mesh.material.emissive)mesh.material.emissiveIntensity=0;
  }
 }
 applyStyle({});
 async function apply(id,s){
  if(disposed)return false;
  const request=++version,guard=timeout(timeoutMs,'A380 涂装载入超时，请重试');
  const nativeEntry=A380_NATIVE[id]?nativeSetFor(id):null,entry=nativeEntry?null:atlasFor(id);
  try{await Promise.race([(nativeEntry??entry).promise,guard.promise]);}finally{guard.cancel();}
  if(disposed||request!==version)return false;
  if(nativeEntry){
   for(const slot of nativeSlots){
    for(const m of [slot.native].flat()){
     const texture=nativeEntry.textures[m.name];
     if(texture&&m.map!==texture){m.map=texture;m.needsUpdate=true;}
    }
    slot.mesh.material=slot.native;
   }
  }else{
   for(const slot of nativeSlots)slot.mesh.material=slot.projected;
   uniforms.uLiveryPort.value=entry.port;uniforms.uLiveryStarboard.value=entry.starboard;
  }
  applyStyle(s);
  const previous=current;current=id;evict([id,previous].filter(Boolean));
  return true;
 }
 function dispose(){
  disposed=true;version++;
  for(const entry of atlases.values()){entry.port?.dispose();entry.starboard?.dispose();}atlases.clear();
  for(const entry of nativeSets.values())for(const texture of Object.values(entry.textures))texture.dispose();nativeSets.clear();
  for(const m of [...projected.values(),...flat.values(),...native.values()])m.dispose();blank.dispose();
 }
 return {apply,dispose,sync,uniforms,caps,windows,projected,flat,flatByRole,get current(){return current;}};
}
