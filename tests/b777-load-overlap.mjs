// Deterministic ordering/ownership checks, not a browser or wall-clock benchmark.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as T from 'three';
import {AccurateB777Research,B777_SOURCE} from '../src/accurate-b777.js';
import {createB777LiveryLoader} from '../src/b777-livery.js';
import {AIRCRAFT_DOWNLOAD_SIZES} from '../src/aircraft-download-sizes.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setTimeout(r,0));

// Model preloads and consumers join the same in-flight transfers. The XML can
// be consumed and parsed while the GLB remains blocked. Abort never steals a
// shared body; failure falls back to the native fetch as before.
globalThis.location={href:'http://localhost/'};
const gates=new Map(),calls=new Map();let failCargoXML=true;
globalThis.fetch=async (url,init={})=>{
 const path=String(url).replace('/assets/','');calls.set(path,(calls.get(path)||0)+1);
 if(path.includes('777-200F-v2.xml')&&failCargoXML){failCargoXML=false;return new Response('',{status:503});}
 const size=AIRCRAFT_DOWNLOAD_SIZES[path];assert(size>0,path);
 if(init.priority){const gate=deferred();gates.set(path,gate);await gate.promise;}
 return new Response(new Uint8Array(size));
};
const {preloadAircraft,isPreloaded,aircraftFiles,installPreloadedFetch}=await import('../src/preload.js');
installPreloadedFetch();
const [xml,glb]=aircraftFiles('b777').map(([path])=>path);
const preload=preloadAircraft('b777');
const xmlFetch=fetch('/assets/'+xml),glbAbort=new AbortController(),cancelled=fetch('/assets/'+glb,{signal:glbAbort.signal});
glbAbort.abort();await assert.rejects(cancelled,e=>e.name==='AbortError');
gates.get(xml).resolve();assert.equal((await xmlFetch).status,200);
assert.equal(isPreloaded('b777'),false,'XML available while GLB preload is blocked');
assert.equal(calls.get(xml),1);assert.equal(calls.get(glb),1);
const glbFetch=fetch('/assets/'+glb);gates.get(glb).resolve();
assert.equal((await (await glbFetch).arrayBuffer()).byteLength,AIRCRAFT_DOWNLOAD_SIZES[glb]);await preload;
assert.equal(calls.get(glb),1,'aborted waiter did not start or steal a transfer');
await fetch('/assets/'+glb);assert.equal(calls.get(glb),2,'one-shot body falls back on later requests');
const [cargoXml,cargoGlb]=aircraftFiles('b777',{livery:'fedex'}).map(([path])=>path);
const warn=console.warn;console.warn=()=>{};
try{
 const failed=preloadAircraft('b777',{livery:'fedex'}),fallback=fetch('/assets/'+cargoXml);
 assert.equal((await fallback).status,200);assert.equal(calls.get(cargoXml),2,'failed preload falls back once');
 gates.get(cargoGlb).resolve();await failed;assert.equal(isPreloaded('b777',{livery:'fedex'}),false);
}finally{console.warn=warn;}

