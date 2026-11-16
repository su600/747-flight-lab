// Background downloads: a drop half-way is retried, counted bytes never exceed the manifest total,
// and a persistent failure ends in an explicit failed state. Each scenario uses a fresh aircraft type,
// because a finished aircraft is cached and would not download again.
import assert from 'node:assert/strict';
import {AIRCRAFT_DOWNLOAD_SIZES} from '../src/aircraft-download-sizes.js';
globalThis.location={href:'http://localhost/'};
Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});

// preload.js captures fetch at import time, so the mock reads its settings from these variables.
let failPath=null,failures=0,calls=0;
// (Data is delivered on the first read; the error comes on the next read, as a real drop would.)
const halfThenReset=size=>{let sent=false;return new ReadableStream({pull(c){if(!sent){sent=true;c.enqueue(new Uint8Array(Math.floor(size/2)));}else c.error(new TypeError('network reset'));}});};
globalThis.fetch=async url=>{
 const path=url.replace('/assets/','');calls++;
 const size=AIRCRAFT_DOWNLOAD_SIZES[path]??0;
 if(path===failPath&&failures>0){failures--;return new Response(halfThenReset(size));}
 return new Response(new Uint8Array(size));
};

const {prefetchInOrder,isPreloaded,observeAircraftDownloads}=await import('../src/preload.js');
const opts={livery:'BOE'};

// 1. A drop half-way through a file (A380 fuselage) is retried; the count never overshoots and the aircraft ends ready.
{
 failPath='a380/fuselage.glb';failures=1;
 let peakExcess=-Infinity;const events=[];
 const off=observeAircraftDownloads((t,p)=>{if(t==='a380'){peakExcess=Math.max(peakExcess,p.excess??-Infinity);events.push(p);}});
 await prefetchInOrder(['a380'],{backoff:async()=>{},onStatus:()=>{}});
 off();
 assert(isPreloaded('a380',opts),'the retry completes the A380');
assert(peakExcess<=0,`counted bytes never exceed the manifest total (peak excess ${peakExcess})`);
 assert.equal(events.at(-1).done,true,'final observer event is ready');
}

// 2. A persistent failure on a330 ends in an explicit failed state after the last attempt.
{
 failPath='accurate-a330/Models/a330-300-main.ac';failures=1e9;
 const statuses=[];
 const origWarn=console.warn;console.warn=()=>{};
 await prefetchInOrder(['a330'],{backoff:async()=>{},onStatus:(t,p)=>statuses.push(p)});
 console.warn=origWarn;
 assert(!isPreloaded('a330',opts),'a persistent failure is not reported as ready');
 assert(statuses.at(-1).failed===true,'after the last attempt the aircraft is marked failed');
}

console.log('Prefetch retry passed: dropped downloads retry without overshooting progress, and persistent failures end in an explicit failed state.');
