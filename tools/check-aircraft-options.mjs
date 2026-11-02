// Aircraft-option verification helper. Run with:
//   node tools/check-aircraft-options.mjs
// Optional integration adapter (see verifyAircraftSelectionAdapter below):
//   node tools/check-aircraft-options.mjs --adapter ./tools/aircraft-options-browser-adapter.mjs --strict
// Add --strict when a runtime selector adapter is available for end-to-end switching checks.
// Selector checks use the current four stable UI IDs; runtime resource checks are adapter-driven.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {addCabinLights,updateCabinLights,removeCabinLights} from '../src/aircraft-lighting.js';
import {addModelPaint} from '../src/model-paint.js';
import {World} from '../src/world.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const close=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-9,`${label}: expected ${expected}, got ${actual}`);
const liveryWords=livery=>[livery?.id,livery?.name,livery?.en,livery?.logo,livery?.file].filter(Boolean).join(' ');
const isFedEx=livery=>/fed[\s-]*ex|联邦快递/i.test(liveryWords(livery));
const isSF=livery=>/顺丰|shun[\s-]*feng|\bSF[\s-]*(?:express|airlines?|cargo)\b/i.test(liveryWords(livery));

/**
 * Browser-adapter contract for the real app at /747/. The adapter is test glue,
 * not a required application API. It exposes the page's window.flightLab methods,
 * visible selector state, cabin-light state, and renderer resource counters.
 */
