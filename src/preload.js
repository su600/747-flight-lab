// Aircraft download manager. Model loaders fetch their files themselves; this module
// warms the cache and reports byte progress. The 777 loader can also join individual
// in-flight downloads, so it need not wait for every file before starting work.
import {CARGO_LIVERIES} from './cargo-liveries.js';
import {BoundedStore} from './bounded-store.js';
import {AIRCRAFT_DOWNLOAD_SIZES} from './aircraft-download-sizes.js';

const ASSETS='/assets/';
const MB=1048576;
// Bound retained decoded model bodies across the six aircraft.
const MAX_PREFETCH_BODY_BYTES=64*MB;
// Fixed uncompressed sizes match the decoded fetch stream, including when HTTP uses gzip.
// Regenerate the manifest whenever one of these files changes.
const sized=paths=>paths.map(path=>[path,AIRCRAFT_DOWNLOAD_SIZES[path]??0]);
const B747=sized([...['747-400_fuselage','747-400_wings','747-400_gear','GE_CF6-80C2B1F'].flatMap(n=>[n+'.ac',n+'.xml']),...['747-400_engine.png','747-400_gear.png','747-400_misc.png','747-400_tire1.png','747-400_tire3.png','747-400_wingbottom.png','747-400_wingtop.png','BOE.png','cockpit.png']].map(n=>'aircraft/'+n));
const A380=sized(['fuselage','wings','body-right','wing-right','body-left','wing-left','nose'].map(n=>'a380/'+n+'.glb'));
const A330_MODELS=['a330-300-main.ac','cf6-80e1.ac','a333-animations.xml','cf6-80e1.xml','323_blank.png','303_blank.png','landing-gears.png','pw_extra.png','windshield_pane.png','windshield.png','wings_main.png','wings_tail.png','ge_extra.png','ge_fan.png','pw_inside.png'];
const A330=sized([...A330_MODELS.map(name=>'accurate-a330/Models/'+name),'accurate-a330/window-footprints.json']);
const B777={
 passenger:sized(['accurate-b777/source-alternatives/2048/777-200LR-v2.xml','accurate-b777/777-200LR-2048.candidate.glb']),
 cargo:sized(['accurate-b777/777-200F-v2.xml','accurate-b777/777-200F-refined.candidate.glb']),
};
const cargoIds=new Set(CARGO_LIVERIES.map(l=>l.id));

const CONCORDE=sized(['concorde/concorde.ac','concorde/concorde.png','concorde/concorde-window.png']);
const SHUTTLE=sized(['shuttle_o2.ac','LandingGears-slim.ac','DragChute.ac','SSME.ac','spstob_1.webp','chutes.png'].map(n=>'space-shuttle/Models/'+n));

export function aircraftFiles(type,{livery='BOE'}={}){
 if(type==='b747')return B747;
 if(type==='a380')return A380;
 if(type==='a330')return A330;
 if(type==='shuttle')return SHUTTLE;
 if(type==='concorde')return CONCORDE;
 if(type==='b777')return B777[cargoIds.has(livery)?'cargo':'passenger'];
 return [];
}

const jobs=new Map();
// Only the 777 loader runs during its preload. Wait for each in-flight file
// rather than starting a second transfer; the completed body is still one-shot.
const b777FilesInFlight=new Map();
// Every download, however it was started (background queue, picker click, loader), reports here so the UI never disagrees with the cache.
const observers=new Set();
export function observeAircraftDownloads(fn){observers.add(fn);return()=>observers.delete(fn);}
const MAX_PARALLEL=4;
// Downloaded bodies wait here until the model loader asks for the same URL. This does not rely on the
// browser keeping multi-megabyte entries in its HTTP cache, which private windows do not.
const store=new BoundedStore(MAX_PREFETCH_BODY_BYTES);
const nativeFetch=globalThis.fetch?.bind(globalThis);

