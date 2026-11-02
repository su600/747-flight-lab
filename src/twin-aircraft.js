import * as T from 'three';
import {Aircraft} from './aircraft.js';
import {addModelPaint} from './model-paint.js';

// Original, metre-scale illustrative widebody meshes. These are not manufacturer CAD.
const SPECS={a330:{length:63.7,span:60.3,radius:2.82,engines:2,tail:8.5,model:'AIRBUS A330-300'},b777:{length:73.9,span:64.8,radius:3.1,engines:2,tail:9.5,model:'BOEING 777-300ER'}};
export class TwinAircraft extends Aircraft {
 constructor(type){super();this.type=type;this.spec=SPECS[type];this.parts={gear:[],wheels:[],flaps:[],ailerons:[],elevators:[],spoilers:[],reversers:[],doors:[],fans:[],rudders:[]};}
 async load(){
  const s=this.spec, L=s.length, span=s.span, r=s.radius;
  const white=new T.MeshStandardMaterial({color:0xe6e9e9,roughness:.36,metalness:.18});
  const wingmat=new T.MeshStandardMaterial({color:0xb5bfc2,roughness:.46,metalness:.32,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({color:0x172b37,roughness:.33,metalness:.3});
  const tyre=new T.MeshStandardMaterial({color:0x202428,roughness:.9});
  const add=(g,m,parent=this.root)=>{const mesh=new T.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  // Lathe uses a smooth series of measured proportions, with separate 777/A330 noses.
  const pts=[[0,-L*.5],[r*.3,-L*.47],[r*.75,-L*.42],[r,-L*.34],[r,-L*.20],[r,L*.30],[r*.97,L*.39],[r*.78,L*.445],[r*.38,L*.49],[0,L*.5]].map(([rad,x])=>new T.Vector2(rad,x));
  const body=add(new T.LatheGeometry(pts,48),white);body.rotation.z=-Math.PI/2;body.name='original-fuselage';
  const polygon=(points,thick,mat,parent=this.root)=>{const sh=new T.Shape();points.forEach(([x,z],i)=>i?sh.lineTo(x,z):sh.moveTo(x,z));sh.closePath();const geo=new T.ExtrudeGeometry(sh,{depth:thick,bevelEnabled:false});geo.rotateX(Math.PI/2);return add(geo,mat,parent);};
  // Swept tapered wings with raked 777 tips and upward A330 winglets.
  for(const sign of [-1,1]){
   const wing=new T.Group();wing.scale.z=sign;this.root.add(wing);
   polygon([[9,2.1],[-7,2.1],[-19,span*.48],[-18,span*.5],[-10,span*.47]],.42,wingmat,wing);
   if(this.type==='a330'){
    const tip=add(new T.BoxGeometry(1.7,3.3,.3),white,wing);tip.position.set(-18,1.3,span*.493);tip.rotation.x=.22;
   }
   const flap=add(new T.BoxGeometry(8,.22,4),wingmat,wing);flap.position.set(-8,-.25,12.5);this.parts.flaps.push(flap);
   const aileron=add(new T.BoxGeometry(5,.18,2.5),wingmat,wing);aileron.position.set(-15,-.15,span*.38);this.parts.ailerons.push([aileron,sign]);
   // Stabilizers and vertical fin are separate solid lifting surfaces.
   polygon([[-L*.38,1],[-L*.45,1],[-L*.48,11],[-L*.44,11]],.25,wingmat,wing).position.y=1;
   // A narrow trailing-edge elevator, hinged along the swept stabilizer.
   const elevator=new T.Group();elevator.position.set(-L*.432,1.03,1);wing.add(elevator);
   elevator.userData.axis=new T.Vector3(-L*.028,0,10).normalize();
   polygon([[0,0],[-L*.018,0],[-L*.048,10],[-L*.028,10]],.08,wingmat,elevator);
   this.parts.elevators.push(elevator);
   // Panels sit on the wing upper surface, hinged at their forward edge.
   for(const [x,z] of [[-3,10],[-6.5,17]]){
    const spoiler=new T.Group();spoiler.position.set(x,.04,z);wing.add(spoiler);
    const panel=add(new T.BoxGeometry(2.4,.08,4),wingmat,spoiler);panel.position.x=-1.2;
    this.parts.spoilers.push(spoiler);
   }
   const engineX=1, engineZ=span*.22, engineR=this.type==='b777'?2.15:1.75;
   const pylon=add(new T.BoxGeometry(5,2,.8),wingmat,wing);pylon.position.set(engineX,-1,engineZ);
   // Translating aft sleeve with a darker fixed inner duct revealed during reverse.
   const nacelle=add(new T.CylinderGeometry(engineR,engineR*.91,4.6,32,1,true),white,wing);nacelle.rotation.z=-Math.PI/2;nacelle.position.set(engineX+1,-2.3,engineZ);
   const duct=add(new T.CylinderGeometry(engineR*.85,engineR*.85,3.2,32,1,true),dark,wing);duct.rotation.z=-Math.PI/2;duct.position.set(engineX-1.6,-2.3,engineZ);
   const sleeve=add(new T.CylinderGeometry(engineR*.91,engineR*.87,2,32,1,true),white,wing);sleeve.rotation.z=-Math.PI/2;sleeve.position.set(engineX-2.3,-2.3,engineZ);sleeve.userData.closedX=sleeve.position.x;this.parts.reversers.push(sleeve);
   const intake=add(new T.CylinderGeometry(engineR*.82,engineR*.82,.12,32),dark,wing);intake.rotation.z=-Math.PI/2;intake.position.set(engineX+3.33,-2.3,engineZ);
   const fan=new T.Group();fan.position.set(engineX+3.42,-2.3,engineZ);wing.add(fan);this.parts.fans.push(fan);
   for(let i=0;i<12;i++){const blade=add(new T.BoxGeometry(.06,engineR*.64,.18),wingmat,fan);const a=i*Math.PI/6;blade.position.set(0,Math.cos(a)*engineR*.43,Math.sin(a)*engineR*.43);blade.rotation.x=a;}
   const hub=add(new T.SphereGeometry(.35,12,8),wingmat,fan);hub.scale.x=1.5;
  }
  // Fin geometry in XY, centred near tail.
  const finShape=new T.Shape();finShape.moveTo(-L*.43,1);finShape.lineTo(-L*.48,1);finShape.lineTo(-L*.47,s.tail);finShape.lineTo(-L*.39,s.tail);finShape.lineTo(-L*.30,1);finShape.closePath();
  const fin=add(new T.ExtrudeGeometry(finShape,{depth:.38,bevelEnabled:false}),white);fin.position.z=-.19;
  const rud=add(new T.BoxGeometry(1.1,s.tail*.65,.22),wingmat);rud.position.set(-L*.468,s.tail*.52,0);this.parts.rudders.push(rud);
  // Two rows of cabin windows would imply a double deck; these types have one.
  const windows=new T.InstancedMesh(new T.SphereGeometry(.17,8,6),dark,2*42);const matrix=new T.Matrix4();let wi=0;
  for(const sign of [-1,1])for(let i=0;i<42;i++){const x=-L*.32+i*L*.017;matrix.makeScale(1,.8,.22);matrix.setPosition(x,1,sign*(r-.05));windows.setMatrixAt(wi++,matrix);}this.root.add(windows);
  for(const sign of [-1,1]){const glass=add(new T.BoxGeometry(3.2,.7,.08),dark);glass.position.set(L*.435,1.15,sign*r*.69);glass.rotation.y=sign*.23;}
  // Cosmetic lower-deck cargo door on the right, curved to the cylindrical hull.
  // The dark patch represents the opening; the original hull remains behind it.
  const doorX=L*.23, top=-.14, bottom=-.72;
  const hullPatch=(width,a,b,radius)=>{
   const vertices=[],indices=[],steps=12;
   for(let i=0;i<=steps;i++){const angle=T.MathUtils.lerp(a,b,i/steps);for(const x of [-width/2,width/2])vertices.push(x,radius*Math.sin(angle),radius*Math.cos(angle));}
   for(let i=0;i<steps;i++){const n=2*i;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
  };
  const openingMat=new T.MeshStandardMaterial({color:0x26343a,roughness:.8,side:T.DoubleSide});
  const opening=add(hullPatch(3.8,top,bottom,r+.012),openingMat);opening.position.x=doorX;
  const door=new T.Group();door.position.set(doorX,(r+.03)*Math.sin(top),(r+.03)*Math.cos(top));this.root.add(door);
  const doorPanel=add(hullPatch(3.72,top,bottom,r+.03),white,door);doorPanel.position.set(0,-door.position.y,-door.position.z);
  this.parts.doors.push(door);
  // Nose folds forward, mains fold and slide inboard into the belly. This is
  // an illustrative mechanism, not the actual aircraft's linkage or gear doors.
  const wheelgeo=new T.CylinderGeometry(.68,.68,.38,16);wheelgeo.rotateX(Math.PI/2);
  for(const [x,z,count] of [[L*.32,0,2],[-3,-4.2,this.type==='b777'?6:4],[-3,4.2,this.type==='b777'?6:4]]){
   const g=new T.Group();g.position.set(x,-2,z);g.userData.side=Math.sign(z);this.root.add(g);this.parts.gear.push(g);
   const strut=add(new T.CylinderGeometry(.22,.25,2.8,10),wingmat,g);strut.position.y=-1.3;
   for(let i=0;i<count;i++){const wheel=add(wheelgeo,tyre,g);wheel.position.set((Math.floor(i/2)-(count/2-1)/2)*1.25,-3,(i%2?1:-1)*.52);this.parts.wheels.push(wheel);}
  }
  addModelPaint(this,{sideZ:r+.08,sideY:-.3,tailX:-L*.43,tailY:s.tail*.64,length:L*.63});
  this.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(this.root);this.contact=-box.min.y;this.dimensions=box.getSize(new T.Vector3());this.rawDimensions=this.dimensions.clone();
  for(const [pos,color] of [[[-18,0,-span/2],0xff3333],[[-18,0,span/2],0x33ff99],[[0,2.8,0],0xff4422]]){const m=add(new T.SphereGeometry(.18,8,8),new T.MeshBasicMaterial({color}));m.position.fromArray(pos);this.lights.push(m);}
  this.update({gear:1,flaps:0,speed:0,engine:0,lights:true},0);return this;
 }
 update(s,dt){
  super.update(s,dt);
  const gear=T.MathUtils.clamp(s.gear??1,0,1),retract=1-gear;
  for(const g of this.parts.gear){
   const side=g.userData.side;
   g.rotation.z=side?0:retract*Math.PI/2;
   g.rotation.x=side*retract*70*Math.PI/180;
   g.position.y=-2+(side?1.6:.65)*retract;
   if(side)g.position.z=side*(4.2-2*retract);
  }
  if(s.onGround)for(const wheel of this.parts.wheels)wheel.rotation.z-=(s.speed||0)*dt/.68;
  for(const f of this.parts.flaps)f.rotation.z=-(s.flaps||0)*Math.PI/180;
  for(const [a,sign] of this.parts.ailerons)a.rotation.z=sign*(s.aileron||0)*.3;
  for(const e of this.parts.elevators)e.quaternion.setFromAxisAngle(e.userData.axis,T.MathUtils.clamp(s.elevator||0,-1,1)*.35);
  for(const p of this.parts.spoilers)p.rotation.z=-T.MathUtils.clamp(s.spoiler||0,0,1)*.8;
  for(const sleeve of this.parts.reversers)sleeve.position.x=sleeve.userData.closedX-T.MathUtils.clamp(s.reverse||0,0,1)*.85;
  for(const door of this.parts.doors)door.rotation.x=-T.MathUtils.clamp(s.door||0,0,1)*1.25;
  for(const r of this.parts.rudders)r.rotation.y=(s.rudder||0)*.3;
  for(const f of this.parts.fans)f.rotation.x+=(s.engine||0)*dt*18;
 }
}
