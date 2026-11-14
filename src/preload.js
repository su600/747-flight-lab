// Aircraft download manager. The model loaders fetch their files themselves; this module
// fetches the same URLs first, so that the loaders are served from the browser's HTTP cache
// and a model switch only pays for parsing. It also reports byte progress for the loading
// indicator and can warm the cache while the browser is idle or the user hovers a model button.
import {CARGO_LIVERIES} from './cargo-liveries.js';
import {BoundedStore} from './bounded-store.js';

const ASSETS='/assets/';
const MB=1048576;
const MAX_PREFETCH_BODY_BYTES=48*MB;
// [path, approximate bytes]. Sizes only seed the progress bar until the server reports the real length.
const A380=[['a380/fuselage.glb',10.4*MB],['a380/wings.glb',7.8*MB],['a380/body-right.glb',3.9*MB],['a380/wing-right.glb',3.6*MB],['a380/body-left.glb',3.3*MB],['a380/wing-left.glb',2.6*MB],['a380/nose.glb',2.5*MB]];
const A330_MODELS=['a330-300-main.ac','cf6-80e1.ac','a333-animations.xml','cf6-80e1.xml','323_blank.png','303_blank.png','landing-gears.png','pw_extra.png','windshield_pane.png','windshield.png','wings_main.png','wings_tail.png','ge_extra.png','ge_fan.png','pw_inside.png'];
const A330=[...A330_MODELS.map(name=>['accurate-a330/Models/'+name,name.endsWith('.png')?.4*MB:.2*MB]),['accurate-a330/window-footprints.json',.05*MB]];
const B777={
 passenger:[['accurate-b777/source-alternatives/2048/777-200LR-v2.xml',.5*MB],['accurate-b777/777-200LR-2048.candidate.glb',6.1*MB]],
 cargo:[['accurate-b777/777-200F-v2.xml',.5*MB],['accurate-b777/777-200F-refined.candidate.glb',7.8*MB]],
};
const cargoIds=new Set(CARGO_LIVERIES.map(l=>l.id));

const SHUTTLE=[
 ['space-shuttle/Models/shuttle_o2.ac',1916512],
 ['space-shuttle/Models/LandingGears-slim.ac',1768487],
 ['space-shuttle/Models/DragChute.ac',2343283],
 ['space-shuttle/Models/SSME.ac',25438],
 ['space-shuttle/Models/spstob_1.png',1689701],
 ['space-shuttle/Models/chutes.png',631],
];

export function aircraftFiles(type,{livery='BOE'}={}){
 if(type==='a380')return A380;
 if(type==='a330')return A330;
 if(type==='shuttle')return SHUTTLE;
 if(type==='b777')return B777[cargoIds.has(livery)?'cargo':'passenger'];
 return [];
}

const jobs=new Map();
const MAX_PARALLEL=4;
// Downloaded bodies wait here until the model loader asks for the same URL. This does not rely on the
// browser keeping multi-megabyte entries in its HTTP cache, which private windows do not.
const store=new BoundedStore(MAX_PREFETCH_BODY_BYTES);
const nativeFetch=globalThis.fetch?.bind(globalThis);

async function pull(path,estimate,job,priority){
 const url=ASSETS+path;
 let counted=0;
 const add=n=>{job.loaded+=n-counted;counted=n;job.notify();};
 try{
  const response=await nativeFetch(url,{priority});
  if(!response.ok||!response.body){await response.arrayBuffer().catch(()=>{});return;}
  const raw=Number(response.headers.get('x-raw-length'));
  if(raw>0){job.total+=raw-estimate;estimate=raw;job.notify();}
  const reader=response.body.getReader(),chunks=[];let received=0;
  for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.byteLength;add(Math.min(received,estimate));}
  const body=new Uint8Array(received);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  // Images are loaded through <img>, not fetch(); for those the download only warms the HTTP cache.
  if(!/\.(png|jpe?g|webp)$/i.test(path))store.set(new URL(url,location.href).href,{body,type:response.headers.get('content-type')||'application/octet-stream'});
 }catch{/* The real loader reports the failure with a proper message. */}
 finally{add(estimate);}
}

// Serve each preloaded file to the first fetch() that asks for it, then forget it. Anything else
// (and any second request, e.g. after the 777 switches between passenger and cargo) goes to the network/HTTP cache.
export function installPreloadedFetch(){
 if(!nativeFetch||globalThis.fetch.preloaded)return;
 const wrapped=(input,init)=>{
  const method=(init?.method||input?.method||'GET').toUpperCase();
  if(method==='GET'){
   const key=new URL(typeof input==='string'?input:input.url||String(input),location.href).href,hit=store.get(key);
   if(hit){
    store.delete(key);
    const signal=init?.signal||input?.signal;
    if(signal?.aborted)return Promise.reject(new DOMException('The operation was aborted.','AbortError'));
    return Promise.resolve(new Response(hit.body,{status:200,headers:{'Content-Type':hit.type}}));
   }
  }
  return nativeFetch(input,init);
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
  job={loaded:0,total:files.reduce((n,f)=>n+f[1],0),listeners,done:false,
   notify(){for(const fn of listeners)fn({loaded:Math.min(this.loaded,this.total),total:this.total,fraction:this.total?Math.min(1,this.loaded/this.total):1});}};
  const queue=files.slice();
  const worker=async()=>{for(let file;(file=queue.shift());)await pull(file[0],file[1],job,priority);};
  job.promise=Promise.all(Array.from({length:Math.min(MAX_PARALLEL,files.length)},worker)).then(()=>{job.done=true;job.notify();});
  jobs.set(key,job);
 }
 if(onProgress){job.listeners.add(onProgress);onProgress({loaded:Math.min(job.loaded,job.total),total:job.total,fraction:job.done?1:job.total?Math.min(1,job.loaded/job.total):1});job.promise.then(()=>job.listeners.delete(onProgress));}
 return job.promise;
}

export function isPreloaded(type,options){const key=aircraftFiles(type,options).map(f=>f[0]).join('|');return !key||!!jobs.get(key)?.done;}
export const downloadSizeMB=(type,options)=>aircraftFiles(type,options).reduce((n,f)=>n+f[1],0)/MB;

// Quietly fetch the other aircraft once the first scene is on screen. Skipped on metered or slow connections.
export function scheduleIdlePrefetch(types,{livery}={}){
 const link=navigator.connection;
 if(link&&(link.saveData||/^(slow-2g|2g|3g)$/.test(link.effectiveType||'')))return;
 const idle=window.requestIdleCallback||(fn=>setTimeout(fn,1500));
 let chain=Promise.resolve();
 for(const type of types)chain=chain.then(()=>new Promise(resolve=>idle(()=>preloadAircraft(type,{livery:livery?.()??'BOE',priority:'low'}).then(resolve),{timeout:8000})));
}
