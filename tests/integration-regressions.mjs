// Deterministic regressions for the real main.js selection functions and A380 loader.
// Run: node tests/integration-regressions.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as T from 'three';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {A380Aircraft,loadA380Part} from '../src/a380-aircraft.js';
import {Aircraft} from '../src/aircraft.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const start=main.indexOf('async function selectAircraft(type){'),end=main.indexOf('// ---- UI',start);
assert(start>=0&&end>start,'selector implementations must be present');
// Execute the actual selection functions with controlled craft/network promises.
const context=vm.createContext({console,Aircraft,tailSamples:()=>[],makePitchLimit:()=>()=>40});
vm.runInContext(`
 let plane,aircraftRequest=0,liveryVersion=0,desiredLivery='BOE';
 const AIRCRAFT_INFO={b747:{name:'747'},a330:{name:'330'}};
 const LIVERIES=[{id:'BOE'},{id:'CCA'},{id:'CSN'},{id:'AF1_CLASSIC'},{id:'AF1_2026'}],sim={},window={flightLab:{}};
 const els=new Map();const $=s=>{if(!els.has(s))els.set(s,{textContent:'',value:''});return els.get(s);};
 const scene={add(){},remove(){}};let candidates={};let notices=[];
 const getAircraft=async type=>candidates[type];
 const syncCabinTime=()=>{},setEmitters=()=>{},showAircraft=()=>{},showLivery=()=>{},notify=message=>notices.push(message),beginLoad=()=>({update(){},done(){}});
 ${main.slice(start,end)}
 globalThis.test={selectAircraft,selectLivery,setup(p,cs){plane=p;candidates=cs;aircraftRequest=liveryVersion=0;desiredLivery='BOE';notices=[];},state(){return {plane,desiredLivery,notices}}};
`,context);
const root=()=>({position:{copy(){}},quaternion:{copy(){}},visible:true});
const craft=(type,impl)=>({type,livery:'BOE',root:root(),update(){},setLivery:impl});
{
 const old=craft('b747',async function(id){this.livery=id;return true;}),next=craft('a330',async function(id){this.livery=id;return true;});
 context.test.setup(old,{a330:next});
 assert.equal(await context.test.selectLivery('AF1_CLASSIC'),true);assert.equal(old.livery,'AF1_CLASSIC');
 assert.equal(await context.test.selectAircraft('a330'),true);
 assert.equal(next.livery,'BOE','switching to a model without AF1 falls back to its supported default');
 assert.equal(context.test.state().desiredLivery,'BOE');
 assert.equal(await context.test.selectLivery('AF1_2026'),false,'A330 rejects AF1 selection');
 assert.equal(next.livery,'BOE');
}
{
 const slow=deferred();const old=craft('b747',()=>slow.promise),next=craft('a330',async function(id){this.livery=id;return true;});
 context.test.setup(old,{a330:next});const paint=context.test.selectLivery('CCA');
 assert.equal(await context.test.selectAircraft('a330'),true);assert.equal(next.livery,'CCA');
 slow.reject(Error('old network failure'));assert.equal(await paint,true);
 assert.equal(context.test.state().plane,next);assert.equal(next.livery,'CCA');assert.equal(context.test.state().desiredLivery,'CCA');assert.equal(context.test.state().notices.length,0);
}
{
 const slow=deferred();const old=craft('b747',()=>slow.promise),next=craft('a330',async function(id){this.livery=id;return true;});
 context.test.setup(old,{a330:next});const earlier=context.test.selectLivery('CCA');await context.test.selectAircraft('a330');
 assert.equal(await context.test.selectLivery('CSN'),true);slow.reject(Error('stale'));
 assert.equal(await earlier,false);assert.equal(next.livery,'CSN');assert.equal(context.test.state().desiredLivery,'CSN');
}
{
 const slow=deferred();let count=0;
 const old=craft('b747',async function(id){if(++count===1)return slow.promise;this.livery=id;return true;});
 const next=craft('a330',async function(id){this.livery=id;return true;});context.test.setup(old,{a330:next,b747:old});
 const paint=context.test.selectLivery('CCA');await context.test.selectAircraft('a330');await context.test.selectAircraft('b747');
 slow.reject(Error('old request failed after returning to same craft'));assert.equal(await paint,true);
 assert.equal(context.test.state().plane,old);assert.equal(old.livery,'CCA');assert.equal(context.test.state().desiredLivery,'CCA');
}
{
 const old=craft('b747',async()=>{throw Error('real failure');});context.test.setup(old,{});
 assert.equal(await context.test.selectLivery('CCA'),false);assert.equal(context.test.state().desiredLivery,'BOE');assert.equal(context.test.state().notices.length,1);
}
console.log('Selection races: old-craft failure, newer selection, and current-craft failure passed.');

// Fake time models the reported 10.44 MB / 117 KB/s transfer without waiting
// 89 seconds in CI. The same per-part deadline also covers async parsing.
{
 const realSetTimeout=globalThis.setTimeout,realClearTimeout=globalThis.clearTimeout;
 let now=0,nextId=0;const timers=new Map();
 globalThis.setTimeout=(fn,delay,...args)=>{const id=++nextId;timers.set(id,{at:now+delay,fn,args,delay});return id;};
 globalThis.clearTimeout=id=>timers.delete(id);
 function advance(ms){
  const target=now+ms;
  for(;;){let selected=null;for(const [id,timer] of timers)if(timer.at<=target&&(!selected||timer.at<selected.timer.at))selected={id,timer};
   if(!selected)break;now=selected.timer.at;timers.delete(selected.id);selected.timer.fn(...selected.timer.args);
  }
  now=target;
 }
 try{
  const transfer=deferred(),parse=deferred();let aborted=false,parseStarted=false,settled=false;
  const fetchImpl=(_url,{signal})=>{signal.addEventListener('abort',()=>aborted=true);return Promise.resolve({ok:true,arrayBuffer:()=>transfer.promise});};
  const loading=loadA380Part({parseAsync:()=>{parseStarted=true;return parse.promise;}},'fuselage',{fetchImpl});
  loading.then(()=>settled=true,()=>settled=true);
  assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,180000,'production part deadline');
  const simulatedTransferMs=Math.ceil(10441820/117000*1000);assert(simulatedTransferMs>45000&&simulatedTransferMs<180000);
  advance(45001);await Promise.resolve();assert.equal(aborted,false);assert.equal(settled,false,'45 seconds must not cancel an active slow transfer');
  advance(simulatedTransferMs-45001);transfer.resolve(new ArrayBuffer(16));await Promise.resolve();await Promise.resolve();assert(parseStarted);
  advance(30000);await Promise.resolve();assert.equal(aborted,false);assert.equal(settled,false,'decode shares the same finite deadline');
  const result={scene:new T.Group()};parse.resolve(result);assert.equal(await loading,result);assert.equal(timers.size,0,'successful load clears deadline');
  // A stalled body is aborted at the deadline even if fetch ignores the signal.
  const stalled=deferred();let staleAbort=false,staleParsed=false;
  const expired=loadA380Part({parseAsync:()=>{staleParsed=true;}},'fuselage',{fetchImpl:(_url,{signal})=>{signal.addEventListener('abort',()=>staleAbort=true);return Promise.resolve({ok:true,arrayBuffer:()=>stalled.promise});}});
  const rejected=assert.rejects(expired,/超时/);await Promise.resolve();advance(179999);assert.equal(staleAbort,false);advance(1);await rejected;assert(staleAbort);
  stalled.resolve(new ArrayBuffer(16));await Promise.resolve();await Promise.resolve();assert.equal(staleParsed,false,'late bytes must not start parsing');assert.equal(timers.size,0);
 }finally{globalThis.setTimeout=realSetTimeout;globalThis.clearTimeout=realClearTimeout;}
}
// Do not start a second component while the first is still transferring or
// decoding: this avoids dividing slow bandwidth or decoding several GLBs at once.
{
 const transfer=deferred(),parsing=deferred(),urls=[];let parseStarted=false;
 const aircraft=new A380Aircraft({timeoutMs:1000,fetchImpl:url=>{urls.push(url);return transfer.promise;},loader:{parseAsync:()=>{parseStarted=true;return parsing.promise;}}});
 const loading=aircraft.load();assert.equal(urls.length,1);assert.match(urls[0],/fuselage\.glb$/);
 transfer.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
 for(let i=0;i<5&&!parseStarted;i++)await Promise.resolve();assert(parseStarted);assert.equal(urls.length,1);
 parsing.reject(Error('test decoding failure'));await assert.rejects(loading,/test decoding failure/);assert.equal(urls.length,1);
}
// A timed-out transfer must abort; a retry must be able to start a new request.
{
 let aborted=false,calls=0;
 const fetchImpl=(_url,{signal})=>{calls++;if(calls===1){signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});}return Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});};
 const loader={parseAsync:async()=>({scene:new T.Group()})};
 await assert.rejects(loadA380Part(loader,'fuselage',{fetchImpl,timeoutMs:10}),/超时/);assert(aborted);
 assert((await loadA380Part(loader,'fuselage',{fetchImpl,timeoutMs:100})).scene);assert.equal(calls,2);
 await assert.rejects(loadA380Part(loader,'wing',{fetchImpl:async()=>({ok:false,status:404}),timeoutMs:100}),/404/);
}
// Parsing cannot be aborted; a late completion must dispose its owned resources.
{
 const late=deferred(),g=new T.BoxGeometry(),image={closed:false,close(){this.closed=true;}},texture=new T.Texture(image),m=new T.MeshBasicMaterial({map:texture}),group=new T.Group();
 group.add(new T.Mesh(g,m));let gd=0,md=0,td=0;g.addEventListener('dispose',()=>gd++);m.addEventListener('dispose',()=>md++);texture.addEventListener('dispose',()=>td++);
 await assert.rejects(loadA380Part({parseAsync:()=>late.promise},'wings',{timeoutMs:10,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)})}),/超时/);
 late.resolve({scene:group});await new Promise(r=>setTimeout(r,0));assert.equal(gd,1);assert.equal(md,1);assert.equal(td,1);assert(image.closed);
}
// A timeout after one loaded component also cleans up the partial aircraft.
{
 const g=new T.BoxGeometry(),t=new T.Texture({close(){}}),m=new T.MeshStandardMaterial({map:t}),scene=new T.Group();scene.add(new T.Mesh(g,m));let gd=0,td=0;g.addEventListener('dispose',()=>gd++);t.addEventListener('dispose',()=>td++);
 let calls=0;const fetchImpl=()=>++calls===1?Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}):new Promise(()=>{});
 const a=new A380Aircraft({loader:{parseAsync:async()=>({scene,animations:[]})},fetchImpl,timeoutMs:10});
 await assert.rejects(a.load(),/超时/);assert.equal(gd,1);assert.equal(td,1);
}
console.log('A380 loading: timeout/abort, retry, HTTP errors, late parse and partial-resource cleanup passed.');

