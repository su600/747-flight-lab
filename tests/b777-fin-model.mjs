// Compare the shipped meshopt GLB's fin geometry/UVs with the pinned,
// uncompressed GLB used by the CPU livery baker. No browser/GPU required.
// B777_GLB_PAX=/path/to/uncompressed.glb node tests/b777-fin-model.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const original=process.env.B777_GLB_PAX;
if(!original) throw Error('Set B777_GLB_PAX to the uncompressed 200LR GLB (see b777_livery_lib.py)');
const bytes=readFileSync(original);
assert.equal(createHash('sha256').update(bytes).digest('hex'),'eddb2ea2e615931145b22838921bf12ac90f78b302a4d301f4d7e9439fa574e9');
if(typeof globalThis.Image==='undefined')globalThis.Image=class {constructor(){this.width=1;this.height=1;}set src(_){queueMicrotask(()=>this.onload?.());}};
async function load(data){
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(parser=>{
  parser.loadImageSource=()=>Promise.resolve(new T.Texture({width:1,height:1}));
  return {name:'FIN_TEXTURE_STUB'};
 });
 return (await loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene;
}
function fin(scene){
 scene.updateMatrixWorld(true);const result=new Map();
 scene.traverse(o=>{
  if(!o.isMesh)return;
  let parent=o;while(parent&&!parent.userData.fgName)parent=parent.parent;
  const name=parent?.userData.fgName;
  if(!['Tail','Rudder','LRudder'].includes(name)||o.material?.userData.sourceTexture!=='Liveries-200LR/AFR5blanc.png')return;
  assert(!result.has(name),`duplicate fin mesh ${name}`);result.set(name,o);
 });
 assert.equal(result.size,3);return result;
}
const a=fin(await load(bytes));
const b=fin(await load(readFileSync(new URL('../assets/accurate-b777/777-200LR-2048.candidate.glb',import.meta.url))));
// Meshopt reorders and quantizes triangles. Match the multiset with explicit
// tolerances instead of assuming identical vertex indices or float rounding.
function triangles(mesh){
 const g=mesh.geometry,uv=g.getAttribute('uv'),pos=g.getAttribute('position'),result=[];
 for(let i=0;i<g.index.count;i+=3){
  const vertices=[];
  for(let j=0;j<3;j++){
   const k=g.index.getX(i+j),v=new T.Vector3().fromBufferAttribute(pos,k).applyMatrix4(mesh.matrixWorld);
   vertices.push([...v.toArray(),uv.getX(k),uv.getY(k)]);
  }
  result.push(vertices);
 }
 return result;
}
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
function match(a,b){
 return permutations.some(p=>a.every((v,i)=>v.every((x,j)=>Math.abs(x-b[p[i]][j])<(j<3?.001:.0003))));
}
for(const [name,left] of a){
 const right=b.get(name);assert(right,name);
 const source=triangles(left),target=triangles(right),used=new Set();assert.equal(source.length,target.length,name);
 for(const triangle of source){
  const i=target.findIndex((other,k)=>!used.has(k)&&match(triangle,other));
  assert(i>=0,`${name} triangle missing after meshopt (position tolerance .001m, UV .0003)`);used.add(i);
 }
}
console.log('777 fin mesh equivalence OK: Tail/Rudder/LRudder world-space UV triangles, including quantization');
