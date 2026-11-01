import * as T from 'three';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
const ROOT='/747/assets/aircraft/';
const textures=new Map();
const textureLoads=new Map();
const loader=new T.TextureLoader();
function texture(name){
 if(!textures.has(name)){
  let resolveLoad,rejectLoad;
  const loaded=new Promise((resolve,reject)=>{resolveLoad=resolve;rejectLoad=reject;});
  // Some textures are loaded by the model rather than awaited by the livery selector.
  loaded.catch(()=>{});
  const t=loader.load(ROOT+name,()=>resolveLoad(t),undefined,()=>{
   if(textures.get(name)===t){textures.delete(name);textureLoads.delete(name);}
   rejectLoad(Error('涂装载入失败，请重试'));
  });
  t.colorSpace=T.SRGBColorSpace;t.anisotropy=16;
  textures.set(name,t);textureLoads.set(name,loaded);
 }
 return textures.get(name);
}
const txt=(node,tag,def='')=>node?.querySelector(':scope > '+tag)?.textContent.trim()??def;
const num=(node,tag,def=0)=>Number(txt(node,tag,def));
const fg=(x,y,z)=>new T.Vector3(x,z,-y);
const children=(el,name)=>Array.from(el.children).filter(x=>x.tagName===name);

// AC3D is Y-up. FlightGear animation XML is Z-up; transform pivots and axes together.
export function parseAC(text,folder=''){
 const lines=text.replace(/\r/g,'').split('\n');let i=1;const materials=[];
 while(lines[i]?.startsWith('MATERIAL')){const l=lines[i++],rgb=l.match(/rgb ([\d.e+ -]+?)\s+amb/)[1].trim().split(/\s+/).map(Number),name=l.match(/"([^"]*)"/)[1],trans=Number(l.match(/trans (\S+)/)?.[1]||0);materials.push({name,rgb,trans});}
 function object(){
  while(!lines[i]?.startsWith('OBJECT'))i++;i++;
  const group=new T.Group();let verts=[],faces=[],tex=null,crease=40;
  while(i<lines.length){const l=lines[i++].trim(),parts=l.split(/\s+/),key=parts[0];
   if(key==='name')group.name=l.slice(6,-1);
   else if(key==='texture')tex=l.slice(9,-1).split(/[\\/]/).pop();
   else if(key==='loc')group.position.fromArray(parts.slice(1).map(Number));
   else if(key==='rot'){const v=parts.slice(1).map(Number);group.quaternion.setFromRotationMatrix(new T.Matrix4().set(v[0],v[1],v[2],0,v[3],v[4],v[5],0,v[6],v[7],v[8],0,0,0,0,1));}
   else if(key==='data'){let n=Number(parts[1]);while(n>0){n-=lines[i++].length+1;}}
   else if(key==='crease')crease=Number(parts[1]);
   else if(key==='numvert'){for(let k=0;k<Number(parts[1]);k++)verts.push(lines[i++].trim().split(/\s+/).map(Number));}
   else if(key==='numsurf'){for(let k=0;k<Number(parts[1]);k++){let flags=0,mat=0;while(i<lines.length){let s=lines[i++].trim().split(/\s+/);if(s[0]==='SURF')flags=parseInt(s[1]);else if(s[0]==='mat')mat=+s[1];else if(s[0]==='refs'){const refs=[];for(let q=0;q<+s[1];q++)refs.push(lines[i++].trim().split(/\s+/).map(Number));faces.push({flags,mat,refs});break;}}}}
   else if(key==='kids'){
    if(faces.length){const matIds=[...new Set(faces.map(f=>f.mat))],mats=matIds.map(id=>{const a=materials[id]||materials[0],glass=a.name.toLowerCase().includes('glass');const painted=!glass&&!!tex;return new T.MeshPhysicalMaterial({color:glass?0x1b2d3b:new T.Color(...a.rgb),map:glass?null:tex?texture(folder+tex):null,roughness:glass?.06:tex?.4:.34,metalness:glass?.75:.16,clearcoat:glass?1:painted?.55:.1,clearcoatRoughness:glass?.02:.14,envMapIntensity:glass?1.5:1,side:T.DoubleSide,transparent:false});});
     const positions=[],uvs=[],geo=new T.BufferGeometry();
     const byMat=new Map();for(const f of faces){let a=byMat.get(f.mat);if(!a)byMat.set(f.mat,a=[]);a.push(f);}
     for(const id of matIds){const start=positions.length/3;for(const f of byMat.get(id)){if((f.flags&15)!==0)continue;for(let v=1;v<f.refs.length-1;v++)for(const r of [f.refs[0],f.refs[v],f.refs[v+1]]){const p=verts[r[0]];positions.push(p[0],p[1],p[2]);uvs.push(r[1],r[2]);}}geo.addGroup(start,positions.length/3-start,matIds.indexOf(id));}
     geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.computeVertexNormals();const smooth=toCreasedNormals(geo,crease*Math.PI/180);const mesh=new T.Mesh(smooth,mats);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=group.name+'#mesh';mesh.userData.texture=tex;group.add(mesh);
    }
    for(let k=0;k<Number(parts[1]);k++)group.add(object());return group;
   }
  }return group;
 }return object();
}