const FILE_ATTEMPTS=3;
// Streams one file into a buffer sized from the manifest (one copy in memory, not two), retrying transient failures.
// cache:'no-cache' revalidates with the server (a cheap 304 when unchanged). Without it a browser could serve a stale
// copy cached under the old one-day max-age, whose size no longer matches the manifest. A size mismatch retries with 'reload'.
async function pullOnce(url,estimate,job,priority,tally,cache){
 const add=n=>{job.loaded+=n-tally.counted;tally.counted=n;job.notify();};
 const response=await nativeFetch(url,{priority,cache});
 if(!response.ok||!response.body)throw Object.assign(Error(`HTTP ${response.status}`),{step:'status'});
 const reader=response.body.getReader(),body=new Uint8Array(estimate);let received=0;
 for(;;){
  const {done,value}=await reader.read();if(done)break;
  if(received+value.byteLength>estimate)throw Object.assign(Error('more data than the manifest lists'),{step:'size'});
  body.set(value,received);received+=value.byteLength;add(Math.min(received,estimate));
 }
 if(received!==estimate)throw Object.assign(Error(`got ${received} of ${estimate} bytes`),{step:'size'});
 return {body,type:response.headers.get('content-type')||'application/octet-stream'};
}
async function pull(path,estimate,job,priority){
 const url=ASSETS+path;
 for(let attempt=1;attempt<=FILE_ATTEMPTS;attempt++){
  const tally={counted:0};
  try{
   const {body,type}=await pullOnce(url,estimate,job,priority,tally,job.lastError?.path===path&&job.lastError.step==='size'?'reload':'no-cache');
   // Images are loaded through <img>, not fetch(); for those the download only warms the HTTP cache.
   if(!/\.(png|jpe?g|webp)$/i.test(path))store.set(new URL(url,location.href).href,{body,type});
   return;
  }catch(error){
   // Bytes already counted for this attempt are taken back, so a retry never pushes progress past 100%.
   job.loaded-=tally.counted;job.notify();job.lastError={path,name:error?.name||'Error',message:error?.message||String(error),step:error?.step||'fetch',attempt};
   // An HTTP error is the server's answer: stop here (the aircraft-level retry and the loader handle it). Dropped
   // connections and stale/short bodies are retried at once with a short back-off.
   if(job.lastError.step==='status')break;
   if(attempt<FILE_ATTEMPTS)await new Promise(r=>setTimeout(r,1000*attempt));
  }
 }
 job.failed=true;
 console.warn('[747] aircraft download failed',job.lastError);
}

// Serve each preloaded file to the first fetch() that asks for it, then forget it. Anything else
// (and any second request, e.g. after the 777 switches between passenger and cargo) goes to the network/HTTP cache.
export function installPreloadedFetch(){
 if(!nativeFetch||globalThis.fetch.preloaded)return;
 const aborted=()=>new DOMException('The operation was aborted.','AbortError');
 const wrapped=(input,init)=>{
  const method=(init?.method||input?.method||'GET').toUpperCase();
  if(method!=='GET')return nativeFetch(input,init);
  const key=new URL(typeof input==='string'?input:input.url||String(input),location.href).href;
  const signal=init?.signal||input?.signal;
  const serve=()=>{
   if(signal?.aborted)return Promise.reject(aborted());
   const hit=store.get(key);
   if(!hit)return nativeFetch(input,init);
   store.delete(key);
   return Promise.resolve(new Response(hit.body,{status:200,headers:{'Content-Type':hit.type}}));
  };
  const pending=b777FilesInFlight.get(key);
  if(!pending)return serve();
  if(signal?.aborted)return Promise.reject(aborted());
  // Aborting a loader must not cancel the shared prefetch or consume its body.
  return new Promise((resolve,reject)=>{
   const onAbort=()=>{signal?.removeEventListener('abort',onAbort);reject(aborted());};
   signal?.addEventListener('abort',onAbort,{once:true});
   pending.then(()=>{signal?.removeEventListener('abort',onAbort);if(signal?.aborted)reject(aborted());else resolve(serve());},error=>{signal?.removeEventListener('abort',onAbort);reject(error);});
  });
 };
 wrapped.preloaded=true;globalThis.fetch=wrapped;
}

