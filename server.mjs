import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {pipeline} from 'node:stream';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ac':'text/plain','.xml':'text/xml'};
const compressible=new Set(['.html','.js','.mjs','.css','.json','.svg','.ac','.xml']);
// An explicit gzip preference overrides the wildcard, including gzip;q=0.
const acceptsGzip=header=>{
 let gzip,wildcard;
 for(const item of (header||'').split(',')){
  const [name,...params]=item.split(';'),coding=name.trim().toLowerCase();
  if(coding!=='gzip'&&coding!=='*')continue;
  let q=1,seenQ=false;
  for(const param of params){
   const match=param.match(/^\s*q\s*=\s*(.*?)\s*$/i);
   if(!match)continue;
   q=seenQ||!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(match[1])?0:Number(match[1]);
   seenQ=true;
  }
  if(coding==='gzip')gzip=Math.max(gzip??0,q);else wildcard=Math.max(wildcard??0,q);
 }
 return (gzip??wildcard??0)>0;
};
// Third-party code and aircraft assets never change while the app runs; our own sources revalidate via ETag.
const longCache=p=>p.startsWith('/assets/')||p.startsWith('/node_modules/');
// PORT=0 is useful for isolated local tests without colliding with a running instance.
const port=process.env.PORT==='0'?0:Number(process.env.PORT)||8748;
const server=http.createServer(async(req,res)=>{
 try{
  const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  // The production proxy strips /747; accept it here too for local standalone use.
  const pathname=requestPath==='/747'?'/':requestPath.startsWith('/747/')?requestPath.slice(4):requestPath;
  // Never publish local configuration, Git metadata or other hidden files.
  if(pathname.split('/').some(part=>part.startsWith('.'))){res.writeHead(404).end('Not found');return;}
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const stat=await fs.promises.stat(target);
  if(!stat.isFile()){res.writeHead(404).end('Not found');return;}
  const ext=path.extname(target),etag=`W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers={'Content-Type':types[ext]||'application/octet-stream','ETag':etag,'Cache-Control':longCache(pathname)?'public, max-age=86400':'no-cache',Vary:'Accept-Encoding'};
  const gzip=(ext==='.glb'||(compressible.has(ext)&&stat.size>1024))&&acceptsGzip(req.headers['accept-encoding']);
  if(gzip)headers['Content-Encoding']='gzip';
  // The weak ETag identifies equivalent raw/gzip representations; Vary separates CDN variants.
  const ifNoneMatch=req.headers['if-none-match'];
  const revalidated=(req.method==='GET'||req.method==='HEAD')&&ifNoneMatch?.split(',').some(tag=>{
   tag=tag.trim();return tag==='*'||tag.replace(/^W\//,'')===etag.slice(2);
  });
  if(ifNoneMatch===etag||revalidated){res.writeHead(304,headers).end();return;}
  if(!gzip)headers['Content-Length']=stat.size;
  res.writeHead(200,headers);
  if(req.method==='HEAD'){res.end();return;}
  const stream=fs.createReadStream(target);
  // GLBs are large: level 4 trades a little bandwidth for lower origin CPU.
  // Stream each response (and let pipeline clean up on disconnect), without an in-process asset cache.
  if(gzip)pipeline(stream,zlib.createGzip({level:ext==='.glb'?4:6}),res,()=>{});else pipeline(stream,res,()=>{});
 }catch{if(!res.headersSent)res.writeHead(404).end('Not found');else res.destroy();}
}).listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`747 Flight Lab: http://localhost:${server.address().port}/747/`));
