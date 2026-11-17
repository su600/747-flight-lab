import * as T from 'three';
import {cockpitWiperSweepAngle} from './cockpit-view.js';

// Forward windshield panes, measured from cockpit.windows in 747-400_fuselage.ac,
// transformed from the native model into the aircraft root's unscaled frame.
export const WINDSHIELD_PANES=[-1,1].map(side=>({
 side,
 bottomOuter:new T.Vector3(25.184925,3.459794,side*.665426),
 bottomInner:new T.Vector3(25.432405,3.445,side*.082692),
 topOuter:new T.Vector3(24.568205,3.993305,side*.413114),
 topInner:new T.Vector3(24.682913,3.990055,side*.082692)
}));
export const WIPER_LENGTH=.94;

// Local +Z points right, +Y points up the glass, and +X is its outward normal.
export function windshieldBasis(pane){
 const z=pane.bottomInner.clone().sub(pane.bottomOuter).multiplyScalar(-pane.side).normalize();
 const y=pane.topOuter.clone().sub(pane.bottomOuter);y.addScaledVector(z,-y.dot(z)).normalize();
 const x=y.clone().cross(z).normalize();
 return {x,y,z,quaternion:new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z))};
}
export function windshieldPoint(pane,u,v){
 // Match the two triangles and UV interpolation used by the mesh exactly.
 if(u+v<=1)return pane.bottomOuter.clone().multiplyScalar(1-u-v).addScaledVector(pane.bottomInner,u).addScaledVector(pane.topOuter,v);
 return pane.topInner.clone().multiplyScalar(u+v-1).addScaledVector(pane.topOuter,1-u).addScaledVector(pane.bottomInner,1-v);
}
export function windshieldWiperCoordinates(pane,point){
 const {y,z}=windshieldBasis(pane),d=point.clone().sub(pane.bottomOuter);
 return {inboard:d.dot(z)*-pane.side,up:d.dot(y)};
}
// Include turnarounds even when a slow frame spans an extremum or a whole cycle.
export function wiperSweepRange(previous,time){
 if(time<previous)previous=time;
 const toRadians=Math.PI/180,a=cockpitWiperSweepAngle(previous)*toRadians,b=cockpitWiperSweepAngle(time)*toRadians;
 let lo=Math.min(a,b),hi=Math.max(a,b);
 const first=Math.ceil(previous*3/Math.PI),last=Math.floor(time*3/Math.PI);
 if(last-first>=1){lo=0;hi=cockpitWiperSweepAngle(Math.PI/3)*toRadians;}
 else if(first===last){if(first%2===0)lo=0;else hi=cockpitWiperSweepAngle(Math.PI/3)*toRadians;}
 return [lo,hi];
}

// Canvas textures are mapped to the actual panes, never to the viewport.
export function createCockpitWindshield(parent,scale=new T.Vector3(1,1,1),makeCanvas=()=>document.createElement('canvas')){
 const root=new T.Group();root.name='cockpit-windshield-rain';root.scale.copy(scale);parent.add(root);
 const panes=WINDSHIELD_PANES.map((pane,index)=>{
  const canvas=makeCanvas();canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const {x}=windshieldBasis(pane),offset=x.multiplyScalar(-.012);
  const points=[pane.bottomOuter,pane.bottomInner,pane.topOuter,pane.topInner].map(p=>p.clone().add(offset));
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));geometry.setIndex([0,1,2,2,1,3]);geometry.computeVertexNormals();
  const material=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
  const mesh=new T.Mesh(geometry,material);mesh.name=`windshield-rain-${index}`;mesh.renderOrder=21;root.add(mesh);
  return {pane,canvas,ctx,texture,mesh};
 });
 const drops=[];let budget=0,lastTime=null;
 function draw(){
  for(const {ctx,texture} of panes){ctx.clearRect(0,0,512,512);texture.needsUpdate=true;}
  for(const d of drops){const ctx=panes[d.pane].ctx,x=d.u*512,y=(1-d.v)*512,r=d.r;
   ctx.beginPath();ctx.ellipse(x,y,r,r*1.6,0,0,Math.PI*2);ctx.fillStyle='rgba(190,220,235,.30)';ctx.fill();ctx.strokeStyle='rgba(235,249,255,.70)';ctx.lineWidth=.8;ctx.stroke();
   if(r>2){ctx.beginPath();ctx.moveTo(x,y-r*1.4);ctx.lineTo(x-1,y-r*4);ctx.strokeStyle='rgba(220,240,255,.23)';ctx.stroke();}
  }
 }
 return {root,panes,drops,update(dt,rain,sim,visible){
  root.visible=visible&&rain!=='off';
  if(rain==='off'){if(drops.length){drops.length=0;draw();}budget=0;lastTime=null;return;}
  const time=Number(sim.time)||0;let dirty=false;
  if(sim.wipers&&lastTime!==null){
   const [lo,hi]=wiperSweepRange(lastTime,time);
   for(let i=drops.length-1;i>=0;i--){const d=drops[i],pane=panes[d.pane].pane,{inboard,up}=windshieldWiperCoordinates(pane,windshieldPoint(pane,d.u,d.v));
    const angle=Math.atan2(up,inboard);if(Math.hypot(inboard,up)<=WIPER_LENGTH&&angle>=lo-.02&&angle<=hi+.02){drops.splice(i,1);dirty=true;}
   }
  }
  lastTime=sim.wipers?time:null;
  const max=rain==='heavy'?200:80;budget+=dt*(rain==='heavy'?65:25);
  while(budget>=1&&drops.length<max){budget--;drops.push({pane:Math.random()<.5?0:1,u:Math.random(),v:Math.random(),r:1+Math.random()*2.5});dirty=true;}
  budget=Math.min(budget,1);if(dirty)draw();
 }};
}
