// CPU regression for shimmering passenger doors. Every visible door panel must stand
// at least 1.5 cm in front of the fuselage skin, or both surfaces, which share the
// livery material, win the depth test in turn on 16-bit phone depth buffers.
// Run: node tests/a380-door-skin.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {A380Aircraft,keepBaseColorMapsOnly,isDoorPanel} from '../src/a380-aircraft.js';

globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,props){this.type=type;Object.assign(this,props);}};

const names=['fuselage','wings','nose','wing-left','wing-right','body-left','body-right'];
const files={};for(const f of names)files[f]=await readFile(new URL(`../assets/a380/${f}.glb`,import.meta.url));
const loader={parseAsync:(data,path)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(keepBaseColorMapsOnly(data),path)};
const fetchImpl=async url=>{const b=files[url.split('/').pop().replace(/\.glb$/,'')];return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
const aircraft=await new A380Aircraft({loader,fetchImpl,timeoutMs:600000}).load();
aircraft.root.updateMatrixWorld(true);

const doors=[],skins=[];
aircraft.root.traverse(o=>{
 if(!o.isMesh||!o.visible)return;
 if(isDoorPanel(o)&&o.geometry.getAttribute('normal'))doors.push(o);
 else if(!o.isSkinnedMesh&&!/(PAX|Pax)_DOOR/.test(o.name)&&[o.material].flat().some(m=>/^A380X_FUSE[1235]$/.test(m?.name)))skins.push(o);
});
assert(doors.length>=20,`door panels are visible (${doors.length})`);

const p=new T.Vector3(),n=new T.Vector3(),s=new T.Vector3();
let worst=-Infinity,checked=0;
const origin=aircraft.root.getWorldPosition(new T.Vector3());
const outward=new T.Vector3();
for(const door of doors){
 const position=door.geometry.getAttribute('position'),normal=door.geometry.getAttribute('normal');
 const box=new T.Box3().setFromObject(door).expandByScalar(.25);
 const near=[];
 for(const skin of skins){
  const sp=skin.geometry.getAttribute('position');
  for(let i=0;i<sp.count;i++){s.fromBufferAttribute(sp,i).applyMatrix4(skin.matrixWorld);if(box.containsPoint(s))near.push(s.clone());}
 }
 for(let i=0;i<position.count;i+=3){
  p.fromBufferAttribute(position,i).applyMatrix4(door.matrixWorld);
  n.fromBufferAttribute(normal,i).transformDirection(door.matrixWorld);
  if(n.dot(outward.subVectors(p,origin))<=0)continue;
  for(const q of near){
   const d=q.clone().sub(p),along=d.dot(n),lateral=Math.sqrt(Math.max(0,d.lengthSq()-along*along));
   if(lateral<.04&&along<.2){worst=Math.max(worst,along);checked++;}
  }
 }
}
assert(checked>0,'door vertices were compared with the skin');
assert(worst<=-.015,`skin stays at least 1.5 cm behind every door panel (worst ${worst.toFixed(4)} m)`);
console.log(`A380 door skin passed: ${doors.length} door panels stand clear of the skin (worst gap ${(-worst*100).toFixed(1)} cm).`);