export const LIVERIES=[
 {id:'BOE',name:'波音经典',en:'BOEING HOUSE',color:'#164a83',symbol:'747',logo:'boeing.png'},
 {id:'CCA',name:'中国国际航空',en:'AIR CHINA',color:'#c72c31',symbol:'凤',logo:'air-china.png'},
 {id:'CEA',name:'中国东方航空',en:'CHINA EASTERN',color:'#174c9c',symbol:'东',logo:'china-eastern.png'},
 {id:'CSN',name:'中国南方航空',en:'CHINA SOUTHERN',color:'#164d9f',symbol:'南',logo:'china-southern.png'},
 {id:'CHH',name:'海南航空',en:'HAINAN AIRLINES',color:'#a61c2c',symbol:'海',logo:'hainan.png'},
 {id:'UAE',name:'阿联酋航空',en:'EMIRATES',color:'#ae252d',symbol:'EK',logo:'emirates.png'},
 {id:'BAW',name:'英国航空',en:'BRITISH AIRWAYS',color:'#172e56',symbol:'BA',logo:'british-airways.png'},
 {id:'KLM',name:'荷兰皇家航空',en:'KLM ROYAL DUTCH',color:'#1683ad',symbol:'KLM',logo:'klm.png'},
 {id:'DLH',name:'汉莎航空',en:'LUFTHANSA · CLASSIC',color:'#8d6806',symbol:'LH',logo:'lufthansa.png'},
 {id:'DLH100',name:'汉莎航空 · 100周年',en:'LUFTHANSA · 100 YEARS',color:'#102958',symbol:'100',logo:'lufthansa.png'},
 {id:'AF1_CLASSIC',name:'空军一号 · 经典涂装',en:'AIR FORCE ONE · CLASSIC',color:'#377fa3',symbol:'AF1',logo:'us-flag.png'},
 {id:'AF1_2026',name:'空军一号 · 2026新版',en:'AIR FORCE ONE · 2026',color:'#142a50',symbol:'AF1',logo:'us-flag.png'},
];