// Exercise the actual main coordinator: import/load begin before preload ends,
// concurrent callers share the craft, and failed/late preload cleans a loaded craft.
const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const start=source.indexOf('function syncCabinTime('),end=source.indexOf('\nfunction showLivery()',start);
assert(start>=0&&end>start);
{
 let gate=deferred(),factories=0,loads=0,disposes=0;
 const context=vm.createContext({preloadAircraft:()=>gate.promise,isPreloaded:()=>false,
  modelFactory:async(type,livery,barrier)=>{assert.equal(type,'b777');assert.equal(barrier,gate.promise);factories++;return {load:async()=>{loads++;},dispose:()=>disposes++,setCabinTime(){}};},
  fixAircraftWingShading(){},applyAircraftFinish(){},addCabinLights(){},updateCabinLights(){},renderLow:false,world:{time:'day'}});
 vm.runInContext(`const aircraftCache=new Map();let desiredLivery='BOE',badgeFor=null;${source.slice(start,end)};globalThis.getAircraft=getAircraft;`,context);
 const a=context.getAircraft('b777'),b=context.getAircraft('b777');assert.equal(a,b);
 await tick();assert.equal(factories,1);assert.equal(loads,1,'model work starts before preload completion');
 gate.resolve();await a;assert.equal(disposes,0);
}
{
 let gate=deferred(),disposes=0;
 const context=vm.createContext({preloadAircraft:()=>gate.promise,isPreloaded:()=>false,
  modelFactory:async()=>({load:async()=>{},dispose:()=>disposes++,setCabinTime(){}}),
  fixAircraftWingShading(){},applyAircraftFinish(){},addCabinLights(){},updateCabinLights(){},renderLow:false,world:{time:'day'}});
 vm.runInContext(`const aircraftCache=new Map();let desiredLivery='BOE',badgeFor=null;${source.slice(start,end)};globalThis.getAircraft=getAircraft;`,context);
 const p=context.getAircraft('b777');await tick();gate.reject(Error('preload callback failed'));
 await assert.rejects(p,/preload callback failed/);assert.equal(disposes,1);
 gate=deferred();gate.resolve();await context.getAircraft('b777');
}

