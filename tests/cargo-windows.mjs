// CPU-only: node tests/cargo-windows.mjs
// Every freight livery (CARGO_LIVERIES: fedex, sf) must leave no passenger
// window visible on b747, a380, a330 and b777, and no night cabin-window overlay
// lit. Real model code, real GLB/AC/XML/JSON/PNG assets, no GPU, browser or
// network. Each model runs in its own child process to bound memory.
// Passenger liveries (BOE) are run as controls so the detectors are proven live.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import zlib from 'node:zlib';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {parseXml} from './xml-fixture-parser.mjs';

const MODELS=['b747','a380','a330','b777'];
const ASSETS=fileURLToPath(new URL('../assets/',import.meta.url));
const SELF=fileURLToPath(import.meta.url);
const FREIGHT=['fedex','sf'];

const model=process.argv[2];

// ---- shared CPU shims -----------------------------------------------------
globalThis.self??=globalThis;
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,props){this.type=type;Object.assign(this,props);}};
globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
// GLTFLoader probes WebP support with an Image; a 1x1 stub answers it without decoding.
globalThis.Image??=class{constructor(){this.width=1;this.height=1;}set src(_){queueMicrotask(()=>this.onload?.());}};
globalThis.DOMParser=class{parseFromString(xml){return parseXml(xml);}};
// Aircraft.bind() queries its FlightGear XML with element selectors. Support the
// exact forms the codebase uses: ':scope > tag', 'tag', and 'a > b' (test-only).
function selectAll(el,selector){
 const parts=selector.split('>').map(x=>x.trim());let set=[el],direct=false;
 if(parts[0]===':scope'){parts.shift();direct=true;}
 const descendants=node=>node.children.flatMap(c=>[c,...descendants(c)]);
 for(const tag of parts){
  const next=[];
  for(const node of set)for(const c of direct?node.children:descendants(node))if(c.tagName===tag)next.push(c);
  set=next;direct=true;
 }
 return set;
}
{
 const proto=Object.getPrototypeOf(parseXml('<probe/>').documentElement);
 proto.querySelectorAll=function(selector){return selectAll(this,selector);};
 proto.querySelector=function(selector){return selectAll(this,selector)[0]??null;};
}
// Map /747/assets/... browser URLs onto the repository's assets directory.
const localPath=url=>{
 const clean=String(url).split('?')[0];
 assert(clean.startsWith('/747/assets/')||clean.startsWith(ASSETS),`unexpected URL ${url}`);
 return clean.startsWith('/747/assets/')?ASSETS+clean.slice('/747/assets/'.length):clean;
};
// Width/height from the IHDR of any PNG (overlays may be RGBA).
function pngSize(path){
 const data=readFileSync(path);assert.equal(data.toString('latin1',1,4),'PNG',path);
 return {w:data.readUInt32BE(16),h:data.readUInt32BE(20)};
}
// Decode 8-bit RGB PNG atlases exactly (no image library needed in Node).
function readPng(path){
 const data=readFileSync(path);assert.equal(data.toString('latin1',1,4),'PNG',path);
 let p=8,w=0,h=0,depth=0,ctype=0,interlace=1;const idat=[];
 while(p<data.length){
  const len=data.readUInt32BE(p),type=data.toString('latin1',p+4,p+8),body=data.subarray(p+8,p+8+len);p+=12+len;
  if(type==='IHDR'){w=body.readUInt32BE(0);h=body.readUInt32BE(4);depth=body[8];ctype=body[9];interlace=body[12];}
  else if(type==='IDAT')idat.push(body);
 }
 assert(depth===8&&ctype===2&&interlace===0,`${path}: 8-bit non-interlaced RGB PNG required`);
 const raw=zlib.inflateSync(Buffer.concat(idat)),bpp=3,stride=w*bpp,out=Buffer.alloc(h*stride);
 for(let y=0;y<h;y++){
  const filter=raw[y*(stride+1)],src=y*(stride+1)+1,dst=y*stride;
  for(let x=0;x<stride;x++){
   const a=x>=bpp?out[dst+x-bpp]:0,b=y?out[dst-stride+x]:0,c=x>=bpp&&y?out[dst-stride+x-bpp]:0,v=raw[src+x];
   let r;
   if(filter===0)r=v;else if(filter===1)r=v+a;else if(filter===2)r=v+b;else if(filter===3)r=v+((a+b)>>1);
   else if(filter===4){const q=a+b-c,pa=Math.abs(q-a),pb=Math.abs(q-b),pc=Math.abs(q-c);r=v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c);}
   else throw Error(`${path}: bad PNG filter ${filter}`);
   out[dst+x]=r&255;
  }
 }
 return {w,h,data:out};
}
const pixelAt=(img,x,y)=>{assert(x>=0&&y>=0&&x<img.w&&y<img.h,`pixel ${x},${y} outside ${img.w}x${img.h}`);const i=(y*img.w+x)*3;return [img.data[i],img.data[i+1],img.data[i+2]];};
// Passenger window artwork is a small neutral-grey rectangle. A livery
// cheatline is also neutral but runs the full width, and painted freight
// colours (purple, orange, red) are saturated, so neither is window art.
const windowGrey=([r,g,b])=>Math.max(r,g,b)<205&&Math.max(r,g,b)-Math.min(r,g,b)<40;
// Count window art at a footprint centre: a neutral pixel whose horizontal run
// is short enough to be a window rather than a full-width livery band.
function windowPixelsAt(img,cx,cy,limit=30,thr=24){
 if(!windowGrey(pixelAt(img,cx,cy)))return 0;
 let left=0,right=0;
 while(left<limit&&windowGrey(pixelAt(img,cx-left-1,cy)))left++;
 while(right<limit&&windowGrey(pixelAt(img,cx+right+1,cy)))right++;
 return (left+right)<thr?1:0;
}
// Texture loads become in-memory textures whose image dimensions come from the
// real PNG header; the URL is kept so tests can read exactly what was bound.
function installTextureStub(){
 T.TextureLoader.prototype.load=function(url,onLoad,_progress,onError){
  const texture=new T.Texture();texture.userData.url=String(url);
  // Model textures without a PNG on disk fall back to 1x1; atlases are sampled separately.
  let size={w:1,h:1};try{size=pngSize(localPath(url));}catch{}
  texture.image={width:size.w,height:size.h,naturalWidth:size.w,naturalHeight:size.h};
  queueMicrotask(()=>onLoad?.(texture));return texture;
 };
}
function atlasFileFor(texture){
 assert(texture?.userData?.url,'bound texture lacks its source URL');
 return readPng(localPath(texture.userData.url));
}
function report(name,lines){console.log(`PASS ${name}: ${lines.join('; ')}`);}

