// CPU-only integration check of main.js coordinators with the real A330 AC,
// animations, UVs and textures. No browser, renderer, GPU, network or deployment.
// Run: node tests/a330-main-integration.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import * as T from 'three';
import {Aircraft,LIVERIES} from '../src/aircraft.js';
import {AccurateA330} from '../src/accurate-a330.js';

function domNode(d){return {tagName:d.tag,textContent:d.text,children:d.children.map(domNode)};}
globalThis.DOMParser=class{parseFromString(xml){
 const py="import sys,json,xml.etree.ElementTree as E\nr=E.fromstring(sys.stdin.read())\ndef cv(e): return {'tag':e.tag,'text':''.join(e.itertext()),'children':[cv(c) for c in e]}\nprint(json.dumps(cv(r)))";
 return {documentElement:domNode(JSON.parse(execFileSync('python3',['-c',py],{input:xml,encoding:'utf8'}))),querySelector:()=>null};
}};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
let failModel=false,holdModel=null,failPaint=false,holdPaint=null;
globalThis.fetch=async url=>{
 if(failModel&&url.endsWith('a330-300-main.ac'))return {ok:false,status:503};
 if(holdModel&&url.endsWith('a330-300-main.ac'))await holdModel.promise;
 try{const base=new URL('../assets/accurate-a330/',import.meta.url),relative=url.endsWith('window-footprints.json')?'window-footprints.json':'Models/'+url.split('/').at(-1);const data=await readFile(new URL(relative,base),'utf8');return{ok:true,text:async()=>data};}catch{return{ok:false,status:404};}
};
T.TextureLoader.prototype.load=function(url,onLoad,_progress,onError){
 const texture=new T.Texture();texture.image={width:2048,height:1024};
 const own=url.includes('/accurate-a330/derived/liveries/')||url.includes('/accurate-a330/Models/Liveries/');
 if(own&&failPaint){queueMicrotask(()=>onError?.(Error('test paint failure')));}
 else if(own&&holdPaint&&url.endsWith('/sf.png'))holdPaint.complete=()=>onLoad(texture);
 else queueMicrotask(()=>onLoad?.(texture));
 return texture;
};

const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const infoStart=source.indexOf('const AIRCRAFT_INFO='),infoEnd=source.indexOf('\nlet originalAbout',infoStart);
const first=source.indexOf('function syncCabinTime('),last=source.indexOf('// ---- UI',first);
const snapshotStart=source.indexOf('snapshot(){return{'),snapshotEnd=source.indexOf('};}};',snapshotStart);
assert(infoStart>=0&&infoEnd>infoStart&&first>=0&&last>first&&snapshotStart>=0&&snapshotEnd>snapshotStart,'real coordinator code available');
const snapshotMethod=source.slice(snapshotStart,snapshotEnd+3);
const elements=new Map(),liveryButtons=LIVERIES.map(l=>({dataset:{livery:l.id},classList:{toggle(){}},setAttribute(){},querySelector(){return {textContent:''};}}));
const aircraftButtons=['b747','a380','a330','b777'].map(id=>({dataset:{aircraft:id},classList:{toggle(){}},setAttribute(){}}));
const all=selector=>selector==='[data-livery]'?liveryButtons:selector==='[data-aircraft]'?aircraftButtons:selector==='.engine-meter'?[{},{},{},{}]:[];
const $=selector=>{if(!elements.has(selector))elements.set(selector,{textContent:'',innerHTML:'',value:'',title:'',disabled:false,hidden:false});return elements.get(selector);};
let genericAdds=0,genericUpdates=0,wingFixes=0;
const context=vm.createContext({T,Aircraft,AccurateA330,LIVERIES,$,all,console,
 TwinAircraft:class{},A380Aircraft:class{},fixAircraftWingShading:()=>wingFixes++,addCabinLights:()=>genericAdds++,updateCabinLights:()=>genericUpdates++,notify:()=>{}});
