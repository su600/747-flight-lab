// Space Shuttle orbiter exterior from FlightGear's SpaceShuttle aircraft
// (GPL-2.0; derived from NASA 3D work by Gijs de Rooy and contributors).
// Source assets are modelled with the payload bay open and the landing gear in
// a separate AC file, so this loader closes the bay doors, drives the gear,
// gear doors, speed brake and drag chute. See assets/space-shuttle/CREDITS.txt.
import * as T from 'three';
import {Aircraft, parseAC} from './aircraft.js';

// parseAC resolves textures relative to /assets/aircraft/, so this relative
// prefix normalises to /assets/space-shuttle/Models/.
const AC_FOLDER='../space-shuttle/Models/';
const ROOT='/assets/space-shuttle/Models/';
const FILES={body:'shuttle_o2.ac',gear:'LandingGears-slim.ac',chute:'DragChute.ac'};
// FlightGear animation XML is Z-up while the AC3D meshes are Y-up.
const fg=(x,y,z)=>new T.Vector3(x,z,-y);
const DEG=Math.PI/180;
const REAL_LENGTH=37.2;      // metres, NASA reference
const CHUTE_DIAMETER=12.19;  // 40 ft nominal
const CHUTE_ATTACH=new T.Vector3(16.2,1.6,0);   // native frame: +X is the tail
// The model is authored with the payload bay open; -171 deg closes it.
const BAY_CLOSED=-171;
const BAY_DOORS=[
 {name:'payload-bay-door-left',center:fg(-2.2671,-2.552,-1.52),sign:1},
 {name:'payload-bay-door-right',center:fg(-2.2672,2.552,-1.52),sign:-1},
];
const GEAR_DOORS=[
 {name:'GearDoorL',center:fg(2.40147,-4.22895,-5.10298),axis:fg(-1,0,0)},
 {name:'GearDoorR',center:fg(2.40147,4.22895,-5.10298),axis:fg(1,0,0)},
 {name:'NoseDoorL',center:fg(-17.00619,-0.52466,-4.90111),axis:fg(-90,0,22)},
 {name:'NoseDoorR',center:fg(-17.00619,0.52466,-4.90111),axis:fg(90,0,-22)},
];
// Split rudder speed brake: both halves hinge on the tail centreline.
const SPEED_BRAKE_CENTER=fg(14.7676,0.0077,5.1456);
const SPEED_BRAKE_AXIS=fg(8,0.5,15);
const SPEED_BRAKE_OPEN=-49.3;

// Rotate an object about an arbitrary hinge line without moving its geometry.
function hinge(object,center,axis,degrees){
 if(!object)return;
 const q=new T.Quaternion().setFromAxisAngle(axis.clone().normalize(),degrees*DEG);
 object.quaternion.copy(q);
 object.position.copy(center).sub(center.clone().applyQuaternion(q));
}
// parseAC starts texture loads asynchronously; wait so the model never renders untextured.
async function waitForTextures(root,timeoutMs=60000){
 const maps=[];
 root.traverse(o=>{if(o.isMesh){for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m.map)maps.push(m.map);}});
 const pending=[...new Set(maps)].filter(t=>!t.image);
 if(!pending.length)return;
 await new Promise((resolve,reject)=>{
  const started=Date.now();
  const timer=setInterval(()=>{
   if(pending.every(t=>t.image)){clearInterval(timer);resolve();}
   else if(Date.now()-started>timeoutMs){clearInterval(timer);reject(Error('航天飞机贴图载入超时'));}
  },80);
 });
}