export async function verifyAircraftSelectionAdapter(adapter){
 const methods=['listAircraft','selectAircraft','getSelectedAircraft','listLiveries','selectLivery',
  'getSelectedLivery','selectTime','getLightingState','resourceSnapshot','waitForSettled','rapidSwitchRace','isRenderingPaused'];
 for(const method of methods)assert.equal(typeof adapter?.[method],'function',`browser adapter must implement ${method}()`);
 const options=await adapter.listAircraft();
 assert(Array.isArray(options),'listAircraft() must return an array');
 const ids=options.map(option=>typeof option==='string'?option:option?.id);
 const expected=['b747','a380','a330','b777'];
 assert.deepEqual([...ids].sort(),[...expected].sort(),'runtime selector must expose the four supported aircraft');
 assert.equal(new Set(ids).size,4,'aircraft choice IDs must be unique');
 assert.equal(await adapter.isRenderingPaused(),true,'state/resource mode must explicitly pause per-frame rendering');
 console.log('[aircraft-options] renderingPaused=true; visual rendering is intentionally not measured');
 const selectedAircraft=async()=>{
  const selected=await adapter.getSelectedAircraft();
  return typeof selected==='string'?{id:selected}:selected;
 };
 const selectAircraft=async id=>{
  const result=await adapter.selectAircraft(id);
  assert.notEqual(result,false,`selectAircraft(${id}) reported failure`);
  const selected=await selectedAircraft();
  assert.equal(selected?.id,id,`selected aircraft should be ${id}`);
  if(selected?.uiActive!==undefined)assert.equal(selected.uiActive,true,`${id} should be the active UI choice`);
  if(selected?.selectValue!==undefined)assert.equal(selected.selectValue,id,'aircraft dropdown should match the model');
 };
 const liveries=await adapter.listLiveries();
 assert(Array.isArray(liveries),'listLiveries() must return an array');
 const byId=new Map(liveries.map(item=>[item.id,item]));
 const fedex=liveries.find(isFedEx),sf=liveries.find(isSF);
 assert(fedex&&sf,'runtime livery selector must expose FedEx and SF');
 const normal=byId.get('BOE')||liveries.find(item=>!isFedEx(item)&&!isSF(item));
 assert(normal?.id,'runtime livery selector must expose a conventional livery');
 const selectedLivery=async()=>{
  const selected=await adapter.getSelectedLivery();
  return typeof selected==='string'?{id:selected}:selected;
 };
 console.log('[aircraft-options] invalid-option/error guards');
 const initialType=(await selectedAircraft()).id,initialLivery=(await selectedLivery()).id;
 assert.equal(await adapter.selectAircraft('__invalid_aircraft_for_test__'),false,'unknown model selection should fail');
 assert.equal((await selectedAircraft()).id,initialType,'unknown model must preserve selected aircraft');
 assert.equal(await adapter.selectLivery('__invalid_livery_for_test__'),false,'unknown livery selection should fail');
 assert.equal((await selectedLivery()).id,initialLivery,'unknown livery must preserve selected livery');
 console.log('[aircraft-options] invalid-option guards passed without changing selection');
 const selectLivery=async id=>{
  const result=await adapter.selectLivery(id);
  assert.notEqual(result,false,`selectLivery(${id}) reported failure`);
  const selected=await selectedLivery();
  assert.equal(selected?.id,id,`selected livery should be ${id}`);
  if(selected?.uiActive!==undefined)assert.equal(selected.uiActive,true,`${id} should be the active livery card`);
 };
 const assertLighting=async(mode,livery)=>{
  const state=await adapter.getLightingState();
  assert.equal(state.time,mode,`world time should be ${mode}`);
  // Time state/light behavior is authoritative; drawer active styling is merely a UI detail.
  assert(Array.isArray(state.cabinLights)&&state.cabinLights.length>0,
   `${state.aircraft} should expose at least one testable cabin-light resource`);
  const expectedLit=mode==='night'&&!['fedex','sf'].includes(String(livery).toLowerCase());
  for(const light of state.cabinLights)assert.equal(light.active,expectedLit,
   `${state.aircraft}/${livery} cabin light should be ${expectedLit?'lit':'dark'} at ${mode}`);
  assert.equal(state.skyVisible,mode!=='night','sky visibility should follow day/night mode');
  assert.equal(state.starsVisible,mode==='night','stars visibility should follow day/night mode');
  if(mode==='night')assert.equal(state.runwayGlowVisible,true,'runway lights should glow at night');
  if(mode==='day')assert.equal(state.runwayGlowVisible,false,'runway glow should be off by day');
  return state;
 };

 // Load and validate every model once before the race. This separates genuine app
 // loading from the concurrency check and avoids decoding the heavyweight A380 twice.
 for(const id of ids){
  const timeCycle=id==='b747'?['day','night','dusk','day']:['day','night','day'];
  console.log(`[aircraft-options] model ${id}: begin`);
  await selectAircraft(id);
  await selectLivery(normal.id);
  let firstDay=null;
  for(const mode of timeCycle){
   console.log(`[aircraft-options] ${id}/${normal.id}: ${mode}`);
   await adapter.selectTime(mode);const state=await assertLighting(mode,normal.id);
   if(mode==='day'){
    const day={sun:state.sunIntensity,hemi:state.hemiIntensity,environment:state.environmentIntensity,runway:state.runwayGlowOpacity};
    if(firstDay===null)firstDay=day;else assert.deepEqual(day,firstDay,`${id}: returning to day should restore prior lighting`);
   }
  }
  for(const cargo of [fedex,sf]){
   console.log(`[aircraft-options] ${id}/${cargo.id}: verify cargo paint + day/night windows`);
   await selectLivery(cargo.id);
   await adapter.selectTime('night');await assertLighting('night',cargo.id);
   await adapter.selectTime('day');await assertLighting('day',cargo.id);
  }
  await selectLivery(normal.id);
  console.log(`[aircraft-options] model ${id}: complete`);
 }

 // Race only warmed model choices, while an uncached atlas request and the two
 // cargo-paint requests compete. Latest model/livery invocation must win.
 console.log('[aircraft-options] rapid-switch race: start');
 const raceCommands=[
  {livery:byId.has('CEA')?'CEA':normal.id},
  {aircraft:'a380'},
  {livery:fedex.id},
  {aircraft:'b777'},
  {livery:sf.id},
  {livery:normal.id}
 ];
 await adapter.rapidSwitchRace(raceCommands);
 await adapter.waitForSettled();
 await selectAircraft('b777');
 assert.equal((await selectedLivery()).id,normal.id,'last racing livery request should win');
 console.log('[aircraft-options] rapid-switch race: latest B777 + conventional livery won');

 // Compare one repeat pass to the fully warmed inventory; avoid the former extra
 // duplicate full warm-up, which added work but little diagnostic value.
 const snapshot=async()=>{
  await adapter.selectTime('day');await selectAircraft('b747');await selectLivery(normal.id);
  await adapter.waitForSettled();return adapter.resourceSnapshot();
 };
 const warmed=await snapshot();console.log('[aircraft-options] repeat warm model/livery cycle');
 for(const id of [...ids].reverse()){
  await selectAircraft(id);
  for(const livery of [sf,fedex,normal])await selectLivery(livery.id);
 }
 const repeated=await snapshot();
 assert.deepEqual(repeated,warmed,'repeated model/livery cycle leaked or replaced cached resources');
 console.log('[aircraft-options] resource comparison passed: scene/model JS resources stable (GPU VRAM not measured)');
 return {ids,liveries:{normal:normal.id,fedex:fedex.id,sf:sf.id},resourceSnapshot:repeated};
}

