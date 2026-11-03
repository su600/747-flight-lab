// A330-303 exterior research implementation; see validation and remaining
// integration gates in assets/accurate-a330/NOTICE. GPL-2.0 source assets.
import * as T from 'three';
import {Aircraft, LIVERIES, parseAC} from './aircraft.js';

const ROOT='/747/assets/accurate-a330/Models/';
// parseAC resolves relative to /747/assets/aircraft/. URL normalization yields
// /747/assets/accurate-a330/Models/ without altering its shared texture cache.
const ASSET_ROOT='/747/assets/accurate-a330/';
const AC_FOLDER='../accurate-a330/Models/';
const EXPECTED_TEXTURES=['323_blank.png','303_blank.png','landing-gears.png','pw_extra.png','windshield_pane.png','windshield.png','wings_main.png','wings_tail.png','ge_extra.png','ge_fan.png','pw_inside.png'];
const UPSTREAM_LIVERIES={CCA:'A333RR/CCA',CEA:'A333RR/CES',CSN:'A333RR/CSN',DLH:'A333RR/DLH',KLM:'A333GE/KLM'};
const CARGO_IDS=new Set(['fedex','sf']);
// Bumped whenever generate_liveries.py output changes; assets are served with a one-day cache.
const LIVERY_VERSION='side-profile-2';
// The versioned SF URL avoids a cached pre-fix atlas being combined with the
// new overlay. The original sf.png is retained for already-open old sessions.
const liveryPath=id=>UPSTREAM_LIVERIES[id]?`${ROOT}Liveries/${UPSTREAM_LIVERIES[id]}.png`:id==='sf'?`${ASSET_ROOT}derived/liveries/sf-v2/sf.png?v=${LIVERY_VERSION}`:id==='fedex'?`${ASSET_ROOT}derived/liveries/fedex-v2.png?v=${LIVERY_VERSION}`:`${ASSET_ROOT}derived/liveries/${id}.png?v=${LIVERY_VERSION}`;

// Own livery maps have an explicit deadline and are discarded on cancellation.
// A late TextureLoader callback is disposed as well; shared parseAC maps are
// never disposed by this function.
function requestLiveryTexture(owner,url,timeoutMs){
 return new Promise((resolve,reject)=>{
  let settled=false,timer,texture;
  const request={cancel:()=>finish(Error('A330 涂装请求已取消'))};owner.pendingLiveries.add(request);
  function finish(error,value){
   if(settled){if(value)value.dispose();return;}settled=true;clearTimeout(timer);owner.pendingLiveries.delete(request);
   if(error){(value||texture)?.dispose();reject(error);}else resolve(value);
  }
  timer=setTimeout(()=>finish(Error('A330 涂装贴图载入超时')),timeoutMs);
  try{texture=new T.TextureLoader().load(url,t=>{
   const image=t.image,w=image?.naturalWidth??image?.width,h=image?.naturalHeight??image?.height;
   if(w!==2048||h!==1024){finish(Error('A330 涂装贴图尺寸错误'),t);return;}
   t.colorSpace=T.SRGBColorSpace;t.anisotropy=16;finish(null,t);
  },undefined,()=>finish(Error('A330 涂装贴图载入失败')));}catch(error){finish(error);}
 });
}

// parseAC's shared cache does not expose its loading promises. Its maps gain an
// image only after TextureLoader succeeds; fail rather than report a blank or
// partially loaded aircraft as ready. Never dispose the shared cache textures.
export async function waitForA330Textures(root,timeoutMs=15000,signal){
 const textures=new Map();
 root.traverse(o=>{if(o.isMesh&&o.userData.texture)for(const m of [o.material].flat())if(m?.map)textures.set(m.map,o.userData.texture);});
 const names=new Set(textures.values());
 for(const name of EXPECTED_TEXTURES)if(!names.has(name))throw Error(`A330 texture binding missing: ${name}`);
 const start=Date.now();
 for(;;){
  if(signal?.aborted)throw Error('A330 模型载入已取消');
  const pending=[...textures].filter(([t])=>{const image=t.image;return !image||!(image.naturalWidth??image.width)||!(image.naturalHeight??image.height);});
  if(!pending.length)return;
  if(Date.now()-start>=timeoutMs)throw Error(`A330 textures failed or timed out: ${[...new Set(pending.map(([,name])=>name))].join(', ')}`);
  await new Promise(resolve=>setTimeout(resolve,Math.min(25,Math.max(1,timeoutMs-(Date.now()-start)))));
 }
}

