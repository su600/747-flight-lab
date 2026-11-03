// CPU regression for the A380 landing pose. With flaps at 30 and spoilers out, only the
// flap surfaces may move. Any other skin that moves lifts off the wing. The left wing
// is the reference: it has no moving skins except the flaps.
// Run: node tests/a380-landing-pose.mjs.
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

const v=new T.Vector3();
function snapshot(state){
 aircraft.update(state,0);aircraft.root.updateMatrixWorld(true);
 const out=new Map();
 aircraft.root.traverse(o=>{
  if(!o.isMesh||!o.visible||!o.geometry.getAttribute('position'))return;
  if(o.isSkinnedMesh)o.skeleton.update();
  const p=o.geometry.getAttribute('position'),arr=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){if(o.isSkinnedMesh)o.getVertexPosition(i,v);else v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);arr.set([v.x,v.y,v.z],i*3);}
  out.set(o,arr);
 });
 return out;
}
const rest=snapshot({gear:0,flaps:0,engine:.2,elevator:.5,aileron:.5,rudder:.5,spoiler:0});
const landing=snapshot({gear:0,flaps:30,engine:.2,elevator:.5,aileron:.5,rudder:.5,spoiler:1});
const moved=[];
for(const [mesh,before] of rest){
 const after=landing.get(mesh);let worst=0;
 for(let i=0;i<before.length;i++)worst=Math.max(worst,Math.abs(before[i]-after[i]));
 if(worst>1e-3)moved.push(mesh.name);
}
const notFlap=moved.filter(name=>!/^FLAPS_SURFACE_/.test(name));
assert.deepEqual(notFlap,[],`only flap surfaces move in the landing pose (moved: ${notFlap.join(', ')})`);
assert(moved.some(name=>/^FLAPS_SURFACE_RH_/.test(name))&&moved.some(name=>/^FLAPS_SURFACE_LH_/.test(name)),'both flap sides move');
console.log('A380 landing pose passed: only the flap surfaces move when flaps are at 30 and spoilers are out.');
