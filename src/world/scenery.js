// Compact, deterministic districts away from the airport and the east/west approach corridor.
import * as T from 'three';

// These reservations also keep the older scattered city and trees out of the new districts.
export const SCENERY_ZONES=[
 {name:'city',minX:3000,maxX:4800,minZ:-3800,maxZ:-2300},
 {name:'fields',minX:3100,maxX:4900,minZ:1550,maxZ:3400},
 {name:'harbour',minX:-4700,maxX:-2850,minZ:4800,maxZ:6100},
 {name:'cargo',minX:1800,maxX:2300,minZ:-1250,maxZ:-851}
];
export const inSceneryZone=(x,z)=>SCENERY_ZONES.some(b=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ);
const standard=(color,roughness=.8,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});

export class Scenery {
 constructor(scene,cityMaterial){
  this.root=new T.Group();this.root.name='scenery';scene.add(this.root);
  this.batches=[];this.boats=[];this.t=0;this.night=false;this.bladeTransform=new T.Object3D();
  const box=new T.BoxGeometry(1,1,1),plane=new T.PlaneGeometry(1,1),cylinder=new T.CylinderGeometry(1,1,1,12),cone=new T.ConeGeometry(1,1,4);
  const transform=new T.Object3D(),color=new T.Color();
  const batch=(name,geometry,material,items,lowCount=items.length)=>{
   const mesh=new T.InstancedMesh(geometry,material,items.length);mesh.name=name;
   items.forEach((v,i)=>{transform.position.set(v.x,v.y,v.z);transform.rotation.set(v.rx||0,v.ry||0,v.rz||0);transform.scale.set(v.w,v.h,v.d);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);if(v.color)mesh.setColorAt(i,color.set(v.color));});
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.receiveShadow=true;this.root.add(mesh);this.batches.push({mesh,high:items.length,low:lowCount});return mesh;
  };
  const ground=(x,z,w,d,y=.1)=>({x,y,z,w,h:d,d:1,rx:-Math.PI/2});
  const dark=standard('#586668'),white=standard('#e4e6df',.62),red=standard('#b9473e'),blue=standard('#527b8b'),roof=standard('#95a4a3',.65,.18);
  // A walkable grid with varied stepped towers; all window glow reuses the existing city material.
  batch('city-plaza',plane,standard('#7b8581'),[ground(3900,-3140,1600,900,.04)]);
  const roads=[];for(let i=0;i<8;i++)roads.push(ground(3200+i*200,-3140,16,900,.06));
  for(let i=0;i<6;i++)roads.push(ground(3900,-3590+i*180,1600,15,.06));
  batch('city-streets',plane,dark,roads);
  const buildings=[],setbacks=[],roofs=[],antennas=[],beacons=[];
  // Interleave the grid so reducing instance counts leaves a complete-looking district.
  for(let i=0;i<35;i++){
   const cell=i*12%35,row=Math.floor(cell/7),col=cell%7,x=3300+col*200,z=-3500+row*180;
   const core=Math.max(0,1-Math.hypot((col-3)/4,(row-2)/3));
   const h=65+Math.round(core*150)+((i*37)%65),w=76+(i*19)%45,d=65+(i*23)%40;
   const tint=['#c7d7d4','#c6d0d2','#ddd4c3','#aebfc2','#d5d9d4'][i%5];
   buildings.push({x,y:h/2,z,w,h,d,color:tint});
   if(i%3!==0){const sh=22+(i*13)%28;setbacks.push({x,y:h+sh/2,z,w:w*.65,h:sh,d:d*.65,color:tint});
    if(h>160){antennas.push({x,y:h+sh+9,z,w:2,h:18,d:2});beacons.push({x,y:h+sh+19,z,w:4,h:4,d:4});}
   }else roofs.push({x,y:h+12,z,w:w*.68,h:24,d:d*.68,ry:Math.PI/4});
  }
  batch('city-towers',box,cityMaterial,buildings,20);
  batch('city-setbacks',box,cityMaterial,setbacks,12);
  batch('city-roofs',cone,roof,roofs,5);
  batch('city-antennas',box,dark,antennas,Math.ceil(antennas.length/2));
  this.beaconMaterial=new T.MeshBasicMaterial({color:'#ff4939',toneMapped:false});
  this.beacons=batch('city-obstruction-lights',new T.SphereGeometry(1,8,6),this.beaconMaterial,beacons,Math.ceil(beacons.length/2));
  // Low raised crop beds remain visible against the huge ground plane at flight distances.
  // One tiny shared texture supplies furrows without coplanar geometry or per-plant draw calls.
  const plots=[],crops=['#a5a05d','#7d995f','#b4a66a','#82975c','#b3ad79','#718b59'];
  for(let i=0;i<20;i++){const cell=i*7%20,r=Math.floor(cell/5),c=cell%5;plots.push({x:3300+c*320,y:1.1,z:1800+r*300,w:280,h:2.2,d:260,color:crops[(c+r*3)%crops.length]});}
  const pixels=new Uint8Array(64*4);for(let i=0;i<64;i++){const value=i%8===0?175:255;pixels.set([value,value,value,255],i*4);}
  const furrows=new T.DataTexture(pixels,64,1);furrows.colorSpace=T.SRGBColorSpace;furrows.magFilter=T.LinearFilter;furrows.minFilter=T.LinearFilter;furrows.needsUpdate=true;
  const cropMaterial=standard('#ffffff');cropMaterial.map=furrows;
  batch('crop-fields',box,cropMaterial,plots,12);
  // Wind farm at the field edge. The blades are one dynamic instanced draw call.
  const turbines=[];for(let i=0;i<6;i++)turbines.push({x:3300+i*270,z:3200});
  batch('wind-towers',new T.CylinderGeometry(.65,1,1,10),white,turbines.map(p=>({...p,y:62,w:7,h:124,d:7})),3);
  batch('wind-nacelles',box,white,turbines.map(p=>({...p,y:125,w:14,h:8,d:24})),3);
  this.blades=batch('wind-blades',box,white,Array.from({length:18},()=>({x:0,y:0,z:0,w:1,h:1,d:1})),9);
  this.turbines=turbines;
  // Cargo depot behind the hangars, outside all existing airport surfaces and routes.
  batch('cargo-yard',plane,standard('#777f7b'),[ground(2050,-1050,400,300,.09)]);
  const containers=[];for(let row=0;row<5;row++)for(let col=0;col<7;col++){
   const x=1890+col*50,z=-1160+row*50;containers.push({x,y:5,z,w:34,h:10,d:20,color:['#b25d49','#668992','#ccaa72','#d2d3c4'][((col+row*2)%4)]});
   if((col+row)%3===0)containers.push({x,y:15,z,w:34,h:10,d:20,color:['#b25d49','#668992','#ccaa72'][col%3]});
  }
  batch('cargo-containers',box,standard('#ffffff'),containers,24);
  const tanks=[1895,1985,2075,2165].map(x=>({x,y:18,z:-910,w:28,h:36,d:28}));
  batch('fuel-tanks',cylinder,white,tanks,2);
  batch('fuel-tank-roofs',new T.ConeGeometry(1,1,12),roof,tanks.map(p=>({...p,y:39,h:7})),2);
  // Harbour pier and striped lighthouse. Nothing casts moving shadows on the sea.
  batch('harbour-pier',box,standard('#a69b83'),[{x:-3700,y:2,z:5200,w:100,h:4,d:400},{x:-3700,y:2,z:5380,w:250,h:4,d:75}]);
  batch('lighthouse',new T.CylinderGeometry(.7,1,1,12),white,[{x:-3700,y:26,z:5380,w:20,h:48,d:20}]);
  batch('lighthouse-bands',new T.CylinderGeometry(.82,.9,1,12),red,[{x:-3700,y:18,z:5380,w:20,h:9,d:20},{x:-3700,y:37,z:5380,w:20,h:9,d:20}]);
  batch('lighthouse-lantern',cylinder,dark,[{x:-3700,y:52,z:5380,w:12,h:9,d:12},{x:-3700,y:58,z:5380,w:15,h:3,d:15}]);
  this.lantern=batch('lighthouse-lamp',cylinder,new T.MeshBasicMaterial({color:'#ffe5a0',toneMapped:false}),[{x:-3700,y:53,z:5380,w:10,h:5,d:10}]);
  const beamGeo=new T.BufferGeometry();beamGeo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,650,0,-80,650,0,80],3));beamGeo.computeVertexNormals();
  this.beam=new T.Mesh(beamGeo,new T.MeshBasicMaterial({color:'#ffebb0',transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));this.beam.position.set(-3700,54,5380);this.root.add(this.beam);
  // Two little ferries travel parallel to shore, wrapping within the reserved water zone.
  for(let i=0;i<2;i++){
   const g=new T.Group();g.name='coastal-ferry';const hull=new T.Mesh(box,i?red:blue);hull.scale.set(105,13,28);hull.position.y=8;g.add(hull);
   const cabin=new T.Mesh(box,white);cabin.scale.set(35,14,22);cabin.position.set(-5,21,0);g.add(cabin);
   const windows=new T.Mesh(box,dark);windows.scale.set(29,5,23);windows.position.set(-5,23,0);g.add(windows);
   g.position.set(-4300+i*650,0,5630+i*270);this.root.add(g);this.boats.push(g);
  }
  this.setTime('day');this.setQuality(false);this.update(0);
  // Include all blade angles, including turbines hidden when low quality is selected.
  this.blades.computeBoundingSphere();this.blades.boundingSphere.radius+=60;
 }
 setQuality(low){for(const b of this.batches)b.mesh.count=low?b.low:b.high;this.boats[1].visible=!low;}
 setTime(mode){this.night=mode==='night';this.beam.visible=this.lantern.visible=this.night;this.beacons.visible=this.night;}
 update(dt){
  this.t+=dt;this.beam.rotation.y=this.t*.35;this.beacons.visible=this.night&&Math.sin(this.t*3)>0;
  const o=this.bladeTransform;for(let i=0;i<this.turbines.length;i++)for(let j=0;j<3;j++){
   const p=this.turbines[i],a=this.t*.45+j*Math.PI*2/3+i*.3;o.position.set(p.x+Math.sin(a)*26,125+Math.cos(a)*26,p.z+13);o.rotation.z=-a;o.scale.set(3.2,50,1.8);o.updateMatrix();this.blades.setMatrixAt(i*3+j,o.matrix);
  }this.blades.instanceMatrix.needsUpdate=true;
  this.boats.forEach((g,i)=>{g.position.x=-4450+((this.t*(7+i*2)+i*650)%1450);});
 }
}