// Explicit real-AC mesh references for integration and inspection. The 323
// atlas is also shared by fin, winglets, gear doors and some GE rims; never
// mutate a cached texture globally or substitute its UVs for the GE atlas.
export function a330PaintTargets(root){
 const all=[];root.traverse(o=>{if(o.isMesh)all.push(o);});
 const pick=(name,texture)=>all.filter(o=>o.parent?.name===name&&o.userData.texture===texture);
 const result={
  body:pick('fuselage','323_blank.png'),fin:pick('vstab','323_blank.png'),
  movingFin:pick('rudder','323_blank.png'),
  engines:['ge.nacelle0','ge.nacelle1','ge.reverser0','ge.reverser1'].flatMap(n=>pick(n,'303_blank.png')),
  winglets:['winglet0','winglet1'].flatMap(n=>pick(n,'323_blank.png')),
  cockpitGlass:pick('windshield','windshield.png'),
  cargoAtlas:'/747/assets/accurate-a330/derived/323_windowless.png',
 };
 if(result.body.length!==1||result.fin.length!==1||result.movingFin.length!==1||result.engines.length!==4||result.winglets.length!==2||result.cockpitGlass.length!==1)throw Error('A330 paint target mismatch');
 return result;
}
// Use the original texture UVs and hull triangles, including actual curvature.
// Ten outlines in the source atlas are not windows and never emit light.
function addA330CabinLights(aircraft,footprints){
 const hull=a330PaintTargets(aircraft.root).body[0],g=hull.geometry,p=g.attributes.position,uv=g.attributes.uv;
 if(!uv||g.index||footprints.rows?.length!==2||footprints.lit?.length!==2)throw Error('A330 cabin-window UV data invalid');
 aircraft.root.updateMatrixWorld(true);
 const toRoot=new T.Matrix4().copy(aircraft.root.matrixWorld).invert().multiply(hull.matrixWorld);
 function point(u,v){
  for(let i=0;i<p.count;i+=3){
   const ax=uv.getX(i),ay=uv.getY(i),bx=uv.getX(i+1),by=uv.getY(i+1),cx=uv.getX(i+2),cy=uv.getY(i+2);
   const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(det)<1e-10)continue;
   const a=((by-cy)*(u-cx)+(cx-bx)*(v-cy))/det,b=((cy-ay)*(u-cx)+(ax-cx)*(v-cy))/det,c=1-a-b;
   if(Math.min(a,b,c)<-1e-6)continue;
   const A=new T.Vector3().fromBufferAttribute(p,i),B=new T.Vector3().fromBufferAttribute(p,i+1),C=new T.Vector3().fromBufferAttribute(p,i+2);
   const q=A.clone().multiplyScalar(a).addScaledVector(B,b).addScaledVector(C,c);
   const normal=B.sub(A).cross(C.sub(A)).normalize();
   const rootPoint=q.clone().applyMatrix4(toRoot),rootNormal=normal.clone().transformDirection(toRoot);
   if(rootPoint.z*rootNormal.z<0)normal.negate();
   return q.addScaledVector(normal,.018);
  }
  throw Error('A330 cabin window does not map onto fuselage UV');
 }
 const vertices=[],colors=[],centers=[];
 const outline=[[-.34,-.48],[.34,-.48],[.46,-.32],[.46,.32],[.34,.48],[-.34,.48],[-.46,.32],[-.46,-.32]];
 for(let r=0;r<2;r++){
  const row=footprints.rows[r],lit=footprints.lit[r];
  if(row.length!==69||lit?.length!==69)throw Error('A330 cabin-window row invalid');
  for(let j=0;j<row.length;j++){
   if(!lit[j])continue;
   const [x0,y0,x1,y1]=row[j],cx=(x0+x1+1)/2,cy=(y0+y1+1)/2,w=x1-x0+1,h=y1-y0+1;
   const at=(x,y)=>point((cx+x*w)/2048,1-(cy+y*h)/1024);
   const center=at(0,0),ring=outline.map(([x,y])=>at(x,y));centers.push(center.clone().applyMatrix4(toRoot).toArray());
   const color=new T.Color((j%7===0)?0xb69167:0xe6be8a);
   for(let i=0;i<ring.length;i++)for(const q of [center,ring[i],ring[(i+1)%ring.length]]){vertices.push(q.x,q.y,q.z);colors.push(color.r,color.g,color.b);}
  }
 }
 if(centers.length!==128)throw Error('A330 cabin-window count invalid');
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeBoundingSphere();
 const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
 mesh.name='cabin-window-lights';mesh.userData.centers=centers;mesh.visible=false;mesh.castShadow=false;mesh.receiveShadow=false;hull.add(mesh);return mesh;
}
// Approximate A330-300 passenger-to-freighter main-deck door. The upstream
// A330-300 AC has no such door or opening. Cut actual hull triangles, retaining
// normals/UVs; the curved extracted skin becomes the hinged door. Coordinates
// are an approximation, not a certified conversion drawing.
function prepareA330CargoDoor(aircraft){
 const hull=a330PaintTargets(aircraft.root).body[0],source=hull.geometry,p=source.attributes.position,n=source.attributes.normal,uv=source.attributes.uv;
 if(!p||!n||!uv||source.index)throw Error('A330 cargo door source geometry unsupported');
 aircraft.root.updateMatrixWorld(true);
 const toRoot=new T.Matrix4().copy(aircraft.root.matrixWorld).invert().multiply(hull.matrixWorld);
 const bounds={x0:11.8,x1:15.4,y0:.05,y1:2.35,radius:.25},r=bounds.radius;
 // A rounded rectangular silhouette, not a certified door drawing.
 const contour=[];
 for(const [x,y,a] of [[bounds.x1-r,bounds.y0+r,-Math.PI/2],[bounds.x1-r,bounds.y1-r,0],[bounds.x0+r,bounds.y1-r,Math.PI/2],[bounds.x0+r,bounds.y0+r,Math.PI]]){
  for(let i=0;i<=4;i++){const angle=a+i*Math.PI/8;contour.push([x+r*Math.cos(angle),y+r*Math.sin(angle)]);}
 }
 const planes=contour.map((a,i)=>{const b=contour[(i+1)%contour.length];return q=>(b[0]-a[0])*(q.r.y-a[1])-(b[1]-a[1])*(q.r.x-a[0]);});
 planes.push(q=>-q.r.z-.5);
 const vertex=i=>({p:new T.Vector3().fromBufferAttribute(p,i),n:new T.Vector3().fromBufferAttribute(n,i),uv:new T.Vector2().fromBufferAttribute(uv,i),r:new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(toRoot)});
 const mix=(a,b,t)=>({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),uv:a.uv.clone().lerp(b.uv,t),r:a.r.clone().lerp(b.r,t)});
 function half(poly,plane,inside){
  const out=[];if(!poly.length)return out;
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],da=plane(a),db=plane(b),ia=inside?da>=0:da<=0,ib=inside?db>=0:db<=0;
   if(ia)out.push(a);
   if(ia!==ib){const t=da/(da-db);out.push(mix(a,b,t));}
  }return out;
 }
 const empty=()=>({p:[],n:[],uv:[],groups:[]}),outside=empty(),panel=empty();
 function append(out,poly){
  for(let i=1;i+1<poly.length;i++)for(const q of [poly[0],poly[i],poly[i+1]]){
   out.p.push(q.p.x,q.p.y,q.p.z);out.n.push(q.n.x,q.n.y,q.n.z);out.uv.push(q.uv.x,q.uv.y);
  }
 }
 const groups=source.groups.length?source.groups:[{start:0,count:p.count,materialIndex:0}];
 for(const group of groups){
  const before=outside.p.length/3,insideBefore=panel.p.length/3;
  for(let i=group.start;i<group.start+group.count;i+=3){
   let remaining=[vertex(i),vertex(i+1),vertex(i+2)];
   for(const plane of planes){if(!remaining.length)break;const rejected=half(remaining,plane,false);append(outside,rejected);remaining=half(remaining,plane,true);}
   append(panel,remaining);
  }
  outside.groups.push({start:before,count:outside.p.length/3-before,materialIndex:group.materialIndex});
  panel.groups.push({start:insideBefore,count:panel.p.length/3-insideBefore,materialIndex:group.materialIndex});
 }
 function geometry(data){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(data.n,3));g.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));for(const q of data.groups)if(q.count)g.addGroup(q.start,q.count,q.materialIndex);g.computeBoundingBox();g.computeBoundingSphere();return g;}
 if(panel.p.length<27)throw Error('A330 cargo door does not intersect hull');
 const cargoHull=geometry(outside),panelGeometry=geometry(panel),parent=hull.parent;
 const ray=new T.Raycaster(),hit=(x,y)=>{
  const start=aircraft.root.localToWorld(new T.Vector3(x,y,-10));
  ray.set(start,new T.Vector3(0,0,1).transformDirection(aircraft.root.matrixWorld));
  const result=ray.intersectObject(hull,false)[0];if(!result)throw Error('A330 cargo door boundary misses hull');
  return aircraft.root.worldToLocal(result.point.clone());
 };
 const top=hit((bounds.x0+bounds.x1)/2,bounds.y1);
 const rootToParent=new T.Matrix4().copy(parent.matrixWorld).invert().multiply(aircraft.root.matrixWorld);
 const pivot=top.clone().applyMatrix4(rootToParent),axis=new T.Vector3(1,0,0).transformDirection(rootToParent);
 const hinge=new T.Group();hinge.name='a330-main-cargo-door';hinge.position.copy(pivot);parent.add(hinge);
 const exterior=[hull.material].flat().map(m=>{const copy=m.clone();copy.side=T.FrontSide;return copy;});
 const leaf=new T.Mesh(panelGeometry,Array.isArray(hull.material)?exterior:exterior[0]);leaf.position.copy(pivot).negate();leaf.name='a330-main-cargo-door-panel';leaf.userData.texture='323_blank.png';leaf.castShadow=leaf.receiveShadow=true;hinge.add(leaf);
 // The opened door exposes its inside, not the mirrored exterior logo.
 const inner=new T.Mesh(panelGeometry,new T.MeshStandardMaterial({color:0xaeb8bb,roughness:.78,side:T.BackSide}));
 inner.position.copy(pivot).negate();inner.name='a330-main-cargo-door-inner';hinge.add(inner);
 const cavity=new T.Mesh(panelGeometry,new T.MeshStandardMaterial({color:0x1b2428,roughness:.95,side:T.DoubleSide}));
 cavity.position.copy(new T.Vector3(0,0,.07).transformDirection(rootToParent)).multiplyScalar(.07);cavity.name='a330-main-cargo-cavity';parent.add(cavity);
 const outline=[];
 for(let edge=0;edge<contour.length;edge++){
  const a=contour[edge],b=contour[(edge+1)%contour.length];
  for(let i=0;i<4;i++)for(const t of [i/4,(i+1)/4]){const q=hit(T.MathUtils.lerp(a[0],b[0],t),T.MathUtils.lerp(a[1],b[1],t));q.z-=.015;outline.push(q.x,q.y,q.z);}
 }
 const outlineGeometry=new T.BufferGeometry();outlineGeometry.setAttribute('position',new T.Float32BufferAttribute(outline,3));
 const border=new T.LineSegments(outlineGeometry,new T.LineBasicMaterial({color:0x596168}));border.name='a330-main-cargo-door-outline';aircraft.root.add(border);
 hinge.visible=cavity.visible=border.visible=false;
 return {hull,passengerHull:source,cargoHull,panelGeometry,leaf,inner,hinge,cavity,border,pivot,axis,bounds};
}
const direct=(node,name)=>Array.from(node?.children||[]).filter(e=>e.tagName===name);
const text=(node,name,fallback='')=>direct(node,name)[0]?.textContent.trim()??fallback;
const number=(node,name,fallback=0)=>{const s=text(node,name,'');return s===''?fallback:Number(s);};
const fg=(x,y,z)=>new T.Vector3(x,z,-y);

