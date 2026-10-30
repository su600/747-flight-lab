import * as T from 'three';
import {Sky} from 'three/addons/objects/Sky.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
let seed=747;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const matCache=new Map();
const mat=(color,roughness=.8,metalness=0)=>{const key=color+'|'+roughness+'|'+metalness;let m=matCache.get(key);if(!m){m=new T.MeshStandardMaterial({color,roughness,metalness});matCache.set(key,m);}return m;};
const boxCache=new Map(),UNIT_PLANE=new T.PlaneGeometry(1,1);
const boxGeo=(w,h,d)=>{const key=w+'|'+h+'|'+d;let g=boxCache.get(key);if(!g){g=new T.BoxGeometry(w,h,d);boxCache.set(key,g);}return g;};
const SUN_UP=new T.Vector3(0,1,0),_right=new T.Vector3(),_up=new T.Vector3(),_anchor=new T.Vector3(),_lampM=new T.Matrix4(),_lampC=new T.Color();
function noiseTexture(base,scale=1){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.fillStyle=base;x.fillRect(0,0,512,512);for(let i=0;i<70000;i++){const g=Math.floor(rnd()*255);x.fillStyle=`rgba(${g},${g},${g},.065)`;x.fillRect(rnd()*512,rnd()*512,1+rnd()*2,1+rnd()*2);}const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(scale,scale);t.anisotropy=8;return t;}
const canvasTex=(c,srgb=true)=>{const t=new T.CanvasTexture(c);if(srgb)t.colorSpace=T.SRGBColorSpace;return t;};
// Rolling patches of meadow plus faint mowing stripes, so the ground no longer reads as one flat colour.
function fieldTexture(){const S=1024,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d');x.fillStyle='#7f9568';x.fillRect(0,0,S,S);
 const tones=['#8aa06b','#738c5f','#90a06a','#6d8660','#9aa570'];
 for(let i=0;i<46;i++){const px=rnd()*S,py=rnd()*S,r=60+rnd()*180,g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,tones[i%tones.length]+'aa');g.addColorStop(1,tones[i%tones.length]+'00');x.fillStyle=g;x.fillRect(px-r,py-r,r*2,r*2);}
 for(let i=0;i<90000;i++){const g=Math.floor(rnd()*255);x.fillStyle=`rgba(${g},${g},${g},.05)`;x.fillRect(rnd()*S,rnd()*S,1+rnd()*2,1+rnd()*3);}
 const t=canvasTex(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;}
// One window-grid texture serves both the colour map and the night-time glow of the distant city.
function facadeTexture(lit){const c=document.createElement('canvas');c.width=128;c.height=256;const x=c.getContext('2d');x.fillStyle=lit?'#000':'#e4e9e8';x.fillRect(0,0,128,256);
 for(let r=0;r<16;r++)for(let k=0;k<8;k++){const on=rnd()<.55;x.fillStyle=lit?(on?'#ffd98a':'#000'):(on?'#8fa7ae':'#b9c7ca');x.fillRect(k*16+3,r*16+3,10,9);}
 const t=canvasTex(c,!lit);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;return t;}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return canvasTex(c);}