// Resolves once every file has been fetched (or failed). Never rejects.
export function preloadAircraft(type,{livery='BOE',priority='low',onProgress}={}){
 const files=aircraftFiles(type,{livery});
 if(!files.length)return Promise.resolve();
 const key=files.map(f=>f[0]).join('|');
 let job=jobs.get(key);
 if(!job){
  const listeners=new Set();
  job={type,loaded:0,total:files.reduce((n,f)=>n+f[1],0),listeners,done:false,
   notify(){const p={loaded:Math.min(this.loaded,this.total),total:this.total,fraction:this.total?Math.min(1,this.loaded/this.total):1,excess:this.loaded-this.total};for(const fn of listeners)fn(p);for(const fn of observers)fn(type,{...p,done:false,failed:false});}};
  const queue=files.slice();
  const worker=async()=>{for(let file;(file=queue.shift());){
   const key=type==='b777'?new URL(ASSETS+file[0],location.href).href:null;
   const task=pull(file[0],file[1],job,priority);
   if(key)b777FilesInFlight.set(key,task);
   try{await task;}finally{if(key&&b777FilesInFlight.get(key)===task)b777FilesInFlight.delete(key);}
  }};
  job.promise=Promise.all(Array.from({length:Math.min(MAX_PARALLEL,files.length)},worker)).then(()=>{job.done=!job.failed;if(job.failed)jobs.delete(key);job.notify();for(const fn of observers)fn(type,{fraction:job.done?1:0,done:job.done,failed:!!job.failed,error:job.lastError});});
  jobs.set(key,job);
 }
 if(onProgress){job.listeners.add(onProgress);onProgress({loaded:Math.min(job.loaded,job.total),total:job.total,fraction:job.done?1:job.total?Math.min(1,job.loaded/job.total):1});job.promise.then(()=>job.listeners.delete(onProgress));}
 return job.promise;
}

export function isPreloaded(type,options){const key=aircraftFiles(type,options).map(f=>f[0]).join('|');return !key||!!jobs.get(key)?.done;}
export const downloadSizeMB=(type,options)=>aircraftFiles(type,options).reduce((n,f)=>n+f[1],0)/MB;

// Download the other aircraft in the background, one after another, as soon as the first scene is up,
// so switching models later only pays for parsing. Respects the browser's Data Saver setting only.
// A failed download (network drop, timeout) is retried with a short back-off; each failed attempt drops its
// job so the next attempt starts clean. onStatus(type,{fraction,done,retrying,attempt}) drives the picker badges.
const PREFETCH_ATTEMPTS=4;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export function prefetchInOrder(types,{livery,onStatus,backoff=ms=>wait(ms)}={}){
 if(navigator.connection?.saveData)return Promise.resolve(false);
 let chain=Promise.resolve();
 for(const type of types)chain=chain.then(async()=>{
  const options={livery:livery?.()??'BOE'};
  for(let attempt=1;attempt<=PREFETCH_ATTEMPTS;attempt++){
   await preloadAircraft(type,{...options,priority:'low',onProgress:p=>onStatus?.(type,{...p,done:false,attempt})});
   if(isPreloaded(type,options)){onStatus?.(type,{fraction:1,done:true,attempt});break;}
   if(attempt===PREFETCH_ATTEMPTS){onStatus?.(type,{fraction:0,done:false,failed:true,attempt});break;}
   const delay=2000*attempt;
   onStatus?.(type,{fraction:0,done:false,retrying:true,attempt,delay});
   await backoff(delay);
  }
 });
 return chain.then(()=>true);
}
export const scheduleIdlePrefetch=(types,options)=>prefetchInOrder(types,options);