// The current UI defines four stable option IDs. Reading the markup avoids depending on
// AIRCRAFT_INFO's private shape while still detecting missing/duplicate selector choices.
async function verifyAircraftChoiceMarkup(){
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const ids=[...html.matchAll(/<button\b[^>]*\bdata-aircraft=[\"']([^\"']+)[\"']/g)].map(match=>match[1]);
 const expected=['b747','a380','a330','b777'];
 assert.equal(ids.length,4,`aircraft selector should expose four choices, found ${ids.length}`);
 assert.equal(new Set(ids).size,4,'aircraft selector choices must be unique');
 assert.deepEqual([...ids].sort(),[...expected].sort(),'aircraft selector should cover 747, A380, A330, and 777');
 const glbNames=['fuselage','wings','nose','wing-left','wing-right','body-left','body-right'];
 for(const name of glbNames){
  const data=await readFile(new URL(`../assets/a380/${name}.glb`,import.meta.url));
  assert.equal(data.toString('ascii',0,4),'glTF',`${name}.glb has an invalid GLB header`);
  assert.equal(data.readUInt32LE(4),2,`${name}.glb should use GLB v2`);
  assert.equal(data.readUInt32LE(8),data.length,`${name}.glb length header does not match file`);
  assert.equal(data.readUInt32LE(16),0x4e4f534a,`${name}.glb must begin with a JSON chunk`);
  const json=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)).trim());
  assert.equal(json.asset?.version,'2.0',`${name}.glb should contain glTF 2.0 data`);
 }
 console.log(`Aircraft choices passed: ${ids.join(', ')}; all ${glbNames.length} A380 GLB assets have valid headers.`);
}

// Unit exercise the real World.setTime() path without constructing a renderer, DOM, or WebGL context.
function verifyCabinLightSwitching(){
 const aircraft={root:new THREE.Group()};
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,1,1,0,1,-1,1,1],3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));
 const fuselage=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
 fuselage.name='fuselage#mesh';fuselage.userData.texture='BOE.png';aircraft.root.add(fuselage);
 assert.equal(addCabinLights(aircraft),true,'supported 747 UV layout should receive cabin lights');
 const lights=aircraft.root.getObjectByName('cabin-window-lights');
 assert((lights?.isMesh||lights?.isInstancedMesh)&&lights.geometry.getAttribute('position').count>0,
  'cabin-light resource should contain generated window geometry');
 assert.equal(addCabinLights(aircraft),true,'repeated initialization should reuse cabin lights');
 assert.equal(fuselage.children.filter(child=>child.name==='cabin-window-lights').length,1,'cabin lights should not duplicate');
 updateCabinLights(aircraft,'day');assert.equal(lights.visible,false,'cabin windows should be dark by day');
 updateCabinLights(aircraft,'night');assert.equal(lights.visible,true,'cabin windows should glow at night');
 updateCabinLights(aircraft,'dusk');assert.equal(lights.visible,false,'cabin windows should be dark at dusk');
 updateCabinLights(aircraft,'night');assert.equal(lights.visible,true,'cabin windows should relight after dusk');
 updateCabinLights(aircraft,'day');assert.equal(lights.visible,false,'returning to day should switch cabin lights off');
 let geometryDisposed=false,materialDisposed=false;
 lights.geometry.addEventListener('dispose',()=>geometryDisposed=true);lights.material.addEventListener('dispose',()=>materialDisposed=true);
 removeCabinLights(aircraft);removeCabinLights(aircraft);
 assert.equal(lights.parent,null,'cleanup should detach cabin-light mesh');assert(geometryDisposed&&materialDisposed,'cleanup should dispose owned cabin-light resources');
 console.log('Cabin-light check passed: idempotent setup, day/dusk/night transitions, and safe resource cleanup.');
}

