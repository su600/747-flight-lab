// CPU-only integration check of main.js coordinators with the real A330 AC,
// animations, UVs and textures. No browser, renderer, GPU, network or deployment.
// Run: node tests/a330-main-integration.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as T from 'three';
import {Aircraft,LIVERIES} from '../src/aircraft.js';
import {AccurateA330} from '../src/accurate-a330.js';

// Test-only XML subset for the pinned FlightGear files. It builds ordered
// element/text content, decodes XML entities and rejects malformed input. DTDs
// are intentionally unsupported: the local assets need neither DTDs nor
// external entities, and the test must never fetch or expand external data.
class XmlElement{
 constructor(tagName,attributes=Object.create(null)){this.tagName=tagName;this.attributes=attributes;this.children=[];this.content=[];}
 get textContent(){return this.content.map(item=>typeof item==='string'?item:item.textContent).join('');}
 getAttribute(name){return Object.hasOwn(this.attributes,name)?this.attributes[name]:null;}
}
function decodeXml(text){
 const predefined={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
 return text.replace(/&([^;]*);|&/g,(reference,name)=>{
  if(name&&Object.hasOwn(predefined,name))return predefined[name];
  let value;
  if(/^#\d+$/.test(name||''))value=Number(name.slice(1));
  else if(/^#x[\da-f]+$/i.test(name||''))value=parseInt(name.slice(2),16);
  else throw Error(`Invalid XML entity: ${reference}`);
  if(!Number.isInteger(value)||!(value===9||value===10||value===13||value>=0x20&&value<=0xd7ff||value>=0xe000&&value<=0xfffd||value>=0x10000&&value<=0x10ffff))throw Error(`Invalid XML character: ${reference}`);
  return String.fromCodePoint(value);
 });
}
function parseXml(xml){
 const s=String(xml).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');let i=0,root=null;const stack=[];
 const whitespace=()=>{const start=i;while(/[\t\n ]/.test(s[i]||''))i++;return i>start;};
 const name=()=>{const match=/^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(s.slice(i));if(!match)throw Error(`Invalid XML name at ${i}`);i+=match[0].length;return match[0];};
 const append=text=>{if(stack.length)stack.at(-1).content.push(text);else if(text.trim())throw Error('Text outside XML root');};
 while(i<s.length){
  if(s[i]!=='<'){const end=s.indexOf('<',i),stop=end<0?s.length:end,text=s.slice(i,stop);if(text.includes(']]>'))throw Error('Unexpected CDATA terminator');append(decodeXml(text));i=stop;continue;}
  if(s.startsWith('<!--',i)){const end=s.indexOf('-->',i+4);if(end<0||s.slice(i+4,end).includes('--'))throw Error('Invalid XML comment');i=end+3;continue;}
  if(s.startsWith('<![CDATA[',i)){const end=s.indexOf(']]>',i+9);if(end<0||!stack.length)throw Error('Invalid XML CDATA');append(s.slice(i+9,end));i=end+3;continue;}
  if(s.startsWith('<?',i)){const end=s.indexOf('?>',i+2);if(end<0)throw Error('Unclosed XML processing instruction');i=end+2;continue;}
  if(s.startsWith('<!',i))throw Error('XML declarations and DTDs are unsupported');
  if(s.startsWith('</',i)){
   i+=2;const closing=name();whitespace();if(s[i++]!=='>')throw Error('Invalid XML closing tag');
   if(!stack.length||stack.pop().tagName!==closing)throw Error(`Mismatched XML closing tag: ${closing}`);continue;
  }
  i++;const tag=name(),attributes=Object.create(null);let selfClosing=false;
  for(;;){
   const spaced=whitespace();
   if(s.startsWith('/>',i)){i+=2;selfClosing=true;break;}
   if(s[i]==='>'){i++;break;}
   if(!spaced)throw Error('XML attributes must be separated by whitespace');
   const key=name();if(Object.hasOwn(attributes,key))throw Error(`Duplicate XML attribute: ${key}`);
   whitespace();if(s[i++]!=='=')throw Error(`Missing XML attribute value: ${key}`);whitespace();
   const quote=s[i++];if(quote!=="'"&&quote!=='"')throw Error(`Unquoted XML attribute: ${key}`);
   const end=s.indexOf(quote,i);if(end<0)throw Error(`Unclosed XML attribute: ${key}`);
   const value=s.slice(i,end);if(value.includes('<'))throw Error(`Invalid XML attribute: ${key}`);
   attributes[key]=decodeXml(value);i=end+1;
  }
  const element=new XmlElement(tag,attributes);
  if(stack.length){stack.at(-1).children.push(element);stack.at(-1).content.push(element);}
  else{if(root)throw Error('Multiple XML roots');root=element;}
  if(!selfClosing)stack.push(element);
 }
 if(!root||stack.length)throw Error('Missing or unclosed XML root');
 const findParserError=node=>node.tagName==='parsererror'?node:node.children.map(findParserError).find(Boolean)||null;
 return {documentElement:root,querySelector:selector=>selector==='parsererror'?findParserError(root):null};
}
globalThis.DOMParser=class{parseFromString(xml){
 try{return parseXml(xml);}catch(error){const node=new XmlElement('parsererror');node.content.push(error.message);return {documentElement:node,querySelector:selector=>selector==='parsererror'?node:null};}
}};
// Exercise the parser independently so a permissive stub cannot silently
// erase or flatten animation nodes while the integration assertions still pass.
{
 const parser=new DOMParser(),doc=parser.parseFromString(`<?xml version="1.0"?><root label="a &amp; b > c" quote='&quot;x&quot;'><!-- ignore -->before<item id='&#x31;'>a&amp;b<inner/>c<![CDATA[<&raw>]]>&#65;&#x1F680;</item>after<empty /></root>`,'application/xml');
 assert.equal(doc.querySelector('parsererror'),null);assert.equal(doc.documentElement.tagName,'root');
 assert.equal(doc.documentElement.getAttribute('label'),'a & b > c');assert.equal(doc.documentElement.getAttribute('quote'),'"x"');
 assert.deepEqual(doc.documentElement.children.map(e=>e.tagName),['item','empty']);assert.equal(doc.documentElement.children[0].getAttribute('id'),'1');
 assert.equal(doc.documentElement.textContent,'beforea&bc<&raw>A🚀after');assert.equal(doc.documentElement.children[0].children[0].tagName,'inner');
 assert.equal(parser.parseFromString('<x>&lt;&gt;&apos;&amp;&quot;&#9;</x>','application/xml').documentElement.textContent,`<>'&"\t`);
 for(const invalid of ['<a><b></a>','<a x="1" x="2"/>','<a x=unquoted/>','<a>&unknown;</a>','<a>&unterminated</a>','<a>&#0;</a>','<a><![CDATA[broken</a>','<!DOCTYPE a><a/>','<a/><b/>'])assert(parser.parseFromString(invalid,'application/xml').querySelector('parsererror'),invalid);
}
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
 AccurateB777Candidate:class{},createB777LiveryLoader:()=>()=>{},b777CargoManifest:()=>{},b777PassengerManifest:()=>{},A380Aircraft:class{},fixAircraftWingShading:()=>wingFixes++,addCabinLights:()=>genericAdds++,updateCabinLights:()=>genericUpdates++,notify:()=>{}});
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