async function run(name){
 const started=performance.now();
 if(name==='b747')await check747();
 else if(name==='a380')await checkA380();
 else if(name==='a330')await checkA330();
 else await checkB777();
 console.log(`  (${name} CPU time ${((performance.now()-started)/1000).toFixed(1)}s)`);
}

// ---- Boeing 747 -----------------------------------------------------------
// The 747 has no passenger-window meshes: its windows are painted in the livery
// atlas (fedex-v2.png / sf.png), with a procedural night overlay on the fuselage.
async function check747(){
 installTextureStub();
 const {Aircraft}=await import('../src/aircraft.js');
 const {addCabinLights,updateCabinLights,WINDOW_ROWS}=await import('../src/aircraft-lighting.js');
 globalThis.fetch=async url=>{const path=localPath(url);const text=readFileSync(path,'utf8');return {ok:true,status:200,text:async()=>text};};
 const plane=await new Aircraft().load();
 assert.equal(plane.type,'b747');
 assert.equal(addCabinLights(plane),true,'747 night overlay installed');
 const lights=plane.root.getObjectByName('cabin-window-lights');assert(lights,'747 overlay exists');
 // No separate passenger-window instanced meshes exist on this model.
 let windowMeshes=0;plane.root.traverse(o=>{if(o.isInstancedMesh&&o.count===84)windowMeshes++;});assert.equal(windowMeshes,0);
 const footprints=WINDOW_ROWS.flatMap(([y,xs])=>xs.map(x=>[x,y]));
 // Control: the passenger livery is lit at night and its atlas has window art.
 assert.equal(await plane.setLivery('BOE'),true);updateCabinLights(plane,'night');
 assert.equal(lights.visible,true,'control: BOE overlay lit at night');
 const boe=atlasFileFor(plane.liveryMats[0].map);
 const controlDark=footprints.filter(([x,y])=>windowPixelsAt(boe,x,y)>0).length;
 assert(controlDark>=footprints.length*.95,`control: BOE atlas shows windows at ${controlDark}/${footprints.length}`);
 for(const id of FREIGHT){
  assert.equal(await plane.setLivery(id),true,`747 ${id} applied`);
  updateCabinLights(plane,'night');
  assert.equal(lights.visible,false,`747 ${id}: night cabin-window overlay hidden`);
  updateCabinLights(plane,'day');assert.equal(lights.visible,false,`747 ${id}: overlay hidden by day`);
  const atlas=atlasFileFor(plane.liveryMats[0].map);
  assert.match(plane.liveryMats[0].map.userData.url,new RegExp(`${id==='fedex'?'fedex-v2':'sf'}\\.png(?:\\?.*)?$`),'freight atlas bound');
  // Every passenger window footprint, on both decks, must be free of window art.
  // (Pre-fix, the upper-deck rows at y=60 and y=338 still carried window art.)
  for(const [y] of WINDOW_ROWS){
   const bad=footprints.filter(([x,yy])=>yy===y&&windowPixelsAt(atlas,x,yy)>0).length;
   assert.equal(bad,0,`747 ${id}: ${bad} window-grey footprints remain on row y=${y}`);
  }
 }
 report('b747',[`fedex/sf: overlay dark day+night; atlases carry no window art on rows ${WINDOW_ROWS.map(r=>r[0]).join('/')} (${footprints.length} footprints); BOE control lit at night and shows windows at ${controlDark}/${footprints.length}`]);
}

