// Run: node tests/pwa.mjs. Verifies the installable app shell over the real static server.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'0'},stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
const exited=new Promise(resolve=>{child.once('error',error=>resolve({error}));child.once('exit',(code,signal)=>resolve({code,signal}));});
const request=(port,pathname)=>new Promise((resolve,reject)=>{
 const req=http.get({hostname:'127.0.0.1',port,path:pathname,headers:{connection:'close'}},res=>{
  const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
  res.on('error',reject);res.on('aborted',()=>reject(Error(`aborted: ${pathname}`)));
 });
 req.setTimeout(15000,()=>req.destroy(Error(`timeout: ${pathname}`)));req.on('error',reject);
});

try{
 child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
 const port=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error(`server startup timed out: ${stdout} ${stderr}`)),10000);
  child.stdout.on('data',()=>{const m=stdout.match(/http:\/\/localhost:(\d+)\/747\//);if(m){clearTimeout(timer);resolve(Number(m[1]));}});
  exited.then(result=>{clearTimeout(timer);reject(Error(`server exited during startup: ${JSON.stringify(result)} ${stderr}`));});
 });
 const get=path=>request(port,path);
 const manifest=await get('/manifest.webmanifest');
 assert.equal(manifest.status,200);assert.match(manifest.headers['content-type'],/^application\/manifest\+json\b/);
 const data=JSON.parse(manifest.body.toString('utf8'));
 assert.equal(data.name,'747 Flight Lab · 小机长飞行实验室');assert.equal(data.start_url,'/');assert.equal(data.scope,'/');assert.equal(data.display,'standalone');
 assert(data.icons.some(icon=>icon.sizes==='192x192'));
 assert(data.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='any'));
 assert(data.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
 for(const icon of data.icons.filter(icon=>icon.type==='image/png')){
  const path=new URL(icon.src,'http://127.0.0.1').pathname,res=await get(path);
  assert.equal(res.status,200,path);assert.deepEqual(res.body.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]),path);
  assert.equal(`${res.body.readUInt32BE(16)}x${res.body.readUInt32BE(20)}`,icon.sizes,path);
 }
 const svg=await get('/assets/pwa/plane.svg');assert.equal(svg.status,200);assert.match(svg.headers['content-type'],/^image\/svg\+xml/);assert(svg.body.toString().includes('747'));
 const index=await get('/');assert.equal(index.status,200);assert.match(index.body.toString(),/rel="manifest"[^>]+manifest\.webmanifest/);assert.match(index.body.toString(),/apple-touch-icon/);assert.match(index.body.toString(),/<a class="brand" href="\/"/);assert.match(index.body.toString(),/serviceWorker\.register\('\/sw\.js',\{scope:'\/'\}/);
 const worker=await get('/sw.js');assert.equal(worker.status,200);assert.match(worker.headers['content-type'],/^text\/javascript/);assert.match(worker.body.toString(),/addEventListener\('install'/);assert.match(worker.body.toString(),/addEventListener\('fetch'/);assert.match(worker.body.toString(),/offline\.html/);
 const offline=await get('/offline.html');assert.equal(offline.status,200);assert(offline.body.toString().includes('恢复网络'));
 const legacy=await get('/747/');assert.equal(legacy.status,200,'legacy /747/ alias remains available');
 console.log('Root-domain PWA manifest, 180/192/512 PNG icons, maskable icon, worker, offline fallback, and legacy /747/ alias passed.');
}finally{
 child.kill('SIGTERM');await exited;
}