export class Aircraft{
 constructor(){this.root=new T.Group();this.native=new T.Group();this.native.rotation.y=Math.PI;this.root.add(this.native);this.animations=[];this.livery='BOE';this.liveryMats=[];this.lights=[];this.liveryRequest=0;}
 async load(){
  const names=['747-400_fuselage','747-400_wings','747-400_gear','GE_CF6-80C2B1F'];
  const raw=await Promise.all(names.map(async n=>{const [ac,xml]=await Promise.all([fetch(ROOT+n+'.ac').then(r=>r.text()),fetch(ROOT+n+'.xml').then(r=>r.text())]);return{n,ac,doc:new DOMParser().parseFromString(xml,'application/xml').documentElement};}));
  for(const part of raw.slice(0,3)){const group=parseAC(part.ac);this.native.add(group);this.bind(group,part.doc);}
  const engineBase=parseAC(raw[3].ac);
  for(const [x,y,z] of [[4.83,-21.23,-1.99],[-2.67,-13.46,-2.60],[-2.67,13.46,-2.60],[4.83,21.23,-1.99]]){const g=engineBase.clone(true);g.position.copy(fg(x,y,z));this.native.add(g);this.bind(g,raw[3].doc);}
  this.native.traverse(o=>{if(o.isMesh&&o.userData.texture==='BOE.png'){const mats=Array.isArray(o.material)?o.material:[o.material];this.liveryMats.push(...mats);}});
  // Measured contact height, retained independently from cosmetic model placement.
  this.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(this.root);this.rawDimensions=box.getSize(new T.Vector3());
  this.native.scale.set(70.67/this.rawDimensions.x,19.41/this.rawDimensions.y,64.44/this.rawDimensions.z);
  this.root.updateMatrixWorld(true);box.setFromObject(this.root);this.contact=-box.min.y;this.dimensions=box.getSize(new T.Vector3());
  for(const [pos,color] of [[[ -16,2.5,-32],0xff3333],[[-16,2.5,32],0x33ff99],[[15.7,5.2,0],0xff4422]]){const m=new T.Mesh(new T.SphereGeometry(.19,8,8),new T.MeshBasicMaterial({color}));m.position.fromArray(pos);this.root.add(m);this.lights.push(m);}
  this.update({gear:1,flaps:0,speed:0,altitude:0,engine:0,lights:true},0);
  return this;
 }
 bind(root,doc){
  for(const a of children(doc,'animation')){
   const type=txt(a,'type');const names=children(a,'object-name').map(x=>x.textContent.trim());let targets=[...new Set(names.map(n=>root.getObjectByName(n)).filter(Boolean))];if(!targets.length)continue;
   if(!type){const group=new T.Group();group.name=txt(a,'name');root.add(group);for(const o of targets)group.attach(o);continue;}
   if(type==='select'){
    if(names.some(n=>/^Gear(Nose|Wing|Body)/.test(n)))this.animations.push({type:'visibility',targets});continue;
   }
   if(!['rotate','translate','spin'].includes(type))continue;
   const prop=txt(a,'property',type==='spin'?'engine/n1':'');
   // Wing load deformation is omitted: its original FDM force properties are not simulated.
   if(prop.includes('/forces/'))continue;
   const ax=a.querySelector(':scope > axis'),ce=a.querySelector(':scope > center');let axis,center;
   if(ax?.querySelector('x1-m')){center=fg(num(ax,'x1-m'),num(ax,'y1-m'),num(ax,'z1-m'));axis=fg(num(ax,'x2-m'),num(ax,'y2-m'),num(ax,'z2-m')).sub(center).normalize();}
   else{center=fg(num(ce,'x-m'),num(ce,'y-m'),num(ce,'z-m'));axis=fg(num(ax,'x',1),num(ax,'y'),num(ax,'z')).normalize();}
   const table=Array.from(a.querySelectorAll('interpolation > entry')).map(e=>[num(e,'ind'),num(e,'dep')]);
   // A wrapper in each object's local parent space preserves compound hinge order.
   const wrappers=targets.map(o=>{const wrapper=new T.Group();wrapper.name='hinge:'+o.name;const parent=o.parent;parent.add(wrapper);wrapper.add(o);return wrapper;});
   this.animations.push({type,wrappers,prop,center,axis,factor:num(a,'factor',1),offset:num(a,'offset-deg',num(a,'offset',0)),table,phase:0});
  }
 }
 value(prop,s){
  if(prop.includes('position-norm')&&prop.includes('gear/'))return s.gear??1;
  if(prop.includes('steering'))return s.rudder||0;
  if(prop.includes('compression'))return 0;
  if(prop.includes('rollspeed'))return s.onGround?s.speed||0:0;
  if(prop.includes('altitude-agl'))return (s.altitude||0)*3.28084;
  if(prop.includes('flap-pos'))return (s.flaps||0)/30;
  if(prop.includes('aileron'))return (s.aileron||0)*.32;
  if(prop.includes('elevator'))return (s.elevator||0)*.35;
  if(prop.includes('rudder-pos'))return (s.rudder||0)*.5;
  if(prop.includes('spoiler'))return (s.spoiler||0)*.8;
  if(prop.includes('reverser'))return s.reverse||0;
  if(prop.includes('cargo1'))return s.door||0;
  if(prop.includes('wiper'))return s.wipers?(Math.sin((s.time||0)*3)+1)/2:0;
  if(prop.includes('n1')||!prop)return (s.engine||0)*800;
  return 0;
 }
 update(s,dt){
  for(const a of this.animations){
   if(a.type==='visibility'){a.targets.forEach(o=>o.visible=(s.gear??1)>.01);continue;}
   let v=this.value(a.prop,s);if(a.table.length){const t=a.table;if(v<=t[0][0])v=t[0][1];else if(v>=t.at(-1)[0])v=t.at(-1)[1];else for(let i=1;i<t.length;i++)if(v<=t[i][0]){v=T.MathUtils.lerp(t[i-1][1],t[i][1],(v-t[i-1][0])/(t[i][0]-t[i-1][0]));break;}}
   v=v*a.factor+a.offset;
   if(a.type==='spin'){a.phase=(a.phase+v*dt*6)%360;v=a.phase;}
   for(const o of a.wrappers){if(a.type==='translate')o.position.copy(a.axis).multiplyScalar(v);else{o.quaternion.setFromAxisAngle(a.axis,v*Math.PI/180);o.position.copy(a.center).sub(a.center.clone().applyQuaternion(o.quaternion));}}
  }
  this.lights.forEach((m,i)=>m.visible=s.lights!==false&&(i<2||((s.time||0)%1.2)<.17));
 }
 async setLivery(id){
  if(!LIVERIES.some(x=>x.id===id))return false;
  const request=++this.liveryRequest,name=id+'.png',t=texture(name);
  let timer;
  try{
   await Promise.race([textureLoads.get(name),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('涂装载入超时，请重试')),10000);})]);
  }catch(error){
   if(!t.image&&textures.get(name)===t){textures.delete(name);textureLoads.delete(name);}
   if(request!==this.liveryRequest)return false;
   throw error;
  }finally{clearTimeout(timer);}
  if(request!==this.liveryRequest)return false;
  this.liveryMats.forEach(m=>{m.map=t;m.needsUpdate=true;});this.livery=id;return true;
 }
}
