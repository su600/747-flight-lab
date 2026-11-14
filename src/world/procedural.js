// Procedural textures, geometry and landmark layout shared by the airport/sky scene.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
let seed=747;export const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const matCache=new Map();
export const mat=(color,roughness=.8,metalness=0)=>{const key=color+'|'+roughness+'|'+metalness;let m=matCache.get(key);if(!m){m=new T.MeshStandardMaterial({color,roughness,metalness,envMapIntensity:.4});matCache.set(key,m);}return m;};
const boxCache=new Map();export const UNIT_PLANE=new T.PlaneGeometry(1,1);
export const LANDMARK_SITES=[
 {kind:'eiffel',title:'EIFFEL TOWER · PARIS',x:-1550,z:-2800,clearance:340},
 {kind:'bigben',title:'BIG BEN · LONDON',x:-750,z:-3000,clearance:260},
 {kind:'burj',title:'BURJ KHALIFA · DUBAI',x:0,z:-3200,clearance:380},
 {kind:'liberty',title:'STATUE OF LIBERTY · NYC',x:1250,z:-3000,clearance:300},
 {kind:'opera',title:'SYDNEY OPERA HOUSE',x:4200,z:4300,clearance:370}
];
export const nearLandmark=(x,z)=>LANDMARK_SITES.some(s=>(x-s.x)**2+(z-s.z)**2<s.clearance*s.clearance);
export const boxGeo=(w,h,d)=>{const key=w+'|'+h+'|'+d;let g=boxCache.get(key);if(!g){g=new T.BoxGeometry(w,h,d);boxCache.set(key,g);}return g;};
// Scatter grey specks straight into the pixel buffer. Thousands of per-speck fillRect calls with
// string colours dominated start-up; this keeps the same random sequence at a fraction of the cost.
export function speckle(ctx,S,count,alpha,wMax,hMax,gBase=0,gRange=255){
 const img=ctx.getImageData(0,0,S,S),d=img.data;
 for(let i=0;i<count;i++){
  const g=Math.floor(gBase+rnd()*gRange),px=rnd()*S,py=rnd()*S,w=1+rnd()*wMax,h=1+rnd()*hMax;
  const x0=Math.max(0,Math.floor(px)),x1=Math.min(S,Math.ceil(px+w)),y0=Math.max(0,Math.floor(py)),y1=Math.min(S,Math.ceil(py+h)),keep=1-alpha,add=g*alpha;
  for(let y=y0;y<y1;y++)for(let k=(y*S+x0)*4,end=(y*S+x1)*4;k<end;k+=4){d[k]=d[k]*keep+add;d[k+1]=d[k+1]*keep+add;d[k+2]=d[k+2]*keep+add;}
 }
 ctx.putImageData(img,0,0);
}
export function noiseTexture(base,scale=1){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.fillStyle=base;x.fillRect(0,0,512,512);speckle(x,512,70000,.065,2,2);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(scale,scale);t.anisotropy=8;return t;}
export const canvasTex=(c,srgb=true)=>{const t=new T.CanvasTexture(c);if(srgb)t.colorSpace=T.SRGBColorSpace;return t;};
// Rolling patches of meadow plus faint mowing stripes, so the ground no longer reads as one flat colour.
export function fieldTexture(){const S=1024,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d');x.fillStyle='#7d9266';x.fillRect(0,0,S,S);
 const tones=['#889d68','#72895c','#93a26b','#6a835e','#a0a672','#7b8c5a'];
 for(let i=0;i<46;i++){const px=rnd()*S,py=rnd()*S,r=60+rnd()*180,g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,tones[i%tones.length]+'aa');g.addColorStop(1,tones[i%tones.length]+'00');x.fillStyle=g;x.fillRect(px-r,py-r,r*2,r*2);}
 speckle(x,S,90000,.05,2,3);
 const t=canvasTex(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;}
// One window-grid texture serves both the colour map and the night-time glow of the distant city.
export function facadeTexture(lit){const c=document.createElement('canvas');c.width=128;c.height=256;const x=c.getContext('2d');x.fillStyle=lit?'#000':'#e4e9e8';x.fillRect(0,0,128,256);
 for(let r=0;r<16;r++)for(let k=0;k<8;k++){const on=rnd()<.55;x.fillStyle=lit?(on?'#ffd98a':'#000'):(on?'#8fa7ae':'#b9c7ca');x.fillRect(k*16+3,r*16+3,10,9);}
 const t=canvasTex(c,!lit);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;return t;}
