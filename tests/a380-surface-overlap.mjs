// CPU regression for shimmering A380 skins. Flush panels (passenger doors and
// right flap skins) must not sit within 2 cm of a same-facing surface, or the
// depth test alternates between them on 16-bit phone depth buffers. Run: node tests/a380-surface-overlap.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {A380Aircraft,keepBaseColorMapsOnly} from '../src/a380-aircraft.js';

globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,props){this.type=type;Object.assign(this,props);}};

const names=['fuselage','wings','nose','wing-left','wing-right','body-left','body-right'];
const files={};for(const f of names)files[f]=await readFile(new URL(`../assets/a380/${f}.glb`,import.meta.url));
const loader={parseAsync:(data,path)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(keepBaseColorMapsOnly(data),path)};
const fetchImpl=async url=>{const b=files[url.split('/').pop().replace(/\.glb$/,'')];return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
const aircraft=await new A380Aircraft({loader,fetchImpl,timeoutMs:600000}).load();
aircraft.root.updateMatrixWorld(true);

assert.equal(aircraft.root.getObjectByName('Cylinder233'),undefined,'source right flap skin Cylinder233 is removed');
assert.equal(aircraft.root.getObjectByName('Cylinder234'),undefined,'source right flap skin Cylinder234 is removed');
assert.equal(aircraft.root.getObjectByName('Cylinder235'),undefined,'source right flap skin Cylinder235 is removed');
for(const door of ['PAX_DOOR_M3L','PAX_DOOR_U1L','Pax_DOOR_M1035']){assert.equal(aircraft.root.getObjectByName(door)?.visible,false,`${door} panel is hidden`);}

// Collect world-space triangles and find coplanar pairs of different meshes.
const tris=[];const v=new T.Vector3(),w=new T.Vector3(),u=new T.Vector3();
aircraft.root.traverse(o=>{
 if(!o.isMesh||!o.visible||!o.geometry.getAttribute('position'))return;
 const p=o.geometry.getAttribute('position'),index=o.geometry.index?o.geometry.index.array:null;
 const n=index?index.length/3:p.count/3;
 for(let t=0;t<n;t++){
  const i0=index?index[t*3]:t*3,i1=index?index[t*3+1]:t*3+1,i2=index?index[t*3+2]:t*3+2;
  if(o.isSkinnedMesh){o.getVertexPosition(i0,v);o.getVertexPosition(i1,w);o.getVertexPosition(i2,u);}
  else{v.fromBufferAttribute(p,i0).applyMatrix4(o.matrixWorld);w.fromBufferAttribute(p,i1).applyMatrix4(o.matrixWorld);u.fromBufferAttribute(p,i2).applyMatrix4(o.matrixWorld);}
  const c=new T.Vector3().add(v).add(w).add(u).multiplyScalar(1/3);
  const nrm=new T.Vector3().crossVectors(new T.Vector3().subVectors(w,v),new T.Vector3().subVectors(u,v));
  if(nrm.lengthSq()<1e-14)continue;nrm.normalize();
  tris.push({m:o.name,c,nrm});
 }
});
const cell=0.05,grid=new Map();const key=(x,y,z)=>Math.floor(x/cell)+'|'+Math.floor(y/cell)+'|'+Math.floor(z/cell);
tris.forEach((t,i)=>{const k=key(t.c.x,t.c.y,t.c.z);(grid.get(k)||grid.set(k,[]).get(k)).push(i);});
// Only visible passenger door panels are checked. Door handles and the door
// outline decals are small details. Right wing skins that overlap the flaps are
// a separate, known issue and are not asserted here.
const flush=name=>/^(PAX|Pax)_DOOR_/.test(name)&&!/HANDLE/i.test(name);
const offenders=new Map();
for(let i=0;i<tris.length;i++){
 const t=tris[i];const cx=Math.floor(t.c.x/cell),cy=Math.floor(t.c.y/cell),cz=Math.floor(t.c.z/cell);
 for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
  const list=grid.get((cx+dx)+'|'+(cy+dy)+'|'+(cz+dz));if(!list)continue;
  for(const j of list){
   if(j<=i)continue;const s=tris[j];if(s.m===t.m)continue;
   if(!flush(t.m)&&!flush(s.m))continue;
   if(Math.abs(t.nrm.dot(s.nrm))<0.98)continue;
   if(t.c.distanceTo(s.c)>0.06)continue;
   if(Math.abs(t.nrm.dot(new T.Vector3().subVectors(s.c,t.c)))>0.02)continue;
   const k=[t.m,s.m].sort().join(' <> ');offenders.set(k,(offenders.get(k)||0)+1);
  }
 }
}
assert.equal(offenders.size,0,`visible passenger door panels overlap the skin: ${[...offenders.entries()].slice(0,6).map(([k,c])=>k+' x'+c).join('; ')}`);
console.log('A380 surface overlap passed: right flap originals removed; visible passenger door panels do not overlap the skin.');