function stateValue(property,s){
 if(property.includes('position-norm')&&property.includes('gear/'))return T.MathUtils.clamp(s.gear??1,0,1);
 if(property.includes('compression-norm'))return 0;
 if(property.includes('rollspeed-ms'))return s.onGround?(s.speed||0):0;
 if(property.includes('flap-pos-norm'))return T.MathUtils.clamp((s.flaps||0)/30,0,1);
 if(property.includes('spoiler-'))return T.MathUtils.clamp(s.spoiler||0,0,1)*45;
 if(property.includes('/n1'))return T.MathUtils.clamp(s.engine||0,0,1)*100;
 const index=property.match(/generic\/float\[(\d+)\]/)?.[1];
 if(index==='1')return T.MathUtils.clamp(s.rudder||0,-1,1);
 if(index==='2'||index==='3')return T.MathUtils.clamp(s.reverse||0,0,1);
 if(index==='4'||index==='5')return T.MathUtils.clamp(s.elevator||0,-1,1)*20;
 if(index==='6'||index==='7'||index==='13'||index==='14')return T.MathUtils.clamp(s.aileron||0,-1,1)*20;
 if(index==='8')return T.MathUtils.clamp(s.rudder||0,-1,1)*25;
 if(index==='11')return T.MathUtils.clamp((s.flaps||0)/30,0,1);
 // No stabilizer trim, gear bogie pitch or wing-flex input in this simulator.
 return 0;
}
function interpolate(table,v){
 if(!table.length)return v;
 if(v<=table[0][0])return table[0][1];
 for(let i=1;i<table.length;i++)if(v<=table[i][0]){
  const [x0,y0]=table[i-1],[x1,y1]=table[i];
  return T.MathUtils.lerp(y0,y1,(v-x0)/(x1-x0));
 }
 return table.at(-1)[1];
}