vm.runInContext(`
 const world={time:'day'},sim={gear:1,flaps:0,engine:0,onGround:true,door:0,doorTarget:0};
 const scene=new T.Scene(),window={flightLab:{}},airflow={},display={diagnostics:()=>({})},renderer={info:{render:{calls:0,triangles:0}}};let fps=0;const warningList=()=>[];
 let plane=new Aircraft();scene.add(plane.root);
 const originalEmitters={engines:[],tips:[],mainGear:[]};let originalAbout='<p>747</p>';
 const aircraftCache=new Map([['b747',Promise.resolve(plane)]]);let aircraftRequest=0,liveryVersion=0,desiredLivery='BOE';
 ${source.slice(infoStart,infoEnd)}
 ${source.slice(first,last)}
 const snapshotHost={${snapshotMethod}};
 globalThis.test={selectAircraft,selectLivery,syncCabinTime,getAircraft,snapshot:()=>snapshotHost.snapshot(),state(){return {plane,scene,sim,world,airflow,desiredLivery,aircraftCache}},setTime(time){world.time=time;syncCabinTime(plane)}};
`,context);
const api=context.test,initial=api.state().plane,scene=api.state().scene;
// A failed load removes its cache entry, keeps the 747 displayed and is retryable.
failModel=true;assert.equal(await api.selectAircraft('a330'),false);failModel=false;
assert.equal(api.state().plane,initial);assert.equal(initial.root.parent,scene);assert(!api.state().aircraftCache.has('a330'));
// A completed but superseded load is cached without taking ownership of the scene.
holdModel=defer();const pending=api.selectAircraft('a330');assert.equal(await api.selectAircraft('b747'),true);holdModel.resolve();assert.equal(await pending,false);holdModel=null;
assert.equal(api.state().plane,initial);assert.equal(initial.root.parent,scene);
const ready=await api.getAircraft('a330');assert(ready instanceof AccurateA330);assert.equal(ready.root.parent,null);assert.equal(genericAdds,0,'A330 must use its own cabin lights');
// A decoded livery failure must also leave the active 747 intact; retry succeeds.
failPaint=true;assert.equal(await api.selectAircraft('a330'),false);failPaint=false;assert.equal(api.state().plane,initial);assert.equal(initial.root.parent,scene);
api.setTime('night');assert.equal(await api.selectAircraft('a330'),true);const a=api.state().plane;
assert.equal(a,ready,'successful model is reused');assert.equal(a.root.parent,scene);assert.equal(initial.root.parent,null);assert.equal(a.livery,'BOE');assert.equal(a.cabinWindowLights.visible,true);
assert(a.dimensions.x>62&&a.dimensions.x<64&&a.dimensions.z>59&&a.dimensions.z<61);assert(a.contact>5&&a.contact<6);assert(a.a330Animations.length>50);
assert.equal($('#engineLabel').textContent,'GE CF6-80E1 · N1 %');assert.equal($('#gearDescription').textContent,'10 个轮子，3 组支撑');assert($('#aboutDetails').innerHTML.includes('FlightGear A330-303'));assert($('#door').disabled);
assert.equal(api.state().airflow.engines.length,2);assert.equal(api.state().airflow.engines[0].z,-9.41);assert.equal(api.state().airflow.mainGear.length,4);
for(const entry of LIVERIES){
 assert.equal(await api.selectLivery(entry.id),true,entry.id);const cargo=['fedex','sf'].includes(entry.id);
 assert.equal(a.livery,entry.id);assert.equal(a.cargoMode,cargo);assert.equal(a.cabinWindowLights.visible,!cargo);assert.equal($('#door').disabled,!cargo);
 assert.equal(a.liveryInfo.approximate,true);assert.equal($('#liveryDetails').hidden,false);assert($('#liveryDetails').textContent.length>10);
 if(cargo){assert.match($('#liveryDetails').textContent,/非 A330-200F/);assert.match($('#aircraftName').textContent,/货运外观示意/);}
}
assert.equal(await api.selectLivery('CCA'),true);api.setTime('day');assert.equal(a.cabinWindowLights.visible,false);api.setTime('dusk');assert.equal(a.cabinWindowLights.visible,false);api.setTime('night');assert.equal(a.cabinWindowLights.visible,true);
await api.selectLivery('sf');assert.equal(a.cabinWindowLights.visible,false);api.state().sim.doorTarget=1;await api.selectLivery('CCA');assert.equal(api.state().sim.doorTarget,0);assert($('#door').disabled);assert.equal(a.cabinWindowLights.visible,true);
// An in-flight A330 paint followed by a switch cannot overwrite the latest intent.
holdPaint={};const paint=api.selectLivery('sf');assert(holdPaint.complete);assert.equal(await api.selectAircraft('b747'),true);assert.equal(api.state().plane,initial);holdPaint.complete();assert.equal(await paint,true);holdPaint=null;assert.equal(initial.livery,'sf');
assert.equal(await api.selectAircraft('a330'),true);assert.equal(api.state().plane,ready);assert.equal(ready.livery,'sf');assert(ready.cargoMode);assert.equal(ready.cabinWindowLights.visible,false);
assert(wingFixes>=1);assert.equal(genericAdds,0);assert(genericUpdates>=1,'747 keeps generic cabin-time hook');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),notes=await readFile(new URL('../MODEL-NOTES.html',import.meta.url),'utf8');
assert.match(html,/A330–303/);assert.match(html,/非 A330-200F/);assert.match(notes,/f016c7c0ad8c6c48b7d9eed7ed7dde49dc69059d/);assert.match(notes,/GPL-2\.0/);assert.match(notes,/Josh Davidson/);assert.match(notes,/不是 A330-200F/);assert(!notes.includes('A330-300 和 777-300ER 为本项目原创'));
const snap=api.snapshot();assert.equal(snap.aircraft,'a330');assert.equal(snap.animations,ready.a330Animations.length);assert.equal(snap.paint,'a330-atlas');assert.equal(snap.cargoMode,true);assert.equal(snap.cabinLit,false);assert.equal(snap.liveryInfo.approximate,true);assert.match(snap.model,/非 A330-200F/);
console.log(`A330 main integration passed: 503 + paint failure/retry, superseded switch, cached model reuse, ${LIVERIES.length} paints, cabin time/cargo, door, airflow and livery race (CPU only).`);