function verifyDayNightLighting(){
 const world=Object.create(World.prototype);
 const color=()=>({value:null,set(value){this.value=value;return this;}});
 const vector=new THREE.Vector3();
 const lampScales=[];
 Object.assign(world,{
  scene:{environment:null,environmentIntensity:0,background:null,fog:{color:color(),density:0}},
  renderer:{toneMappingExposure:0},
  sun:{intensity:0,color:color()},
  hemi:{intensity:0,color:color(),groundColor:color()},
  sky:{visible:true,material:{uniforms:{sunPosition:{value:vector},turbidity:{value:0},rayleigh:{value:0},mieCoefficient:{value:0}}}},
  stars:{visible:false},envs:{},
  envFor(mode){return {mode};},
  cloudMat:{color:color(),opacity:0},cityMat:{emissiveIntensity:0},
  glass:{emissive:color(),emissiveIntensity:0},
  glow:{material:{opacity:0},visible:false},
  scaleLamps(scale){lampScales.push(scale);}
 });
 world.setTime('day');
 const day={sun:world.sun.intensity,hemi:world.hemi.intensity,exposure:world.renderer.toneMappingExposure,
  sky:world.sky.visible,stars:world.stars.visible,background:world.scene.background,
  city:world.cityMat.emissiveIntensity,glass:world.glass.emissiveIntensity,
  glow:world.glow.material.opacity,glowVisible:world.glow.visible,lampScale:lampScales.at(-1),
  environment:world.scene.environment.mode};
 close(day.sun,3.2,'day sunlight');close(day.hemi,1.15,'day ambient light');
 assert.equal(day.sky,true);assert.equal(day.stars,false);assert.equal(day.background,null);
 close(day.city,0,'day city glow');close(day.glass,0,'day terminal-window glow');
 close(day.glow,0,'day runway-light glow');assert.equal(day.glowVisible,false);close(day.lampScale,1,'day runway-lamp scale');
 assert.equal(day.environment,'day');

 world.setTime('night');
 assert.equal(world.time,'night');assert.equal(world.sky.visible,false,'night hides the daylight sky');
 assert.equal(world.stars.visible,true,'night shows stars');assert.equal(world.scene.background.getHex(),0x081426,'night sky background');
 close(world.sun.intensity,.35,'night sunlight');close(world.hemi.intensity,.45,'night ambient light');
 close(world.scene.environmentIntensity,.55,'night environment intensity');close(world.cityMat.emissiveIntensity,1.1,'night city glow');
 close(world.glass.emissiveIntensity,.1,'night terminal-window glow');close(world.glow.material.opacity,1,'night runway-light glow');
 assert.equal(world.glow.visible,true);close(lampScales.at(-1),2,'night runway-lamp scale');
 close(world.scene.fog.density,.00008,'night fog density');assert.equal(world.scene.environment.mode,'night');

 world.setTime('day');
 assert.equal(world.sky.visible,true,'returning to day restores the sky');assert.equal(world.stars.visible,false,'returning to day hides stars');
 assert.equal(world.scene.background,null);close(world.sun.intensity,day.sun,'day sunlight restored');
 close(world.hemi.intensity,day.hemi,'day ambient light restored');close(world.cityMat.emissiveIntensity,day.city,'city glow cleared');
 close(world.glass.emissiveIntensity,day.glass,'terminal glow cleared');close(world.glow.material.opacity,day.glow,'runway glow cleared');
 close(lampScales.at(-1),day.lampScale,'day runway-lamp scale restored');assert.equal(world.scene.environment.mode,'day');
 console.log('Lighting check passed: day → night → day restores sky, ambient/direct light, city/window glow, and runway lights.');
}

