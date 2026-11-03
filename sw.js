const CACHE_NAME='747-flight-lab-pwa-v1';
const BASE_URL=new URL('./',self.location.href);
const BASE_PATH=BASE_URL.pathname;
const urlFor=path=>new URL(path,BASE_URL).href;
const OFFLINE_URL=urlFor('offline.html');
const SHELL_URLS=[
 urlFor(''),
 urlFor('manifest.webmanifest'),
 OFFLINE_URL,
 urlFor('assets/pwa/plane.svg'),
 urlFor('assets/pwa/icon-180.png'),
 urlFor('assets/pwa/icon-192.png'),
 urlFor('assets/pwa/icon-512.png'),
 urlFor('assets/pwa/icon-maskable-512.png')
];

self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll(SHELL_URLS);
  await self.skipWaiting();
 })());
});

self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(name=>name.startsWith('747-flight-lab-pwa-')&&name!==CACHE_NAME).map(name=>caches.delete(name)));
  await self.clients.claim();
 })());
});

function isSmallAppResource(url){
 if(url.origin!==self.location.origin||!url.pathname.startsWith(BASE_PATH))return false;
 const relative=url.pathname.slice(BASE_PATH.length);
 return relative.startsWith('src/')||relative.startsWith('node_modules/three/')||
  relative.startsWith('assets/pwa/')||relative.startsWith('assets/livery-logos/')||
  relative==='manifest.webmanifest';
}

async function networkFirst(request){
 const cache=await caches.open(CACHE_NAME);
 try{
  const response=await fetch(request);
  if(response.ok)await cache.put(request,response.clone());
  return response;
 }catch{
  return await cache.match(request)||new Response('Offline',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 }
}

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||!url.pathname.startsWith(BASE_PATH))return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   try{
    const response=await fetch(request);
    if(response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(urlFor(''),response.clone());}
    return response;
   }catch{
    return await (await caches.open(CACHE_NAME)).match(OFFLINE_URL)||
     new Response('请联网后重新打开 747 Flight Lab。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
   }
  })());
  return;
 }
 if(isSmallAppResource(url))event.respondWith(networkFirst(request));
});
