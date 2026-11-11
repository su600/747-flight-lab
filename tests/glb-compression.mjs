// Run: node tests/glb-compression.mjs. Starts only a loopback server on an OS-selected port.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,stat,unlink,utimes,writeFile} from 'node:fs/promises';
import http from 'node:http';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const hiddenName=`.hidden-path-${process.pid}.txt`,hiddenFile=new URL('../'+hiddenName,import.meta.url);
const etagName=`etag-probe-${process.pid}.txt`,etagFile=new URL('../'+etagName,import.meta.url);
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'0'},stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';
child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
const exited=new Promise(resolve=>{child.once('error',error=>resolve({error}));child.once('exit',(code,signal)=>resolve({code,signal}));});

try{
 const port=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error(`server startup timed out: ${stdout} ${stderr}`)),10000);
  child.stdout.on('data',()=>{
   const match=stdout.match(/http:\/\/localhost:(\d+)\//);
   if(match){clearTimeout(timer);resolve(Number(match[1]));}
  });
  exited.then(result=>{clearTimeout(timer);reject(Error(`server exited during startup: ${JSON.stringify(result)} ${stderr}`));});
 });
 const request=(pathname,{method='GET',headers={}}={})=>new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,path:pathname,method,headers:{connection:'close',...headers}},res=>{
   const chunks=[];
   res.on('data',chunk=>chunks.push(chunk));
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
   res.on('error',reject);res.on('aborted',()=>reject(Error('response aborted')));
  });
  req.setTimeout(60000,()=>req.destroy(Error('request timed out')));
  req.on('error',reject);req.end();
 });
 const vary=response=>assert.match(response.headers.vary||'',/\baccept-encoding\b/i);
 const empty=response=>assert.equal(response.body.length,0);
 await writeFile(hiddenFile,'hidden sentinel');
 const etagTime=Math.floor(Date.now()/1000)+.2501;
 await writeFile(etagFile,'first');await utimes(etagFile,etagTime,etagTime);
 const firstEtagStat=await stat(etagFile,{bigint:true}),firstEtagResponse=await request('/'+etagName);
 await writeFile(etagFile,'other');await utimes(etagFile,etagTime+.0002,etagTime+.0002);
 const secondEtagStat=await stat(etagFile,{bigint:true}),secondEtagResponse=await request('/'+etagName);
 assert.equal(firstEtagStat.size,secondEtagStat.size,'ETag regression uses same-size content');
 assert.equal(firstEtagStat.mtimeNs/1000000n,secondEtagStat.mtimeNs/1000000n,'ETag regression updates within the same millisecond');
 assert.notEqual(firstEtagStat.mtimeNs,secondEtagStat.mtimeNs);
 assert.notEqual(firstEtagResponse.headers.etag,secondEtagResponse.headers.etag,'same-size same-millisecond content changes must get a new ETag');
 const staleEtag=await request('/'+etagName,{headers:{'if-none-match':firstEtagResponse.headers.etag}});
 assert.equal(staleEtag.status,200,'old validator must not produce a stale 304');
 const path='/assets/a380/fuselage.glb';
 const original=await readFile(new URL('../assets/a380/fuselage.glb',import.meta.url));
 const raw=await request(path);
 assert.equal(raw.status,200);assert.equal(raw.headers['content-type'],'application/octet-stream');
 assert.equal(raw.headers['content-length'],String(original.length));assert.equal(raw.headers['content-encoding'],undefined);
 assert.equal(raw.headers['cache-control'],'public, max-age=86400');vary(raw);assert.deepEqual(raw.body,original);
 assert.match(raw.headers.etag,/^W\/"[0-9a-f]+-[0-9a-f]+"$/);
 const gzip=await request(path,{headers:{'accept-encoding':'gzip'}});
 assert.equal(gzip.status,200);assert.equal(gzip.headers['content-type'],'application/octet-stream');
 assert.equal(gzip.headers['content-encoding'],'gzip');assert.equal(gzip.headers['content-length'],undefined);
 assert.equal(gzip.headers.etag,raw.headers.etag);assert.equal(gzip.headers['cache-control'],raw.headers['cache-control']);
 vary(gzip);assert.deepEqual(gunzipSync(gzip.body),original);assert(gzip.body.length<original.length);

 for(const [encoding,compressed] of [
  ['',false],['identity',false],['gzip;q=0',false],['gzip; q=0.000, br',false],
  ['gzip;q=0, *;q=1',false],['br, GZip; Q=0.5',true],['br, *;q=0.5',true],
  ['x-gzip',false],['gzip;q=bogus',false],['gzip;q=1.000',true]
 ]){
  const head=await request(path,{method:'HEAD',headers:{'accept-encoding':encoding}});
  assert.equal(head.status,200,encoding);empty(head);vary(head);
  assert.equal(head.headers.etag,raw.headers.etag,encoding);
  assert.equal(head.headers['content-encoding'],compressed?'gzip':undefined,encoding);
  assert.equal(head.headers['content-length'],compressed?undefined:String(original.length),encoding);
 }
 const noGzip=await request(path,{headers:{'accept-encoding':'br, gzip;q=0, *;q=1'}});
 assert.equal(noGzip.headers['content-encoding'],undefined);assert.equal(noGzip.headers['content-length'],String(original.length));
 assert.deepEqual(noGzip.body,original);
 for(const method of ['GET','HEAD'])for(const encoding of ['gzip','identity']){
  const notModified=await request(path,{method,headers:{'accept-encoding':encoding,'if-none-match':raw.headers.etag}});
  assert.equal(notModified.status,304);empty(notModified);vary(notModified);
  assert.equal(notModified.headers.etag,raw.headers.etag);
  assert.equal(notModified.headers['cache-control'],raw.headers['cache-control']);
  assert.equal(notModified.headers['content-encoding'],encoding==='gzip'?'gzip':undefined);
  assert.equal(notModified.headers['content-length'],undefined);
 }
 for(const validator of ['*',`"other", ${raw.headers.etag}`,raw.headers.etag.slice(2)]){
  const response=await request(path,{headers:{'accept-encoding':'gzip','if-none-match':validator}});
  assert.equal(response.status,304,validator);assert.equal(response.headers['content-encoding'],'gzip');empty(response);vary(response);
 }
 const modified=await request(path,{method:'HEAD',headers:{'accept-encoding':'gzip','if-none-match':'W/"other"'}});
 assert.equal(modified.status,200);assert.equal(modified.headers['content-encoding'],'gzip');

 const wingsPath='/assets/a380/wings.glb',wingsBytes=await readFile(new URL('../assets/a380/wings.glb',import.meta.url));
 const [wingsRaw,wingsGzip]=await Promise.all([request(wingsPath),request(wingsPath,{headers:{'accept-encoding':'gzip'}})]);
 assert.equal(wingsRaw.status,200);assert.equal(wingsGzip.status,200);
 assert.equal(wingsGzip.headers['content-encoding'],'gzip');assert.equal(wingsGzip.headers['content-length'],undefined);
 assert.equal(wingsGzip.headers.etag,wingsRaw.headers.etag);vary(wingsRaw);vary(wingsGzip);
 assert.deepEqual(wingsRaw.body,wingsBytes);assert.deepEqual(gunzipSync(wingsGzip.body),wingsBytes);
 // Disconnect mid-stream, then verify the isolated server still accepts requests.
 await new Promise((resolve,reject)=>{
  const req=http.get({hostname:'127.0.0.1',port,path,headers:{'accept-encoding':'gzip'}},res=>{
   res.once('data',()=>{res.destroy();resolve();});
   res.once('end',()=>reject(Error('compressed stream ended before disconnect')));
   res.once('error',reject);
  });
  req.setTimeout(60000,()=>req.destroy(Error('abort test timed out')));req.on('error',reject);
 });
 assert.equal((await request(path,{method:'HEAD'})).status,200);

 const jsPath='/src/main.js',jsBytes=await readFile(new URL('../src/main.js',import.meta.url));
 const jsRaw=await request(jsPath),jsGzip=await request(jsPath,{headers:{'accept-encoding':'gzip'}});
 assert.equal(jsRaw.status,200);assert.equal(jsRaw.headers['content-encoding'],undefined);
 assert.equal(jsRaw.headers['content-length'],String(jsBytes.length));assert.deepEqual(jsRaw.body,jsBytes);
 assert.equal(jsGzip.status,200);assert.match(jsGzip.headers['content-type'],/^text\/javascript/);
 assert.equal(jsGzip.headers['content-encoding'],'gzip');assert.equal(jsGzip.headers['content-length'],undefined);
 assert.equal(jsGzip.headers.etag,jsRaw.headers.etag);assert.equal(jsGzip.headers['cache-control'],'no-cache');
 vary(jsRaw);vary(jsGzip);assert.deepEqual(gunzipSync(jsGzip.body),jsBytes);
 const jsNoGzip=await request(jsPath,{headers:{'accept-encoding':'gzip;q=0'}});
 assert.equal(jsNoGzip.headers['content-encoding'],undefined);assert.deepEqual(jsNoGzip.body,jsBytes);
 const js304=await request(jsPath,{method:'HEAD',headers:{'accept-encoding':'gzip','if-none-match':jsRaw.headers.etag}});
 assert.equal(js304.status,304);assert.equal(js304.headers['content-encoding'],'gzip');vary(js304);empty(js304);

 const webpPath='/assets/b777-liveries/cargo/fedex-body.webp';
 const webpBytes=await readFile(new URL('../assets/b777-liveries/cargo/fedex-body.webp',import.meta.url));
 const webp=await request(webpPath,{headers:{'accept-encoding':'gzip'}});
 assert.equal(webp.status,200);assert.equal(webp.headers['content-type'],'image/webp');
 assert.equal(webp.headers['content-encoding'],undefined);assert.equal(webp.headers['content-length'],String(webpBytes.length));
 assert.deepEqual(webp.body,webpBytes);

 const pngPath='/assets/aircraft/cockpit/bottom.png';
 const pngBytes=await readFile(new URL('../assets/aircraft/cockpit/bottom.png',import.meta.url));
 const png=await request(pngPath,{headers:{'accept-encoding':'gzip'}});
 assert.equal(png.status,200);assert.equal(png.headers['content-type'],'image/png');
 assert.equal(png.headers['content-encoding'],undefined);assert.equal(png.headers['content-length'],String(pngBytes.length));
 assert.equal(png.headers['cache-control'],'public, max-age=86400');vary(png);assert.deepEqual(png.body,pngBytes);
 for(const unsafe of ['/747/%2e%2e%2fserver.mjs','/%2egit/config','/assets/%2ehidden.glb','/%5c'+hiddenName]){
  const response=await request(unsafe,{headers:{'accept-encoding':'gzip'}});
  assert.equal(response.status,404,unsafe);assert.notEqual(response.headers['content-encoding'],'gzip');
 }
 console.log(`Fuselage raw/gzip: ${original.length} -> ${gzip.body.length} bytes (${(100*gzip.body.length/original.length).toFixed(1)}%); bytes match.`);
 console.log(`Wings raw/gzip: ${wingsBytes.length} -> ${wingsGzip.body.length} bytes (${(100*wingsGzip.body.length/wingsBytes.length).toFixed(1)}%); bytes match.`);
 console.log('HEAD, 304, Accept-Encoding/q=0, disconnect, JS, PNG, prefix and path safety passed.');
}finally{
 child.kill('SIGTERM');
 await exited;
 await Promise.all([unlink(hiddenFile).catch(()=>{}),unlink(etagFile).catch(()=>{})]);
}