// ---- Airbus A380 ----------------------------------------------------------
async function checkA380(){
 installTextureStub();
 const {A380Aircraft}=await import('../src/a380-aircraft.js');
 const {addCabinLights,updateCabinLights}=await import('../src/aircraft-lighting.js');
 const fetchImpl=async(url,{signal}={})=>{
  assert.match(url,/^\/747\/assets\/a380\/[\w-]+\.glb$/);
  const data=readFileSync(localPath(url));
  return {ok:true,status:200,async arrayBuffer(){signal?.throwIfAborted?.();return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}};
 };
 // Freight atlases are not sampled here: the A380 atlas is WebP and Node has no
 // WebP decoder. Its windows are separate meshes (checked below), not atlas art.
 const loadTexture=async url=>{const t=new T.Texture();t.userData.url=String(url);t.image={width:1,height:1};return t;};
 const aircraft=await new A380Aircraft({fetchImpl,loadTexture}).load();
 const root=aircraft.root;
 assert.equal(addCabinLights(aircraft),true,'A380 night overlay installed');
 const lights=root.getObjectByName('cabin-window-lights');assert(lights,'A380 overlay exists');
 const windows=[];root.traverse(o=>{if(o.isMesh&&[o.material].flat().every(m=>m?.name==='A380_PAX_WINDOW'))windows.push(o);});
 assert.equal(windows.length,18,'all A380 passenger-window meshes found');
 // Control: passenger livery shows every window and lights the overlay at night.
 assert.equal(await aircraft.setLivery('BOE'),true);updateCabinLights(aircraft,'night');
 assert(windows.every(o=>o.visible),'control: BOE windows visible');assert.equal(lights.visible,true,'control: BOE overlay lit');
 const caps=aircraft.paint.caps;assert(caps.length>0,'A380 window caps exist');
 for(const id of FREIGHT){
  assert.equal(await aircraft.setLivery(id),true,`A380 ${id} applied`);
  updateCabinLights(aircraft,'night');
  const visibleWindows=windows.filter(o=>o.visible).length;
  assert.equal(visibleWindows,0,`A380 ${id}: ${visibleWindows} passenger-window meshes visible`);
  assert.equal(lights.visible,false,`A380 ${id}: night overlay hidden`);
  assert(caps.every(c=>c.visible),`A380 ${id}: all ${caps.length} window caps shown`);
 }
 report('a380',[`fedex/sf: 0/18 passenger-window meshes visible, overlay dark, ${caps.length} window caps shown; BOE control shows 18/18 and lit overlay`]);
}

