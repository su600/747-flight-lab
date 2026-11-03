// CPU-only: node tests/model-specific-default.mjs
// Real catalog, selection coordinators and model-paint on the actual A380 GLB
// geometry. Canvas and image loading are controlled; no browser/GPU/network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Aircraft,LIVERIES} from '../src/aircraft.js';
import {addModelPaint} from '../src/model-paint.js';
import {TwinAircraft} from '../src/twin-aircraft.js';
import {realityFor} from '../src/livery-reality.js';

const catalog=JSON.stringify(LIVERIES),boe=LIVERIES.find(l=>l.id==='BOE');
for(const type of ['b747','b777','a380','a330']){
 const effective=Aircraft.liveryForModel('BOE',type);
 assert.equal(effective.id,'BOE');
 assert.equal(effective.en,type.startsWith('a')?'AIRBUS HOUSE':'BOEING HOUSE');
 assert.equal(effective.logo,type.startsWith('a')?'airbus-house.png':'boeing.png');
 for(const cargo of ['fedex','sf'])assert.strictEqual(Aircraft.liveryForModel(cargo,type),LIVERIES.find(l=>l.id===cargo));
}
for(const id of ['AF1_CLASSIC','AF1_2026']){
 assert.equal(Aircraft.liveryForModel(id,'b747'),LIVERIES.find(l=>l.id===id),`${id} remains available for 747`);
 for(const type of ['a330','a380','b777'])assert.equal(Aircraft.liveryForModel(id,type),null,`${id} must not be supported on ${type}`);
}
assert.equal(Aircraft.liveryForModel('bogus','a380'),undefined);
assert.equal(JSON.stringify(LIVERIES),catalog,'resolver must not mutate shared catalog');
const logo=await readFile(new URL('../assets/livery-logos/airbus-house.png',import.meta.url));
assert.equal(logo.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
assert.equal(logo.readUInt32BE(16),512);assert.equal(logo.readUInt32BE(20),512);

const images=[],canvases=[];
globalThis.Image=class{constructor(){images.push(this);}set src(value){this.url=value;}get src(){return this.url;}};
globalThis.document={createElement(type){
 assert.equal(type,'canvas');const calls=[];
 const ctx={calls,clearRect(...x){calls.push(['clear',...x]);},drawImage(...x){calls.push(['image',...x]);},fillText(...x){calls.push(['text',this.fillStyle,...x]);},fillRect(...x){calls.push(['rect',this.fillStyle,...x]);},measureText(text){return {width:String(text).length*20};},beginPath(){},moveTo(){},lineTo(){},arc(){},stroke(){},closePath(){},fill(){}};
 const canvas={getContext:()=>ctx,ctx};canvases.push(canvas);return canvas;
}};
globalThis.ProgressEvent??=class{constructor(type,options){this.type=type;Object.assign(this,options);}};
async function geometryOnlyGLB(name){
 const data=await readFile(new URL(`../assets/a380/${name}.glb`,import.meta.url));
 const size=data.readUInt32LE(12),json=JSON.parse(data.subarray(20,20+size).toString());
 for(const m of json.materials||[]){delete m.normalTexture;delete m.emissiveTexture;delete m.occlusionTexture;if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}}
 delete json.images;delete json.textures;delete json.samplers;
 const text=Buffer.from(JSON.stringify(json)),n=(text.length+3)&~3,bin=data.subarray(20+size),out=Buffer.alloc(20+n+bin.length,0x20);
 out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(n,12);out.write('JSON',16);text.copy(out,20);bin.copy(out,20+n);
 return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');
}
// The A380 atlas painter is covered by tests/a380-paint.mjs.
const b777=await new TwinAircraft('b777').load();
for(const plane of [b777]){
 const side=plane.root.getObjectByName('livery-side-right'),tail=plane.root.getObjectByName('livery-tail-right');
 assert(side&&tail,`${plane.type} projected decals`);
 await plane.setLivery('BOE');assert.equal(plane.livery,'BOE');
 const sideCanvas=side.material.map.image,tailCanvas=tail.material.map.image;
 const calls=sideCanvas.ctx.calls.filter(x=>x[0]==='text');
 assert(calls.some(x=>x[2]===(plane.type==='a380'?'AIRBUS A380':'BOEING HOUSE')));
 assert(images.at(-1).src.endsWith(plane.type==='a380'?'/airbus-house.png':'/boeing.png'));
 images.at(-1).onload();assert(tailCanvas.ctx.calls.some(x=>x[0]==='image'));
 if(plane.type==='a380'){
  let fin;plane.root.traverse(o=>{if(o.name==='Mesh_44002')fin=o;});assert(fin);
  assert.equal(fin.material.color.getHexString(),new T.Color('#164a83').getHexString());
  assert(!calls.some(x=>String(x[2]).includes('BOEING')));
 }
 const previous=images.at(-1).onload;
 for(const id of ['fedex','sf']){
  const count=images.length;
  assert.equal(await plane.setLivery(id),true);assert.equal(plane.livery,id);
  assert.equal(images.length,count,'cargo marks are drawn without a menu-card image');
  const before=tailCanvas.ctx.calls.length;previous();assert.equal(tailCanvas.ctx.calls.length,before,'stale house logo cannot overwrite freight');
  for(const sign of ['left','right']){
   const decal=plane.root.getObjectByName('livery-freight-side-'+sign);assert(decal?.visible);
   const texts=decal.material.map.image.ctx.calls.filter(x=>x[0]==='text').map(x=>x[2]);
   assert((id==='sf'?['AIRLINES','顺丰航空','SF']:['Fed','Ex','Express']).every(text=>texts.includes(text)));
  }
 }
 await plane.setLivery('BOE');assert.equal(plane.livery,'BOE');
 assert(images.at(-1).src.endsWith(plane.type==='a380'?'/airbus-house.png':'/boeing.png'));
}
assert.equal(JSON.stringify(LIVERIES),catalog);

