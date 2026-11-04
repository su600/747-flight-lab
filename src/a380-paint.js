import * as T from 'three';
import {closeA380Windows} from './model-paint.js';

// Full-aircraft side-profile livery for the A380X model. A pre-rendered
// atlas (one image per side, see assets/a380-liveries/lib.mjs) is projected
// onto the fuselage and fin from the side, in aircraft-root coordinates, so a
// livery switch only swaps two textures: no decals, geometry, canvas drawing
// or per-frame work beyond one matrix upload.
export const A380_ATLAS={x0:-37.5,x1:37.0,y0:-9.8,y1:12.6};
const ROOT='/747/assets/a380-liveries/';
// Bump when generated atlases change: the server gives /assets/* a 24-hour browser cache.
export const A380_ATLAS_VERSION='20261106';
const FIN_BASE_Y=-1.4;

const BODY_MATERIAL=/^A380X_FUSE[1235]$/;
const FIN_MATERIAL='A380X_FUSE4';

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
 const originals=new Map();
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
  }else if(names.includes(FIN_MATERIAL)){
   let inFin=false;for(let p=o;p&&p!==root;p=p.parent)if(p.name==='VTP'){inFin=true;break;}
   swap(o,m=>m.name!==FIN_MATERIAL?m:inFin?projectedFor(m):flatFor(m,'stabilizer'));
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
   if(cap){cap.material=source.material;root.add(cap);caps.push(cap);}
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

 const atlases=new Map();let current=null,version=0,disposed=false;
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
  const request=++version,entry=atlasFor(id),guard=timeout(timeoutMs,'A380 涂装载入超时，请重试');
  try{await Promise.race([entry.promise,guard.promise]);}finally{guard.cancel();}
  if(disposed||request!==version)return false;
  uniforms.uLiveryPort.value=entry.port;uniforms.uLiveryStarboard.value=entry.starboard;
  applyStyle(s);
  const previous=current;current=id;evict([id,previous].filter(Boolean));
  return true;
 }
 function dispose(){
  disposed=true;version++;
  for(const entry of atlases.values()){entry.port?.dispose();entry.starboard?.dispose();}atlases.clear();
  for(const m of [...projected.values(),...flat.values()])m.dispose();blank.dispose();
 }
 return {apply,dispose,sync,uniforms,caps,windows,projected,flat,flatByRole,get current(){return current;}};
}