// Read clip names directly from the shipped GLBs and bind them through the real loader.
const clips={},models={};for(const part of ['fuselage','wings']){
 const data=await readFile(new URL(`../assets/a380/${part}.glb`,import.meta.url)),jsonLength=data.readUInt32LE(12),json=JSON.parse(data.toString('utf8',20,20+jsonLength).trim());
 models[part]={json,binary:data.subarray(20+jsonLength+8)};clips[part]=json.animations.map(a=>new T.AnimationClip(a.name,1,[]));
}
// Check the real compressed keyframes and parent transforms, not just clip times.
// Positive roll must raise the right trailing edge and lower the left; negative
// elevator (pilot pulls up) must raise both elevator trailing edges.
await MeshoptDecoder.ready;
function worldDeltaZ(part,name,index){
 const {json,binary}=models[part],anim=json.animations.find(a=>a.name===name),channel=anim.channels.find(c=>c.target.path==='rotation');
 const sampler=anim.samplers[channel.sampler],accessor=json.accessors[sampler.output],view=json.bufferViews[accessor.bufferView],ext=view.extensions.EXT_meshopt_compression;
 const source=binary.subarray(ext.byteOffset||0,(ext.byteOffset||0)+ext.byteLength),decoded=new Uint8Array(ext.count*ext.byteStride);
 MeshoptDecoder.decodeGltfBuffer(decoded,ext.count,ext.byteStride,source,ext.mode,ext.filter);
 const values=new DataView(decoded.buffer,decoded.byteOffset,decoded.byteLength);
 const quat=i=>{const offset=(accessor.byteOffset||0)+i*(view.byteStride||ext.byteStride);return new T.Quaternion(...[0,1,2,3].map(k=>values.getInt16(offset+k*2,true)/32767)).normalize();};
 const parents=new Map();json.nodes.forEach((node,i)=>(node.children||[]).forEach(child=>parents.set(child,i)));
 function matrix(i){const n=json.nodes[i];return n.matrix?new T.Matrix4().fromArray(n.matrix):new T.Matrix4().compose(new T.Vector3().fromArray(n.translation||[0,0,0]),new T.Quaternion().fromArray(n.rotation||[0,0,0,1]),new T.Vector3().fromArray(n.scale||[1,1,1]));}
 let parent=parents.get(channel.target.node),world=new T.Matrix4();while(parent!==undefined){world.premultiply(matrix(parent));parent=parents.get(parent);}
 const position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();world.decompose(position,rotation,scale);
 const delta=rotation.clone().multiply(quat(index===0?0:accessor.count-1)).multiply(quat(Math.floor(accessor.count/2)).invert()).multiply(rotation.clone().invert());
 return new T.Vector3(delta.x,delta.y,delta.z).applyAxisAngle(new T.Vector3(0,1,0),Math.PI/2).z;
}
assert(worldDeltaZ('wings','r_aileron1_percent_key',1)<-.1);assert(worldDeltaZ('wings','l_aileron1_percent_key',1)>.1);
assert(worldDeltaZ('fuselage','l_outer_elevator_deflection',1)<-.1);assert(worldDeltaZ('fuselage','r_outer_elevator_deflection',1)<-.1);
{
 let part=0;const parts=['fuselage','wings','nose','wing-left','wing-right','body-left','body-right'];
 const loader={parseAsync:async()=>{const name=parts[part++],scene=new T.Group();scene.add(new T.Mesh(new T.BoxGeometry(10,4,8),new T.MeshStandardMaterial()));return {scene,animations:clips[name]||[]};}};
 const a=await new A380Aircraft({loader,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}),timeoutMs:100}).load();
 const names=control=>a.bindings.filter(b=>b.control===control).map(b=>b.action.getClip().name.toLowerCase());
 assert.equal(names('aileron').length,6);assert.equal(names('elevator').length,5);
 assert.deepEqual(names('door').sort(),['aft_door_cargo','door_cargo','fwd_door_cargo']);assert(!a.bindings.some(b=>/^anim_door_/i.test(b.action.getClip().name)));
 for(const val of [-1,0,1]){
  a.update({aileron:val,elevator:val,door:0,gear:1},0);
  for(const binding of a.bindings.filter(b=>b.control==='aileron'||b.control==='elevator')){const expected=binding.control==='elevator'?(1-val)/2:(val+1)/2;assert(Math.abs(binding.action.time-expected)<1e-6);}
 }
 a.update({door:1,gear:1},0);for(const binding of a.bindings.filter(b=>b.control==='door'))assert.equal(binding.action.time,1);
 a.dispose();
}
console.log('A380 GLB clips: six ailerons, five elevator/trim clips and three cargo-door clips passed.');