// Run the actual UI binding and coordinator functions in a controlled DOM.
// A real native <button> supplies Enter/Space activation. These mocks preserve
// child identity and focus and model that native activation via key().
const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const showStart=source.indexOf('function showLivery(){'),showEnd=source.indexOf('function showAircraft(){',showStart);
const selectStart=source.indexOf('async function selectAircraft(type){'),selectEnd=source.indexOf('// ---- UI',selectStart);
const bindStart=source.indexOf(" $('#liveries').innerHTML=LIVERIES.map"),bindEnd=source.indexOf('\n // Space/Enter',bindStart);
assert(showStart>=0&&showEnd>showStart&&selectStart>=0&&selectEnd>selectStart&&bindStart>=0&&bindEnd>bindStart);
let focused=null,buttons=[];
function button(id){
 const fields={b:{textContent:''},small:{textContent:''},img:{src:''},'.check':{textContent:''}},attributes={};
 return {dataset:{livery:id},fields,attributes,classList:{values:new Set(),toggle(k,v){if(v)this.values.add(k);else this.values.delete(k);}},setAttribute(k,v){attributes[k]=v;},querySelector(s){return fields[s];},focus(){focused=this;},key(k){if(k==='Enter'||k===' ')this.onclick();}};
}
const elements=new Map(),liveriesEl={set innerHTML(html){this.html=html;buttons=[...html.matchAll(/<button\b[^>]*data-livery="([^"]+)"/g)].map(m=>button(m[1]));},get innerHTML(){return this.html;}};
const $=s=>{if(s==='#liveries')return liveriesEl;if(!elements.has(s))elements.set(s,{textContent:'',value:'',hidden:false});return elements.get(s);};
const all=s=>s==='[data-livery]'?buttons:[];
// Geometry helpers are stubs here: this test checks the picker, not tail geometry (see tests/tail-clearance.mjs).
const context=vm.createContext({Aircraft,LIVERIES,$,all,console,realityFor,REALITY_TAGS:{real:'真机',family:'同系列',none:'无真机'},tailSamples:()=>[],makePitchLimit:()=>()=>40});
vm.runInContext(`
 const AIRCRAFT_INFO={b747:{name:'747'},a380:{name:'380'},a330:{name:'330'},b777:{name:'777'}};
 let plane,aircraftRequest=0,liveryVersion=0,desiredLivery='BOE';const sim={},window={flightLab:{}},scene={add(){},remove(){}};
 let candidates={};const getAircraft=async type=>candidates[type];
 const showAircraft=()=>{},syncCabinTime=()=>{},setEmitters=()=>{},notify=()=>{},beginLoad=()=>({update(){},done(){}});
 ${source.slice(showStart,showEnd)}
 ${source.slice(selectStart,selectEnd)}
 function bind(){${source.slice(bindStart,bindEnd)}}
 globalThis.test={bind,showLivery,selectAircraft,selectLivery,setup(p,c){plane=p;candidates=c;},state(){return {plane,desiredLivery}}};
`,context);
const root=()=>({position:{copy(){}},quaternion:{copy(){}},visible:true});
const craft=type=>({type,livery:'BOE',root:root(),update(){},async setLivery(id){this.livery=id;return true;}});
const candidates=Object.fromEntries(['b747','b777','a380','a330'].map(type=>[type,craft(type)]));
context.test.setup(candidates.b747,candidates);context.test.bind();context.test.showLivery();
assert.match(liveriesEl.html,/<button\b/);const house=buttons.find(b=>b.dataset.livery==='BOE'),sf=buttons.find(b=>b.dataset.livery==='sf');
const af1Classic=buttons.find(b=>b.dataset.livery==='AF1_CLASSIC'),af1New=buttons.find(b=>b.dataset.livery==='AF1_2026');
assert.equal(house.fields.small.textContent,'BOEING HOUSE');assert.equal(house.attributes['aria-pressed'],'true');
assert.equal(af1Classic.hidden,false);assert.equal(af1New.hidden,false,'AF1 schemes remain visible on 747');
house.focus();
for(const type of ['a380','a330','b777','b747']){
 assert(await context.test.selectAircraft(type));assert.strictEqual(focused,house);assert.strictEqual(buttons.find(b=>b.dataset.livery==='BOE'),house);
 assert.equal(house.fields.small.textContent,type.startsWith('a')?'AIRBUS HOUSE':'BOEING HOUSE');
 assert(house.fields.img.src.endsWith(type.startsWith('a')?'/airbus-house.png':'/boeing.png'));
 assert.equal(house.attributes['aria-pressed'],'true');assert.equal(context.test.state().plane.livery,'BOE');
 assert.equal(af1Classic.hidden,type!=='b747');assert.equal(af1New.hidden,type!=='b747');
 assert.equal(af1Classic.disabled,type!=='b747');assert.equal(af1New.disabled,type!=='b747');
}
sf.focus();sf.key('Enter');await new Promise(r=>setImmediate(r));assert.equal(context.test.state().plane.livery,'sf');assert.equal(sf.attributes['aria-pressed'],'true');
assert(await context.test.selectAircraft('a380'));assert.strictEqual(focused,sf);assert.equal(sf.attributes['aria-pressed'],'true');assert.equal(house.attributes['aria-pressed'],'false');assert.equal(house.fields.small.textContent,'AIRBUS HOUSE');assert.equal(context.test.state().desiredLivery,'sf');assert.match($('#liveryDetails').textContent,/假想/);
house.focus();house.key(' ');await new Promise(r=>setImmediate(r));assert.equal(context.test.state().plane.livery,'BOE');assert.equal(house.attributes['aria-pressed'],'true');assert.equal($('#liveryName').textContent,'空客原厂 · 示意');assert.match($('#liveryDetails').textContent,/厂商涂装/);
assert.equal(await context.test.selectLivery('AF1_CLASSIC'),false,'A380 must reject Air Force One schemes');
await context.test.selectAircraft('b747');await context.test.selectLivery('AF1_CLASSIC');
assert.equal(context.test.state().plane.livery,'AF1_CLASSIC');assert.equal(af1Classic.hidden,false);
await context.test.selectAircraft('a380');
assert.equal(context.test.state().plane.livery,'BOE','switching off 747 falls back from AF1 to Airbus house paint');
assert.equal(context.test.state().desiredLivery,'BOE');assert.equal(af1Classic.hidden,true);assert.equal(af1New.hidden,true);
// Exercise the real global shortcut handler as well: without its focus guard,
// Space is prevented before the browser can activate the focused button.
const ignoreStart=source.indexOf(' const ignore=()=>'),keyEnd=source.indexOf("\n addEventListener('keyup'",ignoreStart);assert(ignoreStart>=0&&keyEnd>ignoreStart);
const keyboard={handler:null,sim:{paused:false},keys:new Set(),document:{activeElement:{matches:s=>s.includes('.livery-card')},querySelector:()=>null},addEventListener(type,fn){assert.equal(type,'keydown');this.handler=fn;}};
keyboard.addEventListener=(_type,fn)=>keyboard.handler=fn;
vm.runInNewContext(source.slice(ignoreStart,keyEnd),keyboard);
let prevented=false;keyboard.handler({code:'Space',preventDefault(){prevented=true;}});assert.equal(prevented,false);assert.equal(keyboard.sim.paused,false);
keyboard.document.activeElement={matches:()=>false};keyboard.handler({code:'Space',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(keyboard.sim.paused,true);
console.log('Model defaults passed: catalog immutability, Airbus/Boeing markings, freight and stale logos, model-aware menu, focus, keyboard and persistent selection (CPU only).');
