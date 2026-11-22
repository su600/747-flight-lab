import * as T from 'three';

// Bogie centres in aircraft-root coordinates, +X towards the nose. Values come from
// wheel animation centres / measured tyre meshes; the 747 source coordinates are
// scaled by its native group. The orbiter and Concorde expose measured contacts.
// A single patch covers each bogie rather than trying to simulate individual tyres.
const LAYOUTS={
 b747:[[21.991,0,2.6,2.1],[-2.0835,-5.5155,4.4,2.8],[-2.0835,5.5155,4.4,2.8],[-5.461,-1.906,4.4,2.8],[-5.461,1.906,4.4,2.8]],
 a330:[[18.7084,0,2.5,2],[-5.834,-5.02,4,2.6],[-5.834,4.99,4,2.6]],
 b777:[[19.1793,0,2.6,2.1],[-6.996,-5.62,5.5,2.8],[-6.996,5.62,5.5,2.8]],
 a380:[[31.57,0,2.8,2.3],[-.6,-2.63,5.8,3.1],[-.6,2.63,5.8,3.1],[3.1,-6.16,4.6,3],[3.1,6.16,4.6,3]],
 // The shuttle's measured contacts contain only main gear; its nose wheel is
 // at x≈16.01 after the model's scale and ground tilt.
 shuttle:[[16.01,0,1.9,1.6],[0,0,2.4,2.6],[0,0,2.4,2.6]],
 concorde:[[0,0,3.9,2.5],[0,0,3.9,2.5],[0,0,2.2,1.7]],
};
export const WHEEL_SHADOW_MAX=5;
export const WHEEL_SHADOW_Y=.16;
const clamp01=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp01(x);return x*x*(3-2*x);};
// Ground is at the simulator's y=0 datum. End by 1.5 m AGL regardless of
// attitude, and fade each gear separately as its own tyre lifts off.
export function wheelShadowFade(gear,altitude,clearance){
 return smooth((gear-.85)/.15)*(1-smooth((altitude-.25)/1.25))*(1-smooth((clearance-.15)/1.05));
}

export class WheelContactShadow{
 constructor(scene){
  const geometry=new T.PlaneGeometry(1,1);
  this.opacity=new T.InstancedBufferAttribute(new Float32Array(WHEEL_SHADOW_MAX),1).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('contactOpacity',this.opacity);
  // Opaque queue with alpha blending: render after pavement/rubber but BEFORE
  // the opaque runway paint (which has depth writes disabled). This leaves paint
  // legible and avoids the transparent queue painting over the markings.
  const material=new T.MeshBasicMaterial({color:0x000000,depthWrite:false,fog:false,side:T.FrontSide});
  material.blending=T.CustomBlending;material.blendSrc=T.SrcAlphaFactor;material.blendDst=T.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha=T.OneFactor;material.blendDstAlpha=T.OneMinusSrcAlphaFactor;
  material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float contactOpacity;\nvarying float vContactOpacity;\nvarying vec2 vContactCoord;');
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvContactCoord=position.xy*2.0;\nvContactOpacity=contactOpacity;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vContactOpacity;\nvarying vec2 vContactCoord;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat contactFalloff=1.0-smoothstep(0.0,1.0,length(vContactCoord));\ndiffuseColor.a*=vContactOpacity*contactFalloff;');
  };
  material.customProgramCacheKey=()=> 'wheel-contact-shadow-v1';
  const mesh=this.mesh=new T.InstancedMesh(geometry,material,WHEEL_SHADOW_MAX);
  mesh.name='wheel-contact-shadow';mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.renderOrder=79;mesh.frustumCulled=false;mesh.visible=false;
  mesh.castShadow=false;mesh.receiveShadow=false;scene.add(mesh);
  this.point=new T.Vector3();this.forward=new T.Vector3();this.transform=new T.Object3D();
 }
 update(plane,sim,time){
  const mesh=this.mesh,layout=LAYOUTS[plane?.type];
  if(!layout||!plane.root?.visible||!Number.isFinite(plane.contact)||!Number.isFinite(sim.gear)||!Number.isFinite(sim.altitude)||sim.gear<=.85||sim.altitude>=1.5) {mesh.visible=false;return;}
  // Root is a direct scene child. Use the actual frame pose, not heading or a
  // stale matrixWorld, so pitch, bank, ground lift and compression are included.
  const root=plane.root,forward=this.forward.set(1,0,0).applyQuaternion(root.quaternion);
  const yaw=Math.atan2(-forward.z,forward.x),transform=this.transform,point=this.point;
  const scale=plane.type==='b747'?plane.native.scale:null;
  const contacts=plane.wheelContacts;let any=false;
  for(let i=0;i<layout.length;i++){
   const entry=layout[i];let x=entry[0],z=entry[1],y=-plane.contact;
   if(scale){x*=scale.x;z*=scale.z;if(i>0)y+=.462*scale.y;}
   if(plane.type==='concorde'&&contacts?.[i]){x=contacts[i].x;y=contacts[i].y;z=contacts[i].z;}
   if(plane.type==='shuttle'){
    if(i>0&&contacts?.[i-1]){x=contacts[i-1].x;z=contacts[i-1].z;}
    // The orbiter removes its built-in ground tilt at liftoff.
    if(!sim.onGround){x+=i===0?.435:.4;y+=i===0?1.02:-.28;}
   }
   point.set(x,y,z).applyQuaternion(root.quaternion).add(root.position);
   const alpha=(time==='night'?.20:.32)*wheelShadowFade(sim.gear,sim.altitude,point.y);
   this.opacity.setX(i,alpha);if(alpha>0)any=true;
   transform.position.set(point.x,WHEEL_SHADOW_Y,point.z);transform.rotation.set(-Math.PI/2,0,yaw);transform.scale.set(entry[2],entry[3],1);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
  }
  mesh.count=layout.length;mesh.visible=any;this.opacity.needsUpdate=true;mesh.instanceMatrix.needsUpdate=true;
 }
}
