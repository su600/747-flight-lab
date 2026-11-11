// Real browser adapter for check-aircraft-options.mjs.
// This file is intentionally inert on import; Chrome starts only when the main
// checker calls createAircraftOptionsAdapter().
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const APP_URL=process.env.AIRCRAFT_TEST_URL||'http://127.0.0.1:18750/';
const STARTUP_TIMEOUT=Number(process.env.AIRCRAFT_TEST_STARTUP_TIMEOUT_MS||150000);
const CDP_TIMEOUT=Number(process.env.AIRCRAFT_TEST_CDP_TIMEOUT_MS||12000);
const OPERATION_TIMEOUT=Number(process.env.AIRCRAFT_TEST_OPERATION_TIMEOUT_MS||150000);

async function chromeExecutable(){
 const candidates=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser',
  '/root/.cache/ms-playwright/chromium-1248/chrome-linux/chrome',
  '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'] .filter(Boolean);
 for(const path of candidates){try{await access(path);return path;}catch{}}
 throw Error('Chromium/Chrome not found; set CHROME_BIN to an installed executable. No browser was started.');
}

class CDPPage{
 constructor(socket){this.socket=socket;this.nextId=0;this.pending=new Map();this.listeners=new Map();this.closed=false;
  socket.addEventListener('message',event=>this.receive(String(event.data)));
  socket.addEventListener('close',()=>{this.closed=true;for(const {reject,timer} of this.pending.values()){clearTimeout(timer);reject(Error('Chrome DevTools socket closed'));}this.pending.clear();});
  socket.addEventListener('error',()=>{this.closed=true;});
 }
 static async connect(url){
  const socket=new WebSocket(url);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Timed out connecting to Chrome DevTools')),15000);
   socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
   socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Could not connect to Chrome DevTools'));},{once:true});
  });
  return new CDPPage(socket);
 }
 receive(text){
  let message;try{message=JSON.parse(text);}catch{return;}
  if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);
   if(message.error)pending.reject(Error(`CDP ${pending.method}: ${message.error.message}`));else pending.resolve(message.result||{});return;}
  for(const listener of this.listeners.get(message.method)||[])listener(message.params||{});
 }
 on(method,listener){const list=this.listeners.get(method)||[];list.push(listener);this.listeners.set(method,list);}
 request(method,params={},timeout=30000){
  if(this.closed)return Promise.reject(Error('Chrome DevTools socket is closed'));
  const id=++this.nextId;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`CDP request timed out: ${method}`));},timeout);
   this.pending.set(id,{resolve,reject,timer,method});this.socket.send(JSON.stringify({id,method,params}));
  });
 }
 async evaluate(expression,{awaitPromise=true,timeout=CDP_TIMEOUT}={}){
  const response=await this.request('Runtime.evaluate',{expression,awaitPromise,returnByValue:true,userGesture:true},timeout);
  if(response.exceptionDetails){
   const detail=response.exceptionDetails.exception?.description||response.exceptionDetails.text||'page evaluation failed';
   throw Error(`Browser evaluation failed: ${detail}`);
  }
  const remote=response.result||{};
  if(remote.subtype==='error')throw Error(remote.description||'browser returned an Error');
  return remote.value;
 }
 close(){if(!this.closed){try{this.socket.close();}catch{}this.closed=true;}}
}

async function waitFor(check,{timeout=STARTUP_TIMEOUT,interval=300,label='condition'}={}){
 const end=Date.now()+timeout;let last;
 while(Date.now()<end){
  try{last=await check();if(last)return last;}catch(error){last=error.message;}
  await delay(interval);
 }
 throw Error(`Timed out waiting for ${label}${last?`: ${typeof last==='string'?last:JSON.stringify(last)}`:''}`);
}