// source is the native coordinate frame, not the target's parent. Convert
// each pivot and axis into parent space before inserting its neutral wrapper;
// AC objects frequently have nonzero loc and nested gear assemblies.
function bindAnimations(aircraft,doc){
 const native=aircraft.native;
 for(const a of direct(doc,'animation')){
  const type=text(a,'type'),property=text(a,'property');
  if(!['rotate','translate','spin'].includes(type)||property.includes('float[15]'))continue;
  const names=new Set(direct(a,'object-name').map(n=>n.textContent.trim()));
  const targets=[];native.traverse(o=>{if(names.has(o.name))targets.push(o);});
  // Avoid transforming a nested same-name object twice.
  const targetSet=new Set(targets);
  const top=targets.filter(o=>{for(let p=o.parent;p&&p!==native;p=p.parent)if(targetSet.has(p))return false;return true;});
  if(!top.length)continue;
  const ax=direct(a,'axis')[0],ce=direct(a,'center')[0];
  let center,axis;
  if(text(ax,'x1-m')!==''){
   center=fg(number(ax,'x1-m'),number(ax,'y1-m'),number(ax,'z1-m'));
   axis=fg(number(ax,'x2-m'),number(ax,'y2-m'),number(ax,'z2-m')).sub(center).normalize();
  }else{
   center=fg(number(ce,'x-m'),number(ce,'y-m'),number(ce,'z-m'));
   axis=fg(number(ax,'x'),number(ax,'y'),number(ax,'z')).normalize();
  }
  if(axis.lengthSq()<.5)continue;
  const table=direct(direct(a,'interpolation')[0],'entry').map(e=>[number(e,'ind'),number(e,'dep')]);
  const wrappers=[];
  for(const target of top){
   native.updateWorldMatrix(true,true);
   const parent=target.parent;
   const toParent=new T.Matrix4().copy(parent.matrixWorld).invert().multiply(native.matrixWorld);
   const pivot=center.clone().applyMatrix4(toParent),direction=axis.clone().transformDirection(toParent);
   const wrapper=new T.Group();wrapper.name='a330-hinge:'+target.name;
   parent.add(wrapper);wrapper.add(target);wrappers.push({wrapper,pivot,direction});
  }
  aircraft.a330Animations.push({type,property,table,wrappers,factor:number(a,'factor',1),offset:number(a,'offset-deg',number(a,'offset',0)),phase:0});
 }
}

