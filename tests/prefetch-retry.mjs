// A download that drops mid-way is retried, and the picker never stays on "未完成" after a successful retry.
import assert from 'node:assert/strict';
import {AIRCRAFT_DOWNLOAD_SIZES} from '../src/aircraft-download-sizes.js';
globalThis.location={href:'http://localhost/'};
Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
const flaky='space-shuttle/Models/SSME.ac';let failures=1,calls=0,failPath=flaky;
// preload.js captures fetch at import time, so the mock reads its failure settings from these variables.
globalThis.fetch=async url=>{const path=url.replace('/assets/','');calls++;
 if(path===failPath&&failures-->0)throw new TypeError('network reset');
 return new Response(new Uint8Array(AIRCRAFT_DOWNLOAD_SIZES[path]??0));};
const {prefetchInOrder,isPreloaded}=await import('../src/preload.js');
const events=[];
const ok=await prefetchInOrder(['shuttle'],{backoff:async()=>{},onStatus:(type,p)=>events.push(p)});
assert.equal(ok,true);
assert(calls>=7,'the dropped file is fetched again');
assert(isPreloaded('shuttle',{livery:'BOE'}),'the retry completes the aircraft');
assert.equal(events.at(-1).done,true,'final status is ready, not failed');
assert(!events.at(-1).failed);
// A persistent failure ends in an explicit failed state, not a silent stall.
const bad='accurate-a330/Models/a330-300-main.ac';failPath=bad;failures=1e9;
const again=[];
await prefetchInOrder(['a330'],{backoff:async()=>{},onStatus:(t,p)=>again.push(p)});
assert(again.at(-1).failed===true,'after the last attempt the aircraft is marked as failed');
console.log('Prefetch retry passed: dropped downloads retry and end in ready or an explicit failed state.');
