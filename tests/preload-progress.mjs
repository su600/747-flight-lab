// Deterministic decoded-stream accounting, including gzip headers and concurrent subscribers.
import assert from 'node:assert/strict';
import {AIRCRAFT_DOWNLOAD_SIZES} from '../src/aircraft-download-sizes.js';
let calls=0,fail=false;
const gates=[];
globalThis.location={href:'http://localhost/'};
globalThis.fetch=async url=>{
 calls++;
 if(fail)return new Response('unavailable',{status:503});
 const size=AIRCRAFT_DOWNLOAD_SIZES[url.replace('/assets/','')];assert(size>0,url);
 const half=Math.floor(size/2);
 const body=new ReadableStream({start(controller){
  controller.enqueue(new Uint8Array(half));
  gates.push(()=>{controller.enqueue(new Uint8Array(size-half));controller.close();});
 }});
 return new Response(body,{headers:{'content-encoding':'gzip','content-length':'7','x-raw-length':'999999999'}});
};
const {preloadAircraft,isPreloaded,aircraftFiles}=await import('../src/preload.js');
const samples=[],later=[];
const promise=preloadAircraft('a380',{onProgress:p=>samples.push({...p})});
await new Promise(r=>setTimeout(r,10));
const same=preloadAircraft('a380',{onProgress:p=>later.push({...p})});
assert.strictEqual(promise,same);assert(later[0].loaded>0);assert(!isPreloaded('a380'));
while(!isPreloaded('a380')){
 for(const release of gates.splice(0))release();
 await new Promise(r=>setTimeout(r,5));
}
await promise;
const total=aircraftFiles('a380').reduce((n,[,size])=>n+size,0);
for(const list of [samples,later]){
 assert(list.length>2);
 for(let i=0;i<list.length;i++){
  const p=list[i];assert.equal(p.total,total);assert(p.loaded>=0&&p.loaded<=p.total);assert(p.fraction>=0&&p.fraction<=1);
  if(i)assert(p.loaded>=list[i-1].loaded&&p.fraction>=list[i-1].fraction);
 }
 assert.equal(list.at(-1).loaded,total);assert.equal(list.at(-1).fraction,1);
}
const after=calls;await preloadAircraft('a380');assert.equal(calls,after,'completed job does not refetch');
fail=true;const failed=[];await preloadAircraft('b777',{onProgress:p=>failed.push(p)});
assert(!isPreloaded('b777'));assert(failed.every(p=>p.fraction<1),'failed fetch is not reported as downloaded');
fail=false;const retry=preloadAircraft('b777');await new Promise(r=>setTimeout(r,10));for(const release of gates.splice(0))release();await retry;assert(isPreloaded('b777'));
console.log('Preload progress: decoded bytes, fixed totals, concurrency, failure and retry passed.');