export class AccurateA330Research extends Aircraft{
 constructor(options={}){super(options);this.type='a330';this.modelLabel='A330-303';this.cargoModelLabel='A330-300 货运外观示意（非 A330-200F）';this.a330Animations=[];this.textureTimeoutMs=options.textureTimeoutMs??120000;this.resourceTimeoutMs=options.resourceTimeoutMs??120000;this.pendingLiveries=new Set();this.disposed=false;this.loading=false;}
 async load(){
  if(this.disposed||this.loading||this.loaded)throw Error('A330 模型已载入、正在载入或已释放');
  this.loading=true;this.loadController=new AbortController();let timer;
  try{
  const names=['a330-300-main.ac','cf6-80e1.ac','a333-animations.xml','cf6-80e1.xml','window-footprints.json'];
  const requests=Promise.all(names.map(async (name,i)=>{
   const response=await fetch((i===4?ASSET_ROOT:ROOT)+name,{signal:this.loadController.signal});
   if(!response.ok)throw Error(`A330 resource ${name}: HTTP ${response.status}`);
   return response.text();
  }));
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('A330 模型资源载入超时'));this.loadController.abort();},this.resourceTimeoutMs);});
  const canceled=new Promise((_,reject)=>this.loadController.signal.addEventListener('abort',()=>reject(Error('A330 模型载入已取消')),{once:true}));
  const raw=await Promise.race([requests,deadline,canceled]);clearTimeout(timer);
  if(this.disposed)throw Error('A330 模型载入已取消');
  const docs=raw.slice(2,4).map((xml,i)=>{
   const doc=new DOMParser().parseFromString(xml,'application/xml');
   if(doc.querySelector('parsererror'))throw Error(`A330 XML invalid: ${names[i+2]}`);
   return doc.documentElement;
  });
  // Both engines already have their absolute positions inside the engine AC.
  this.native.add(parseAC(raw[0],AC_FOLDER));this.native.add(parseAC(raw[1],AC_FOLDER));
  await waitForA330Textures(this.native,this.textureTimeoutMs,this.loadController.signal);
  if(this.disposed)throw Error('A330 模型载入已取消');
  for(const doc of docs)bindAnimations(this,doc);
  this.update({gear:1,flaps:0,engine:0,onGround:false},0);
  this.root.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(this.root,true);
  this.contact=-bounds.min.y;this.dimensions=bounds.getSize(new T.Vector3());this.rawDimensions=this.dimensions.clone();
  this.cabinWindowLights=addA330CabinLights(this,JSON.parse(raw[4]));
  this.cargoDoor=prepareA330CargoDoor(this);
  // SF markings use the exact hull UVs on a transparent, unlit skin layer.
  // This avoids losing contrast in the main scene's bright environment while
  // preserving its PBR fuselage, door, cockpit glass and freight window state.
  const markMaterial=new T.MeshBasicMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,alphaTest:.01,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false});
  // Offset a private skin by 1.2 cm instead of relying solely on polygon
  // offset: the main app uses a logarithmic depth buffer. UVs remain intact.
  const markSkin=this.cargoDoor.cargoHull.clone(),position=markSkin.attributes.position,normal=markSkin.attributes.normal;
  const toRoot=new T.Matrix4().copy(this.root.matrixWorld).invert().multiply(this.cargoDoor.hull.matrixWorld),point=new T.Vector3(),out=new T.Vector3(),localNormal=new T.Vector3();
  for(let i=0;i<position.count;i++){
   point.fromBufferAttribute(position,i).applyMatrix4(toRoot);localNormal.fromBufferAttribute(normal,i).normalize();out.copy(localNormal).transformDirection(toRoot);
   if((point.y-.24)*out.y+point.z*out.z<0)localNormal.negate();
   position.setXYZ(i,position.getX(i)+.012*localNormal.x,position.getY(i)+.012*localNormal.y,position.getZ(i)+.012*localNormal.z);
  }
  position.needsUpdate=true;markSkin.computeBoundingBox();markSkin.computeBoundingSphere();
  this.sfMarkLayer=new T.Mesh(markSkin,markMaterial);this.sfMarkLayer.name='a330-sf-fuselage-marks';this.sfMarkLayer.visible=false;
  this.sfMarkLayer.castShadow=this.sfMarkLayer.receiveShadow=false;this.cargoDoor.hull.add(this.sfMarkLayer);
  this.paintMaterials=new Set();this.engineMaterials=new Map();
  this.native.traverse(o=>{
   if(!o.isMesh)return;
   if(o.userData.texture==='323_blank.png'&&!/^ge\\.rim/.test(o.parent?.name||''))for(const m of [o.material].flat())if(m?.map)this.paintMaterials.add(m);
  });
  for(const o of a330PaintTargets(this.root).engines)for(const m of [o.material].flat())if(m?.color)this.engineMaterials.set(m,{color:m.color.clone(),map:m.map});
  if(!this.paintMaterials.size||!this.engineMaterials.size)throw Error('A330 paint material binding missing');
  this.setCargoMode(false);this.setCabinTime('day');
  for(const [pos,color] of [[[-12.764,.916,-28.821],0xff3333],[[-12.764,.916,28.821],0x33ff99],[[-7.34,3.16,0],0xff4422]]){
   const light=new T.Mesh(new T.SphereGeometry(.13,8,8),new T.MeshBasicMaterial({color}));light.position.fromArray(pos);this.root.add(light);this.lights.push(light);
  }
  this.loaded=true;return this;
  }catch(error){this.dispose();throw error;}finally{clearTimeout(timer);this.loading=false;}
 }
 update(s,dt){
  super.update(s,dt);
  for(const a of this.a330Animations){
   let v=interpolate(a.table,stateValue(a.property,s))*a.factor+a.offset;
   // FG spin is RPM; factor*input*6 is degrees/sec.
   if(a.type==='spin'){a.phase=(a.phase+v*Math.max(0,dt||0)*6)%360;v=a.phase;}
   for(const {wrapper,pivot,direction} of a.wrappers){
    if(a.type==='translate')wrapper.position.copy(direction).multiplyScalar(v);
    else{wrapper.quaternion.setFromAxisAngle(direction,T.MathUtils.degToRad(v));wrapper.position.copy(pivot).sub(pivot.clone().applyQuaternion(wrapper.quaternion));}
   }
  }
  this.doorPosition=T.MathUtils.clamp(s.door||0,0,1);
  if(this.cargoDoor)this.cargoDoor.hinge.quaternion.setFromAxisAngle(this.cargoDoor.axis,this.doorPosition*100*Math.PI/180);
 }
 // Toggle only after a successful livery transaction; keep passenger geometry
 // intact and make the freight-only opening/door invisible for passengers.
 setCargoMode(cargo){
  this.cargoMode=!!cargo;const d=this.cargoDoor;
  if(d){d.hull.geometry=this.cargoMode?d.cargoHull:d.passengerHull;d.hinge.visible=d.cavity.visible=d.border.visible=this.cargoMode;}
  if(this.sfMarkLayer)this.sfMarkLayer.visible=this.cargoMode&&this.livery==='sf'&&!!this.sfMarkTexture;
  this.setCabinTime(this.cabinTime||'day');
 }
 // Coordinator may call this alongside/in place of updateCabinLights(craft,time).
 // Freight is always dark, including immediately after a livery change.
 setCabinTime(time){this.cabinTime=time;if(this.cabinWindowLights)this.cabinWindowLights.visible=time==='night'&&!this.cargoMode&&!['fedex','sf'].includes(String(this.livery).toLowerCase());return !!this.cabinWindowLights;}
 async setLivery(id){
  if(!LIVERIES.some(l=>l.id===id))return false;
  if(this.disposed||!this.paintMaterials)throw Error('A330 模型尚未准备好');
  const request=++this.liveryRequest;
  for(const pending of [...this.pendingLiveries])pending.cancel();
  let next,marks;
  try{
   next=await requestLiveryTexture(this,liveryPath(id),this.textureTimeoutMs);
   if(request!==this.liveryRequest||this.disposed){next.dispose();return false;}
   if(id==='sf')marks=await requestLiveryTexture(this,`${ASSET_ROOT}derived/liveries/sf-v2/sf-marks.png?v=${LIVERY_VERSION}`,this.textureTimeoutMs);
  }catch(error){next?.dispose();if(request!==this.liveryRequest||this.disposed)return false;throw error;}
  if(request!==this.liveryRequest||this.disposed){next.dispose();marks?.dispose();return false;}
  // Commit only after the actual image is decoded and validated. parseAC
  // creates per-mesh materials; changing their map does not mutate its cache.
  for(const m of this.paintMaterials){m.map=next;m.needsUpdate=true;}
  for(const [m,base] of this.engineMaterials){
   m.color.copy(base.color);if(id==='sf')m.color.set('#282a2d');
   // Only the upstream GE atlas uses the CF6 nacelle UVs. Never apply the
   // RR-source liveries to GE engines.
   m.map=id==='KLM'?next:base.map;m.needsUpdate=true;
  }
  const previous=this.ownedLiveryTexture,previousMarks=this.sfMarkTexture;this.ownedLiveryTexture=next;this.sfMarkTexture=marks;
  this.sfMarkLayer.material.map=marks||null;this.sfMarkLayer.material.needsUpdate=true;
  this.livery=id;this.setCargoMode(CARGO_IDS.has(id));this.setCabinTime(this.cabinTime||'day');
  // RR-source paint is used on the GE airframe only as an adaptation; all
  // other generated skins are explicitly fictional approximations.
  const cargo=CARGO_IDS.has(id);
  this.liveryInfo={id,source:UPSTREAM_LIVERIES[id]?`FlightGear ${UPSTREAM_LIVERIES[id]}`:'原创近似绘制',approximate:true,cargo,model:cargo?this.cargoModelLabel:this.modelLabel,
   disclosure:cargo?'A330-300 货运外观示意；非 A330-200F，货舱门与涂装为近似。':'A330-303 外形；涂装为移植或近似，不保证机号及发动机与实机一致。'};
  previous?.dispose();previousMarks?.dispose();return true;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.liveryRequest++;this.loadController?.abort();
  for(const pending of [...this.pendingLiveries])pending.cancel();
  const geometries=new Set(),materials=new Set();
  this.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat())if(m)materials.add(m);});
  if(this.cargoDoor)for(const g of [this.cargoDoor.passengerHull,this.cargoDoor.cargoHull,this.cargoDoor.panelGeometry])geometries.add(g);
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.ownedLiveryTexture?.dispose();this.sfMarkTexture?.dispose();this.root.removeFromParent();
  this.native.clear();this.root.clear();this.a330Animations=[];this.paintMaterials?.clear();this.engineMaterials?.clear();this.cargoDoor=null;this.cabinWindowLights=null;this.sfMarkLayer=null;this.lights=[];
 }
}
export const AccurateA330=AccurateA330Research;
