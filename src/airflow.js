import * as T from 'three';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const D2R=Math.PI/180;
const Y=new T.Vector3(0,1,0);
const fg=(x,y,z)=>new T.Vector3(x,z,-y);

// Round-robin particle pool drawn as soft points, with per-particle colour + alpha.
class Pool{
 constructor(scene,{count,size,color,additive=false,map=null}){
  this.n=count;this.next=0;
  this.pos=new Float32Array(count*3);this.col=new Float32Array(count*4);
  this.vel=new Float32Array(count*3);this.age=new Float32Array(count).fill(1e3);this.life=new Float32Array(count).fill(1);this.alpha=new Float32Array(count);
  for(let i=0;i<count;i++){this.col.set([color[0],color[1],color[2],0],i*4);}
  this.rgb=color;
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(this.pos,3));g.setAttribute('color',new T.BufferAttribute(this.col,4));
  this.points=new T.Points(g,new T.PointsMaterial({size,map,vertexColors:true,transparent:true,depthWrite:false,blending:additive?T.AdditiveBlending:T.NormalBlending}));
  this.points.frustumCulled=false;this.points.renderOrder=10;scene.add(this.points);
 }
 emit(p,v,life,alpha){
  const i=this.next;this.next=(i+1)%this.n;
  this.pos.set([p.x,p.y,p.z],i*3);this.vel.set(v?[v.x,v.y,v.z]:[0,0,0],i*3);this.age[i]=0;this.life[i]=life;this.alpha[i]=alpha;
 }
 update(dt){
  let live=false;
  for(let i=0;i<this.n;i++){
   const age=this.age[i]+=dt;
   if(age>=this.life[i]){this.col[i*4+3]=0;continue;}
   live=true;const k=i*3;this.pos[k]+=this.vel[k]*dt;this.pos[k+1]+=this.vel[k+1]*dt;this.pos[k+2]+=this.vel[k+2]*dt;
   const t=age/this.life[i];this.col[i*4+3]=this.alpha[i]*Math.pow(1-t,1.5)*Math.min(1,age*6);
  }
  this.points.visible=live||this.wasLive;this.wasLive=live;
  this.points.geometry.attributes.position.needsUpdate=true;this.points.geometry.attributes.color.needsUpdate=true;
 }
}

function softDot(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.4,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}