// ---- Airbus A330 ----------------------------------------------------------
async function checkA330(){
 installTextureStub();
 const {AccurateA330}=await import('../src/accurate-a330.js');
 globalThis.fetch=async url=>{const path=localPath(url);try{const text=readFileSync(path,'utf8');return {ok:true,status:200,text:async()=>text};}catch{return {ok:false,status:404};}};
 const plane=await new AccurateA330().load();
 assert.equal(plane.type,'a330');
 const lights=plane.cabinWindowLights;assert(lights?.isMesh,'A330 cabin-window overlay exists');
 const fp=JSON.parse(readFileSync(ASSETS+'accurate-a330/window-footprints.json','utf8'));
 const footprints=fp.rows.flat();assert.equal(footprints.length,138);
 const centres=footprints.map(([x0,y0,x1,y1])=>[Math.round((x0+x1)/2),Math.round((y0+y1)/2)]);
 // Control: BOE is lit at night on the real overlay and its atlas has window art.
 assert.equal(await plane.setLivery('BOE'),true);plane.setCabinTime('night');
 assert.equal(lights.visible,true,'control: BOE overlay lit at night');
 const boe=atlasFileFor([...plane.paintMaterials][0].map);
 const controlWindows=centres.filter(([x,y])=>windowPixelsAt(boe,x,y)>0).length;
 assert(controlWindows>=fp.lit.flat().filter(Boolean).length*.95,`control: BOE atlas windows ${controlWindows}`);
 for(const id of FREIGHT){
  assert.equal(await plane.setLivery(id),true,`A330 ${id} applied`);
  assert.equal(plane.cargoMode,true);
  plane.setCabinTime('night');
  assert.equal(lights.visible,false,`A330 ${id}: night overlay hidden`);
  plane.setCabinTime('day');assert.equal(lights.visible,false,`A330 ${id}: overlay hidden by day`);
  const atlas=atlasFileFor([...plane.paintMaterials][0].map);
  assert.match([...plane.paintMaterials][0].map.userData.url,/fedex-v2\.png|sf-v2\/sf\.png/,'A330 freight atlas bound');
  const remaining=centres.filter(([x,y])=>windowPixelsAt(atlas,x,y)>0).length;
  assert.equal(remaining,0,`A330 ${id}: ${remaining} window-grey footprints remain`);
 }
 report('a330',[`fedex/sf: overlay dark day+night; 0/138 window footprints show window art in freight atlases; BOE control lit (${controlWindows}/138 windows in atlas)`]);
 plane.dispose();
}