// Exercise Aircraft.setLivery with deterministic in-memory texture loads. The pre-existing
// livery checker still validates atlas/logo files, stale requests, failures, and retry.
async function verifyCargoModelPaint(Aircraft,fedex,sf,requests){
 const hadDocument=Object.hasOwn(globalThis,'document'),priorDocument=globalThis.document;
 const hadImage=Object.hasOwn(globalThis,'Image'),priorImage=globalThis.Image;
 const contexts=[],images=[];
 const fakeDocument={createElement(name){
  assert.equal(name,'canvas');const calls=[];
  const context={calls,fillStyle:null,clearRect(...args){calls.push(['clear',...args]);},drawImage(...args){calls.push(['image',...args]);},
   fillText(...args){calls.push(['text',this.fillStyle,...args]);},fillRect(...args){calls.push(['rect',this.fillStyle,...args]);},
   beginPath(){calls.push(['begin']);},moveTo(...args){calls.push(['move',...args]);},lineTo(...args){calls.push(['line',...args]);},
   closePath(){calls.push(['close']);},fill(){calls.push(['fill',this.fillStyle]);}};
  const canvas={width:0,height:0,ctx:context,getContext(){return context;}};contexts.push(context);return canvas;
 }};
 class FakeImage{constructor(){images.push(this);this.onload=null;this.onerror=null;this.url='';}set src(value){this.url=value;}get src(){return this.url;}}
 globalThis.document=fakeDocument;globalThis.Image=FakeImage;
 let aircraft;
 try{
  // Minimal surface fixture exercises the live decal painter without relying
  // on a particular production aircraft geometry or decal count.
  aircraft=new Aircraft();aircraft.type='b777';aircraft.spec={length:73.9};aircraft.root=new THREE.Group();
  const hull=new THREE.Mesh(new THREE.BoxGeometry(70,4,6),new THREE.MeshStandardMaterial({color:0xffffff}));
  hull.name='original-fuselage';aircraft.root.add(hull);
  const shape=new THREE.Shape();shape.moveTo(-31.8,1);shape.lineTo(-35.5,1);shape.lineTo(-34.7,9);shape.lineTo(-28.8,9);shape.lineTo(-22.2,1);shape.closePath();
  const fin=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.38,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:0xffffff}));
  fin.position.z=-.19;aircraft.root.add(fin);
  const windows=new THREE.InstancedMesh(new THREE.SphereGeometry(.17,8,6),new THREE.MeshStandardMaterial({color:0x172b37}),84);
  windows.name='passenger-windows-fixture';aircraft.root.add(windows);
  assert.equal(addCabinLights(aircraft),true,'window fixture should accept the model-aware night-light material');
  addModelPaint(aircraft,{sideZ:3,sideY:0,tailX:-31,tailY:6,length:46});
  const rootChildren=aircraft.root.children.length,requestCount=requests.length;
  const canvasBindings=()=>{
   const result=[];aircraft.root.traverse(object=>{if(!object.isMesh)return;
    for(const material of [object.material].flat())if(material?.map?.isCanvasTexture)result.push({object,material,map:material.map});
   });return result;
  };
  const initialNight=()=>{aircraft.livery='BOE';updateCabinLights(aircraft,'night');};
  initialNight();assert(windows.material.emissiveIntensity>.01,'passenger windows should illuminate at night');
  const sequence=[fedex,sf,fedex,sf];let stableBindings=null,staleLogoLoad=null,sfLogoLoad=null;
  for(const livery of sequence){
   const imageStart=images.length;
   assert.equal(await aircraft.setLivery(livery.id),true,`model-paint switch to ${livery.id}`);
   assert.equal(aircraft.livery,livery.id);
   assert.equal(windows.visible,false,`${livery.id} freight paint hides passenger windows`);
   assert.equal(windows.material.emissiveIntensity,0,`${livery.id} immediately suppresses cabin glow`);
   assert.equal(aircraft.root.children.length,rootChildren,'livery changes must not accumulate geometry/decal meshes');
   const bindings=canvasBindings();
   assert(bindings.length>0,'surface decals should use persistent generated canvas textures');
   assert(bindings.every(({map})=>map.colorSpace===THREE.SRGBColorSpace),'decal canvas textures should be sRGB');
   if(!stableBindings)stableBindings=bindings;
   else for(const previous of stableBindings){
    const current=bindings.find(entry=>entry.object===previous.object&&entry.material===previous.material);
    assert(current,'repainting should retain prepared surface-decal objects');
    assert.equal(current.map,previous.map,'repainting should update persistent canvas maps, not replace/dispose them');
    assert.deepEqual([current.map.image.width,current.map.image.height],[previous.map.image.width,previous.map.image.height],
     'repainting should preserve uploaded canvas dimensions');
   }
   assert(contexts.some(context=>context.calls.some(call=>call[0]==='clear')),'paint path should clear and redraw reusable canvases');
   const textValues=contexts.flatMap(context=>context.calls.filter(call=>call[0]==='text').map(call=>String(call[2])));
   const expectedText=livery.id===sf.id?['AIRLINES','顺丰航空','CARGO']:[`${livery.en} CARGO`];
   for(const text of expectedText)assert(textValues.includes(text),`${livery.id} should draw ${text}`);
   assert(images.slice(imageStart).some(image=>image.src.endsWith('/'+livery.logo)),`${livery.id} should request its catalog logo`);
   if(livery.id===fedex.id)staleLogoLoad=images.slice(imageStart).find(image=>image.src.endsWith('/'+livery.logo))?.onload;
   if(livery.id===sf.id)sfLogoLoad=images.slice(imageStart).find(image=>image.src.endsWith('/'+livery.logo))?.onload;
  }
  assert.equal(requests.length,requestCount,'procedural decals should not request or reload aircraft atlas textures');
  const callsBeforeStale=contexts.reduce((n,context)=>n+context.calls.length,0);staleLogoLoad?.();
  assert.equal(contexts.reduce((n,context)=>n+context.calls.length,0),callsBeforeStale,'late logo callbacks from an older paint must not repaint');
  sfLogoLoad?.();assert(contexts.some(context=>context.calls.some(call=>call[0]==='image')),'selected logo image should be composited onto the decal');
  await aircraft.setLivery('BOE');assert.equal(windows.visible,true,'passenger livery restores passenger windows');
  updateCabinLights(aircraft,'night');assert(windows.material.emissiveIntensity>.01,'passenger cabin light returns at night');
  updateCabinLights(aircraft,'day');assert.equal(windows.material.emissiveIntensity,0,'passenger cabin light switches off by day');
  assert.equal(aircraft.root.children.length,rootChildren,'repeated passenger/cargo changes keep the prepared decal geometry stable');
  console.log(`Cargo paint check passed: ${sequence.length} FedEx/SF switches, persistent decal canvases, cargo windows dark, passenger cabin lights restored.`);
 }finally{
  if(aircraft)removeCabinLights(aircraft);
  if(hadDocument)globalThis.document=priorDocument;else delete globalThis.document;
  if(hadImage)globalThis.Image=priorImage;else delete globalThis.Image;
 }
}

