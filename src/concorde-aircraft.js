// FlightGear Concorde exterior; provenance and licensing in assets/concorde/CREDITS.txt.
import * as T from 'three';
import {Aircraft,parseAC} from './aircraft.js';

const ROOT='/assets/concorde/';
export const CONCORDE_ASSETS=[ROOT+'concorde.ac',ROOT+'concorde.png',ROOT+'concorde-window.png',ROOT+'AF.png'];
export const CONCORDE_LIVERIES=['CONCORDE_BAW','CONCORDE_AFR'];
const DEG=Math.PI/180;
const fg=(x,y,z)=>new T.Vector3(x,z,-y);
const clamp=(v,a,b)=>T.MathUtils.clamp(Number.isFinite(v)?v:0,a,b);

// The AC export declares 104 flat children but actually contains 103. Omit
// cockpit meshes and effect planes before parseAC requests their textures; they are not part
// of the exterior and have no corresponding renderer in this simulator.
function exteriorAC(text){
 const parts=text.split(/^OBJECT /m),header=parts.shift(),world=parts.shift();
 if(!world?.startsWith('world\n')||parts.length!==103||parts.some(p=>!/^kids 0\s*$/m.test(p)))throw Error('Unexpected Concorde AC hierarchy');
 const keep=parts.filter(p=>!/^texture "(?:fx|concorde-cockpit-textures)\.png"$/m.test(p));
 return header+'OBJECT '+world.replace(/^kids \d+$/m,'kids '+keep.length)+keep.map(p=>'OBJECT '+p).join('');
}
function group(root,names,name){
 const objects=names.map(n=>{const o=root.getObjectByName(n);if(!o)throw Error(`Concorde mesh missing: ${n}`);return o;});
 const g=new T.Group();g.name=name;root.add(g);objects.forEach(o=>g.add(o));return g;
}
function hinge(group,center,axis,degrees){
 group.quaternion.setFromAxisAngle(axis.clone().normalize(),degrees*DEG);
 group.position.copy(center).sub(center.clone().applyQuaternion(group.quaternion));
}
const AXIS_NOSE=fg(0,1,0),AXIS_GEAR=fg(1,0,0),AXIS_RUDDER=fg(0,0,1);
function interpolate(points,v){
 if(v<=points[0][0])return points[0][1];
 for(let i=1;i<points.length;i++)if(v<=points[i][0])return T.MathUtils.lerp(points[i-1][1],points[i][1],(v-points[i-1][0])/(points[i][0]-points[i-1][0]));
 return points.at(-1)[1];
}
const leg=[[0,1],[.17,1],[.83,0],[1,0]];
const doors=[[0,0],[.17,1],[.83,1],[1,0]];
function makeDoor(root,name,a,b){return {object:group(root,[name],'hinge:'+name),center:fg(...a),axis:fg(...b).sub(fg(...a)).normalize()};}
async function waitTextures(root,timeout,owner){
 const maps=new Set();root.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())if(m?.map)maps.add(m.map);});
 const start=Date.now();
 while([...maps].some(t=>!t.image||!(t.image.naturalWidth??t.image.width))){
  if(owner.disposed)throw Error('Concorde load cancelled');
  if(Date.now()-start>=timeout)throw Error('Concorde texture load timed out');
  await new Promise(resolve=>setTimeout(resolve,25));
 }
}
function loadTexture(url,timeout){
 return new Promise((resolve,reject)=>{
  let done=false,timer,texture;
  const finish=(error,t)=>{if(done){t?.dispose();return;}done=true;clearTimeout(timer);if(error){texture?.dispose();reject(error);}else{t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;resolve(t);}};
  timer=setTimeout(()=>finish(Error('Concorde livery load timed out')),timeout);
  try{texture=new T.TextureLoader().load(url,t=>finish(null,t),undefined,()=>finish(Error('Concorde livery load failed')));}catch(error){finish(error);}
 });
}

