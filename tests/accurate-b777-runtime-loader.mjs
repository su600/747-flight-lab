// Tiny synthetic GLB tests for failure cleanup; no image decode or GPU.
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createB777CandidateGeometryLoader,B777_SOURCE} from '../src/accurate-b777.js';
const tag=(tagName,textContent='',children=[])=>({tagName,textContent,children});
const xml=tag('PropertyList','',[tag('path','Aircraft/777-VMD/Models/Liveries-F/777-200F.ac')]);
function tinyGLB({unresolved=false}={}){
 const bin=Buffer.alloc(48);new Float32Array(bin.buffer,bin.byteOffset,9).set([0,0,0,1,0,0,0,1,0]);
 bin.writeUInt16LE(0,36);bin.writeUInt16LE(1,38);bin.writeUInt16LE(2,40);bin.writeUInt32LE(0x12345678,44);
 const doc={asset:{version:'2.0',extras:{upstreamRevision:B777_SOURCE.revision,sourceIdentity:'FlightGear Boeing 777-200F'}},
  buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6},{buffer:0,byteOffset:44,byteLength:4}],
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}],
  images:[{bufferView:2,mimeType:'image/png'}],textures:[{source:0}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}},extras:{sourceTexture:'fake.png'}}],
  meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],nodes:[{mesh:0,...(unresolved?{extras:{unresolvedTextureOverride:'unresolved.png'}}:{})}],scenes:[{nodes:[0]}],scene:0};
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
 const out=Buffer.alloc(12+8+json.length+8+bin.length);out.write('glTF',0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
 out.writeUInt32LE(json.length,12);out.write('JSON',16);json.copy(out,20);const off=20+json.length;
 out.writeUInt32LE(bin.length,off);out.write('BIN\0',off+4);bin.copy(out,off+8);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
}
const bytes=tinyGLB();
const fetchFn=async url=>({ok:true,status:200,text:async()=>'<ignored/>',arrayBuffer:async()=>bytes});
function instrumentation({failBeforeRoot=false,failEarly=false,watchTextures=true}={}){
 const events={geometry:0,material:0,texture:0,bitmap:0},seen=new WeakSet(),counts=new Map();
 const watch=(x,key)=>{if(!x||seen.has(x)||(key==='texture'&&!watchTextures))return;seen.add(x);counts.set(x,0);x.addEventListener?.('dispose',()=>{events[key]++;counts.set(x,counts.get(x)+1);});};
 const observe=o=>{
  if(!o)return;
  if(o.isObject3D)o.traverse(x=>{watch(x.geometry,'geometry');for(const m of [x.material].flat()){watch(m,'material');if(m?.map)watch(m.map,'texture');}});
  else if(o.isMaterial){watch(o,'material');watch(o.map,'texture');}
  else if(o.isTexture)watch(o,'texture');
 };
 const loaderFactory=()=>new GLTFLoader().register(parser=>{
  const get=parser.getDependency.bind(parser);
  parser.getDependency=(type,index)=>Promise.resolve(get(type,index)).then(value=>{observe(value);return value;});
  return {name:'B777_CPU_OBSERVER',...(failBeforeRoot?{beforeRoot:()=>parser.getDependency('mesh',0).then(()=>{throw Error('beforeRoot failure');})}:failEarly?{beforeRoot:()=>{parser.getDependency('mesh',0).catch(()=>{});throw Error('early failure');}}:{})};
 });
 const decodeImage=async()=>({width:1,height:1,close(){events.bitmap++;}});
 return {events,loaderFactory,decodeImage,assertOnce(){for(const n of counts.values())assert.equal(n,1,'resource not disposed exactly once');}};
}
// Even if loading/rigging fails after image and mesh creation, all exclusive
// resources are released, including ImageBitmap shared by source/clone maps.
{
 const x=instrumentation();const loader=createB777CandidateGeometryLoader({fetchFn,parseXML:()=>xml,loaderFactory:x.loaderFactory,decodeImage:x.decodeImage});
 await assert.rejects(loader({variant:'cargo'}),/wheel\/bounds missing/);
 assert.equal(x.events.geometry,1);assert.ok(x.events.material>=1);assert.ok(x.events.texture>=1);assert.equal(x.events.bitmap,1);x.assertOnce();
}
// A failed image decode is not silently treated as a successful blank texture.
{
 const x=instrumentation();const loader=createB777CandidateGeometryLoader({fetchFn,parseXML:()=>xml,loaderFactory:x.loaderFactory,decodeImage:async()=>{throw Error('bad image');}});
 await assert.rejects(loader({variant:'cargo'}),/texture failed/);
 assert.equal(x.events.geometry,1);assert.ok(x.events.material>=1);assert.equal(x.events.bitmap,0);x.assertOnce();
}
// Strict mode rejects an unresolved source-material override; the default
// preview mode allows it and must report the incomplete appearance.
{
 const raw=tinyGLB({unresolved:true}),f=async()=>({ok:true,status:200,text:async()=>'<ignored/>',arrayBuffer:async()=>raw});
 const x=instrumentation();const loader=createB777CandidateGeometryLoader({fetchFn:f,parseXML:()=>xml,loaderFactory:x.loaderFactory,decodeImage:x.decodeImage,allowUnresolvedTextures:false});
 await assert.rejects(loader({variant:'cargo'}),/unresolved source texture override: unresolved.png/);assert.equal(x.events.bitmap,1);x.assertOnce();
 const y=instrumentation();const experimental=createB777CandidateGeometryLoader({fetchFn:f,parseXML:()=>xml,loaderFactory:y.loaderFactory,decodeImage:y.decodeImage,allowUnresolvedTextures:true});
 await assert.rejects(experimental({variant:'cargo'}),/wheel\/bounds missing/);assert.equal(y.events.bitmap,1);y.assertOnce();
}
// A parse rejection after a dependency was created must clean that dependency.
{
 const x=instrumentation({failBeforeRoot:true});const loader=createB777CandidateGeometryLoader({fetchFn,parseXML:()=>xml,loaderFactory:x.loaderFactory,decodeImage:x.decodeImage});
 await assert.rejects(loader({variant:'cargo'}),/beforeRoot failure/);
 assert.equal(x.events.geometry,1);assert.ok(x.events.material>=1);assert.ok(x.events.texture>=1);assert.equal(x.events.bitmap,1);x.assertOnce();
}
// An in-flight dependency may resolve after parse rejection. Its bitmap,
// material, geometry and textures must still be released on arrival.
{
 const x=instrumentation({failEarly:true,watchTextures:false}),textureCounts=new Map(),originalDispose=T.Texture.prototype.dispose;
 T.Texture.prototype.dispose=function(){textureCounts.set(this,(textureCounts.get(this)||0)+1);return originalDispose.call(this);};
 try{
  let resolveImage,startedImage;const started=new Promise(resolve=>{startedImage=resolve;});
  const decodeImage=()=>{startedImage();return new Promise(resolve=>{resolveImage=resolve;});};
  const loader=createB777CandidateGeometryLoader({fetchFn,parseXML:()=>xml,loaderFactory:x.loaderFactory,decodeImage});
  const work=loader({variant:'cargo'});await assert.rejects(work,/early failure/);await started;
  resolveImage({width:1,height:1,close(){x.events.bitmap++;}});
  for(let i=0;i<5;i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(x.events.geometry,1);assert.ok(x.events.material>=1);assert.ok(textureCounts.size>=1);for(const n of textureCounts.values())assert.equal(n,1);
  assert.equal(x.events.bitmap,1);x.assertOnce();
 }finally{T.Texture.prototype.dispose=originalDispose;}
}
// Failed fetch can be retried on the very next call; parser errors and wrong
// source XML fail before reading or parsing the GLB.
{
 let attempt=0,loads=0;
 const net=async url=>{loads++;if(attempt++===0)return {ok:false,status:503};return fetchFn(url);};
 const x=instrumentation();const loader=createB777CandidateGeometryLoader({fetchFn:net,parseXML:()=>xml,loaderFactory:x.loaderFactory,decodeImage:x.decodeImage});
 await assert.rejects(loader({variant:'cargo'}),/HTTP 503/);await assert.rejects(loader({variant:'cargo'}),/wheel\/bounds missing/);assert.equal(loads,3);
 let hits=0;const bad=createB777CandidateGeometryLoader({fetchFn:async()=>{hits++;return fetchFn('x');},parseXML:()=>tag('parsererror')});
 await assert.rejects(bad({variant:'cargo'}),/Invalid B777 777-200F XML/);assert.equal(hits,1);
}
console.log('accurate-b777 candidate loader failure/disposal: OK');
