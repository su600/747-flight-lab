// Tail clearance from real model geometry.
// The aircraft pitches about its origin. The tail is the aft quarter of the
// model, located by the vertical fin (the highest vertex) so either model
// orientation works. A pitch angle is allowed only while the lowest tail point
// stays above the runway (plus a small margin).
import {groundLift} from './flight.js';

export const TAIL_CLEARANCE_M=0.3;
const D2R=Math.PI/180;
const MAX_PITCH_DEG=40;
const STEP_DEG=0.25;

// Rest-pose tail samples as {f, y}: f is forward distance (+ = nose), y is height
// relative to the root origin. Uses the root's inverse transform, so the result
// does not depend on the pitch or bank at the time of the call.
// Needs a Matrix4-like object from the caller's three.js (anything with clone/invert/multiply).
export function tailSamples(root,{maxPoints=6000}={}){
 root.updateMatrixWorld(true);
 const inv=root.matrixWorld.clone().invert();
 const all=[];let top=null;
 root.traverse(o=>{
  if(!o.isMesh||!o.geometry?.attributes?.position)return;
  const p=o.geometry.attributes.position;
  const e=inv.clone().multiply(o.matrixWorld).elements;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   const w={x:e[0]*x+e[4]*y+e[8]*z+e[12],y:e[1]*x+e[5]*y+e[9]*z+e[13]};
   all.push(w);
   if(!top||w.y>top.y)top=w;
  }
 });
 if(!all.length)return [];
 // The fin tip is aft. If it sits at +x, the model's forward direction is -x.
 const aftSign=top.x>0?1:-1;
 const f=all.map(p=>({f:-aftSign*p.x,y:p.y}));
 let minF=Infinity,maxF=-Infinity;for(const p of f){if(p.f<minF)minF=p.f;if(p.f>maxF)maxF=p.f;}
 const cut=minF+.25*(maxF-minF);
 let tail=f.filter(p=>p.f<=cut);
 if(tail.length>maxPoints){const stride=Math.ceil(tail.length/maxPoints);tail=tail.filter((_,i)=>i%stride===0);}
 return tail;
}

// Returns alt -> maximum allowed pitch (degrees) such that the lowest tail point
// stays above TAIL_CLEARANCE_M, using the same lift term as the renderer.
export function makePitchLimit(samples,contact,{clearance=TAIL_CLEARANCE_M}={}){
 const tailMinAt=deg=>{
  const s=Math.sin(deg*D2R),c=Math.cos(deg*D2R);let m=Infinity;
  for(const p of samples){const y=p.f*s+p.y*c;if(y<m)m=y;}
  return m;
 };
 const table=[];for(let d=0;d<=MAX_PITCH_DEG+1e-9;d+=STEP_DEG)table.push([d,tailMinAt(d)]);
 return function pitchLimit(altitude){
  let best=0;
  for(const [deg,tailMin] of table){
   const height=contact+altitude+groundLift(deg,altitude)+tailMin;
   if(height>=clearance)best=deg;else break;
  }
  return best;
 };
}
