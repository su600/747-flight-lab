import * as T from 'three';
import {Sky} from 'three/addons/objects/Sky.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rnd,mat,boxGeo,nearLandmark,LANDMARK_SITES,speckle,noiseTexture,canvasTex,fieldTexture,facadeTexture,glowTexture,cumulusTexture,pavementTexture,grassBumpTexture,waterNormalTexture,mountainGeometry,rollingHillGeometry,pineGeometry,oakGeometry,UNIT_PLANE} from './world/procedural.js';
const SUN_UP=new T.Vector3(0,1,0),_right=new T.Vector3(),_up=new T.Vector3(),_anchor=new T.Vector3(),_lampM=new T.Matrix4(),_lampC=new T.Color();

export class World{
 constructor(scene,renderer){this.scene=scene;this.renderer=renderer;this.lamps=[];this.lampData=[];this.lampMesh=null;this.time='day';this.clouds=[];this.t=0;this.build();}
 box(x,y,z,w,h,d,m,shadow=false){const o=new T.Mesh(boxGeo(w,h,d),m);o.position.set(x,y,z);o.receiveShadow=true;o.castShadow=shadow;this.scene.add(o);return o;}
 ground(x,z,w,d,m,y=0){const o=new T.Mesh(UNIT_PLANE,m);o.scale.set(w,d,1);o.rotation.x=-Math.PI/2;o.position.set(x,y,z);o.receiveShadow=true;o.matrixAutoUpdate=false;o.updateMatrix();
  // Render pavement layers from bottom to top; equal-depth fragments then have a stable winner.
  o.renderOrder=Math.round(y*1000);this.scene.add(o);return o;}
 line(points,color,width=1){const m=new T.LineBasicMaterial({color,linewidth:width});const g=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p)));const o=new T.Line(g,m);this.scene.add(o);return o;}
 label(text,x,y,z,w,h,ground=false,fg='#f5f3dc',bg=null){const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);}ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';let fontSize=175;ctx.font=`bold ${fontSize}px Arial`;while(fontSize>54&&ctx.measureText(text).width>930){fontSize-=8;ctx.font=`bold ${fontSize}px Arial`;}ctx.fillText(text,512,132,960);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;const m=new T.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:T.DoubleSide});const o=new T.Mesh(new T.PlaneGeometry(w,h),m);o.position.set(x,y,z);if(ground)o.rotation.x=-Math.PI/2;this.scene.add(o);return o;}
 build(){
  const scene=this.scene;scene.fog=new T.FogExp2(0x8fbde8,.000055);
  this.sky=new Sky();this.sky.scale.setScalar(200000);scene.add(this.sky);const u=this.sky.material.uniforms;u.turbidity.value=2.5;u.rayleigh.value=.7;u.mieCoefficient.value=.005;u.mieDirectionalG.value=.8;
  this.envs={};
  this.hemi=new T.HemisphereLight(0xcde9ff,0x758466,1.15);scene.add(this.hemi);
  this.sun=new T.DirectionalLight(0xfff5de,3.2);this.sun.position.set(300,500,-250);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-150,right:150,top:150,bottom:-150,near:10,far:1600});this.sun.shadow.bias=-.0001;this.sun.shadow.normalBias=.08;this.sun.shadow.radius=2.2;scene.add(this.sun,this.sun.target);
  const grass=mat('#ffffff',.95);grass.map=fieldTexture();grass.map.repeat.set(48,48);grass.bumpMap=grassBumpTexture();grass.bumpMap.repeat.set(900,900);grass.bumpScale=1.2;this.ground(0,0,100000,100000,grass,-.05);
  // Mowed stripes beside the runway and soft far-field patches break up the horizon.
  const mowA=mat('#78905f',.95),mowB=mat('#869d68',.95);for(let i=0;i<22;i++)this.ground(0,60+i*14,4300,14,i%2?mowA:mowB,-.045);
  for(let i=0;i<26;i++){const m=mat(['#9a9c66','#667f55','#86996a','#758f68','#a7a173','#5f7a52'][i%6],.95);this.ground((rnd()-.5)*16000,600+rnd()*4200,500+rnd()*1700,300+rnd()*900,m,-.049).renderOrder=-49+i*.01;}
  const islandShape=new T.Shape();islandShape.moveTo(-.5,-.24);islandShape.lineTo(-.37,-.5);islandShape.lineTo(.34,-.5);islandShape.lineTo(.5,-.18);islandShape.lineTo(.43,.34);islandShape.lineTo(.22,.5);islandShape.lineTo(-.37,.43);islandShape.lineTo(-.5,.12);islandShape.closePath();
  const islandGeo=new T.ShapeGeometry(islandShape);islandGeo.rotateX(-Math.PI/2);
  const airportTurf=new T.MeshStandardMaterial({color:'#ffffff',roughness:.96,map:fieldTexture(),bumpMap:grassBumpTexture(),bumpScale:.22});
  airportTurf.map.repeat.set(2,2);airportTurf.bumpMap.repeat.set(4,4);
  const greenIslands=[
   [-1500,-160,500,22],[-320,-160,980,22],[890,-160,1180,22],
   [-1320,-82,310,42],[-320,-82,340,42],[900,-82,440,42],
   [-1460,-380,95,170],[855,-380,95,170],[1320,-660,520,34],[1320,-450,520,28]
  ];
  const turf=new T.InstancedMesh(islandGeo,airportTurf,greenIslands.length),turfTransform=new T.Object3D();
  for(let i=0;i<greenIslands.length;i++){
   const [x,z,w,d]=greenIslands[i];turfTransform.position.set(x,.055,z);turfTransform.scale.set(w,1,d);turfTransform.updateMatrix();turf.setMatrixAt(i,turfTransform.matrix);
  }
  turf.instanceMatrix.needsUpdate=true;turf.receiveShadow=true;turf.castShadow=false;scene.add(turf);
  this.waterNormal=waterNormalTexture();this.waterNormal.repeat.set(28,9);const sea=new T.MeshStandardMaterial({color:'#176f96',roughness:.24,metalness:.0,normalMap:this.waterNormal,normalScale:new T.Vector2(.09,.09),envMapIntensity:.7});this.ground(0,16000,100000,22000,sea,.02);this.ground(0,5090,100000,200,mat('#3fa8b8'),.024);this.ground(0,4970,100000,140,mat('#e4d6ae'),.03);
  const asphalt=mat('#343e42',.88);asphalt.map=pavementTexture('#4a5254',14,{stains:26});this.ground(0,0,3900,82,asphalt,.03);
  const runway=mat('#424c51',.82);runway.map=pavementTexture('#50575a',16,{stains:30});this.ground(0,0,3800,60,runway,.05);
  const concrete=mat('#ffffff',.92);concrete.map=pavementTexture('#aaa89f',10,{joints:8,stains:22});this.ground(-300,-380,2200,410,concrete,.035);
  const taxi=mat('#555e5d',.86);taxi.map=pavementTexture('#626866',12,{stains:20});this.ground(0,-130,3850,30,taxi,.045);
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
  const groundRects=(rects,material,y,order)=>{
   const mesh=new T.InstancedMesh(UNIT_PLANE,material,rects.length),transform=new T.Object3D();
   for(let i=0;i<rects.length;i++){const [x,z,w,d]=rects[i];transform.rotation.set(-Math.PI/2,0,0);transform.position.set(x,y,z);transform.scale.set(w,d,1);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);}
   mesh.instanceMatrix.needsUpdate=true;mesh.renderOrder=order;mesh.castShadow=false;mesh.receiveShadow=false;scene.add(mesh);return mesh;
  };
  const taxiEdges=[];
  for(const [start,end] of [[-1890,-1768],[-1732,-868],[-832,182],[218,1532],[1568,1900]]){
   taxiEdges.push([(start+end)/2,-143.5,end-start,.5],[(start+end)/2,-116.5,end-start,.5]);
  }
  groundRects(taxiEdges,yellow,.078,82);
  const connectorLines=[],holdSolid=[],holdDashed=[],standStops=[];
  for(const x of [-1750,-850,200,1550]){
   for(let z=-143;z<=-63;z+=12)connectorLines.push([x,z,.55,4.5]);
   holdSolid.push([x,-57,34,.5],[x,-59,34,.5]);
   for(let i=0;i<7;i++){const dx=-15.6+i*5.2;holdDashed.push([x+dx,-52,3.2,.5],[x+dx,-50,3.2,.5]);}
  }
  for(let i=0;i<9;i++){const x=-1200+i*230;standStops.push([x,-311,28,.55],[x,-314,28,.55]);}
  groundRects(connectorLines,yellow,.079,83);
  groundRects([...holdSolid,...holdDashed,...standStops],yellow,.081,84);
  // Rubber deposits in the touchdown zones.
  for(let i=0;i<220;i++){const x=(rnd()<.5?-1:1)*(1100+rnd()*500),z=(rnd()-.5)*16;this.ground(x,z,8+rnd()*38,.12+rnd()*.4,mat('#394144'),.078);}
  for(let x=-1890;x<1900;x+=60){this.lamp(x,.3,-32,0xffe8bd);this.lamp(x,.3,32,0xffe8bd);if(x%120===-90)this.lamp(x,.2,-145,0x3299ff);}
  // Centerline, threshold, and approach lights make the runway readable at night.
  for(let x=-1800;x<=1800;x+=30)this.lamp(x,.2,0,0xf6f2dc);
  for(let x=-1800;x<=1800;x+=60)this.lamp(x,.16,-130,0x36c982);
  for(const end of [-1,1]){
   for(let z=-20;z<=20;z+=4)this.lamp(end*1834,.24,z,0x38d482);
   for(let i=1;i<=12;i++)this.lamp(end*(1880+i*35),.32,0,0xf6f2dc);
  }
  for(let x=-1890;x<1900;x+=180){this.box(x,.55,-46,5,1.1,.22,mat('#272f25'));this.label('A  →',x,.7,-45.83,4,1,false,'#f2cf6a');}
  for(let x=-1380;x<790;x+=65){this.ground(x,-380,.05,410,mat('#8b968d'),.052);}
  for(let z=-570;z<-175;z+=55)this.ground(-300,z,2180,.045,mat('#8b968d'),.052);
  // Gate guidance, parking boxes, and safe movement boundaries.
  for(let i=0;i<9;i++){const x=-1200+i*230;this.ground(x,-370,.35,170,yellow,.08);this.ground(x,-286,38,.45,yellow,.08);this.ground(x-48,-350,.35,180,red,.08);this.ground(x+48,-350,.35,180,red,.08);const n=this.label(String(i+1).padStart(2,'0'),x,.09,-288,12,9,true,'#d8b34c');n.rotation.z=Math.PI;}
  const terminalMetal=mat('#dfe2dc',.4,.28),glass=mat('#497179',.23,.52),atriumGlass=mat('#315f6b',.2,.48),atriumRoof=mat('#c3d0cb',.38,.22),dark=mat('#293e45',.52,.25),terminalBase=mat('#4c5554',.82,.05),towerBody=mat('#d3d7d0',.7,.06);glass.envMapIntensity=atriumGlass.envMapIntensity=1.3;this.glass=glass;
  // Layered glass wings, a raised atrium, and a broad sculpted canopy form a modern terminal.
  this.box(-300,3,-603,1940,6,116,terminalBase,true);
  for(const [x,w] of [[-925,650],[-300,620],[325,650]]){this.box(x,15,-603,w,22,84,glass,true);this.box(x,27,-603,w+14,3,112,terminalMetal,true);}
  this.box(-300,42,-603,420,30,84,atriumGlass,true);this.box(-300,58,-603,460,3,122,atriumRoof,true);
  this.box(-300,59.8,-603,280,.45,72,glass);
  const canopyShape=new T.Shape();
  canopyShape.moveTo(-1290,-62);canopyShape.quadraticCurveTo(-1308,-34,-1260,-14);canopyShape.lineTo(-1110,48);canopyShape.quadraticCurveTo(-1050,69,-965,69);
  canopyShape.lineTo(410,69);canopyShape.quadraticCurveTo(505,69,565,48);canopyShape.lineTo(690,-8);canopyShape.quadraticCurveTo(733,-28,712,-59);
  canopyShape.lineTo(650,-75);canopyShape.quadraticCurveTo(592,-86,520,-72);canopyShape.lineTo(-950,-72);canopyShape.quadraticCurveTo(-1050,-72,-1130,-46);canopyShape.closePath();
  const canopyGeo=new T.ExtrudeGeometry(canopyShape,{depth:3,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:5,bevelThickness:1.2});
  canopyGeo.rotateX(-Math.PI/2);
  const canopyMat=new T.MeshStandardMaterial({color:'#e4e9e4',roughness:.36,metalness:.22,envMapIntensity:.8});
  const canopy=new T.Mesh(canopyGeo,canopyMat);canopy.position.set(0,29,-603);canopy.castShadow=true;canopy.receiveShadow=true;scene.add(canopy);
  const skylight=mat('#8eb4b9',.22,.35);
  for(const [x,w] of [[-870,520],[-300,340],[270,520]]){
   const strip=new T.Mesh(UNIT_PLANE,skylight);strip.scale.set(w,19,1);strip.rotation.x=-Math.PI/2;strip.position.set(x,32.05,-602);strip.receiveShadow=false;scene.add(strip);
  }
  const canopySupports=new T.InstancedMesh(boxGeo(2.4,22,2.4),terminalMetal,18),support=new T.Object3D();
  for(let i=0;i<9;i++)for(let side=0;side<2;side++){
   const x=-1200+i*230;support.position.set(x+(side?31:-31),16.5,-526);support.updateMatrix();canopySupports.setMatrixAt(i*2+side,support.matrix);
  }
  canopySupports.instanceMatrix.needsUpdate=true;canopySupports.castShadow=true;scene.add(canopySupports);
  // Facade mullions use instancing so the extra architecture adds one draw call per tier.
  const facadeFrames=new T.InstancedMesh(boxGeo(.65,20,.7),terminalMetal,87),frameTransform=new T.Object3D();
  for(let i=0;i<87;i++){frameTransform.position.set(-1230+i*22,15,-559);frameTransform.updateMatrix();facadeFrames.setMatrixAt(i,frameTransform.matrix);}
  facadeFrames.castShadow=false;scene.add(facadeFrames);
  const atriumFrames=new T.InstancedMesh(boxGeo(.7,26,.7),terminalMetal,22);
  for(let i=0;i<22;i++){frameTransform.position.set(-500+i*20,42,-559);frameTransform.updateMatrix();atriumFrames.setMatrixAt(i,frameTransform.matrix);}
  atriumFrames.castShadow=false;scene.add(atriumFrames);
  for(const y of [7,12,25,28])this.box(-300,y,-558,1900,.5,.7,terminalMetal);
  this.box(-300,37,-556,360,9,1.5,dark,true);
  this.label('STAR BAY INTERNATIONAL',-300,39,-555.1,336,5,false,'#f3eddd');
  this.label('星湾国际机场 · TERMINAL 1',-300,34.8,-555.1,300,3.2,false,'#d7e2dc');
  for(let i=0;i<9;i++){const x=-1200+i*230;this.box(x,7,-510,9,6,105,glass,true);this.box(x,11,-510,11,1.2,110,terminalMetal,true);this.box(x,6,-455,13,8,10,dark,true);this.box(x,3,-495,1,6,1,terminalMetal);this.box(x,3,-478,1.2,6,1.2,terminalBase,true);this.box(x,11,-455,14,1.4,20,terminalMetal);this.box(x,8.5,-444,11,1,5,glass);this.label('G'+(i+1),x,9,-449,7,3,false,'#ffda7e','#243941');}
  // Instanced yellow lead-in lanes and white stand edges guide traffic without dozens of draw calls.
  const apronGuides=new T.InstancedMesh(UNIT_PLANE,yellow,18),apronEdges=new T.InstancedMesh(UNIT_PLANE,white,18),mark=new T.Object3D();
  for(let i=0;i<9;i++){
   const x=-1200+i*230;
   mark.rotation.set(-Math.PI/2,0,0);mark.position.set(x,.083,-245);mark.scale.set(.5,210,1);mark.updateMatrix();apronGuides.setMatrixAt(i,mark.matrix);
   mark.position.set(x,.084,-352);mark.scale.set(62,.6,1);mark.updateMatrix();apronGuides.setMatrixAt(9+i,mark.matrix);
   for(const [j,side] of [-1,1].entries()){mark.position.set(x+side*35,.084,-385);mark.scale.set(.45,64,1);mark.updateMatrix();apronEdges.setMatrixAt(i*2+j,mark.matrix);}
  }
  apronGuides.instanceMatrix.needsUpdate=true;apronGuides.renderOrder=83;apronGuides.castShadow=false;apronGuides.receiveShadow=false;
  apronEdges.instanceMatrix.needsUpdate=true;apronEdges.renderOrder=84;apronEdges.castShadow=false;apronEdges.receiveShadow=false;scene.add(apronGuides,apronEdges);
  // Tapered control-tower shaft, octagonal glazed cab, roof deck, and rotating radar.
  const towerX=0,towerZ=-520;
  // A distinct apron-side control tower with an octagonal glazed cab and rotating radar.
  this.ground(towerX,towerZ,72,72,concrete,.04);this.box(towerX,3,towerZ,28,6,28,terminalMetal,true);
  const towerShaft=new T.Mesh(new T.CylinderGeometry(5.5,8.5,48,10),towerBody);towerShaft.position.set(towerX,30,towerZ);towerShaft.castShadow=true;towerShaft.receiveShadow=true;scene.add(towerShaft);
  const cab=new T.Mesh(new T.CylinderGeometry(10.5,9,8,12,1,true),glass);cab.position.set(towerX,59,towerZ);cab.castShadow=true;scene.add(cab);
  const cabDeck=new T.Mesh(new T.CylinderGeometry(12,12,.8,12),terminalMetal),cabRoof=new T.Mesh(new T.CylinderGeometry(12.5,12.5,1.2,12),terminalMetal);cabDeck.position.set(towerX,54.8,towerZ);cabRoof.position.set(towerX,63.6,towerZ);cabDeck.castShadow=cabRoof.castShadow=true;scene.add(cabDeck,cabRoof);
  const cabFrames=new T.InstancedMesh(boxGeo(.45,7,.55),terminalMetal,12),cabFrame=new T.Object3D();
  for(let i=0;i<12;i++){const a=i*Math.PI*2/12;cabFrame.position.set(towerX+Math.cos(a)*9.65,59,towerZ+Math.sin(a)*9.65);cabFrame.rotation.y=-a;cabFrame.updateMatrix();cabFrames.setMatrixAt(i,cabFrame.matrix);}
  cabFrames.instanceMatrix.needsUpdate=true;cabFrames.castShadow=false;scene.add(cabFrames);
  this.label('ATC',towerX,40,towerZ+8.5,8,3,false,'#f3eddd','#374951');
  this.box(towerX,69,towerZ,.6,10,.6,dark,true);this.radar=this.box(towerX,75,towerZ,14,.7,1.2,dark);
  this.box(towerX,78,towerZ,.5,5,.5,dark,true);this.box(towerX,81,towerZ,1.4,1.4,1.4,mat('#d34a40',.5,.05));
  // Airport hangars.
  for(let i=0;i<3;i++){this.box(1120+i*210,18,-560,170,36,130,mat('#c8cabe'),true);this.box(1120+i*210,14,-493,140,25,1,mat('#607477'));this.label('HANGAR '+(i+1),1120+i*210,31,-492,85,6,false,'#35515c');}
  // Floodlight masts stand behind the terminal, not in the default presentation shot.
  for(const x of [-1300,-800,-300,200,700]){this.box(x,15,-760,.5,30,.5,dark,true);this.box(x,30,-760,9,.4,2,dark);}
  this.buildServiceVehicles(dark);
  // Distant urban edge and tree belts use instancing to keep the airport responsive.
  const temp=new T.Object3D(),col=new T.Color();
  this.cityMat=new T.MeshStandardMaterial({color:'#ffffff',roughness:.38,metalness:.35,map:facadeTexture(false),emissive:'#ffffff',emissiveMap:facadeTexture(true),emissiveIntensity:0});
  const city=new T.InstancedMesh(boxGeo(1,1,1),this.cityMat,250);for(let i=0;i<250;i++){const x=-6000+rnd()*12000,z=-1300-rnd()*3500,h=10+rnd()*90;if(nearLandmark(x,z)){temp.position.set(0,-100,0);temp.scale.set(0,0,0);}else{temp.position.set(x,h/2,z);temp.scale.set(35+rnd()*60,h,25+rnd()*55);city.setColorAt(i,col.setHSL(.5+rnd()*.06,.1+rnd()*.1,.62+rnd()*.25));}temp.updateMatrix();city.setMatrixAt(i,temp.matrix);}scene.add(city);
  // Two tree species, tinted individually, scattered outside the airfield.
  const spots=[];for(let i=0;i<1500;i++){let x=(rnd()-.5)*14000,z=(rnd()-.5)*11000;if(Math.abs(x)<2500&&z>-850&&z<200){z=350+rnd()*500;}if(!nearLandmark(x,z))spots.push([x,z,6+rnd()*13,rnd()]);}
  const pines=spots.filter(s=>s[3]<.55),oaks=spots.filter(s=>s[3]>=.55);
  const pineMesh=new T.InstancedMesh(pineGeometry(),mat('#ffffff',.92),pines.length),oakMesh=new T.InstancedMesh(oakGeometry(),mat('#ffffff',.92),oaks.length);pineMesh.castShadow=oakMesh.castShadow=false;
  pines.forEach(([x,z,h],i)=>{temp.position.set(x,0,z);temp.rotation.y=rnd()*6.28;temp.scale.set(h*.36,h,h*.36);temp.updateMatrix();pineMesh.setMatrixAt(i,temp.matrix);pineMesh.setColorAt(i,col.setHSL(.36+rnd()*.05,.35,.2+rnd()*.1));});
  oaks.forEach(([x,z,h],i)=>{temp.position.set(x,h*.42,z);temp.rotation.y=rnd()*6.28;temp.scale.set(h*.42,h*.4,h*.42);temp.updateMatrix();oakMesh.setMatrixAt(i,temp.matrix);oakMesh.setColorAt(i,col.setHSL(.22+rnd()*.12,.4,.28+rnd()*.12));});
  temp.rotation.set(0,0,0);scene.add(pineMesh,oakMesh);this.buildLandmarks();
  const hills=[[-10500,-7600,3500,410],[10800,-9800,4100,500],[-14800,-1200,3800,350],[15100,1800,4200,440],[-9200,3200,2900,290]];
  for(const [x,z,r,h] of hills){const hill=new T.Mesh(rollingHillGeometry(r,h),new T.MeshStandardMaterial({vertexColors:true,roughness:.96,flatShading:true}));hill.position.set(x,0,z);hill.receiveShadow=true;scene.add(hill);}
  for(let i=0;i<18;i++){const mh=700+rnd()*1900,mountain=new T.Mesh(mountainGeometry(1400+rnd()*2100,mh,mh>1700),new T.MeshStandardMaterial({vertexColors:true,roughness:.95,flatShading:true}));mountain.position.set(-24000+i*2800,mh/2-40,-16000-rnd()*3000);mountain.rotation.y=rnd()*6;scene.add(mountain);}
  this.buildWindsock();this.buildStars();
  this.cloudMat=new T.SpriteMaterial({map:cumulusTexture(),transparent:true,opacity:.85,depthWrite:false,color:0xffffff});
  const mkCloud=(n,alt,spread,w,hh)=>{const g=new T.Group();for(let j=0;j<n;j++){const s=new T.Sprite(this.cloudMat);s.position.set((rnd()-.5)*spread,rnd()*70,(rnd()-.5)*spread*.4);s.scale.set(w*(.6+rnd()*.8),hh*(.6+rnd()*.8),1);g.add(s);}g.position.set((rnd()-.5)*28000,alt,(rnd()-.5)*28000);g.userData.drift=.8+rnd()*1.2;scene.add(g);this.clouds.push(g);};
  for(let i=0;i<26;i++)mkCloud(6,1900+rnd()*1400,700,700,380);
  for(let i=0;i<14;i++)mkCloud(4,1000+rnd()*600,420,420,230);
  this.glowTex=glowTexture();
  this.buildLamps();this.setTime('day');
 }
 buildServiceVehicles(dark){
  const scene=this.scene,asphalt=mat('#30383a',.9),yellow=mat('#e4aa27',.58,.08),white=mat('#e6e9e4',.55,.08),green=mat('#55966a',.56,.04),windowMat=mat('#294b53',.26,.22),reflective=mat('#f2d85e',.42,.12),tankerMat=mat('#d7ddda',.3,.24),aluminium=mat('#aeb6b3',.38,.55);
  const headlight=new T.MeshStandardMaterial({color:'#fff5d5',emissive:'#80642b',roughness:.32}),tailLight=new T.MeshStandardMaterial({color:'#bd392a',emissive:'#54100b',roughness:.38}),beaconMat=new T.MeshStandardMaterial({color:'#ff9d26',emissive:'#a94508',roughness:.3});
  const wheelGeo=new T.CylinderGeometry(.48,.48,.42,16),rimGeo=new T.CylinderGeometry(.255,.255,.1,16),hubGeo=new T.CylinderGeometry(.105,.105,.12,12),roundedGeometries=new Map(),decalMaterials=new Map(),vehicles=[];
  const roundedGeo=(w,h,d)=>{
   const key=`${w}|${h}|${d}`;let g=roundedGeometries.get(key);
   if(!g){g=new RoundedBoxGeometry(w,h,d,2,Math.min(.22,w*.18,h*.18,d*.18));roundedGeometries.set(key,g);}
   return g;
  };
  const addBox=(root,x,y,z,w,h,d,material)=>{
   const mesh=new T.Mesh(boxGeo(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);return mesh;
  };
  const addRounded=(root,x,y,z,w,h,d,material)=>{
   const mesh=new T.Mesh(roundedGeo(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);return mesh;
  };
  const decal=(root,text,x,y,z,w,h,bg='#24363a',fg='#f4edcf')=>{
   const key=`${text}|${bg}|${fg}`;let material=decalMaterials.get(key);
   if(!material){
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=96;const ctx=canvas.getContext('2d');
    ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(2,2,380,92,14);ctx.fill();
    ctx.fillStyle=fg;ctx.font='bold 54px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,50,360);
    material=new T.MeshBasicMaterial({map:canvasTex(canvas),side:T.DoubleSide,toneMapped:false});decalMaterials.set(key,material);
   }
   const mesh=new T.Mesh(new T.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);
   if(z<0){mesh.rotation.y=Math.PI;mesh.scale.x=-1;}
   mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);
  };
  const wheels=(root,points,wheelGroups)=>{
   for(const [x,z,r=.48] of points){
    const axle=new T.Group();axle.rotation.x=Math.PI/2;axle.scale.setScalar(r/.48);axle.position.set(x,r,z);
    const wheel=new T.Group();wheel.userData.radius=r;axle.add(wheel);
    const tire=new T.Mesh(wheelGeo,asphalt);wheel.add(tire);
    for(const side of [-1,1]){
     const rim=new T.Mesh(rimGeo,aluminium),hub=new T.Mesh(hubGeo,asphalt);
     rim.position.y=side*.235;hub.position.y=side*.295;wheel.add(rim,hub);
    }
    axle.castShadow=false;root.add(axle);wheelGroups.push(wheel);
   }
  };
  const truck=(root,wheelGroups,{length=7,width=2.8,bodyColor=yellow,cabColor=yellow}={})=>{
   addRounded(root,-.1,1.15,0,length,1.5,width,bodyColor);
   addRounded(root,-.1,.56,0,length*.78,.45,width*.68,asphalt);
   const cabX=length*.32;
   addRounded(root,cabX,2.15,0,length*.3,2,width*.84,cabColor);
   addBox(root,cabX+length*.15+.04,2.45,0,.08,.92,width*.67,windowMat);
   for(const side of [-1,1]){
    addBox(root,cabX-.1,2.47,side*width*.425,length*.14,.76,.08,windowMat);
    addBox(root,cabX+.2,2.78,side*width*.55,.72,.08,.24,asphalt);
    addRounded(root,cabX+.55,2.82,side*width*.62,.34,.28,.12,windowMat);
    addRounded(root,length*.25,1.55,side*width*.505,length*.54,.2,.08,reflective);
    addRounded(root,length*.49,1.45,side*width*.43,.18,.3,.1,tailLight);
    addRounded(root,length*.49,1.55,side*width*.43,.18,.24,.1,headlight);
   }
   addRounded(root,cabX+.35,1.27,0,.42,.18,width*.95,asphalt);
   addBox(root,length*.5,1.5,0,.2,.3,width*.9,white);
   wheels(root,[[-length*.34,-width*.4],[-length*.34,width*.4],[length*.34,-width*.4],[length*.34,width*.4]],wheelGroups);
  };
  const cart=(root,x,index,wheelGroups)=>{
   addRounded(root,x,1.03,0,4.2,.22,2.5,aluminium);
   for(const side of [-1,1]){
    addBox(root,x,1.72,side*1.14,4.05,.12,.12,aluminium);
    for(const dx of [-1.85,-.95,0,.95,1.85])addBox(root,x+dx,1.42,side*1.14,.08,.62,.08,aluminium);
   }
   addBox(root,x-2.02,1.46,0,.12,.66,2.25,aluminium);addBox(root,x+2.02,1.46,0,.12,.66,2.25,aluminium);
   addBox(root,x,1.8,0,3.8,.08,2.2,reflective);
   const luggage=mat(index%2?'#627c8b':'#9b7955',.82);
   addRounded(root,x-.8,2.25,-.48,1.45,.72,.9,luggage);addRounded(root,x+.72,2.18,.45,1.35,.58,.88,luggage);
   addBox(root,x-.8,2.63,-.48,.06,.12,.93,asphalt);addBox(root,x+.72,2.48,.45,.06,.1,.91,asphalt);
   wheels(root,[[x-1.3,-1.25],[x-1.3,1.25],[x+1.3,-1.25],[x+1.3,1.25]].map(([wx,wz])=>[wx,wz,.36]),wheelGroups);
   addBox(root,x+2.35,.55,0,.8,.14,.14,asphalt);addBox(root,x+2.85,.72,0,.14,.12,.12,aluminium);
  };
  const addVehicle=(type,route,speed,startDelay=0)=>{
   const root=new T.Group(),wheelGroups=[];
   if(type==='tug'){
    addRounded(root,-.2,1.05,0,5.1,1.3,2.8,yellow);addRounded(root,1.3,1.88,0,1.95,1.45,2.35,yellow);
    addBox(root,2.3,2.1,0,.08,.82,1.9,windowMat);
    for(const side of [-1,1]){
     addBox(root,1.25,2.12,side*1.2,.9,.72,.08,windowMat);
     addBox(root,1.95,2.45,side*1.52,.62,.08,.22,asphalt);addRounded(root,2.15,2.5,side*1.63,.24,.25,.12,windowMat);
     addRounded(root,2.42,1.35,side*.9,.16,.28,.18,headlight);
     addRounded(root,-2.72,1.27,side*.9,.14,.22,.16,tailLight);
     addBox(root,-1.5,1.6,side*1.42,1.2,.18,.08,reflective);
    }
    addRounded(root,-1.9,.45,0,1.1,.32,2.1,asphalt);addBox(root,-3, .65,0,.7,.18,.18,aluminium);
    const beacon=new T.Mesh(new T.CylinderGeometry(.16,.2,.35,10),beaconMat);beacon.position.set(1.3,2.8,0);root.add(beacon);
    for(const side of [-1,1])decal(root,'AIR TOW',.15,1.1,side*1.43,1.8,.34,'#252f2c','#f7d45c');
    wheels(root,[[-1.5,-1.18],[-1.5,1.18],[1.5,-1.18],[1.5,1.18]],wheelGroups);
   }else if(type==='fuel'){
    truck(root,wheelGroups,{length:8.6,width:3,bodyColor:yellow});
    const tank=new T.Mesh(new T.CylinderGeometry(1.12,1.12,5.6,20,1),tankerMat);tank.rotation.z=Math.PI/2;tank.position.set(-.65,2.78,0);root.add(tank);
    for(const x of [-3.1,-2.25,-1.4,.1,1.25]){const ring=new T.Mesh(new T.TorusGeometry(1.1,.045,7,24),aluminium);ring.rotation.y=Math.PI/2;ring.position.set(x,2.78,0);root.add(ring);}
    for(const side of [-1,1]){
     addBox(root,-.65,3.88,side*.55,4.35,.08,.14,reflective);
     addRounded(root,-.65,2.62,side*1.08,4.2,.22,.1,yellow);
     addBox(root,-2.5,1.95,side*1.58,.12,1.65,.1,aluminium);addBox(root,-2.05,1.95,side*1.58,.12,1.65,.1,aluminium);
     for(let rung=0;rung<5;rung++)addBox(root,-2.27,1.4+rung*.27,side*1.58,.44,.07,.08,aluminium);
     const hose=new T.Mesh(new T.TorusGeometry(.44,.07,8,16),asphalt);hose.position.set(-3.65,1.72,side*1.4);hose.rotation.y=Math.PI/2;root.add(hose);
     addBox(root,-3.65,1.18,side*1.5,.75,.22,.12,yellow);
    }
    const beacon=new T.Mesh(new T.CylinderGeometry(.15,.18,.28,10),beaconMat);beacon.position.set(2.75,3.25,0);root.add(beacon);
    for(const side of [-1,1])decal(root,'JET A-1',-.55,2.55,side*1.15,2.1,.42,'#263b43','#f2d35a');
   }else if(type==='baggage'){
    truck(root,wheelGroups,{length:5.8,width:2.5,bodyColor:yellow});
    for(const side of [-1,1])decal(root,'BAGGAGE',.1,1.1,side*1.28,2.2,.34,'#344a54','#f4e3a8');
    for(let i=0;i<3;i++)cart(root,-5.3-i*5.4,i,wheelGroups);
   }else{
    const length=11.2,width=3.1;
    addRounded(root,-.25,1.95,0,length,3.2,width,white);
    addRounded(root,-.25,.62,0,length*.9,.42,width*.92,green);
    addBox(root,5.38,2.72,0,.08,1.35,2.45,windowMat);
    addBox(root,-.3,3.57,0,8.8,.16,width*.88,green);
    addBox(root,5.42,3.52,0,.08,.4,1.35,windowMat);
    addBox(root,5.3,1.13,0,.16,.2,width*.82,reflective);
    for(let i=0;i<5;i++){
     const x=-3.65+i*1.35;
     addRounded(root,x,2.72,-width*.49,.98,1.27,.1,windowMat);
     addRounded(root,x,2.72,width*.49,.98,1.27,.1,windowMat);
     if(i<4)for(const side of [-1,1])addBox(root,x+.59,2.72,side*width*.49,.08,1.3,.11,white);
    }
    for(const side of [-1,1]){
     addRounded(root,-2.8,2.0,side*(width*.5+.035),1.25,2.15,.08,green);
     addRounded(root,-2.8,2.18,side*(width*.5+.09),.82,1.35,.06,windowMat);
     addBox(root,4.7,2.93,side*1.82,.38,.1,.26,asphalt);addRounded(root,4.85,2.98,side*1.98,.2,.28,.12,windowMat);
     addRounded(root,5.25,1.42,side*1.0,.13,.32,.2,headlight);addRounded(root,5.25,1.42,side*1.33,.13,.32,.2,headlight);
     addRounded(root,-5.7,1.4,side*1.05,.12,.28,.16,tailLight);
     decal(root,'AIRPORT SHUTTLE',-.45,1.13,side*1.58,3.1,.32,'#31553d','#f7f3df');
    }
    wheels(root,[[-4.3,-1.35],[-4.3,1.35],[4.2,-1.35],[4.2,1.35]],wheelGroups);
   }
   root.position.set(route[0][0],0,route[0][1]);scene.add(root);
   vehicles.push({root,route,speed,next:1,wait:startDelay,wheels:wheelGroups,task:type});
  };
  addVehicle('tug',[[-1370,-205,2],[-1370,-255,1],[-1050,-255,3],[-1050,-205,2]],4.8,1);
  addVehicle('fuel',[[-980,-230,1],[-980,-300,4],[-980,-230,0],[-730,-230,0],[-730,-300,1],[-730,-230,1],[0,-230,1],[0,-300,4],[250,-300,1],[250,-230,1],[980,-230,1],[980,-300,4],[1210,-300,1],[1210,-230,1]],4,3);
  addVehicle('baggage',[[1340,-205,1],[-1340,-205,2],[-1340,-255,2],[1340,-255,1]],5,4);
  addVehicle('bus',[[-1330,-185,2],[-700,-185,3],[0,-185,3],[700,-185,3],[1330,-185,2],[1330,-225,1],[-1330,-225,2]],5.5,0);
  addVehicle('bus',[[1330,-195,3],[700,-195,2],[0,-195,2],[-700,-195,2],[-1330,-195,3],[-1330,-235,1],[1330,-235,2]],5,8);
  this.vehicles=vehicles;
 }
 buildLandmarks(){
  const scene=this.scene,plaza=mat('#aaa99e',.9),sign=mat('#35444a',.72),steel=new T.MeshStandardMaterial({color:'#76634f',roughness:.58,metalness:.48}),stone=mat('#a89a80',.86),roof=mat('#465157',.75),gold=mat('#b89a56',.48,.5),copper=new T.MeshStandardMaterial({color:'#78927b',roughness:.58,metalness:.34}),white=new T.MeshPhysicalMaterial({color:'#eeeae0',roughness:.3,clearcoat:.65,clearcoatRoughness:.22}),glass=new T.MeshPhysicalMaterial({color:'#8faebc',roughness:.2,metalness:.42,clearcoat:.7,clearcoatRoughness:.16});
  const add=(g,geometry,material,x,y,z,shadow=true)=>{const o=new T.Mesh(geometry,material);o.position.set(x,y,z);o.castShadow=shadow;o.receiveShadow=shadow;g.add(o);return o;};
  const box=(g,w,h,d,x,y,z,m)=>add(g,boxGeo(w,h,d),m,x,y,z);
  const cylinder=(g,rt,rb,h,x,y,z,m,n=10)=>add(g,new T.CylinderGeometry(rt,rb,h,n,1),m,x,y,z);
  const sphere=(g,r,x,y,z,m)=>add(g,new T.SphereGeometry(r,12,8),m,x,y,z);
  const beam=(g,a,b,r,m)=>{const from=new T.Vector3(...a),to=new T.Vector3(...b),dir=to.clone().sub(from),len=dir.length(),mid=from.add(to).multiplyScalar(.5),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize());if(g.name==='landmark-eiffel'){g.userData.beamMatrices??=[];g.userData.beamMatrices.push(new T.Matrix4().compose(mid,q,new T.Vector3(r,len,r)));return;}const o=add(g,new T.CylinderGeometry(r*.82,r,len,7,1),m,0,0,0);o.position.copy(mid);o.quaternion.copy(q);return o;};
  for(const site of LANDMARK_SITES){
   this.ground(site.x,site.z,site.kind==='opera'?220:180,site.kind==='opera'?150:160,plaza,.008);
   const g=new T.Group();g.name='landmark-'+site.kind;g.position.set(site.x,0,site.z);scene.add(g);
   if(site.kind==='eiffel'){
    g.userData.beamMatrices=[];const levels=[[0,64],[78,48],[150,32],[276,12],[300,5]];
    for(const sx of [-1,1])for(const sz of [-1,1])beam(g,[sx*64,0,sz*64],[sx*5,300,sz*5],3.2,steel);
    for(let i=0;i<levels.length-1;i++){const [y0,w0]=levels[i],[y1,w1]=levels[i+1];
     for(const zSide of [-1,1]){beam(g,[-w0,y0,zSide*w0],[w0,y0,zSide*w0],1.6,steel);beam(g,[-w1,y1,zSide*w1],[w1,y1,zSide*w1],1.4,steel);beam(g,[-w0,y0,zSide*w0],[w1,y1,zSide*w1],1.1,steel);beam(g,[w0,y0,zSide*w0],[-w1,y1,zSide*w1],1.1,steel);}
     for(const xSide of [-1,1]){beam(g,[xSide*w0,y0,-w0],[xSide*w0,y0,w0],1.6,steel);beam(g,[xSide*w1,y1,-w1],[xSide*w1,y1,w1],1.4,steel);beam(g,[xSide*w0,y0,-w0],[xSide*w1,y1,w1],1.1,steel);beam(g,[xSide*w0,y0,w0],[xSide*w1,y1,-w1],1.1,steel);}
    }
    const frame=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,7),steel,g.userData.beamMatrices.length);g.userData.beamMatrices.forEach((m,i)=>frame.setMatrixAt(i,m));frame.castShadow=true;frame.receiveShadow=true;g.add(frame);delete g.userData.beamMatrices;
    for(const [y,w] of levels.slice(1,4))box(g,w*1.65,3,w*1.65,0,y,0,steel);
    cylinder(g,.7,2.2,24,0,312,0,steel,8);sphere(g,2.4,0,326,0,gold);
   }else if(site.kind==='bigben'){
    const clockDark=mat('#343b3c',.66),dial=mat('#e6dcc2',.72);
    box(g,23,8,23,0,4,0,stone);box(g,18,15,18,0,15.5,0,stone);box(g,14,29,14,0,37.5,0,stone);box(g,17,25,17,0,64.5,0,stone);box(g,18,4,18,0,79,0,roof);cylinder(g,0,9,13,0,87.5,0,roof,8);cylinder(g,.45,1.6,8,0,98,0,gold,8);
    for(const [angle,x,z] of [[0,0,8.7],[Math.PI,0,-8.7],[Math.PI/2,8.7,0],[-Math.PI/2,-8.7,0]]){const f=new T.Group();f.position.set(x,66,z);f.rotation.y=angle;g.add(f);add(f,new T.CircleGeometry(5.1,28),dial,0,0,0,false);add(f,new T.TorusGeometry(5.15,.42,8,28),gold,0,0,.08,false);const hands=new T.Group();hands.position.z=.12;f.add(hands);box(hands,.34,4.2,.18,0,.55,0,clockDark);const minute=box(hands,3.2,.26,.18,.7,-.45,0,clockDark);minute.rotation.z=-.29;sphere(hands,.48,0,0,.16,gold);}g.scale.y=1.5;
   }else if(site.kind==='burj'){
    const towerMat=new T.MeshPhysicalMaterial({color:'#9ab9c5',roughness:.22,metalness:.42,clearcoat:.72,clearcoatRoughness:.15});box(g,150,8,150,0,4,0,stone);
    for(let i=0;i<16;i++){const y=i*40+20,r0=68*Math.pow(1-i/17,1.42)+3.5,r1=68*Math.pow(1-(i+1)/17,1.42)+2.4,o=cylinder(g,r1,r0,40,0,y,0,towerMat,12);o.rotation.y=i*.13;}
    cylinder(g,1,8,150,0,715,0,towerMat,12);cylinder(g,0,.95,38,0,809,0,roof,8);
   }else if(site.kind==='liberty'){
    box(g,38,8,38,0,4,0,stone);box(g,29,17,29,0,16.5,0,stone);box(g,21,15,21,0,32.5,0,stone);box(g,14,9,14,0,44.5,0,stone);
    cylinder(g,2.1,6.8,18,0,58,0,copper,9);box(g,4.5,10,4.5,0,72,0,copper);sphere(g,2.8,0,79,0,copper);
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7;beam(g,[Math.cos(a)*2.1,80,Math.sin(a)*2.1],[Math.cos(a)*4.2,87,Math.sin(a)*4.2],.55,copper);}
    beam(g,[2,68,0],[8,89,0],1.6,copper);sphere(g,2.5,8,91,0,gold);box(g,2.6,12,3,3,66,-2,copper);g.scale.y=1.4;
   }else if(site.kind==='opera'){
    box(g,152,8,70,0,4,0,stone);box(g,126,9,52,0,12,0,glass);box(g,145,3,4,0,17,24,gold);
    const shellGeo=new T.SphereGeometry(1,20,12,0,Math.PI,0,Math.PI/2),sails=[[-48,18,-7,18,29,15,-.34],[-23,20,5,21,38,17,-.22],[4,20,-3,21,36,16,.22],[31,17,8,18,28,14,.38],[50,15,-5,14,22,12,.45]];
    for(const [x,y,z,w,h,d,lean] of sails){const sail=add(g,shellGeo,white,x,y,z);sail.scale.set(w,h,d);sail.rotation.z=lean;}
   }
   // Small airport-style plaques identify the miniature skyline without crowding the runway.
   this.box(site.x,3,site.z+112,1.2,6,.9,sign,true);this.box(site.x,7,site.z+112,66,8,1.2,sign,true);this.label(site.title,site.x,7,site.z+112.7,62,5,false,'#f3eddd','#35444a');
  }
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
 // Image-based lighting captured from the same physical sky as the backdrop, plus a ground-bounce disc,
 // so paint, glass and water reflect an outdoor scene instead of an indoor room.
 envFor(mode){
  if(this.envs[mode])return this.envs[mode];
  const night=mode==='night',dusk=mode==='dusk',s=new T.Scene(),sky=new Sky();sky.scale.setScalar(10000);const u=sky.material.uniforms;
  u.turbidity.value=dusk?8:night?2.2:2.5;u.rayleigh.value=dusk?2.4:night?2.3:.7;u.mieCoefficient.value=dusk?.02:night?.003:.005;u.mieDirectionalG.value=(night||dusk)?.82:.8;
  u.sunPosition.value.set(300,night?-160:dusk?90:360,-250).normalize();s.add(sky);
  const floor=new T.Mesh(new T.CircleGeometry(95,32),new T.MeshBasicMaterial({color:night?0x070b12:dusk?0x6a5a50:0x7d9266}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.5;s.add(floor);
  const pmrem=new T.PMREMGenerator(this.renderer),tex=pmrem.fromScene(s,.02).texture;pmrem.dispose();this.envs[mode]=tex;return tex;
 }
 // A soft contact shadow so aircraft that cast no real shadow still sit on the apron.
 softShadow(x,z,w,d,rotY=0,opacity=.42){
  if(!this.blobTex){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,6,64,64,64);r.addColorStop(0,'rgba(0,0,0,1)');r.addColorStop(.55,'rgba(0,0,0,.55)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,128,128);this.blobTex=canvasTex(c);this.blobMat=new T.MeshBasicMaterial({map:this.blobTex,transparent:true,depthWrite:false,opacity});}
  const m=this.ground(x,z,w,d,this.blobMat,.085);m.rotation.z=rotY;m.updateMatrix();m.renderOrder=200;return m;
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
  this.sun.intensity=night?.35:dusk?2.6:3.2;this.sun.color.set(night?0x9db4ff:dusk?0xffa868:0xfff2d8);
  this.hemi.intensity=night?.45:dusk?.75:1.15;this.scene.environment=this.envFor(mode);this.scene.environmentIntensity=night?.55:dusk?.8:1;this.hemi.color.set(night?0x6b86bf:dusk?0xffcfa8:0xbddcff);this.hemi.groundColor.set(night?0x1e2a3a:dusk?0x6a5a56:0x72835f);
  // Daylight: a slightly lower sun models the airframe with longer shadows, and a cleaner,
  // bluer sky/haze keeps the white fuselage from merging into a washed-out horizon.
  this.sunOffset=new T.Vector3(300,night?160:dusk?90:360,-250);
  u.sunPosition.value.copy(this.sunOffset).normalize();u.turbidity.value=dusk?8:2.5;u.rayleigh.value=dusk?2.4:.7;u.mieCoefficient.value=dusk?.02:.005;
  this.sky.visible=!night;this.stars.visible=night;this.scene.background=night?new T.Color('#081426'):null;
  this.scene.fog.color.set(night?0x142339:dusk?0xe0b79c:0x8fbde8);this.scene.fog.density=night?.00008:dusk?.0001:.00009;
  this.renderer.toneMappingExposure=night?1:dusk?.95:.7;
  this.cloudMat.color.set(night?0x2c3a58:dusk?0xffb890:0xffffff);this.cloudMat.opacity=night?.7:dusk?.8:.85;
  this.cityMat.emissiveIntensity=night?1.1:dusk?.35:0;
  this.glass.emissive.set(0xffc880);this.glass.emissiveIntensity=night?.1:dusk?.04:0;
  const glow=night?1:dusk?.6:0;this.glow.material.opacity=glow;this.glow.visible=glow>0;
  this.scaleLamps(night?2:dusk?1.5:1);
 }
 updateServiceVehicles(dt){
  for(const vehicle of this.vehicles){
   vehicle.wait=Math.max(0,vehicle.wait-dt);
   if(vehicle.wait>0||dt<=0)continue;
   let distanceLeft=vehicle.speed*dt,moved=0;
   for(let hops=0;distanceLeft>0&&hops<8;hops++){
    const [targetX,targetZ,dwell]=vehicle.route[vehicle.next],dx=targetX-vehicle.root.position.x,dz=targetZ-vehicle.root.position.z,distance=Math.hypot(dx,dz);
    if(distance<=distanceLeft){
     vehicle.root.position.set(targetX,0,targetZ);distanceLeft-=distance;moved+=distance;vehicle.next=(vehicle.next+1)%vehicle.route.length;vehicle.wait=dwell;
     if(dwell>0)break;
    }else{
     const step=distanceLeft/distance;vehicle.root.position.x+=dx*step;vehicle.root.position.z+=dz*step;moved+=distanceLeft;
     vehicle.root.rotation.y=-Math.atan2(dz,dx);distanceLeft=0;
    }
    if(distance>0)vehicle.root.rotation.y=-Math.atan2(dz,dx);
   }
   for(const wheel of vehicle.wheels)wheel.rotation.y+=moved/wheel.userData.radius;
  }
 }
 update(dt,pos){
  this.t+=dt;if(this.waterNormal){this.waterNormal.offset.x=(this.t*.0021)%1;this.waterNormal.offset.y=(this.t*.0013)%1;}
  this.updateServiceVehicles(dt);
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