// Run the actual application paint-preparation adapter with the real paint
// controller and synthetic geometry. No 777 assets are changed or rendered.
const ps=source.indexOf('function createB777PreparedLiveryLoader('),pe=source.indexOf('\nlet b777LiveryLoader;',ps);
assert(ps>=0&&pe>ps);
const context=vm.createContext({AbortController,Promise,Error});
vm.runInContext(`${source.slice(ps,pe)};globalThis.make=createB777PreparedLiveryLoader;`,context);
const manifestFor=({id,variant})=>({id,variant,maps:[
 {sourceTexture:'Liveries-200LR/body.png',url:'/body'},
 {sourceTexture:'Liveries-200LR/fin.png',url:'/fin'},
]});
const makeBundle=()=>{
 const scene=new T.Group(),geo=new T.BoxGeometry(),mats=['body','fin'].map(name=>{
  const map=new T.Texture({width:1,height:1}),mat=new T.MeshBasicMaterial({map});mat.userData.sourceTexture=`Liveries-200LR/${name}.png`;return mat;
 });
 const body=new T.Mesh(geo,mats);body.userData.fgName='Fuselage';scene.add(body);
 const window=new T.Mesh(geo,mats[0]);window.userData.fgName='glassehublot';scene.add(window);
 return {scene,model:B777_SOURCE.passenger.model,sourceRevision:B777_SOURCE.passenger.revision,contact:5,dimensions:[63,18,64],cabinWindows:[{mesh:window,indices:[0]}],disposed:0,update(){},dispose(){this.disposed++;geo.dispose();for(const m of mats){m.map.dispose();m.dispose();}}};
};
function fixture(){
 const requests=[];
 const loadTexture=({url,signal})=>{const gate=deferred(),lease={texture:new T.Texture({width:1,height:1}),disposed:0,dispose(){this.disposed++;this.texture.dispose();}};requests.push({url,signal,gate,lease});return gate.promise;};
 const liveryLoader=context.make({createB777LiveryLoader,loadB777CargoTexture:loadTexture,manifestFor});
 return {requests,liveryLoader};
}
{
 const {requests,liveryLoader}=fixture(),geometry=deferred(),bundle=makeBundle();
 const plane=new AccurateB777Research({geometryLoader:()=>geometry.promise,liveryLoader});
 const loading=plane.load();await tick();assert.equal(requests.length,2,'atlas requests start before geometry resolves');
 for(const r of requests)r.gate.resolve(r.lease);await tick();assert(requests.every(r=>r.lease.disposed===0));
 geometry.resolve(bundle);await loading;assert.equal(plane.livery,'BOE');assert(requests.every(r=>r.lease.disposed===0));
 const repaint=plane.setLivery('CCA');await tick();assert.equal(requests.length,4,'same-variant repaint uses fresh leases');
 for(const r of requests.slice(2))r.gate.resolve(r.lease);assert.equal(await repaint,true);assert.equal(plane.livery,'CCA');
 assert(requests.slice(0,2).every(r=>r.lease.disposed===1));assert(requests.slice(2).every(r=>r.lease.disposed===0));
 plane.dispose();assert(requests.every(r=>r.lease.disposed===1));assert.equal(bundle.disposed,1);
}
{
 const {requests,liveryLoader}=fixture(),geometry=deferred(),bundle=makeBundle();
 const plane=new AccurateB777Research({geometryLoader:()=>geometry.promise,liveryLoader});
 const pending=plane.setLivery('BOE');await tick();assert.equal(await plane.setLivery('unknown'),false);assert.equal(await pending,false);
 assert(requests.every(r=>r.signal.aborted),'superseded paint is aborted without waiting for geometry');
 for(const r of requests)r.gate.resolve(r.lease);await tick();assert(requests.every(r=>r.lease.disposed===1),'late unused leases released once');
 geometry.resolve(bundle);await tick();assert.equal(bundle.disposed,1);assert.equal(plane.livery,null);plane.dispose();
}
{
 const {requests,liveryLoader}=fixture(),geometry=deferred(),bundle=makeBundle();
 const plane=new AccurateB777Research({geometryLoader:()=>geometry.promise,liveryLoader});
 const pending=plane.setLivery('BOE');await tick();geometry.resolve(bundle);await tick();
 // The controller has claimed both pending textures. Cancellation disposes the
 // bundle promptly; the controller owns and eventually releases late leases.
 assert.equal(await plane.setLivery('unknown'),false);assert.equal(await pending,false);await tick();
 assert.equal(bundle.disposed,1);assert(requests.every(r=>r.signal.aborted));
 for(const r of requests)r.gate.resolve(r.lease);await tick();assert(requests.every(r=>r.lease.disposed===1));plane.dispose();
}
{
 const {requests,liveryLoader}=fixture(),geometry=deferred();
 const plane=new AccurateB777Research({geometryLoader:()=>geometry.promise,liveryLoader});
 const pending=plane.load();await tick();requests[0].gate.resolve(requests[0].lease);await tick();
 geometry.reject(Error('geometry failed'));await assert.rejects(pending,/geometry failed/);
 requests[1].gate.resolve(requests[1].lease);await tick();assert(requests.every(r=>r.lease.disposed===1));plane.dispose();
}
{
 const {requests,liveryLoader}=fixture(),geometry=deferred(),bundle=makeBundle();
 const plane=new AccurateB777Research({geometryLoader:()=>geometry.promise,liveryLoader});
 const pending=plane.load();await tick();geometry.resolve(bundle);await tick();
 requests[0].gate.reject(Error('paint failed'));requests[1].gate.resolve(requests[1].lease);
 await assert.rejects(pending,/paint failed/);assert.equal(requests[1].lease.disposed,1);assert.equal(bundle.disposed,1);plane.dispose();
}
// The production initial model deadline still starts only after preload ends.
{
 const barrier=deferred(),geometry=deferred(),bundle=makeBundle();
 const plane=new AccurateB777Research({timeoutMs:15,initialLoadBarrier:barrier.promise,geometryLoader:()=>geometry.promise,liveryLoader:async()=>({dispose(){}})});
 const pending=plane.load();await new Promise(r=>setTimeout(r,35));assert.equal(plane._pending!==null,true);
 barrier.resolve();await assert.rejects(pending,/timed out/);geometry.resolve(bundle);await tick();assert.equal(bundle.disposed,1);plane.dispose();
}
console.log('777 overlap: gated XML/GLB, one-shot transfers, factory ordering, paint ownership/cancellation/failures and deadline passed (no real timing benchmark).');