export async function createAircraftOptionsAdapter(){
 if(typeof WebSocket!=='function')throw Error('Node global WebSocket is unavailable; use Node 22+ for the browser adapter.');
 const executable=await chromeExecutable();
 const profile=await mkdtemp(join(tmpdir(),'747-flight-check-'));
 let chromeLog='';let child;let cdp;
 const roots=new Map();
 const onLog=stream=>stream?.on('data',chunk=>{chromeLog=(chromeLog+chunk.toString()).slice(-12000);});
 const terminateChrome=async()=>{
  if(!child||child.exitCode!==null)return;
  const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
  if(await Promise.race([exited.then(()=>true),delay(3500).then(()=>false)]))return;
  child.kill('SIGKILL');await Promise.race([exited,delay(2500)]);
 };
 const removeProfile=async()=>{
  for(let i=0;i<8;i++){
   try{await rm(profile,{recursive:true,force:true});return;}
   catch(error){if(i===7)console.warn(`[browser] temporary profile cleanup deferred: ${error.message}`);else await delay(250);}
  }
 };
 try{
  const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking',
   '--disable-default-apps','--disable-extensions','--disable-sync','--no-first-run','--no-default-browser-check',
   '--disable-features=Translate,BackForwardCache','--renderer-process-limit=1','--force-device-scale-factor=1','--window-size=960,640',
   '--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--remote-debugging-address=127.0.0.1',
   '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'];
  child=spawn(executable,args,{stdio:['ignore','pipe','pipe']});onLog(child.stdout);onLog(child.stderr);
  const activePort=join(profile,'DevToolsActivePort');
  const port=await waitFor(async()=>{
   if(child.exitCode!==null)throw Error(`Chrome exited early (${child.exitCode})`);
   const contents=await readFile(activePort,'utf8').catch(()=>null);
   const value=Number(contents?.split(/\s+/)[0]);return Number.isInteger(value)&&value>0?value:null;
  },{timeout:20000,interval:100,label:'Chrome DevTools port'});
  const endpoint=`http://127.0.0.1:${port}`;
  let target;
  const targetResponse=await fetch(`${endpoint}/json/new?about:blank`,{method:'PUT'});
  if(!targetResponse.ok)throw Error(`Chrome could not create a page target (${targetResponse.status})`);
  target=await targetResponse.json();
  cdp=await CDPPage.connect(target.webSocketDebuggerUrl);
  const pageErrors=[],networkPending=new Map(),networkRecent=[];
  cdp.on('Runtime.exceptionThrown',event=>pageErrors.push(event.exceptionDetails?.exception?.description||event.exceptionDetails?.text||'uncaught page exception'));
  cdp.on('Log.entryAdded',event=>{if(event.entry?.level==='error')pageErrors.push(event.entry.text||'browser console error');});
  cdp.on('Network.requestWillBeSent',event=>{networkPending.set(event.requestId,event.request?.url||'');});
  cdp.on('Network.loadingFinished',event=>{const url=networkPending.get(event.requestId);networkPending.delete(event.requestId);if(url)networkRecent.push(url);if(networkRecent.length>12)networkRecent.shift();});
  cdp.on('Network.loadingFailed',event=>{const url=networkPending.get(event.requestId);networkPending.delete(event.requestId);if(url)networkRecent.push(`FAILED ${url}: ${event.errorText||''}`);if(networkRecent.length>12)networkRecent.shift();});
  await cdp.request('Page.enable');await cdp.request('Runtime.enable');await cdp.request('Log.enable');await cdp.request('Network.enable');
  const navigation=await cdp.request('Page.navigate',{url:APP_URL});
  if(navigation.errorText)throw Error(`could not navigate to ${APP_URL}: ${navigation.errorText}`);
  const startup=await waitFor(async()=>{
   const result=await cdp.evaluate(`(()=>({ready:!!window.flightLab,loading:!!document.querySelector('#loading'),
    text:document.querySelector('#loadingText')?.textContent||'',url:location.href}))()`);
   if(result.ready)return {ready:true};
   if(/载入遇到了问题|浏览器暂时不能显示|WebGL2 unavailable/i.test(result.text))return {failed:result.text};
   if(pageErrors.length)return {failed:pageErrors.at(-1)};
   return false;
  },{timeout:STARTUP_TIMEOUT,interval:500,label:'flightLab startup/WebGL scene'});
  if(startup.failed)throw Error(`browser app failed to initialize: ${startup.failed}`);
  const basic=await cdp.evaluate(`({webgl:!!document.querySelector('#viewport canvas'),url:location.href,
   aircraft:window.flightLab.plane.type,livery:window.flightLab.plane.livery})`);
  if(!basic.webgl)throw Error('The app initialized without a WebGL canvas; visual integration is unavailable.');
  // Switch as soon as the app exposes its runtime, before doing any model cycles.
  const quality=await cdp.evaluate(`(()=>{const q=document.querySelector('#quality');if(q){q.value='low';q.dispatchEvent(new Event('change',{bubbles:true}));}
   const f=window.flightLab;f.display.setQuality(true);f.renderer.shadowMap.enabled=false;f.airflow?.setQuality(true);
   // The app's optional last-frame copy synchronously stalls software WebGL during resize.
   // It is not part of aircraft/livery/light assertions, so disable only this test-only fallback.
   f.display.captureBackup=()=>{};
   // Keep native RAF/event dispatch alive, but do not render frames or sample WebGL back buffers.
   const pausedBeginFrame=()=>false;f.display.beginFrame=pausedBeginFrame;window.__aircraftOptionsPausedBeginFrame=pausedBeginFrame;
   window.__aircraftOptionsRenderingPaused=true;
   return{value:q?.value||'low',lowQuality:f.display.lowQuality,shadowMap:f.renderer.shadowMap.enabled,
    backupCaptureDisabled:true,renderingPaused:true,pixelRatio:devicePixelRatio};})()`);
  console.log(`[browser] app ready (${basic.aircraft}); ${JSON.stringify(quality)}; renderingPaused=${quality.renderingPaused}; settling state-only mode`);
  await cdp.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  await cdp.evaluate(`(()=>{window.__aircraftCheckHeartbeat={ticks:0};setInterval(()=>window.__aircraftCheckHeartbeat.ticks++,500)})()`,{awaitPromise:false});

  const evaluateId=async(expression,options)=>cdp.evaluate(expression,options);
  const waitFrames=async(count=2)=>evaluateId(`new Promise(resolve=>{let n=${count};function f(){if(--n<=0)resolve();else requestAnimationFrame(f)}requestAnimationFrame(f)})`,{timeout:CDP_TIMEOUT});
  const settle=async()=>{await delay(100);await waitFrames(2);};
  const getPlaneId=async()=>evaluateId('window.flightLab.plane.type');
  const getLiveryId=async()=>evaluateId('window.flightLab.plane.livery');
  let operationSequence=0,lastLightingState=null;
  async function runPagePromise(expression,label,timeout=OPERATION_TIMEOUT){
   const key=`flight-check-${++operationSequence}`;
   const launch=`(()=>{const key=${JSON.stringify(key)};window.__aircraftCheckOps??={};window.__aircraftCheckOps[key]={done:false};
    Promise.resolve().then(()=>${expression}).then(value=>window.__aircraftCheckOps[key]={done:true,value},
     error=>window.__aircraftCheckOps[key]={done:true,error:String(error?.stack||error)});return key})()`;
   await evaluateId(launch,{awaitPromise:false,timeout:CDP_TIMEOUT});
   console.log(`[browser] START ${label}`);const start=Date.now();let lastLog=0,lastHeartbeat=-1;
   while(Date.now()-start<timeout){
    let state;
    try{state=await evaluateId(`(()=>{const op=window.__aircraftCheckOps?.[${JSON.stringify(key)}],f=window.flightLab;
     return{done:!!op?.done,value:op?.value,error:op?.error,aircraft:f?.plane?.type,livery:f?.plane?.livery,
      status:document.querySelector('#aircraftStatus')?.textContent||'',heartbeat:window.__aircraftCheckHeartbeat?.ticks||0,
      loading:document.querySelector('#loadingText')?.textContent||''}})()`,{awaitPromise:false,timeout:CDP_TIMEOUT});}
    catch(error){
     const elapsed=Math.round((Date.now()-start)/1000);
     if(elapsed-lastLog>=5){console.log(`[browser] WAIT ${label} ${elapsed}s: main-thread/CDP poll delayed (${error.message}); pending network=${networkPending.size}`);lastLog=elapsed;}
     await delay(700);continue;
    }
    if(state.done){await evaluateId(`delete window.__aircraftCheckOps[${JSON.stringify(key)}]`,{awaitPromise:false,timeout:CDP_TIMEOUT});
     if(state.error)throw Error(`${label} rejected: ${state.error}`);
     console.log(`[browser] DONE ${label} in ${((Date.now()-start)/1000).toFixed(1)}s`);return state.value;}
    const elapsed=Math.round((Date.now()-start)/1000);
    if(elapsed-lastLog>=5||state.heartbeat!==lastHeartbeat){
     if(elapsed-lastLog>=5){const active=[...networkPending.values()].slice(-3).map(url=>url.split('/').at(-1));
      console.log(`[browser] WAIT ${label} ${elapsed}s · plane=${state.aircraft} · ${state.status||state.loading} · heartbeat=${state.heartbeat} · pending=${networkPending.size}${active.length?` [${active.join(', ')}]`:''}`);lastLog=elapsed;}
     lastHeartbeat=state.heartbeat;
    }
    await delay(700);
   }
   const diagnostic=await evaluateId(`(()=>({aircraft:window.flightLab?.plane?.type,livery:window.flightLab?.plane?.livery,
    status:document.querySelector('#aircraftStatus')?.textContent||'',heartbeat:window.__aircraftCheckHeartbeat?.ticks||0,
    task:window.__aircraftCheckOps?.[${JSON.stringify(key)}]}))()`,{awaitPromise:false,timeout:CDP_TIMEOUT}).catch(error=>({pollError:error.message}));
   throw Error(`${label} exceeded ${timeout}ms; page operation still unresolved. Diagnostics=${JSON.stringify(diagnostic)}; pendingNetwork=${JSON.stringify([...networkPending.values()].slice(-8))}`);
  }

  const adapter={
   async isRenderingPaused(){return evaluateId(`(()=>{const f=window.flightLab;return !!window.__aircraftOptionsRenderingPaused&&
    f.display.beginFrame===window.__aircraftOptionsPausedBeginFrame&&f.display.lowQuality&&f.renderer.shadowMap.enabled===false})()`);},
   async listAircraft(){return evaluateId(`Array.from(document.querySelectorAll('[data-aircraft]'),e=>({id:e.dataset.aircraft,
    label:e.querySelector('b')?.textContent.trim()||e.textContent.trim()}))`);},
   async selectAircraft(id){
    const timeout=id==='a380'?OPERATION_TIMEOUT:Math.min(OPERATION_TIMEOUT,90000);
    const result=await runPagePromise(`window.flightLab.selectAircraft(${JSON.stringify(id)})`,`select aircraft ${id}`,timeout);
    await settle();
    const type=await getPlaneId();if(type===id){const rootId=await evaluateId('window.flightLab.plane.root.uuid');roots.set(id,rootId);}
    return result;
   },
   async getSelectedAircraft(){
    return evaluateId(`(()=>{const id=window.flightLab.plane.type;const btn=document.querySelector('[data-aircraft="'+id+'"]');
     return{id,uiActive:!!btn?.classList.contains('active'),selectValue:document.querySelector('#aircraftSelect')?.value||id}})()`);
   },
   async listLiveries(){return evaluateId(`Array.from(document.querySelectorAll('[data-livery]'),e=>({id:e.dataset.livery,
    name:e.querySelector('b')?.textContent.trim()||'',en:e.querySelector('small')?.textContent.trim()||'',
    logo:e.querySelector('img')?.getAttribute('src')||''}))`);},
   async selectLivery(id){
    const result=await runPagePromise(`window.flightLab.selectLivery(${JSON.stringify(id)})`,`select livery ${id}`,Math.min(OPERATION_TIMEOUT,60000));
    await settle();return result;
   },
   async getSelectedLivery(){
    return evaluateId(`(()=>{const id=window.flightLab.plane.livery;const card=document.querySelector('[data-livery="'+id+'"]');
     return{id,uiActive:!!card?.classList.contains('active'),name:card?.querySelector('b')?.textContent.trim()||''}})()`);
   },
   async selectTime(mode){
    assert(['day','dusk','night'].includes(mode),`invalid time option: ${mode}`);
    console.log(`[browser] time transition → ${mode}`);
    await evaluateId(`(()=>{const mode=${JSON.stringify(mode)};const button=document.querySelector('[data-time="'+mode+'"]');if(!button)throw Error('missing time option');
     if(button.closest('#worldPanel')?.hidden)document.querySelector('[data-panel="world"]').click();button.click()})()`,{awaitPromise:false,timeout:60000});
    await settle();return this.getLightingState();
   },
   async getLightingState(){
    lastLightingState=await evaluateId(`(()=>{const lab=window.flightLab,plane=lab.plane,world=lab.world,lights=[];
     plane.root.traverse(o=>{
      if(o.name==='cabin-window-lights')lights.push({kind:'projected-cabin-windows',active:!!o.visible,
       count:o.isInstancedMesh?o.count:(o.geometry?.getAttribute('position')?.count||0)});
      else if(o.isInstancedMesh){
       const materials=[o.material].flat(),windowGlow=materials.some(m=>m?.emissive&&m.emissive.getHex?.()!==0);
       if(windowGlow)lights.push({kind:'emissive-window-surface',
        active:!!o.visible&&materials.some(m=>(m.emissiveIntensity||0)>.01),count:o.count});
      }
     });
     const timeButton=document.querySelector('[data-time="'+world.time+'"]');
     return{time:world.time,aircraft:plane.type,livery:plane.livery,timeButtonActive:!!timeButton?.classList.contains('active'),
      cabinLights:lights,skyVisible:!!world.sky.visible,starsVisible:!!world.stars.visible,
      runwayGlowVisible:!!world.glow.visible,runwayGlowOpacity:world.glow.material.opacity,
      sunIntensity:world.sun.intensity,hemiIntensity:world.hemi.intensity,environmentIntensity:world.scene.environmentIntensity};
    })()`);
    return lastLightingState;
   },
   async waitForSettled(){await settle();},
   async rapidSwitchRace(commands){
    const encoded=JSON.stringify(commands);
    return runPagePromise(`Promise.all(${encoded}.map(c=>c.aircraft?
     window.flightLab.selectAircraft(c.aircraft):window.flightLab.selectLivery(c.livery)))`,'rapid aircraft/livery race',Math.min(OPERATION_TIMEOUT,90000));
   },
   async resourceSnapshot(){
    await settle();
    const snapshot=await evaluateId(`(()=>{const lab=window.flightLab,root=lab.plane.root,scene=lab.world.scene;
     const countResources=target=>{let nodes=0,meshes=0,instanced=0;const geometries=new Set(),materials=new Set(),textures=new Set();
      target.traverse(o=>{nodes++;if(o.isMesh)meshes++;if(o.isInstancedMesh)instanced++;
       if(o.geometry)geometries.add(o.geometry.uuid);
       for(const material of [o.material].flat()){if(!material)continue;materials.add(material.uuid);
        for(const key of ['map','alphaMap','aoMap','bumpMap','displacementMap','emissiveMap','envMap','lightMap','metalnessMap','normalMap','roughnessMap']){
         const texture=material[key];if(texture?.isTexture)textures.add(texture.uuid);
        }
        if(material.uniforms)for(const uniform of Object.values(material.uniforms))if(uniform?.value?.isTexture)textures.add(uniform.value.uuid);
       }
      });return{nodes,meshes,instanced,uniqueGeometries:geometries.size,uniqueMaterials:materials.size,textureObjects:textures.size};};
     return{renderingPaused:!!window.__aircraftOptionsRenderingPaused,sceneChildren:scene.children.length,
      worldScene:countResources(scene),selectedModel:countResources(root),
      environmentModes:Object.keys(lab.world.envs||{}).sort(),
      environmentTextureObjects:Object.values(lab.world.envs||{}).filter(x=>x?.isTexture).length};})()`);
    return {...snapshot,cachedModelRoots:Object.fromEntries([...roots.entries()].sort(([a],[b])=>a.localeCompare(b)))};
   },
   async close(){
    cdp?.close();await terminateChrome();await delay(250);await removeProfile();
   },
   diagnostics(){return {url:APP_URL,chrome:executable,logs:chromeLog,pageErrors:pageErrors.slice(-20),lastLightingState,
    pendingNetwork:[...networkPending.values()].slice(-12),recentNetwork:networkRecent.slice(-12)};}
  };
  console.log(`Browser ready: ${APP_URL} (${executable}; headless Chromium state/resource mode, rendering paused)`);
  return adapter;
 }catch(error){
  cdp?.close();await terminateChrome();await delay(250);await removeProfile();
  const detail=chromeLog.trim();throw Error(`${error.message}${detail?`\nChrome diagnostics:\n${detail}`:''}`);
 }
}
