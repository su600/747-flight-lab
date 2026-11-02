// Offline FlightGear 777 conversion candidate. Source and textures GPL-2.0;
// see assets/accurate-b777/CREDITS.txt. This is not an animated aircraft.
// Streams one AC object and one already-resized PNG at a time. FlightGear
// effects, conditional selection and animations still require integration.
import fs from 'node:fs';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {fileURLToPath} from 'node:url';
import {ShapeUtils, Vector2} from 'three';
import {boundaryPreservingTriangulation} from './convert-b777-triangulation.mjs';

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets/accurate-b777');
const variants=JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'convert-b777-variants.json'),'utf8'));
const variant=process.argv[2]||'passenger',config=variants[variant];
if(!config)throw Error('Unknown variant: '+variant);
const sealEnabled=['300F-single-hublot','200F-single-hublot'].includes(config.windowSeal);
if(config.windowSeal&&!sealEnabled)throw Error('Unknown window-seal policy: '+config.windowSeal);
if(sealEnabled&&(!Array.isArray(config.sealSkinRegion)||config.sealSkinRegion.length!==5))throw Error('Missing configured seal region');
function availableKiB(){return Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1]);}
if(!availableKiB()||availableKiB()<512*1024)throw Error('Less than 512 MiB available; refusing conversion');
const prefix=config.outputPrefix,directory=config.textureDirectory,textureVariant=config.textureVariant||variant;
const manifest=JSON.parse(fs.readFileSync(path.join(dir,`production-textures-${textureVariant}.json`),'utf8'));
if(manifest.textures.some(t=>!t.path.startsWith(directory+'/')))throw Error('Texture manifest does not match model directory');
const textureRecords=new Map(manifest.textures.map(t=>[t.path,t]));
const source=path.join(dir,config.ac);
const repairData=config.repairAudit?JSON.parse(fs.readFileSync(path.join(dir,config.repairAudit),'utf8')):null;
if(repairData&&repairData.source!==config.ac)throw Error('Repair audit does not match model source');
const repairMap=new Map((repairData?.faces||[]).map(f=>[`${f.object}:${f.surfaceIndex}`,f]));
if(repairData&&repairMap.size!==repairData.faces.length)throw Error('Duplicate repair targets');
const repairSeen=new Set();
const binPath=path.join(dir,`${prefix}.candidate.bin.tmp`);
const glbPath=path.join(dir,`${prefix}.candidate.glb`),glbTemp=glbPath+'.tmp';
const statsPath=path.join(dir,`${prefix}.candidate.json`);
const target=fs.openSync(binPath,'w');
let written=0;
const gltf={asset:{version:'2.0',generator:'FlightGear 777 candidate converter',extras:{upstreamRevision:manifest.revision,variant,sourceIdentity:config.sourceIdentity,realWorldStatus:config.realWorldStatus}},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],images:[],textures:[],samplers:[{wrapS:10497,wrapT:10497}],buffers:[],bufferViews:[],accessors:[]};
const materials=[],materialMap=new Map(),textureMap=new Map(),stack=[],skinTriangles=[];let skinMaterial=0;
const stats={variant,sourceIdentity:config.sourceIdentity,realWorldStatus:config.realWorldStatus,sourceBytes:fs.statSync(source).size,objectCount:0,sourceVertices:0,surfaces:0,faceReferences:0,sourceTriangles:0,outputTriangles:0,concaveOrNgon:0,triangulationMismatch:0,triangulationExceptions:0,degenerateProjected:0,quadFallbacks:0,geometryNormalFallbacks:0,degenerateTriangles:0,triangulationIssues:[],repairedPolygons:[],objects:[],cargoWindowSeal:null,warnings:['FlightGear effects, select conditions and animations are not applied. Cargo seal and all materials require visual verification.']};

