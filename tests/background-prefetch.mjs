// Background aircraft downloads: strictly one aircraft after another, in the given order, with status callbacks.
import assert from 'node:assert/strict';
import {AIRCRAFT_DOWNLOAD_SIZES} from '../src/aircraft-download-sizes.js';
globalThis.location={href:'http://localhost/'};
const log=[];
const typeOf=url=>url.includes('/a380/')?'a380':url.includes('accurate-a330')?'a330':url.includes('accurate-b777')?'b777':url.includes('space-shuttle')?'shuttle':'other';
globalThis.fetch=async url=>{const path=url.replace('/assets/','');log.push(typeOf(url));
 await new Promise(r=>setTimeout(r,1));return new Response(new Uint8Array(AIRCRAFT_DOWNLOAD_SIZES[path]??0));};
const {prefetchInOrder,isPreloaded}=await import('../src/preload.js');
const status=[];
const ok=await prefetchInOrder(['a380','a330','b777','shuttle'],{onStatus:(type,p)=>{if(p.done)status.push(type);}});
assert.equal(ok,true);
assert.deepEqual(status,['a380','a330','b777','shuttle'],'each aircraft completes in order');
const firstIndex=t=>log.indexOf(t),lastIndex=t=>log.lastIndexOf(t);
for(const [a,b] of [['a380','a330'],['a330','b777'],['b777','shuttle']])assert(lastIndex(a)<firstIndex(b),`${b} starts only after ${a} finished`);
for(const t of ['a380','a330','b777','shuttle'])assert(isPreloaded(t,{livery:'BOE'}),`${t} marked ready`);
Object.defineProperty(globalThis,'navigator',{value:{connection:{saveData:true}},configurable:true});
assert.equal(await prefetchInOrder(['a380']),false,'Data Saver skips background downloads');
console.log('Background prefetch passed: sequential picker order, ready status, Data Saver respected.');