// Visible air around the aircraft: wingtip vortices, engine exhaust, high-altitude contrails and
// wind streaks that stream past at flight speed.
export class Airflow{
 constructor(scene,plane){
  this.plane=plane;this.quality=1;this.acc={vortex:0,exhaust:0,contrail:0};
  const dot=softDot();
  this.vortex=new Pool(scene,{count:520,size:3.2,color:[.96,.98,1],map:dot});
  this.exhaust=new Pool(scene,{count:260,size:7,color:[.75,.72,.68],map:dot});
  this.contrail=new Pool(scene,{count:700,size:6,color:[1,1,1],map:dot});
  // Wind streaks: short fading line segments that fly past the camera.
  this.streakN=150;this.streakPos=new Float32Array(this.streakN*6);this.streakCol=new Float32Array(this.streakN*8);this.streakP=Array.from({length:this.streakN},()=>new T.Vector3());
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(this.streakPos,3));g.setAttribute('color',new T.BufferAttribute(this.streakCol,4));
  this.streaks=new T.LineSegments(g,new T.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false}));this.streaks.frustumCulled=false;this.streaks.renderOrder=11;scene.add(this.streaks);
  this.streakSeeded=false;
  // Emitter points in the aircraft's own frame (x nose, y up, z right wing).
  this.engines=[[4.83,-21.23,-1.99],[-2.67,-13.46,-2.60],[-2.67,13.46,-2.60],[4.83,21.23,-1.99]].map(([x,y,z])=>fg(x,y,z).multiply(plane.native.scale).applyAxisAngle(Y,Math.PI));
  this.tips=[new T.Vector3(-14,2.6,-32),new T.Vector3(-14,2.6,32)];
  this.tmp=new T.Vector3();this.dir=new T.Vector3();this.v=new T.Vector3();this.pp=new T.Vector3();
 }
 setQuality(low){this.quality=low?.35:1;}
 respawn(i,planePos,dir,spread){
  const p=this.streakP[i],a=Math.random()*Math.PI*2,r=8+Math.random()*spread;
  // Orthonormal frame around the flight direction.
  const side=this.tmp.set(-dir.z,0,dir.x).normalize(),up=this.v.crossVectors(dir,side);
  p.copy(planePos).addScaledVector(dir,-30+Math.random()*110).addScaledVector(side,Math.cos(a)*r).addScaledVector(up,Math.sin(a)*r);
 }
 update(sim,dt,mode,timeOfDay){
  const plane=this.plane;plane.root.updateMatrixWorld();
  const planePos=this.pp.copy(plane.root.position);
  const heading=(90-sim.heading)*D2R,cg=Math.cos(sim.gamma),dir=this.dir.set(Math.cos(heading)*cg,Math.sin(sim.gamma),Math.sin(heading)*cg).normalize();
  const flying=!sim.onGround&&sim.mode!=='inspect',speed=sim.speed;
  const q=this.quality;
  if(!sim.paused&&dt>0){
   // Wingtip vortices: strongest at high lift (low speed, flaps out, hard turns).
   const lift=clamp((sim.cl-.45)/1.1,0,1)*(flying?1:0)*clamp((speed-45)/30,0,1);
   this.acc.vortex+=dt*70*q*(lift>.05?1:0);
   while(this.acc.vortex>=1){this.acc.vortex--;for(const tip of this.tips){const p=plane.root.localToWorld(this.tmp.copy(tip));this.vortex.emit(p,null,2.6,.1+.4*lift);}}
   // Engine exhaust haze while the engines are working hard at low speed.
   const n1=clamp((sim.engineN1-.55)/.45,0,1),haze=n1*clamp(1-speed/90,0,1)*(sim.mode==='inspect'?0:1);
   this.acc.exhaust+=dt*26*q*haze;
   while(this.acc.exhaust>=1){this.acc.exhaust--;for(const e of this.engines){const p=plane.root.localToWorld(this.tmp.set(e.x-6,e.y,e.z));this.v.copy(dir).multiplyScalar(-(22+Math.random()*14));this.v.y+=1.5+Math.random();this.exhaust.emit(p,this.v,.9,.05+.07*n1);}}
   // Contrails above ~5 km where the air is cold enough.
   const cold=flying?clamp((sim.altitude-4500)/2500,0,1):0;
   this.acc.contrail+=dt*40*q*cold;
   while(this.acc.contrail>=1){this.acc.contrail--;for(const e of this.engines){const p=plane.root.localToWorld(this.tmp.set(e.x-7,e.y,e.z));this.contrail.emit(p,null,9,.5*cold);}}
  }
  this.vortex.update(sim.paused?0:dt);this.exhaust.update(sim.paused?0:dt);this.contrail.update(sim.paused?0:dt);

  // Wind streaks.
  const strength=(flying||speed>55?clamp((speed-40)/70,0,1):0)*(mode==='cockpit'?.5:1)*q;
  const night=timeOfDay==='night',base=(night?.2:timeOfDay==='dusk'?.5:.6)*strength;
  const len=clamp(speed*.1,0,15);
  if(!this.streakSeeded){for(let i=0;i<this.streakN;i++)this.respawn(i,planePos,dir,60);this.streakSeeded=true;}
  const shade=night?.85:.9;
  for(let i=0;i<this.streakN;i++){
   const p=this.streakP[i];
   const rel=this.tmp.copy(p).sub(planePos);
   if(rel.dot(dir)<-60||rel.lengthSq()>150*150)this.respawn(i,planePos,dir,60);
   const k=i*6,c=i*8,on=i<this.streakN*q;
   this.streakPos[k]=p.x;this.streakPos[k+1]=p.y;this.streakPos[k+2]=p.z;
   this.streakPos[k+3]=p.x-dir.x*len;this.streakPos[k+4]=p.y-dir.y*len;this.streakPos[k+5]=p.z-dir.z*len;
   const a=on?base:0;
   this.streakCol.set([shade,shade,1,a,shade,shade,1,0],c);
  }
  this.streaks.geometry.attributes.position.needsUpdate=true;this.streaks.geometry.attributes.color.needsUpdate=true;this.streaks.visible=strength>.02;
 }
}