// Read one bounded chunk at a time rather than holding all 1M+ lines in memory.
function* lines(filename){
 const fd=fs.openSync(filename,'r'),buf=Buffer.allocUnsafe(128*1024),decoder=new StringDecoder('utf8');let carry='';
 try{while(true){const n=fs.readSync(fd,buf,0,buf.length,null);if(!n)break;const all=carry+decoder.write(buf.subarray(0,n));let start=0,end;while((end=all.indexOf('\n',start))!==-1){yield all.slice(start,end).replace(/\r$/,'');start=end+1;}carry=all.slice(start);}carry+=decoder.end();if(carry)yield carry;}
 finally{fs.closeSync(fd);}
}
const iter=lines(source);function next(){const r=iter.next();if(r.done)throw Error('Unexpected AC EOF');return r.value.trim();}
function floatParts(line){return line.trim().split(/\s+/).map(Number);}
function addData(data,targetType){
 const padding=(4-written%4)%4;if(padding){fs.writeSync(target,Buffer.alloc(padding));written+=padding;}
 const byteOffset=written,bytes=Buffer.from(data.buffer,data.byteOffset,data.byteLength);fs.writeSync(target,bytes);written+=bytes.length;
 const index=gltf.bufferViews.length;gltf.bufferViews.push({buffer:0,byteOffset,byteLength:bytes.length,target:targetType});return index;
}
function accessor(view,componentType,count,type,min,max){const a={bufferView:view,componentType,count,type};if(min)a.min=min;if(max)a.max=max;gltf.accessors.push(a);return gltf.accessors.length-1;}
function texture(pathname){
 if(textureMap.has(pathname))return textureMap.get(pathname);
 const record=textureRecords.get(pathname);if(!record)throw Error('Missing prepared texture '+pathname);
 const data=fs.readFileSync(path.join(dir,'production-textures',textureVariant,record.name));
 const view=addData(data);gltf.images.push({name:record.name,mimeType:'image/png',bufferView:view,extras:{upstreamPath:pathname}});
 gltf.textures.push({sampler:0,source:gltf.images.length-1});const result={index:gltf.textures.length-1,alpha:record.alpha_range[0]<255};textureMap.set(pathname,result);return result;
}
function mat(id,flags,pathname,slot){
 const key=`${id}|${flags&0x20}|${pathname||''}|${slot||''}`;if(materialMap.has(key))return materialMap.get(key);
 const sourceMat=materials[id];if(!sourceMat)throw Error('Unknown source material '+id);
 const pbr={baseColorFactor:[...sourceMat.rgb,1-sourceMat.trans],metallicFactor:0,roughnessFactor:Math.max(.05,Math.min(1,Math.sqrt(2/(sourceMat.shininess+2))))};
 let hasAlpha=false;if(pathname){const t=texture(pathname);pbr.baseColorTexture={index:t.index};hasAlpha=t.alpha;}
 const a={name:sourceMat.name+' / '+(pathname||'(untextured)'),doubleSided:!!(flags&0x20),pbrMetallicRoughness:pbr,extras:{sourceMaterial:id,sourceTexture:pathname||null,textureSlot:slot||null,sourceTransparency:sourceMat.trans,sourceShininess:sourceMat.shininess}};
 if(sourceMat.trans>0||hasAlpha)a.alphaMode='BLEND';gltf.materials.push(a);const idx=gltf.materials.length-1;materialMap.set(key,idx);return idx;
}
// Triangulate simple projected n-gons with Three's Earcut. AC3D polygons may
// be non-planar/degenerate; failures are counted and this output is diagnostic.
function triangulate(refs,verts,objectName,surfaceIndex){
 const key=`${objectName}:${surfaceIndex}`,sourceFace=repairMap.get(key);
 if(sourceFace){
  if(refs.length!==sourceFace.refs.length||refs.some((r,i)=>r.length!==sourceFace.refs[i].length||r.some((v,j)=>v!==sourceFace.refs[i][j])||verts[r[0]].some((v,j)=>v!==sourceFace.positions[i][j])))throw Error('Source changed for audited polygon '+key);
  const plan=boundaryPreservingTriangulation(refs,verts);if(plan.degenerate)throw Error('Degenerate repaired polygon '+key);
  repairSeen.add(key);stats.repairedPolygons.push({object:objectName,surfaceIndex,refs:refs.length,method:'boundary-preserving-dp',projectedArea:plan.signedArea,extraProjectedArea:plan.extraProjectedArea,oppositeArea:plan.oppositeArea});
  return plan.triangles;
 }
 if(refs.length===3)return [[0,1,2]];
 let nx=0,ny=0,nz=0;
 for(let i=0;i<refs.length;i++){const a=verts[refs[i][0]],b=verts[refs[(i+1)%refs.length][0]];nx+=(a[1]-b[1])*(a[2]+b[2]);ny+=(a[2]-b[2])*(a[0]+b[0]);nz+=(a[0]-b[0])*(a[1]+b[1]);}
 const axes=Math.abs(nx)>=Math.abs(ny)&&Math.abs(nx)>=Math.abs(nz)?[1,2]:Math.abs(ny)>=Math.abs(nz)?[0,2]:[0,1];
 const points=refs.map(r=>new Vector2(verts[r[0]][axes[0]],verts[r[0]][axes[1]]));
 let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;}
 if(Math.abs(area)<1e-12){stats.degenerateProjected++;return [];}
 if(refs.length===4){
  // Use the fan if both triangles preserve polygon orientation and are nonzero.
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  if(cross(points[0],points[1],points[2])*area>0&&cross(points[0],points[2],points[3])*area>0)return [[0,1,2],[0,2,3]];
  // Earcut can collapse projected non-planar quads; retain a non-degenerate
  // 3D diagonal when either projected triangle is exactly collinear.
  const c1=cross(points[0],points[1],points[2]),c2=cross(points[0],points[2],points[3]);
  if(Math.abs(c1)<1e-12||Math.abs(c2)<1e-12){
   const area3=(i,j,k)=>{const a=verts[refs[i][0]],b=verts[refs[j][0]],c=verts[refs[k][0]],u=b.map((v,q)=>v-a[q]),v=c.map((v,q)=>v-a[q]);return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);};
   const first=[[0,1,2],[0,2,3]],second=[[0,1,3],[1,2,3]];
   const score=t=>Math.min(...t.map(x=>area3(...x)));const chosen=score(first)>=score(second)?first:second;
   if(score(chosen)>1e-12){stats.quadFallbacks++;return chosen;}
  }
 }
 stats.concaveOrNgon++;
 try{
  const tris=ShapeUtils.triangulateShape(points,[]);
  if(tris.length!==refs.length-2){stats.triangulationMismatch++;if(stats.triangulationIssues.length<40)stats.triangulationIssues.push({objectName,refs:refs.length,triangles:tris.length,first:refs[0],last:refs.at(-1),firstPosition:verts[refs[0][0]],lastPosition:verts[refs.at(-1)[0]]});}
  for(const tri of tris){const [a,b,c]=tri.map(i=>points[i]);const sign=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(sign*area<0)[tri[1],tri[2]]=[tri[2],tri[1]];}
  return tris;
 }catch{stats.triangulationExceptions++;return [];}
}
// Source polygon normal and angle-weighted normals across shared AC vertices,
// respecting the SURF smooth bit and the object's crease angle. UV seams do
// not break smoothing; sharp faces and different crease results split vertices.
function prepareNormals(o){
 const adjacent=Array.from({length:o.verts.length},()=>[]);
 for(let fi=0;fi<o.faces.length;fi++){
  const f=o.faces[fi],r=f.refs;let x=0,y=0,z=0;
  for(let i=0;i<r.length;i++){const a=o.verts[r[i][0]],b=o.verts[r[(i+1)%r.length][0]];x+=(a[1]-b[1])*(a[2]+b[2]);y+=(a[2]-b[2])*(a[0]+b[0]);z+=(a[0]-b[0])*(a[1]+b[1]);}
  const len=Math.hypot(x,y,z);if(len<1e-14)throw Error('Zero polygon normal in '+o.name);
  f.normal=[x/len,y/len,z/len];
  if(f.flags&0x10)for(let i=0;i<r.length;i++){
   const p=o.verts[r[i][0]],a=o.verts[r[(i+r.length-1)%r.length][0]],b=o.verts[r[(i+1)%r.length][0]],u=a.map((v,k)=>v-p[k]),v=b.map((v,k)=>v-p[k]);
   const l=Math.hypot(...u)*Math.hypot(...v),angle=l?Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1]+u[2]*v[2])/l))):0;
   adjacent[r[i][0]].push([fi,angle]);
  }
 }
 const limit=Math.cos(o.crease*Math.PI/180);
 return (f,r)=>{
  if(!(f.flags&0x10))return f.normal;
  let x=0,y=0,z=0;for(const [i,w] of adjacent[r[0]]){const n=o.faces[i].normal;if(n[0]*f.normal[0]+n[1]*f.normal[1]+n[2]*f.normal[2]>=limit-1e-8){x+=n[0]*w;y+=n[1]*w;z+=n[2]*w;}}
  const len=Math.hypot(x,y,z);return len>1e-12?[x/len,y/len,z/len]:f.normal;
 };
}
function sampleSkin(x,y){
 let best=null;
 for(const t of skinTriangles){const [a,b,c]=t.p,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-12)continue;
  const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w=1-u-v;
  if(Math.min(u,v,w)<-1e-7)continue;const z=u*a[2]+v*b[2]+w*c[2];if(z<2.8||z>3.2||best&&z<best.z)continue;
  best={z,uv:[u*t.uv[0][0]+v*t.uv[1][0]+w*t.uv[2][0],u*t.uv[0][1]+v*t.uv[1][1]+w*t.uv[2][1]]};
 }return best;
}
function makeCargoSeal(o){
 const original=o.faces[0];if(o.faces.length!==1||original.refs.length!==18||!skinTriangles.length)throw Error('Unexpected cargo window topology');
 const ring=original.refs.map(r=>o.verts[r[0]]),cx=ring.reduce((s,p)=>s+p[0],0)/ring.length,cy=ring.reduce((s,p)=>s+p[1],0)/ring.length;
 let points,scale;for(scale of [1.25,1.35,1.45,1.55,1.7]){points=ring.map(p=>{const x=cx+(p[0]-cx)*scale,y=cy+(p[1]-cy)*scale,s=sampleSkin(x,y);return s?{x,y,...s}:null;});if(points.every(Boolean))break;}
 if(!points?.every(Boolean))throw Error('Cargo seal boundary cannot be projected onto fuselage');
 let centre=null;for(const dx of [-.25,.25,-.3,.3]){centre=sampleSkin(cx+dx,cy);if(centre)break;}if(!centre)throw Error('Cargo seal centre could not be estimated');
 let signed=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];signed+=a.x*b.y-b.x*a.y;}if(signed<0)points.reverse();
 const mean=[0,0];for(const p of points){mean[0]+=p.uv[0]/points.length;mean[1]+=p.uv[1]/points.length;}
 const verts=[[cx,cy,centre.z+.002],...points.map(p=>[p.x,p.y,p.z+.002])],uv=[mean,...points.map(p=>p.uv)],faces=[];
 for(let i=0;i<points.length;i++){const ids=[0,i+1,(i+1)%points.length+1];faces.push({flags:0x10,material:skinMaterial,refs:ids.map(j=>[j,...uv[j]])});}
 stats.cargoWindowSeal={sourceObject:'hublot',method:'overlapping UV-projected fuselage patch',scale,offsetMetres:.002,centre:[cx,cy,centre.z+.002],boundaryVertices:points.length};
 gltf.nodes[o.node].extras.role='cargo-window-seal';
 return {...o,verts,faces,crease:61,forcedTexture:manifest.overrides.Fuselage,forcedSlot:manifest.slots.Fuselage};
}
function convertObject(original){
 let o=original;if(sealEnabled&&o.name==='hublot')o=makeCargoSeal(o);
 const pos=[],uv=[],normal=[],lookup=new Map(),groups=new Map(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let triangles=0;
 const normalAt=prepareNormals(o),pathname=o.forcedTexture||manifest.overrides[o.name]||(o.texture?directory+'/'+o.texture:null),slot=o.forcedSlot||manifest.slots[o.name]||null;
 for(const f of o.faces){
  if((f.flags&15)!==0)continue;
  const m=mat(f.material,f.flags,pathname,slot);if(!groups.has(m))groups.set(m,[]);const indices=groups.get(m);
  const refs=f.refs,cornerNormals=refs.map(r=>normalAt(f,r)),tris=triangulate(refs,o.verts,o.name,f.surfaceIndex);
  if(sealEnabled&&o.name==='Fuselage')for(const tri of tris){const p=tri.map(i=>o.verts[refs[i][0]]),[xmin,xmax,ymin,ymax,zmin]=config.sealSkinRegion;if(p.some(v=>v[0]>=xmin&&v[0]<=xmax&&v[1]>=ymin&&v[1]<=ymax&&v[2]>zmin))skinTriangles.push({p,uv:tri.map(i=>refs[i].slice(1,3))});}
  for(const tri of tris){
   // A few source n-gons are non-planar/twisted. For triangles whose smooth
   // normal points behind the actual float32 triangle, use its geometric normal
   // instead of silently publishing inverted lighting.
   const p=tri.map(k=>o.verts[refs[k][0]].map(Math.fround)),u=p[1].map((v,j)=>v-p[0][j]),v=p[2].map((v,j)=>v-p[0][j]);
   const g=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...g);
   let ns=tri.map(k=>cornerNormals[k]);
   if(length<1e-9)stats.degenerateTriangles++;
   else if(ns.some(n=>g[0]*n[0]+g[1]*n[1]+g[2]*n[2]<0)){const flat=g.map(x=>x/length);ns=[flat,flat,flat];stats.geometryNormalFallbacks++;}
   for(let j=0;j<3;j++){const k=tri[j],r=refs[k],n=ns[j],key=`${r[0]}/${r[1]}/${r[2]}/${n.map(x=>x.toFixed(6)).join('/')}`;let i=lookup.get(key);if(i===undefined){i=pos.length/3;lookup.set(key,i);const point=o.verts[r[0]];pos.push(...point);normal.push(...n);uv.push(r[1],1-r[2]);for(let a=0;a<3;a++){min[a]=Math.min(min[a],point[a]);max[a]=Math.max(max[a],point[a]);}}indices.push(i);}
   triangles++;
  }
 }
 if(sealEnabled&&o.name==='Fuselage')skinMaterial=o.faces[0].material;
 stats.outputTriangles+=triangles;
 if(!pos.length)return;
 const positions=new Float32Array(pos),uvs=new Float32Array(uv),normals=new Float32Array(normal);
 const pa=accessor(addData(positions,34962),5126,positions.length/3,'VEC3',min,max),na=accessor(addData(normals,34962),5126,normals.length/3,'VEC3'),ua=accessor(addData(uvs,34962),5126,uvs.length/2,'VEC2');
 const primitives=[];
 for(const [material,indices] of groups){if(!indices.length)continue;const values=new Uint32Array(indices);const ia=accessor(addData(values,34963),5125,values.length,'SCALAR');primitives.push({attributes:{POSITION:pa,NORMAL:na,TEXCOORD_0:ua},indices:ia,material});}
 gltf.meshes.push({name:o.name,primitives,extras:{sourceTexture:o.texture||null,crease:o.crease}});gltf.nodes[o.node].mesh=gltf.meshes.length-1;
 stats.objects.push({name:o.name,texture:pathname,slot,vertices:o.verts.length,faces:o.faces.length,triangles,bounds:[min,max]});
}
try{
 let obj=null,line;
 while(!(line=iter.next()).done){const l=line.value.trim();if(!l)continue;const [k,...a]=l.split(/\s+/);
  if(k==='MATERIAL'){const name=l.match(/"([^"]*)"/)?.[1]||'',m=l.match(/\brgb\s+(\S+)\s+(\S+)\s+(\S+)/),t=l.match(/\btrans\s+(\S+)/),s=l.match(/\bshi\s+(\S+)/);if(!m)throw Error('Bad material');materials.push({name,rgb:m.slice(1).map(Number),trans:Number(t?.[1]||0),shininess:Number(s?.[1]||0)});}
  else if(k==='OBJECT'){
   while(stack.length&&!stack.at(-1).remaining)stack.pop();
   const node=gltf.nodes.length;gltf.nodes.push({name:'',children:[]});
   if(stack.length){gltf.nodes[stack.at(-1).node].children.push(node);stack.at(-1).remaining--;}else gltf.scenes[0].nodes.push(node);
   obj={node,name:'',verts:[],faces:[],texture:null,crease:40};stats.objectCount++;
  }
  else if(k==='name'){obj.name=l.slice(6,-1);gltf.nodes[obj.node].name=obj.name;gltf.nodes[obj.node].extras={fgName:obj.name};const unresolved=manifest.unresolvedTextureOverrides?.[obj.name];if(unresolved)gltf.nodes[obj.node].extras.unresolvedTextureOverride=unresolved;}
  else if(k==='data'){let remaining=Number(a[0]);while(remaining>0){const data=next();remaining-=Buffer.byteLength(data)+1;}if(remaining< -1)throw Error('Unsupported AC data block');}
  else if(k==='texture')obj.texture=l.slice(9,-1).split(/[\\/]/).at(-1);
  else if(k==='crease')obj.crease=Number(a[0]);
  else if(k==='texrep'&&(Number(a[0])!==1||Number(a[1])!==1))throw Error('Unsupported texture repeat');
  else if(k==='texoff'||k==='loc'||k==='rot')throw Error('Unsupported AC transform: '+k);
  else if(k==='numvert'){const n=Number(a[0]);stats.sourceVertices+=n;for(let i=0;i<n;i++)obj.verts.push(floatParts(next()));}
  else if(k==='numsurf'){
   const n=Number(a[0]);stats.surfaces+=n;
   for(let i=0;i<n;i++){
    const surf=next().split(/\s+/),material=next().split(/\s+/),refsLine=next().split(/\s+/);
    if(surf[0]!=='SURF'||material[0]!=='mat'||refsLine[0]!=='refs')throw Error('Unexpected surface block');
    const count=Number(refsLine[1]),refs=[];stats.faceReferences+=count;stats.sourceTriangles+=Math.max(0,count-2);
    for(let j=0;j<count;j++)refs.push(floatParts(next()));
    obj.faces.push({flags:Number(surf[1]),material:Number(material[1]),surfaceIndex:i,refs});
   }
  }
  else if(k==='kids'){if(availableKiB()<180*1024)throw Error('Memory pressure during conversion; aborting');if(obj.faces.length)convertObject(obj);const n=Number(a[0]);if(n)stack.push({node:obj.node,remaining:n});obj=null;}
 }
 if(stack.some(x=>x.remaining))throw Error('Incomplete object tree');
 if(repairSeen.size!==repairMap.size)throw Error(`Only ${repairSeen.size}/${repairMap.size} audited polygons were encountered`);
 fs.closeSync(target);for(const node of gltf.nodes)if(!node.children.length)delete node.children;gltf.buffers.push({byteLength:written});
 // Build a GLB in bounded chunks; no data URI or full binary copy in JS heap.
 let json=Buffer.from(JSON.stringify(gltf)),jsonPad=(4-json.length%4)%4;if(jsonPad)json=Buffer.concat([json,Buffer.alloc(jsonPad,0x20)]);
 const out=fs.openSync(glbTemp,'w');const header=Buffer.alloc(20);header.write('glTF',0,'ascii');header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+written,8);header.writeUInt32LE(json.length,12);header.write('JSON',16,'ascii');fs.writeSync(out,header);fs.writeSync(out,json);
 const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(written,0);binHeader.write('BIN\0',4,'ascii');fs.writeSync(out,binHeader);
 const input=fs.openSync(binPath,'r'),chunk=Buffer.allocUnsafe(256*1024);while(true){const n=fs.readSync(input,chunk,0,chunk.length,null);if(!n)break;fs.writeSync(out,chunk,0,n);}fs.closeSync(input);fs.closeSync(out);
 stats.glbBytes=fs.statSync(glbTemp).size;stats.binaryBytes=written;stats.materials=gltf.materials.length;stats.images=gltf.images.length;stats.peakRssKiB=process.resourceUsage().maxRSS;
 const statsTemp=statsPath+'.tmp';fs.writeFileSync(statsTemp,JSON.stringify(stats,null,2));
 fs.renameSync(glbTemp,glbPath);fs.renameSync(statsTemp,statsPath);
 console.log(JSON.stringify({...stats,objects:undefined},null,2));
}catch(e){try{fs.closeSync(target);}catch{}throw e;}finally{for(const temp of [binPath,glbTemp,statsPath+'.tmp'])try{fs.unlinkSync(temp);}catch{}}
