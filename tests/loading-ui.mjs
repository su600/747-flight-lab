// Exercise the real switch indicator without a browser or GPU.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const start=source.indexOf('let loadToken=0,loadHideTimer;'),end=source.indexOf('// Cache each complete model',start);
assert(start>=0&&end>start);
const elements=new Map();
const $=selector=>{
 if(!elements.has(selector))elements.set(selector,{hidden:false,textContent:'',firstElementChild:{style:{}},classList:{add(){},remove(){}}});
 return elements.get(selector);
};
const cache=new Map(),context=vm.createContext({$,AIRCRAFT_INFO:{a380:{name:'A380'}},aircraftCache:cache,desiredLivery:'BOE',isPreloaded:()=>false,clearTimeout,setTimeout});
vm.runInContext(source.slice(start,end)+';globalThis.begin=beginLoad;',context);
const first=context.begin('a380');first.update({loaded:1048576,total:2097152,fraction:.5});
assert.equal($('#loadProgress').textContent,'A380 · 已下载 1.0 / 2.0 MB · 50%');assert(!$('#loadBar').hidden);
const next=context.begin('a380');next.update({loaded:1572864,total:2097152,fraction:.75});first.update({loaded:0,total:2097152,fraction:0});
assert.match($('#loadProgress').textContent,/75%/,'superseded callback cannot move progress backwards');
next.update({loaded:2097152,total:2097152,fraction:1});assert.match($('#loadProgress').textContent,/100% · 正在构建/);
cache.set('a380',{ready:true});context.begin('a380');assert($('#loadBar').hidden,'resident model has no download bar');
console.log('Loading UI: byte readout, superseded request and cached model passed.');
