import * as T from 'three';
import {cockpitWiperSweepAngle} from './cockpit-view.js';

const UP=new T.Vector3(0,1,0);
function rod(parent,start,end,radius,material,name){
 const direction=end.clone().sub(start),length=direction.length();
 const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,length,8),material);
 mesh.name=name;mesh.position.copy(start).add(end).multiplyScalar(.5);
 mesh.quaternion.setFromUnitVectors(UP,direction.normalize());
 mesh.castShadow=false;mesh.receiveShadow=false;mesh.renderOrder=20;parent.add(mesh);return mesh;
}
function makeWiper(parent,name,z,side,armMaterial,bladeMaterial,pivotMaterial){
 const pivot=new T.Group();pivot.name=`cockpit-wiper-${name}`;pivot.position.set(25.52,3.50,z);parent.add(pivot);
 const start=new T.Vector3(),tip=new T.Vector3(.04,.24,.12*side),bladeEnd=tip.clone().add(new T.Vector3(0,.05,.19*side));
 rod(pivot,start,tip,.012,armMaterial,`wiper-arm-${name}`);
 rod(pivot,tip,bladeEnd,.018,bladeMaterial,`wiper-blade-${name}`);
 const cap=new T.Mesh(new T.SphereGeometry(.032,8,6),pivotMaterial);cap.name=`wiper-pivot-${name}`;cap.castShadow=false;cap.receiveShadow=false;cap.renderOrder=20;pivot.add(cap);
 return pivot;
}

/** Create windshield wipers in aircraft-root coordinates so they move with the cockpit/airframe, not the screen. */
export function createCockpitWipers(parent,scale=new T.Vector3(1,1,1)){
 const root=new T.Group();root.name='cockpit-wiper-blades';root.scale.copy(scale);parent.add(root);
 const arm=new T.MeshStandardMaterial({color:0x1b2428,roughness:.72,metalness:.18,side:T.DoubleSide});
 const blade=new T.MeshStandardMaterial({color:0x090d0f,roughness:.92,metalness:0,side:T.DoubleSide});
 const pivot=new T.MeshStandardMaterial({color:0x48545a,roughness:.58,metalness:.3,side:T.DoubleSide});
 const left=makeWiper(root,'left',-.95,1,arm,blade,pivot);
 const right=makeWiper(root,'right',-.15,-1,arm,blade,pivot);
 return {root,left,right,update(state){const angle=state.wipers?cockpitWiperSweepAngle(state.time)*Math.PI/180:0;left.rotation.x=angle;right.rotation.x=-angle;}};
}