export function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return canvasTex(c);}
// A puffy cumulus: white crowns, soft blue-grey undersides.
export function cumulusTexture(){const W=256,H=160,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
 for(let i=0;i<22;i++){const px=36+rnd()*(W-72),py=H*.5+(rnd()-.5)*H*.3-Math.abs(px-W/2)*.12,r=22+rnd()*30,g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(.55,'rgba(255,255,255,.6)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(px-r,py-r,r*2,r*2);}
 x.globalCompositeOperation='source-atop';const sh=x.createLinearGradient(0,H*.28,0,H*.78);sh.addColorStop(0,'rgba(255,255,255,0)');sh.addColorStop(1,'rgba(176,194,220,.42)');x.fillStyle=sh;x.fillRect(0,0,W,H);
 return canvasTex(c);}

// Weathered pavement: broad stains, tyre-polished lanes, expansion joints and fine cracks.
export function pavementTexture(base,scale=1,{joints=0,stains=18}={}){const S=1024,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d');x.fillStyle=base;x.fillRect(0,0,S,S);
 for(let i=0;i<stains;i++){const px=rnd()*S,py=rnd()*S,r=70+rnd()*220,g=x.createRadialGradient(px,py,0,px,py,r),d=rnd()<.5?'0,0,0':'255,255,255';g.addColorStop(0,`rgba(${d},.09)`);g.addColorStop(1,`rgba(${d},0)`);x.fillStyle=g;x.fillRect(px-r,py-r,r*2,r*2);}
 speckle(x,S,120000,.07,2,2);
 x.strokeStyle='rgba(10,12,12,.28)';x.lineWidth=1;for(let i=0;i<26;i++){let px=rnd()*S,py=rnd()*S;x.beginPath();x.moveTo(px,py);for(let k=0;k<8;k++){px+=(rnd()-.5)*46;py+=(rnd()-.35)*34;x.lineTo(px,py);}x.stroke();}
 if(joints){x.strokeStyle='rgba(20,22,22,.34)';x.lineWidth=2;for(let k=0;k<=joints;k++){const q=k*S/joints;x.beginPath();x.moveTo(q,0);x.lineTo(q,S);x.stroke();x.beginPath();x.moveTo(0,q);x.lineTo(S,q);x.stroke();}}
 const t=canvasTex(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(scale,scale);t.anisotropy=8;return t;}
// Greyscale lumps for a gentle bump on grass, so the low sun grazes real relief.
export function grassBumpTexture(){const S=512,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d');x.fillStyle='#808080';x.fillRect(0,0,S,S);
 speckle(x,S,90000,1,2,4,90,80);
 const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;}
// Tileable ripples encoded as a normal map; the sea slides this slowly past the viewer.
export function waterNormalTexture(){const S=256,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d'),img=x.createImageData(S,S);
 const waves=[];for(let i=0;i<9;i++)waves.push([1+Math.floor(rnd()*6),1+Math.floor(rnd()*6),rnd()*6.28,.35+rnd()*.65,rnd()<.5?1:-1]);
 const h=(u,v)=>{let a=0;for(const [fx,fy,ph,amp,sg] of waves)a+=amp*Math.sin(6.2832*(fx*u+sg*fy*v)+ph);return a/9;};
 for(let j=0;j<S;j++)for(let i=0;i<S;i++){const u=i/S,v=j/S,e=1/S,dx=(h(u+e,v)-h(u-e,v))*S*.045,dy=(h(u,v+e)-h(u,v-e))*S*.045,l=Math.hypot(dx,dy,1),k=(j*S+i)*4;
  img.data[k]=(-dx/l*.5+.5)*255;img.data[k+1]=(-dy/l*.5+.5)*255;img.data[k+2]=(1/l*.5+.5)*255;img.data[k+3]=255;}
 x.putImageData(img,0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;}
// Faceted but irregular peaks with rock-to-snow vertex colours; fog supplies the aerial perspective.
export function mountainGeometry(radius,height,snow){const g=new T.ConeGeometry(radius,height,11,4,true);const p=g.attributes.position,col=new Float32Array(p.count*3),c=new T.Color();
 for(let i=0;i<p.count;i++){const y=p.getY(i),k=(y+height/2)/height;
  if(k<.97){const a=1-k,j=1+(rnd()-.5)*.38*a;p.setX(i,p.getX(i)*j);p.setZ(i,p.getZ(i)*j);p.setY(i,y+(rnd()-.5)*height*.07*a);}
  if(snow&&k>.72)c.setRGB(.95,.96,.98);else if(k>.5)c.setHSL(.58,.07,.5+k*.1);else c.setHSL(.3-k*.12,.16,.28+k*.22);
  col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
 g.setAttribute('color',new T.BufferAttribute(col,3));g.computeVertexNormals();return g;}
export function rollingHillGeometry(radius,height){
 const g=new T.PlaneGeometry(radius*2,radius*2,48,48);g.rotateX(-Math.PI/2);
 const p=g.attributes.position,col=new Float32Array(p.count*3),c=new T.Color();
 for(let i=0;i<p.count;i++){
  const x=p.getX(i)/radius,z=p.getZ(i)/radius,r=Math.hypot(x,z),edge=Math.max(0,1-r*r);
  const ridges=.78+.12*Math.sin(x*5.2+z*2.7)+.08*Math.sin(z*7.4-x*3.1);
  const y=height*edge*edge*Math.max(.35,ridges)+(rnd()-.5)*height*.018*edge;
  p.setY(i,Math.max(0,y));
  const slope=Math.min(1,Math.hypot(x,z)*.8),rock=Math.max(0,(y/height-.72)*2.8);
  c.setHSL(.29-slope*.08-rock*.07,.3-rock*.16,.3+slope*.12+rock*.12);
  col.set([c.r,c.g,c.b],i*3);
 }
 g.setAttribute('color',new T.BufferAttribute(col,3));g.computeVertexNormals();return g;
}
// Three stacked skirts for conifers; two lumpy crowns for broadleaf trees.
export function pineGeometry(){const tiers=[[1,.52,.05],[.78,.42,.3],[.54,.36,.52]].map(([r,h,y])=>{const g=new T.ConeGeometry(r,h*1.15,8,1);g.translate(0,y+h*.5,0);return g;});return mergeGeometries(tiers);}
export function oakGeometry(){const a=new T.IcosahedronGeometry(1,2),b=new T.IcosahedronGeometry(.68,1);b.translate(.5,.28,.15);const c=new T.IcosahedronGeometry(.6,1);c.translate(-.46,.16,-.22);return mergeGeometries([a,b,c]);}