// A puffy cumulus: white crowns, soft blue-grey undersides.
function cumulusTexture(){const W=256,H=160,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
 for(let i=0;i<22;i++){const px=36+rnd()*(W-72),py=H*.5+(rnd()-.5)*H*.3-Math.abs(px-W/2)*.12,r=22+rnd()*30,g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(.55,'rgba(255,255,255,.6)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(px-r,py-r,r*2,r*2);}
 x.globalCompositeOperation='source-atop';const sh=x.createLinearGradient(0,H*.28,0,H*.78);sh.addColorStop(0,'rgba(255,255,255,0)');sh.addColorStop(1,'rgba(176,194,220,.42)');x.fillStyle=sh;x.fillRect(0,0,W,H);
 return canvasTex(c);}
export class World{
 constructor(scene,renderer){this.scene=scene;this.renderer=renderer;this.lamps=[];this.lampData=[];this.lampMesh=null;this.time='day';this.clouds=[];this.t=0;this.build();}
 box(x,y,z,w,h,d,m,shadow=false){const o=new T.Mesh(boxGeo(w,h,d),m);o.position.set(x,y,z);o.receiveShadow=true;o.castShadow=shadow;this.scene.add(o);return o;}
 ground(x,z,w,d,m,y=0){const o=new T.Mesh(UNIT_PLANE,m);o.scale.set(w,d,1);o.rotation.x=-Math.PI/2;o.position.set(x,y,z);o.receiveShadow=true;o.matrixAutoUpdate=false;o.updateMatrix();
  // Render pavement layers from bottom to top; equal-depth fragments then have a stable winner.
  o.renderOrder=Math.round(y*1000);this.scene.add(o);return o;}
 line(points,color,width=1){const m=new T.LineBasicMaterial({color,linewidth:width});const g=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p)));const o=new T.Line(g,m);this.scene.add(o);return o;}
 label(text,x,y,z,w,h,ground=false,fg='#f5f3dc',bg=null){const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);}ctx.fillStyle=fg;ctx.font='bold 175px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,132);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;const m=new T.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:T.DoubleSide});const o=new T.Mesh(new T.PlaneGeometry(w,h),m);o.position.set(x,y,z);if(ground)o.rotation.x=-Math.PI/2;this.scene.add(o);return o;}
 build(){
  const scene=this.scene;scene.fog=new T.FogExp2(0xb9d2db,.000055);
  this.sky=new Sky();this.sky.scale.setScalar(200000);scene.add(this.sky);const u=this.sky.material.uniforms;u.turbidity.value=3;u.rayleigh.value=1.6;u.mieCoefficient.value=.004;u.mieDirectionalG.value=.82;
  const pmrem=new T.PMREMGenerator(this.renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.035).texture;pmrem.dispose();scene.environmentIntensity=.45;
  this.hemi=new T.HemisphereLight(0xcde9ff,0x758466,2);scene.add(this.hemi);
  this.sun=new T.DirectionalLight(0xfff5de,3.2);this.sun.position.set(300,500,-250);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-180,right:180,top:180,bottom:-180,near:10,far:1600});this.sun.shadow.bias=-.00015;this.sun.shadow.normalBias=.12;scene.add(this.sun,this.sun.target);
  const grass=mat('#ffffff',.95);grass.map=fieldTexture();grass.map.repeat.set(48,48);this.ground(0,0,100000,100000,grass,-.05);
  // Mowed stripes beside the runway and soft far-field patches break up the horizon.
  const mowA=mat('#7c9764',.95),mowB=mat('#8aa571',.95);for(let i=0;i<22;i++)this.ground(0,60+i*14,4300,14,i%2?mowA:mowB,-.045);
  for(let i=0;i<26;i++){const m=mat(['#a3a56a','#6f8d5c','#8d9e63','#7c9a6f'][i%4],.95);this.ground((rnd()-.5)*16000,600+rnd()*4200,500+rnd()*1700,300+rnd()*900,m,-.049).renderOrder=-49+i*.01;}
  const sea=mat('#417e96',.3,.3);this.ground(0,16000,100000,22000,sea,.02);this.ground(0,4970,100000,140,mat('#d2c5a2'),.03);
  const asphalt=mat('#343e42');asphalt.map=noiseTexture('#485053',20);this.ground(0,0,3900,82,asphalt,.03);
  const runway=mat('#424c51');runway.map=noiseTexture('#4b5153',22);this.ground(0,0,3800,60,runway,.05);
  const concrete=mat('#aaafa6');concrete.map=noiseTexture('#adb1a8',12);this.ground(-300,-380,2200,410,concrete,.035);
  const taxi=mat('#555e5d');taxi.map=noiseTexture('#5c6260',16);this.ground(0,-130,3850,30,taxi,.045);
  for(const x of [-1750,-850,200,1550])this.ground(x,-75,34,160,taxi,.06);
  const white=mat('#e9ebe4'),yellow=mat('#d3ae45'),red=mat('#a75b4c');
  this.ground(0,-28,3740,.6,white,.07);this.ground(0,28,3740,.6,white,.07);this.ground(0,-130,3760,.3,yellow,.065);
  for(let x=-1810;x<1830;x+=60)this.ground(x,0,30,.9,white,.075);
  for(const end of [-1,1]){
   for(let z=-24;z<=24;z+=4)if(Math.abs(z)>3)this.ground(end*1835,z,32,1.8,white,.075);
   for(const x of [1550,1450,1250])for(const z of [-17,17])this.ground(end*x,z,x===1550?42:24,x===1550?5:1.5,white,.075);
   const number=this.label(end<0?'09':'27',end*1760,.09,0,19,22,true);number.rotation.z=end<0?-Math.PI/2:Math.PI/2;
   for(let i=1;i<17;i++){const x=end*(1900+i*30);for(const z of i%4===0?[-12,-6,0,6,12]:[-2,0,2])this.lamp(x,.6,z,0xf9ebca);}
  }
  // Rubber deposits in the touchdown zones.
  for(let i=0;i<220;i++){const x=(rnd()<.5?-1:1)*(1100+rnd()*500),z=(rnd()-.5)*16;this.ground(x,z,8+rnd()*38,.12+rnd()*.4,mat('#394144'),.078);}
  for(let x=-1890;x<1900;x+=60){this.lamp(x,.3,-32,0xffe8bd);this.lamp(x,.3,32,0xffe8bd);if(x%120===-90)this.lamp(x,.2,-145,0x3299ff);}
  for(let x=-1890;x<1900;x+=180){this.box(x,.55,-46,5,1.1,.22,mat('#272f25'));this.label('A  →',x,.7,-45.83,4,1,false,'#f2cf6a');}
  for(let x=-1380;x<790;x+=65){this.ground(x,-380,.05,410,mat('#8b968d'),.052);}
  for(let z=-570;z<-175;z+=55)this.ground(-300,z,2180,.045,mat('#8b968d'),.052);
  // Gate guidance, parking boxes, and safe movement boundaries.
  for(let i=0;i<9;i++){const x=-1200+i*230;this.ground(x,-370,.35,170,yellow,.08);this.ground(x,-286,38,.45,yellow,.08);this.ground(x-48,-350,.35,180,red,.08);this.ground(x+48,-350,.35,180,red,.08);const n=this.label(String(i+1).padStart(2,'0'),x,.09,-288,12,9,true,'#d8b34c');n.rotation.z=Math.PI;}
  const terminalMetal=mat('#deddd1',.4,.35),glass=mat('#4e777e',.21,.65),dark=mat('#293e45',.5,.25);this.glass=glass;
  this.box(-300,14,-603,1900,28,80,glass,true);this.box(-300,29,-602,1940,4,105,terminalMetal,true);this.box(-300,2,-600,1920,4,90,dark);
  for(let x=-1240;x<=650;x+=22)this.box(x,15,-561,.65,27,.6,terminalMetal);
  for(const y of [8,17,25])this.box(-300,y,-560,1900,.5,.6,terminalMetal);
  this.label('STAR BAY  /  星湾国际机场',-370,23,-559,135,14,false,'#e4ebde');
  for(let i=0;i<9;i++){const x=-1200+i*230;this.box(x,7,-510,9,6,105,glass,true);this.box(x,11,-510,11,1,106,terminalMetal,true);this.box(x,6,-455,13,8,10,dark,true);this.box(x,3,-495,1,6,1,terminalMetal);this.label('G'+(i+1),x,9,-449,7,3,false,'#ffda7e','#243941');}
  // Control tower, radar and airport hangars.
  this.box(900,27,-580,15,54,15,mat('#d6d7cc'),true);const cab=new T.Mesh(new T.CylinderGeometry(16,11,10,8),glass);cab.position.set(900,59,-580);cab.castShadow=true;scene.add(cab);this.box(900,65,-580,34,2,32,terminalMetal,true);this.box(900,74,-580,.4,17,.4,dark);this.radar=this.box(900,80,-580,9,2,.5,dark);
  for(let i=0;i<3;i++){this.box(1120+i*210,18,-560,170,36,130,mat('#c8cabe'),true);this.box(1120+i*210,14,-493,140,25,1,mat('#607477'));this.label('HANGAR '+(i+1),1120+i*210,31,-492,85,6,false,'#35515c');}
  for(const x of [-1300,-800,-300,200,700]){this.box(x,15,-225,.5,30,.5,dark,true);this.box(x,30,-225,9,.4,2,dark);}
  this.vehicles=[];for(let i=0;i<8;i++){const g=new T.Group(),color=i%3===0?0xe2b449:0xe7e9dd;const body=new T.Mesh(new T.BoxGeometry(7,2,2.5),mat(color));body.position.y=1.5;g.add(body);const windshield=new T.Mesh(new T.BoxGeometry(1.2,1,2.4),glass);windshield.position.set(2,2.4,0);g.add(windshield);for(const x of [-2,2])for(const z of [-1.3,1.3]){const wheel=new T.Mesh(new T.CylinderGeometry(.55,.55,.3,12),dark);wheel.rotation.x=Math.PI/2;wheel.position.set(x,.55,z);g.add(wheel);}g.position.set(-1200+i*230,0,-430-rnd()*25);scene.add(g);this.vehicles.push(g);}
  // Distant urban edge and tree belts use instancing to keep the airport responsive.
  const temp=new T.Object3D(),col=new T.Color();
  this.cityMat=new T.MeshStandardMaterial({color:'#ffffff',roughness:.7,metalness:.1,map:facadeTexture(false),emissive:'#ffffff',emissiveMap:facadeTexture(true),emissiveIntensity:0});
  const city=new T.InstancedMesh(boxGeo(1,1,1),this.cityMat,250);for(let i=0;i<250;i++){const h=10+rnd()*90;temp.position.set(-6000+rnd()*12000,h/2,-1300-rnd()*3500);temp.scale.set(35+rnd()*60,h,25+rnd()*55);temp.updateMatrix();city.setMatrixAt(i,temp.matrix);city.setColorAt(i,col.setHSL(.5+rnd()*.06,.1+rnd()*.1,.62+rnd()*.25));}scene.add(city);
  // Two tree species, tinted individually, scattered outside the airfield.
  const spots=[];for(let i=0;i<1500;i++){let x=(rnd()-.5)*14000,z=(rnd()-.5)*11000;if(Math.abs(x)<2500&&z>-850&&z<200){z=350+rnd()*500;}spots.push([x,z,6+rnd()*13,rnd()]);}
  const pines=spots.filter(s=>s[3]<.55),oaks=spots.filter(s=>s[3]>=.55);
  const pineMesh=new T.InstancedMesh(new T.ConeGeometry(1,1,7),mat('#ffffff',.9),pines.length),oakMesh=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),mat('#ffffff',.9),oaks.length);
  pines.forEach(([x,z,h],i)=>{temp.position.set(x,h/2,z);temp.scale.set(h*.3,h,h*.3);temp.updateMatrix();pineMesh.setMatrixAt(i,temp.matrix);pineMesh.setColorAt(i,col.setHSL(.36+rnd()*.05,.35,.2+rnd()*.1));});
  oaks.forEach(([x,z,h],i)=>{temp.position.set(x,h*.5,z);temp.scale.set(h*.4,h*.45,h*.4);temp.updateMatrix();oakMesh.setMatrixAt(i,temp.matrix);oakMesh.setColorAt(i,col.setHSL(.22+rnd()*.12,.4,.28+rnd()*.12));});
  scene.add(pineMesh,oakMesh);
  for(let i=0;i<18;i++){const mountain=new T.Mesh(new T.ConeGeometry(1400+rnd()*2100,700+rnd()*1600,6),mat(i%3?'#8fa6a3':'#9bb0b6'));mountain.position.set(-24000+i*2800,0,-16000-rnd()*3000);mountain.rotation.y=rnd()*6;scene.add(mountain);}
  this.buildWindsock();this.buildStars();
  this.cloudMat=new T.SpriteMaterial({map:cumulusTexture(),transparent:true,opacity:.85,depthWrite:false,color:0xffffff});
  const mkCloud=(n,alt,spread,w,hh)=>{const g=new T.Group();for(let j=0;j<n;j++){const s=new T.Sprite(this.cloudMat);s.position.set((rnd()-.5)*spread,rnd()*70,(rnd()-.5)*spread*.4);s.scale.set(w*(.6+rnd()*.8),hh*(.6+rnd()*.8),1);g.add(s);}g.position.set((rnd()-.5)*28000,alt,(rnd()-.5)*28000);g.userData.drift=.8+rnd()*1.2;scene.add(g);this.clouds.push(g);};
  for(let i=0;i<26;i++)mkCloud(6,1900+rnd()*1400,700,700,380);
  for(let i=0;i<14;i++)mkCloud(4,1000+rnd()*600,420,420,230);
  this.glowTex=glowTexture();
  this.buildLamps();this.setTime('day');
 }
 lamp(x,y,z,color){this.lampData.push({x,y,z,color});}
 buildLamps(){
  const n=this.lampData.length,mesh=new T.InstancedMesh(new T.SphereGeometry(.25,5,4),new T.MeshBasicMaterial(),n);
  this.lampData.forEach((l,i)=>mesh.setColorAt(i,_lampC.set(l.color)));
  mesh.frustumCulled=false;this.lampMesh=mesh;this.scene.add(mesh);this.scaleLamps(1);
  // Additive halos make the runway and taxiway lights bloom after dark.
  const pos=new Float32Array(n*3),col=new Float32Array(n*3);
  this.lampData.forEach((l,i)=>{pos.set([l.x,l.y+.2,l.z],i*3);_lampC.set(l.color);col.set([_lampC.r,_lampC.g,_lampC.b],i*3);});
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('color',new T.BufferAttribute(col,3));
  this.glow=new T.Points(g,new T.PointsMaterial({size:7,map:this.glowTex,vertexColors:true,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false}));
  this.glow.frustumCulled=false;this.glow.visible=false;this.scene.add(this.glow);
 }
 scaleLamps(s){
  const mesh=this.lampMesh;if(!mesh)return;
  this.lampData.forEach((l,i)=>{_lampM.makeScale(s,s,s).setPosition(l.x,l.y,l.z);mesh.setMatrixAt(i,_lampM);});
  mesh.instanceMatrix.needsUpdate=true;
 }
 // A windsock beside the runway: the visible cue for the air moving over the field.
 buildWindsock(){
  const g=new T.Group(),pole=new T.Mesh(boxGeo(.25,9,.25),mat('#e6e6e0',.6));pole.position.y=4.5;pole.castShadow=true;g.add(pole);
  const sock=new T.Group();sock.position.y=9;g.add(sock);this.sockSegs=[];
  for(let i=0;i<5;i++){const r0=1-i*.11,r1=1-(i+1)*.11,seg=new T.Mesh(new T.CylinderGeometry(r1*.8,r0*.8,1.5,10,1,true),new T.MeshStandardMaterial({color:i%2?'#f4f2ea':'#e8692e',roughness:.8,side:T.DoubleSide}));seg.rotation.z=Math.PI/2;seg.position.x=.8+i*1.5;seg.castShadow=true;sock.add(seg);this.sockSegs.push(seg);}
  g.position.set(-1250,0,56);this.sock=sock;this.scene.add(g);
 }
 buildStars(){
  const n=1100,p=new Float32Array(n*3);for(let i=0;i<n;i++){const a=rnd()*Math.PI*2,e=Math.asin(.04+rnd()*.96),r=70000;p.set([Math.cos(a)*Math.cos(e)*r,Math.sin(e)*r,Math.sin(a)*Math.cos(e)*r],i*3);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));
  this.stars=new T.Group();this.stars.visible=false;
  const pts=new T.Points(g,new T.PointsMaterial({size:2.2,sizeAttenuation:false,color:0xdfe8ff,transparent:true,opacity:.9,depthWrite:false,fog:false}));pts.frustumCulled=false;this.stars.add(pts);
  const moon=new T.Sprite(new T.SpriteMaterial({map:glowTexture(),color:0xdfe9ff,fog:false,depthWrite:false,transparent:true}));moon.position.set(-24000,34000,42000);moon.scale.setScalar(7000);this.stars.add(moon);
  this.scene.add(this.stars);
 }
 setTime(mode){
  this.time=mode;const night=mode==='night',dusk=mode==='dusk',u=this.sky.material.uniforms;
  this.sun.intensity=night?.35:dusk?2.6:3.2;this.sun.color.set(night?0x9db4ff:dusk?0xffa868:0xfff5de);
  this.hemi.intensity=night?.7:dusk?1.05:2;this.hemi.color.set(night?0x6b86bf:dusk?0xffcfa8:0xcde9ff);this.hemi.groundColor.set(night?0x1e2a3a:dusk?0x6a5a56:0x758466);
  this.sunOffset=new T.Vector3(300,night?160:dusk?90:500,-250);
  u.sunPosition.value.copy(this.sunOffset).normalize();u.turbidity.value=dusk?8:3;u.rayleigh.value=dusk?2.4:1.6;u.mieCoefficient.value=dusk?.02:.004;
  this.sky.visible=!night;this.stars.visible=night;this.scene.background=night?new T.Color('#081426'):null;
  this.scene.fog.color.set(night?0x142339:dusk?0xe0b79c:0xb9d2db);this.scene.fog.density=dusk?.00007:.000055;
  this.renderer.toneMappingExposure=night?1:dusk?.95:.83;
  this.cloudMat.color.set(night?0x2c3a58:dusk?0xffb890:0xffffff);this.cloudMat.opacity=night?.7:dusk?.8:.85;
  this.cityMat.emissiveIntensity=night?1.1:dusk?.35:0;
  this.glass.emissive.set(0xffc880);this.glass.emissiveIntensity=night?.1:dusk?.04:0;
  const glow=night?1:dusk?.6:0;this.glow.material.opacity=glow;this.glow.visible=glow>0;
  this.scaleLamps(night?2:dusk?1.5:1);
 }
 update(dt,pos){
  this.t+=dt;
  // Quantize the shadow camera in light space to avoid shadows swimming over the aircraft.
  const right=_right.crossVectors(SUN_UP,this.sunOffset).normalize();
  const up=_up.crossVectors(this.sunOffset,right).normalize();
  const c=this.sun.shadow.camera,stepX=(c.right-c.left)/this.sun.shadow.mapSize.x,stepY=(c.top-c.bottom)/this.sun.shadow.mapSize.y;
  const sx=pos.dot(right),sy=pos.dot(up),anchor=_anchor.copy(pos).addScaledVector(right,Math.round(sx/stepX)*stepX-sx).addScaledVector(up,Math.round(sy/stepY)*stepY-sy);
  this.sun.position.copy(anchor).add(this.sunOffset);this.sun.target.position.copy(anchor);this.radar.rotation.y+=dt*.7;
  // Clouds drift with the wind and wrap around the aircraft so the sky stays populated on long flights.
  for(const g of this.clouds){g.position.x+=dt*g.userData.drift;const dx=g.position.x-pos.x,dz=g.position.z-pos.z;if(dx>14000)g.position.x-=28000;else if(dx<-14000)g.position.x+=28000;if(dz>14000)g.position.z-=28000;else if(dz<-14000)g.position.z+=28000;}
  this.stars.position.copy(pos);this.sky.position.set(pos.x,0,pos.z);
  this.sock.rotation.y=-.35+Math.sin(this.t*.31)*.25;this.sock.rotation.z=-.15+Math.sin(this.t*1.7)*.05;
  this.sockSegs.forEach((s,i)=>{s.position.y=-Math.sin(this.t*2.6-i*.8)*.06*i-.04*i*i*.3;});
 }
}