async function verifyRepeatedLiverySwitching(){
 const requests=[],originalLoad=THREE.TextureLoader.prototype.load;
 THREE.TextureLoader.prototype.load=function(url,onLoad,_onProgress,onError){
  const texture=new THREE.Texture();requests.push({url,texture,onLoad,onError});
  queueMicrotask(()=>{texture.image={naturalWidth:4096};onLoad?.(texture);});
  return texture;
 };
 try{
  const {Aircraft,LIVERIES}=await import('../src/aircraft.js');
  const ids=LIVERIES.map(livery=>livery.id);
  assert.equal(new Set(ids).size,ids.length,'livery IDs must be unique');
  const fedex=LIVERIES.find(isFedEx),sf=LIVERIES.find(isSF);
  const missingCargo=[];
  if(!fedex)missingCargo.push('FedEx');
  if(!sf)missingCargo.push('SF');
  if(missingCargo.length)console.log(`SKIP cargo-livery assertions (not discoverable in current LIVERIES metadata): ${missingCargo.join(', ')}`);
  else{
   for(const livery of [fedex,sf])assert(livery.id&&livery.name&&livery.en,`incomplete cargo-livery metadata: ${livery.id}`);
   assert.notEqual(fedex.id,sf.id,'FedEx and SF must be distinct livery options');
   console.log(`Cargo liveries discovered: ${fedex.id} (${fedex.name}), ${sf.id} (${sf.name}).`);
   await verifyCargoModelPaint(Aircraft,fedex,sf,requests);
  }
  assert(ids.length>=3,'need at least three existing liveries to exercise repeated switching');
  const aircraft=new Aircraft(),materials=[{},{}];aircraft.liveryMats=materials;
  const sequence=[ids[0],ids[1],ids[2],ids[1],ids[0],ids[2],ids[0]];
  for(const id of sequence){
   assert.equal(await aircraft.setLivery(id),true,`setLivery(${id}) should complete`);
   assert.equal(aircraft.livery,id,'selected livery should match the latest completed request');
   const map=materials[0].map;
   assert(map,'selected livery should be assigned to materials');
   assert(materials.every(material=>material.map===map),'all livery materials should share the selected texture');
  }
  for(const id of new Set(sequence)){
   const hits=requests.filter(request=>request.url.endsWith(`/${id}.png`));
   assert.equal(hits.length,1,`${id} should load once and reuse its cached resource across switches`);
  }
  console.log(`Livery resource check passed: ${sequence.length} switches, ${new Set(sequence).size} cached atlas resources, no duplicate loads.`);
  return {LIVERIES,fedex,sf};
 }finally{THREE.TextureLoader.prototype.load=originalLoad;}
}