export class ConcordeAircraft extends Aircraft{
 constructor(options={}){
  super(options);this.type='concorde';this.modelLabel='CONCORDE';this.livery='CONCORDE_BAW';
  this.textureTimeoutMs=options.textureTimeoutMs??30000;this.initialLivery=CONCORDE_LIVERIES.includes(options.initialLivery)?options.initialLivery:'CONCORDE_BAW';this.disposed=false;this.loading=false;this.loaded=false;
  this.setCabinTime=()=>{}; // no generated cabin-window lights
 }
 async load(){
  if(this.disposed||this.loading||this.loaded)throw Error('Concorde already loading, loaded or disposed');
  this.loading=true;
  try{
   const response=await fetch(ROOT+'concorde.ac');if(!response.ok)throw Error(`Concorde mesh HTTP ${response.status}`);
   const source=await response.text();if(this.disposed)throw Error('Concorde load cancelled');
   const model=parseAC(exteriorAC(source),'../concorde/');this.native.add(model);this.model=model;
   // These are exactly the livery targets in the FlightGear model definition.
   this.paintMaterials=[];
   for(const name of ['Hull','Wing','Upperrudder','Lowerrudder','Nose_0','Nose_1']){
    const o=model.getObjectByName(name);if(!o)throw Error(`Concorde mesh missing: ${name}`);
    o.traverse(m=>{if(m.isMesh&&m.userData.texture==='concorde.png')this.paintMaterials.push(...[m.material].flat());});
   }
   if(!this.paintMaterials.length)throw Error('Concorde livery targets missing');
   this.bawTexture=this.paintMaterials[0].map;
   const nose=group(model,['Nose_0','Nose_1'],'concorde-nose');
   const visor=group(model,['Screen_0','Screen_1'],'concorde-visor');
   this.nose=group(model,[],'concorde-nose-assembly');this.nose.add(nose,visor);this.visor=visor;
   this.frontGear=group(model,['Fwheels','Fhub','Fstrut','Fram'],'concorde-front-gear');
   this.mainGear=['L','R'].map(side=>group(model,[side+'mainwheels',side+'mainwheels2',side+'mainhub',side+'piston',side+'Mainstrut',side+'MainPiston',side+'ActuatingPiston'],'concorde-'+side+'-gear'));
   this.tailGear=group(model,['Tailwheels','Tailstrut','Tailram'],'concorde-tail-gear');
   this.mainWell=['L','R'].map(side=>group(model,[side+'MainCylinder',side+'ActuatingCylinder',side+'mainram',side+'MainActuator'],'concorde-'+side+'-well'));
   this.wheels=[['Fwheels',-12.123,-3.646,.405],['Lmainwheels',4.49,-3.461,.61],['Lmainwheels2',6.243,-3.478,.61],['Rmainwheels',4.49,-3.461,.61],['Rmainwheels2',6.243,-3.478,.61]].map(([name,x,y,radius])=>({object:model.getObjectByName(name),center:fg(x,0,y),radius,phase:0}));
   this.elevons=['L','R'].map(side=>({
    outer:group(model,[side+'Oailaron',side+'Mailaron'],'concorde-'+side+'-outer-elevons'),
    inner:group(model,[side+'Iailaron'],'concorde-'+side+'-inner-elevon'),
    axis:fg(13.992,side==='L'?-6.746:6.746,-.303).sub(fg(14.008,side==='L'?-12.036:12.036,-.852)).normalize(),
    center:fg(14.008,side==='L'?-12.036:12.036,-.852),side,
   }));
   this.rudder=group(model,['Upperrudder','Lowerrudder'],'concorde-rudder');
   this.nozzles=Array.from({length:4},(_,i)=>({
    top:group(model,['NozzleTop'+(i+1)],'concorde-nozzle-top-'+(i+1)),
    bottom:group(model,['NozzleBottom'+(i+1)],'concorde-nozzle-bottom-'+(i+1)),
   }));
   this.doors=[
    makeDoor(model,'LOdoorclosed',[4.904,-3.912,-.425],[6.521,-3.915,-.441]),
    makeDoor(model,'ROdoorclosed',[4.904,3.897,-.425],[6.521,3.9,-.441]),
    makeDoor(model,'LIdoorclosed',[4.257,-.124,-1.041],[6.32,-.127,-1.02]),
    makeDoor(model,'RIdoorclosed',[4.257,.109,-1.041],[6.32,.112,-1.02]),
    makeDoor(model,'OFLbigdoor',[-16.135,-.605,-.737],[-12.299,-.635,-.743]),
    makeDoor(model,'OFRbigdoor',[-16.135,.605,-.737],[-12.299,.635,-.743]),
    makeDoor(model,'OFlsmalldoor',[-12.268,-.637,-.743],[-11.454,-.64,-.748]),
    makeDoor(model,'OFRsmalldoor',[-12.268,.637,-.743],[-11.454,.64,-.748]),
   ];
   // Alternative open-door meshes are not used in the upstream configuration.
   for(const name of ['OLImaindoor','OLOmaindoor','ORImaindoor','OROmaindoor'])model.getObjectByName(name).visible=false;
   for(const name of ['Front_1','Screen_1','Side','Cabin'])model.getObjectByName(name)?.traverse(o=>{
    if(o.isMesh)for(const m of [o.material].flat()){m.color.set(0x263e50);m.roughness=.22;m.metalness=.15;}
   });
   await waitTextures(model,this.textureTimeoutMs,this);
   // Source model is in metres, nose at -X. Aircraft.native turns it to +X.
   this.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(this.root);
   this.contact=-box.min.y;this.dimensions=box.getSize(new T.Vector3());this.rawDimensions=this.dimensions.clone();
   this.wingtipPoints=[new T.Vector3(-13.4,-.7,-12.24),new T.Vector3(-13.4,-.7,12.24)];
   // Centres of the four upstream nozzle meshes in aircraft-root coordinates.
   this.enginePoints=[-6.12,-4.78,4.78,6.11].map(z=>new T.Vector3(-15.38,-.9,z));
   this.wheelContacts=[new T.Vector3(-5.35,-this.contact,-3.7),new T.Vector3(-5.35,-this.contact,3.7),new T.Vector3(12.12,-this.contact,0)];
   for(const [p,color] of [[this.wingtipPoints[0],0xff3333],[this.wingtipPoints[1],0x33ff99],[new T.Vector3(-14,1,0),0xff4422]]){
    const m=new T.Mesh(new T.SphereGeometry(.12,8,8),new T.MeshBasicMaterial({color}));m.position.copy(p);this.root.add(m);this.lights.push(m);
   }
   this.loaded=true;this.update({gear:1,concordeNose:0,lights:true},0);
   if(this.initialLivery!=='CONCORDE_BAW')await this.setLivery(this.initialLivery);
   return this;
  }catch(error){this.dispose();throw error;}finally{this.loading=false;}
 }
 update(s,dt=0){
  super.update(s,dt);if(!this.model)return;
  // Physics exposes visor position as 1 = raised; the mesh animation below
  // uses 1 = retracted. Without an explicit input, lower for a drooped nose.
  const nose=clamp(s.concordeNose??0,0,12.5),visor=s.concordeVisor==null?(nose>0?1:0):1-clamp(s.concordeVisor,0,1);
  hinge(this.nose,fg(-23.2,0,-.43),AXIS_NOSE,-nose);
  hinge(this.visor,fg(-25.72,1.108,0),AXIS_NOSE,9*visor);
  this.visor.position.add(fg(-.7*visor,0,-.25*visor));
  const gear=clamp(s.gear??1,0,1),retract=interpolate(leg,gear),door=interpolate(doors,gear);
  hinge(this.frontGear,fg(-12.133,0,-.65),AXIS_NOSE,97*retract);
  hinge(this.mainGear[0],fg(0,-3.731,-.246),AXIS_GEAR,87*retract);
  hinge(this.mainGear[1],fg(0,3.731,-.246),AXIS_GEAR,-87*retract);
  hinge(this.tailGear,fg(22.88,0,.041),AXIS_NOSE,-50*retract);
  for(const g of [this.frontGear,...this.mainGear,...this.mainWell,this.tailGear])g.visible=gear>.001;
  const [lo,ro,li,ri,fl,fr,sl,sr]=this.doors;
  for(const [d,angle] of [[lo,-85.5*(1-retract)],[ro,85.5*(1-retract)],[li,81.4*door],[ri,-81.4*door],[fl,74*(1-door)],[fr,-74*(1-door)],[sl,74*retract],[sr,-74*retract]])hinge(d.object,d.center,d.axis,angle);
  fl.object.visible=fr.object.visible=gear>0&&gear<1;sl.object.visible=sr.object.visible=gear>0;
  for(const name of ['Fucdclosed'])this.model.getObjectByName(name).visible=gear<=0||gear>=1;
  this.model.getObjectByName('Fsucdclosed').visible=gear<=0;
  this.model.getObjectByName('Taildoorclosed').visible=gear<=.17;
  for(const name of ['Littledoorleft','Littledoorright','Taildoorfront'])this.model.getObjectByName(name).visible=gear>.17;
  this.model.getObjectByName('OFlegdoor').visible=gear>0;
  if(s.onGround&&dt>0)for(const wheel of this.wheels){
   wheel.phase=(wheel.phase-(s.speed||0)*dt/wheel.radius)%(2*Math.PI);
   hinge(wheel.object,wheel.center,AXIS_NOSE,wheel.phase/DEG);
  }
  const elevator=clamp(s.elevator??0,-1,1),aileron=clamp(s.aileron??0,-1,1);
  for(const e of this.elevons){
   const isLeft=e.side==='L';
   hinge(e.outer,e.center,e.axis,22.5*clamp((isLeft?elevator:-elevator)+aileron,-1,1));
   hinge(e.inner,fg(13.965,0,-.182),AXIS_NOSE,8*clamp(elevator+(isLeft?aileron:-aileron),-1,1));
  }
  hinge(this.rudder,fg(23.085,0,0),AXIS_RUDDER,29*clamp(s.rudder??0,-1,1));
  // Upstream bucket angles: 21° at takeoff, 0° at Mach 1.1, 73° in reverse;
  // the XML turns each half by 4° + half the bucket angle.
  const forward=21*(1-clamp(((s.mach??0)-.55)/.55,0,1));
  const bucket=T.MathUtils.lerp(forward,73,clamp(s.reverse??0,0,1)),angle=4+bucket/2;
  for(const nozzle of this.nozzles){
   hinge(nozzle.top,fg(15.603,0,-.949),AXIS_NOSE,angle);
   hinge(nozzle.bottom,fg(15.603,0,-.949),AXIS_NOSE,-angle);
  }
 }
 async setLivery(id){
  if(!CONCORDE_LIVERIES.includes(id))return false;
  if(!this.loaded||this.disposed)throw Error('Concorde is not ready');
  const request=++this.liveryRequest;
  if(id===this.livery)return true;
  if(id==='CONCORDE_BAW'){
   this.paintMaterials.forEach(m=>{m.map=this.bawTexture;m.needsUpdate=true;});this.livery=id;return true;
  }
  let texture;
  try{texture=await loadTexture(ROOT+'AF.png',this.textureTimeoutMs);}catch(error){if(request!==this.liveryRequest||this.disposed)return false;throw error;}
  if(request!==this.liveryRequest||this.disposed){texture.dispose();return false;}
  const old=this.afTexture;this.afTexture=texture;
  this.paintMaterials.forEach(m=>{m.map=texture;m.needsUpdate=true;});this.livery=id;old?.dispose();return true;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.liveryRequest++;
  const geometries=new Set(),materials=new Set();this.root.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of [o.material].flat())if(m)materials.add(m);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.afTexture?.dispose();this.root.removeFromParent();
 }
}
