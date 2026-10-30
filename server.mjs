import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {pipeline} from 'node:stream';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ac':'text/plain','.xml':'text/xml'};
const compressible=new Set(['.html','.js','.mjs','.css','.json','.svg','.ac','.xml']);
// Third-party code and aircraft assets never change while the app runs; our own sources revalidate via ETag.
const longCache=p=>p.startsWith('/assets/')||p.startsWith('/node_modules/');
http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const stat=await fs.promises.stat(target);
  if(!stat.isFile()){res.writeHead(404).end('Not found');return;}
  const ext=path.extname(target),etag=`W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers={'Content-Type':types[ext]||'application/octet-stream','ETag':etag,'Cache-Control':longCache(pathname)?'public, max-age=86400':'no-cache',Vary:'Accept-Encoding'};
  if(req.headers['if-none-match']===etag){res.writeHead(304,headers).end();return;}
  const gzip=compressible.has(ext)&&stat.size>1024&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
  if(gzip)headers['Content-Encoding']='gzip';else headers['Content-Length']=stat.size;
  res.writeHead(200,headers);
  if(req.method==='HEAD'){res.end();return;}
  const stream=fs.createReadStream(target);
  if(gzip)pipeline(stream,zlib.createGzip({level:6}),res,()=>{});else pipeline(stream,res,()=>{});
 }catch{if(!res.headersSent)res.writeHead(404).end('Not found');else res.destroy();}
}).listen(8748,'127.0.0.1',()=>console.log('747 Flight Lab: http://localhost:8748'));