function parseArgs(args){
 const options={strict:false,unitOnly:false,skipRegressions:false,adapter:null};
 for(let i=0;i<args.length;i++){
  if(args[i]==='--strict')options.strict=true;
  else if(args[i]==='--unit-only')options.unitOnly=true;
  else if(args[i]==='--skip-regressions')options.skipRegressions=true;
  else if(args[i]==='--adapter')options.adapter=args[++i];
  else if(args[i].startsWith('--adapter='))options.adapter=args[i].slice('--adapter='.length);
  else if(args[i]==='--help'||args[i]==='-h')options.help=true;
  else throw Error(`unknown argument: ${args[i]}`);
 }
 return options;
}
function usage(){
 console.log('Usage: node tools/check-aircraft-options.mjs [--unit-only] [--adapter MODULE] [--strict]');
 console.log('--unit-only runs local, non-WebGL unit checks and skips browser integration/regressions.');
 console.log('--skip-regressions skips already-run flight/livery/camera CPU checks after adapter verification.');
 console.log('Without a runtime selector adapter, repeated aircraft switching/resource checks are reported as SKIP.');
 console.log('--strict requires a runtime selector adapter and discoverable FedEx + SF livery metadata.');
}
async function runAdapter(path){
 const url=pathToFileURL(resolve(process.cwd(),path)).href;
 const module=await import(url);
 const factory=module.createAircraftOptionsAdapter||module.default;
 const adapter=typeof factory==='function'?await factory():factory;
 try{
  const result=await verifyAircraftSelectionAdapter(adapter);
  console.log(`Browser state/resource integration passed: aircraft ${result.ids.join(', ')}; liveries ${result.liveries.normal}/${result.liveries.fedex}/${result.liveries.sf}; rendering paused; JS scene resources stable (GPU VRAM not measured).`);
 }catch(error){
  const diagnostics=adapter?.diagnostics?.();
  if(diagnostics)console.error('Browser diagnostics:',JSON.stringify(diagnostics,null,2));
  throw error;
 }finally{
  try{await adapter?.close?.();}catch(error){console.warn(`Browser adapter cleanup warning: ${error.message}`);}
 }
}
function runRegression(file,label){
 const result=spawnSync(process.execPath,[resolve(ROOT,'tools',file)],{cwd:ROOT,encoding:'utf8'});
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 if(result.error)throw result.error;
 assert.equal(result.status,0,`${label} failed with exit status ${result.status}`);
}

async function main(){
 const options=parseArgs(process.argv.slice(2));
 if(options.help){usage();return;}
 await verifyAircraftChoiceMarkup();
 verifyCabinLightSwitching();
 verifyDayNightLighting();
 const cargo=await verifyRepeatedLiverySwitching();
 if(options.unitOnly){console.log('Non-GPU option checks completed; browser and regression suites were not started.');return;}
 if(options.adapter)await runAdapter(options.adapter);
 else{
  const message='SKIP runtime four-aircraft switching/resource check: browser flightLab APIs need an adapter; supply one with --adapter.';
  if(options.strict)assert.fail(message);
  console.log(message);
 }
 if(options.strict){
  assert(cargo.fedex&&cargo.sf,'--strict requires discoverable FedEx and SF entries in LIVERIES metadata');
 }
 if(options.skipRegressions){console.log('\nExisting CPU regressions skipped by request.');return;}
 console.log('\nRunning existing regressions:');
 runRegression('check-flight.mjs','flight regression');
 runRegression('check-liveries.mjs','livery regression');
 runRegression('check-camera.mjs','camera regression');
 console.log('\nAircraft-option verification completed.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{console.error(error);process.exitCode=1;});
}