export class SpaceShuttle extends Aircraft{
 constructor(options={}){
  super(options);
  this.type='shuttle';
  // The FlightGear AC3D has the nose toward -X, so the base class's half-turn stays.
  this.hasDragChute=true;
  this.setCabinTime=()=>{};
  this.wheels=[];this.wheelContacts=[];this.wingtipPoints=[];
  this.livery='NASA_SHUTTLE';
 }
 async load(){
  const [bodyText,gearText,chuteText]=await Promise.all(Object.values(FILES).map(async name=>{
   const response=await fetch(ROOT+name);
   if(!response.ok)throw Error(`航天飞机资源 ${name}：HTTP ${response.status}`);
   return response.text();
  }));
  const body=parseAC(bodyText,AC_FOLDER);
  const gear=parseAC(gearText,AC_FOLDER);
  const chute=parseAC(chuteText,AC_FOLDER);
  this.body=body;this.gearGroup=gear;this.chuteModel=chute;
  // Close the payload bay doors for the landing configuration.
  for(const door of BAY_DOORS){
   const object=body.getObjectByName(door.name);
   if(object)hinge(object,door.center,new T.Vector3(1,0,0),door.sign*BAY_CLOSED);
  }
  this.gearDoors=GEAR_DOORS.map(d=>({...d,object:body.getObjectByName(d.name)}));
  this.speedBrakes=['SpeedBrakeL','SpeedBrakeR'].map((name,i)=>({
   object:body.getObjectByName(name),
   center:SPEED_BRAKE_CENTER,
   axis:i===0?SPEED_BRAKE_AXIS:SPEED_BRAKE_AXIS.clone().negate(),
  }));
  this.native.add(body,gear);
  // The chute model points up from its attach point; turn it aft (the native group's
  // +X is the tail) and scale it to the real 40 ft canopy diameter.
  const chutePivot=new T.Group();
  chutePivot.rotation.z=-Math.PI/2;
  const chuteScale=CHUTE_DIAMETER/8.43;
  chute.scale.setScalar(chuteScale);
  chutePivot.add(chute);
  chutePivot.position.copy(CHUTE_ATTACH);
  this.chuteRoot=chutePivot;this.chuteCanopy=chute;
  this.native.add(chutePivot);
  await waitForTextures(this.native);
  // Match NASA's published length; both the body and the gear sit in one frame.
  this.native.scale.setScalar(REAL_LENGTH/36.688);
  this.root.updateMatrixWorld(true);
  // Measure the fuselage and gear only: the stowed chute trails far aft and would
  // otherwise inflate the reported length.
  const box=new T.Box3();
  box.expandByObject(body);box.expandByObject(gear);
  this.contact=-box.min.y;
  this.dimensions=box.getSize(new T.Vector3());
  this.wingtipPoints=this.findWingtips(body).map(p=>p.applyMatrix4(this.native.matrix));
  this.wheelContacts=this.findWheelContacts(gear);
  this.buildLights();
  this.update({gear:1,chute:0,speed:0,spoiler:0,lights:true,time:0},0);
  return this;
 }
 findWingtips(body){
  // Outermost vertices on each side near the wing trailing edge.
  const half=11.93,eps=.25;
  const port=[],starboard=[];
  body.traverse(o=>{
   if(!o.isMesh)return;const p=o.geometry.attributes.position;
   for(let i=0;i<p.count;i++){const z=p.getZ(i);
    if(Math.abs(z)>half-eps){(z<0?port:starboard).push(new T.Vector3(p.getX(i),p.getY(i),z));}
   }
  });
  const centreOf=list=>{
   if(!list.length)return null;
   const v=new T.Vector3();for(const p of list)v.add(p);return v.multiplyScalar(1/list.length);
  };
  const p=centreOf(port)||new T.Vector3(-9,0,-half);
  const st=centreOf(starboard)||new T.Vector3(-9,0,half);
  return [p,st];
 }
 findWheelContacts(gear){
  // Lowest vertices of the gear model cluster at the tyre contact patches.
  const points=[];let minY=Infinity;
  gear.traverse(o=>{
   if(!o.isMesh)return;const p=o.geometry.attributes.position;
   for(let i=0;i<p.count;i++){const y=p.getY(i);if(y<minY)minY=y;points.push(new T.Vector3(p.getX(i),y,p.getZ(i)));}
  });
  const low=points.filter(p=>p.y<minY+.15);
  const left=low.filter(p=>p.z<0),right=low.filter(p=>p.z>=0);
  const mid=list=>{const v=new T.Vector3();for(const p of list)v.add(p);return v.multiplyScalar(1/Math.max(1,list.length));};
  const m=this.native.matrix;
  if(!left.length||!right.length)return [new T.Vector3(0,-this.contact,-3.4),new T.Vector3(0,-this.contact,3.4)];
  return [mid(left).applyMatrix4(m),mid(right).applyMatrix4(m)];
 }
 buildLights(){
  const red=new T.MeshBasicMaterial({color:0xff3333});
  const green=new T.MeshBasicMaterial({color:0x33ff99});
  const beacon=new T.MeshBasicMaterial({color:0xff7a2e});
  const add=(p,mat,r)=>{const m=new T.Mesh(new T.SphereGeometry(r,8,8),mat);m.position.copy(p);this.root.add(m);this.lights.push(m);return m;};
  add(this.wingtipPoints[0],red,.14);
  add(this.wingtipPoints[1],green,.14);
  add(new T.Vector3(-13.5,8.6,0),beacon,.12);
 }
 setLivery(){
  // One built-in NASA scheme ships with the model.
  this.livery='NASA_SHUTTLE';return true;
 }
 update(s,dt=0){
  const gear=Math.max(0,Math.min(1,s.gear??1));
  const chute=Math.max(0,Math.min(1,s.chute??0));
  const brake=Math.max(0,Math.min(1,s.spoiler??0));
  // Landing gear slides up into the wheel wells as it retracts.
  this.gearGroup.visible=gear>.02;
  this.gearGroup.position.y=(1-gear)*4.6;
  for(const d of this.gearDoors)hinge(d.object,d.center,d.axis,90*gear);
  for(const b of this.speedBrakes)hinge(b.object,b.center,b.axis,SPEED_BRAKE_OPEN*brake);
  // Drag chute: inflate away from the attach point, trailing aft with a slight sway.
  this.chuteRoot.visible=chute>.01;
  if(this.chuteRoot.visible){
   const t=s.time||0;
   this.chuteCanopy.scale.setScalar((CHUTE_DIAMETER/8.43)*(.3+.7*chute));
   this.chuteRoot.rotation.set(0,Math.sin(t*1.1)*.04*chute,-.10*chute+Math.sin(t*1.6)*.03*chute);
  }
  this.lights.forEach((m,i)=>m.visible=s.lights!==false&&(i<2||((s.time||0)%1.2)<.17));
 }
}