// ---- Boeing 777 -----------------------------------------------------------
// Freight selects the separate 777-200F candidate, which has no 'glassehublot'
// passenger glazing and no cabin-window overlays. The 200LR passenger variant
// is not loaded here (memory); its window path is covered by the repo's own
// accurate-b777 candidate test.
async function checkB777(){
 const {AccurateB777Candidate,createB777CandidateGeometryLoader,B777_SOURCE}=await import('../src/accurate-b777.js');
 const {createB777LiveryLoader}=await import('../src/b777-livery.js');
 const dir=ASSETS+'accurate-b777/';
 const fetchFn=async url=>{
  const name=url.startsWith(dir)?url.slice(dir.length):url;const file=readFileSync(dir+name);
  return {ok:true,status:200,text:async()=>file.toString('utf8'),arrayBuffer:async()=>file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength)};
 };
 let textures=0;
 const loaderFactory=()=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(()=>({name:'B777_CPU_TEXTURE_STUB',loadTexture(){textures++;return Promise.resolve(new T.Texture({width:1,height:1}));}}));
 const geometryLoader=createB777CandidateGeometryLoader({baseURL:dir,fetchFn,parseXML:parseXml,loaderFactory,decodeImage:async()=>({width:1,height:1,close(){}})});
 const paintLoads=[];
 const loadTexture=async({url})=>{
  const name=url.split('/').at(-1);assert.match(name,/^(?:fedex|sf)-(?:body|fin|doors|belly|eng)\.webp$/);
  paintLoads.push(name);
  return {texture:new T.Texture({width:2048,height:2048}),dispose(){}};
 };
 const liveryLoader=createB777LiveryLoader({loadTexture});
 const plane=new AccurateB777Candidate({initialLivery:'fedex',geometryLoader,liveryLoader,timeoutMs:420000});
 assert.equal(await plane.setLivery('fedex'),true,'B777 fedex (777-200F) applied');
 assert.equal(plane.cargoMode,true);
 const bundle=plane._current.bundle,scene=bundle.scene;
 assert.equal(bundle.model,B777_SOURCE.cargo.model,'freight selects the 777-200F variant');
 assert.equal(bundle.cabinWindows.length,0,'no passenger cabin-window targets in the freight variant');
 let glazing=0,overlays=0;scene.traverse(o=>{if(o.userData?.fgName==='glassehublot')glazing++;if(o.userData?.role==='b777-cabin-window-light')overlays++;});
 assert.equal(glazing,0,'no passenger glazing (glassehublot) in the 777F scene');
 for(const id of FREIGHT){
  assert.equal(await plane.setLivery(id),true,`B777 ${id} applied`);
  plane.setCabinLights(true);
  const shown=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
  let visibleOverlays=0,visibleGlazing=0;scene.traverse(o=>{if(!shown(o))return;if(o.userData?.role==='b777-cabin-window-light')visibleOverlays++;if(o.userData?.fgName==='glassehublot')visibleGlazing++;});
  assert.equal(visibleOverlays,0,`B777 ${id}: cabin-window overlays visible at night`);
  assert.equal(visibleGlazing,0,`B777 ${id}: passenger glazing visible`);
 }
 assert(paintLoads.length>=3&&paintLoads.some(n=>n.startsWith('sf-'))&&paintLoads.some(n=>n.startsWith('fedex-')),'both freight paints were loaded');
 const hublots=[];scene.traverse(o=>{if(o.userData?.fgName==='hublot')hublots.push(o);});
 report('b777',[`fedex/sf on 777-200F: 0 passenger glazing (glassehublot) meshes, 0 cabin-window overlays; ${hublots.length} hublot cargo-window seal(s) kept as cargo-door seals; atlas pixels not sampled (WebP, no Node decoder)`]);
 plane.dispose?.();
}

// Entry point last: every helper above is initialised before any check runs.
if(!model){
 // Parent: run every model isolated, then report one summary.
 const results=MODELS.map(name=>{
  const child=spawnSync(process.execPath,['--max-old-space-size=1024',SELF,name],{encoding:'utf8'});
  process.stdout.write(child.stdout);process.stderr.write(child.stderr);
  return {name,ok:child.status===0&&!child.error};
 });
 const failed=results.filter(r=>!r.ok).map(r=>r.name);
 console.log(`cargo-windows: ${results.length-failed.length}/${results.length} models passed${failed.length?`; FAILED: ${failed.join(', ')}`:''}`);
 process.exitCode=failed.length?1:0;
}else{
 assert(MODELS.includes(model),`unknown model ${model}`);
 try{await run(model);}
 catch(error){console.log(`FAIL ${model}: ${error.message}`);process.exitCode=1;}
}
