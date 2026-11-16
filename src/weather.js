import * as T from 'three';
import {CLOUDS,VISIBILITY,KNOT_MS} from './weather-math.js';
import {cockpitWiperSweepAngle} from './cockpit-view.js';

// Owns the visual weather only; the flight model stores the wind in m/s.
export class Weather{
 constructor(world,scene,sim){
  this.world=world;this.sim=sim;this.cloud='clear';this.rain='off';this.visibility='good';this.low=false;
  world.weather=this;
  this.ground=world.weatherGround.map(m=>({m,color:m.color.clone(),roughness:m.roughness}));
  this.extraClouds=[];
  for(let i=0;i<64;i++){
   const g=world.clouds[i%world.clouds.length].clone();g.position.set(((i%8)-3.5)*3000,1200+(i%3)*130,(Math.floor(i/8)-3.5)*3000);g.scale.setScalar(2.5);g.userData.drift=.7;g.visible=false;scene.add(g);world.clouds.push(g);this.extraClouds.push(g);
  }
  const count=1400,positions=new Float32Array(count*6);this.rainPositions=positions;this.rainCount=count;
  for(let i=0;i<count;i++){const j=i*6;positions[j]=(Math.random()-.5)*140;positions[j+1]=(Math.random()-.5)*80;positions[j+2]=(Math.random()-.5)*140;}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
  this.rainLines=new T.LineSegments(geometry,new T.LineBasicMaterial({color:0xc9dce6,transparent:true,opacity:.48,depthWrite:false,fog:false}));this.rainLines.frustumCulled=false;this.rainLines.visible=false;scene.add(this.rainLines);
  this.canvas=document.createElement('canvas');this.canvas.id='weatherWindshield';document.body.appendChild(this.canvas);this.ctx=this.canvas.getContext('2d');this.drops=[];this.dropBudget=0;this.lastSweep=null;
  this.windHud=document.getElementById('windHud');
 }
 applyWorld(){
  const w=this.world,p=CLOUDS[this.cloud],night=w.time==='night',dusk=w.time==='dusk';
  w.sun.intensity*=p.sun*(this.rain==='off'?1:.86);w.hemi.intensity*=p.hemi*(this.rain==='off'?1:.92);
  const u=w.sky.material.uniforms;
  if(this.cloud!=='clear'){
   const amount=this.cloud==='overcast'?.8:.3;
   // Blend the daytime blue multiplier towards neutral; retain dusk's warm sky.
   if(!night&&!dusk)u.skyTint.value.lerp(new T.Vector3(.85,.88,.92),amount);
   else if(dusk)u.skyTint.value.lerp(new T.Vector3(.88,.9,.95),amount*.5);
   w.scene.fog.color.lerp(new T.Color(night?0x273342:dusk?0xa89890:0xa2adb4),amount);
   if(night)w.scene.background.lerp(new T.Color(0x26303b),amount*.35);
  }
  if(VISIBILITY[this.visibility])w.scene.fog.density=VISIBILITY[this.visibility];
  this.updateCloudVisibility();
  if(this.cloud==='overcast')w.cloudMat.color.lerp(new T.Color(night?0x3c4654:dusk?0xb7a49d:0x9aa5ae),.65);
  const wet=this.rain==='heavy'?.65:this.rain==='light'?.82:1;
  for(const {m,color,roughness} of this.ground){m.color.copy(color).multiplyScalar(wet);m.roughness=wet===1?roughness:Math.max(.35,roughness-.22);}
 }
 set(options){
  if(options.cloud in CLOUDS)this.cloud=options.cloud;
  if(['off','light','heavy'].includes(options.rain))this.rain=options.rain;
  // Rain needs cloud: a clear sky always means no rain.
  if(this.cloud==='clear')this.rain='off';
  if(options.visibility in VISIBILITY)this.visibility=options.visibility;
  if(options.windDirection!==undefined)this.sim.windDirection=((Number(options.windDirection)||0)%360+360)%360;
  if(options.windKnots!==undefined)this.sim.windSpeed=Math.max(0,Math.min(40,Number(options.windKnots)||0))*KNOT_MS;
  // setTime establishes the unmodified baseline before applying weather, avoiding cumulative dimming.
  this.world.setTime(this.world.time);
 }
 updateCloudVisibility(){this.extraClouds.forEach((g,i)=>g.visible=this.cloud==='overcast'?(!this.low||i%2===0):this.cloud==='partly'&&i%3===0&&(!this.low||i%2===0));}
 setQuality(low){this.low=low;this.updateCloudVisibility();}
 update(dt,camera,mode,sim){
  const active=this.rain!=='off',count=active?Math.floor(this.rainCount*(this.rain==='light'?.4:1)*(this.low?.35:1)):0;
  this.rainLines.visible=active;this.rainLines.geometry.setDrawRange(0,count*2);
  if(active){
   const a=this.rainPositions;
   for(let i=0;i<count;i++){const j=i*6;a[j+1]-=dt*32;if(a[j+1]<-40)a[j+1]+=80;a[j+3]=a[j]-.15;a[j+4]=a[j+1]+2.1;a[j+5]=a[j+2];}
   this.rainLines.position.copy(camera.position);this.rainLines.geometry.attributes.position.needsUpdate=true;
  }
  this.updateDrops(dt,mode==='cockpit'&&active,sim);
  this.windHud.hidden=sim.windSpeed<=0;
  if(!this.windHud.hidden){this.windHud.querySelector('i').style.transform=`rotate(${sim.windDirection+180-sim.heading}deg)`;this.windHud.querySelector('span').textContent=`风 ${Math.round(sim.windDirection)}° · ${Math.round(sim.windSpeed/KNOT_MS)} kt / ${sim.windSpeed.toFixed(1)} m/s`;}
 }
 updateDrops(dt,visible,sim){
  this.canvas.hidden=!visible;if(!visible){this.drops.length=0;this.lastSweep=null;return;}
  const c=this.canvas,ctx=this.ctx,w=window.innerWidth,h=window.innerHeight;
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  const sweep=cockpitWiperSweepAngle(sim.time)/50;
  if(sim.wipers&&this.lastSweep!==null){
   const lo=Math.min(sweep,this.lastSweep),hi=Math.max(sweep,this.lastSweep);
   // Approximate the projected arcs of the two cockpit blades, using their
   // shared sweep angle; drops elsewhere on the glass are left untouched.
   this.drops=this.drops.filter(d=>{const dx=(d.side<0?d.x-.373:.627-d.x)*w,dy=(.52-d.y)*h;const phase=Math.atan2(dy,dx)/(50*Math.PI/180);return dx<0||dy<0||Math.hypot(dx,dy)>w*.28||phase<lo||phase>hi;});
  }
  this.lastSweep=sim.wipers?sweep:null;
  const max=this.rain==='heavy'?200:80;this.dropBudget+=dt*(this.rain==='heavy'?65:25);
  while(this.dropBudget>=1&&this.drops.length<max){this.dropBudget--;const side=Math.random()<.5?-1:1,angle=Math.random()*50*Math.PI/180,dist=.02+Math.sqrt(Math.random())*.26;this.drops.push({side,x:(side<0?.373:.627)-side*Math.cos(angle)*dist,y:.52-Math.sin(angle)*dist*w/h,r:1+Math.random()*2.5});}
  this.dropBudget=Math.min(this.dropBudget,1);ctx.clearRect(0,0,w,h);
  this.drops=this.drops.filter(d=>d.y<.53);
  for(const d of this.drops){d.y+=dt*.0002*d.r;const x=d.x*w,y=d.y*h,r=d.r;
   ctx.beginPath();ctx.ellipse(x,y,r,r*1.6,0,0,Math.PI*2);ctx.fillStyle='rgba(190,220,235,.25)';ctx.fill();ctx.strokeStyle='rgba(235,249,255,.55)';ctx.lineWidth=.8;ctx.stroke();
   if(r>2){ctx.beginPath();ctx.moveTo(x,y-r*1.4);ctx.lineTo(x-1,y-r*4);ctx.strokeStyle='rgba(220,240,255,.23)';ctx.stroke();}
  }
 }
}
