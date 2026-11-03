import * as T from 'three';

// BOE.png's painted window centres, in pixels (4096 x 1024). They are not
// separate glass meshes. Use the model's UVs rather than guessing a cylinder:
// the nose, hump and tail all have different curvature. Other aircraft must
// have their own layout; never put 747 windows on an unknown model.
export const WINDOW_ROWS=[
 [60,[323,340,357,374,391,408,425,442,459,476,545,562,579,596,613,630,647,664]],
 [150,[69,87,103,120,137,155,172,189,205,223,239,256,274,328,358,374,391,409,426,442,460,477,493,511,527,544,561,579,631,658,675,693,709,726,743,761,777,795,812,829,845,880,913,948,964,1029,1072,1090,1106,1124,1140,1157,1175,1191,1208,1225,1242,1260,1277,1294,1352,1377,1395,1411,1438,1455,1472,1489,1506,1523,1565,1582,1599,1616,1633,1650,1667,1684,1701,1718,1735,1752,1769,1786,1839]],
 [338,[1644,1661,1678,1695,1712,1729,1746,1763,1780,1797,1814,1883,1900,1917,1934,1951,1968,1985,2002]],
 [430,[521,574,591,609,626,643,659,676,693,710,727,744,761,778,795,813,829,847,863,880,898,915,931,949,965,983,1008,1066,1083,1100,1118,1135,1152,1168,1185,1203,1220,1236,1254,1270,1288,1331,1396,1412,1447,1480,1515,1531,1548,1565,1583,1599,1617,1634,1651,1667,1684,1702,1729,1985,2002,2032,2086,2104,2120,2137,2155,2171,2188,2205,2223,2240,2256,2273,2291]]
];
const cabins=new WeakMap(),wingFixes=new WeakMap();
const modelRoot=aircraft=>aircraft?.root;

// Invert one triangle's UV mapping. Positions returned are in mesh-local
// coordinates, so the lights follow native scaling, rotation and the plane.
function uvPoint(geometry,u,v){
 const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),index=geometry.index;
 const n=index?index.count:p.count;
 for(let i=0;i<n;i+=3){
  const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
  const ax=uv.getX(a),ay=uv.getY(a),bx=uv.getX(b),by=uv.getY(b),cx=uv.getX(c),cy=uv.getY(c);
  const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(det)<1e-10)continue;
  const wa=((by-cy)*(u-cx)+(cx-bx)*(v-cy))/det,wb=((cy-ay)*(u-cx)+(ax-cx)*(v-cy))/det,wc=1-wa-wb;
  if(Math.min(wa,wb,wc)<-1e-5)continue;
  const A=new T.Vector3().fromBufferAttribute(p,a),B=new T.Vector3().fromBufferAttribute(p,b),C=new T.Vector3().fromBufferAttribute(p,c);
  const point=A.clone().multiplyScalar(wa).addScaledVector(B,wb).addScaledVector(C,wc);
  // Use the surface normal, oriented away from the fuselage axis. Offset in
  // model units, not polygonOffset: no coplanar depth flicker at close range.
  const normal=B.clone().sub(A).cross(C.clone().sub(A)).normalize();
  if(normal.z*point.z<0)normal.negate();
  return point.addScaledVector(normal,.025);
 }
 return null;
}

// The illustrative twinjets already have a single row of dark window meshes.
// Light those exact meshes rather than placing a second, coplanar window layer.
function addTwinLights(aircraft,root){
 let windows;root.traverse(o=>{if(o.isInstancedMesh&&o.count===84&&o.geometry?.type==='SphereGeometry'&&o.geometry.parameters.radius===.17)windows=o;});
 if(!windows)return null;
 const original=windows.material,material=original.clone();material.emissive.set(0xffc880);material.emissiveIntensity=0;windows.material=material;
 return {root,kind:'twin',mesh:windows,original,material};
}

// A380X has textured windows, plus separate window markers at both deck
// heights. Project approximate rows onto its actual fuselage, avoiding doors.
function addA380Lights(root){
 root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);
 const hull=[],doors=[];let lower,upper,tailMarker;
 // GLTFLoader uses the node name, not necessarily the source mesh name.
 // A multi-primitive MAIN FUSELAGE node becomes a group with mesh children;
 // a single-primitive version can itself be the mesh. Restrict by both node
 // ancestry and fuselage material, rather than scanning hundreds of decals,
 // doors and other meshes on every ray.
 const isFuselageNode=o=>/^MAIN[\s_]+FUSELAGE(?:_\d+)?$/i.test(o.name);
 root.traverse(o=>{
  if(!o.isMesh)return;
  if([o.material].flat().some(m=>/^A380X_FUSE[123]$/i.test(m?.name))){
   for(let p=o;p&&p!==root;p=p.parent)if(isFuselageNode(p)){hull.push(o);break;}
  }
  if(/^PAX_DOOR_[UM]\d[LR](?:\d+)?$/.test(o.name))doors.push(o);
  if(o.name==='Window_Texture_Main_Deck003')lower=o;
  if(o.name==='Window_Texture_Main_Deck004')upper=o;
  if(o.name==='Window_Texture_Main_Deck007')tailMarker=o;
 });
 if(!hull.length||!lower||!upper||!tailMarker)return null;
 const localCenter=o=>root.worldToLocal(new T.Box3().setFromObject(o).getCenter(new T.Vector3()));
 const lowerCenter=localCenter(lower),rows=[lowerCenter.y,localCenter(upper).y];
 // The model can be mounted facing either +/-X. The row template is in the
 // original nose-negative orientation; use two real markers to orient it.
 const rowDirection=lowerCenter.x>localCenter(tailMarker).x?-1:1;
 const doorCenters=doors.map(localCenter);
 const ray=new T.Raycaster(),direction=new T.Vector3(0,0,-1).transformDirection(root.matrixWorld),inverse=new T.Matrix4().copy(root.matrixWorld).invert();
 const matrices=[],normalMatrix=new T.Matrix3(),q=new T.Quaternion(),m=new T.Matrix4(),scale=new T.Vector3(.105,.15,1),zAxis=new T.Vector3(0,0,1);
 // Freeze each skinned hull section at its current pose once. Raycasting a
 // SkinnedMesh otherwise skins every triangle again for every window. These
 // CPU-only proxies share indices/materials, but never alter or dispose them.
 const proxies=[],temporaryGeometry=[];
 try{
  for(const part of hull){
   if(!part.isSkinnedMesh){proxies.push(part);continue;}
   const source=part.geometry,position=source.getAttribute('position'),values=new Float32Array(position.count*3),vertex=new T.Vector3();
   for(let i=0;i<position.count;i++){part.getVertexPosition(i,vertex);vertex.toArray(values,i*3);}
   const geometry=new T.BufferGeometry();temporaryGeometry.push(geometry);
   geometry.setAttribute('position',new T.BufferAttribute(values,3));geometry.setIndex(source.index);
   for(const group of source.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
   geometry.setDrawRange(source.drawRange.start,source.drawRange.count);geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const proxy=new T.Mesh(geometry,part.material);proxy.matrixWorld.copy(part.matrixWorld);proxies.push(proxy);
  }
  for(const y of rows)for(let i=0;i<61;i++){
   const x=rowDirection*(-28.5+i*.8);if(doorCenters.some(d=>Math.abs(d.y-y)<1.2&&Math.abs(d.x-x)<.9))continue;
   ray.set(root.localToWorld(new T.Vector3(x,y,12)),direction);
   const found=new Set();
   for(const hit of ray.intersectObjects(proxies,false)){
    const point=root.worldToLocal(hit.point.clone()),side=Math.sign(point.z);
    if(!side||found.has(side))continue;found.add(side);
    const normal=hit.face.normal.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).transformDirection(inverse);
    if(normal.z*side<0)normal.negate();point.addScaledVector(normal,.035);
    q.setFromUnitVectors(zAxis,normal);matrices.push(m.clone().compose(point,q,scale));
    if(found.size===2)break;
   }
  }
 }finally{for(const geometry of temporaryGeometry)geometry.dispose();}
 if(!matrices.length)return null;
 const mesh=new T.InstancedMesh(new T.CircleGeometry(1,8),new T.MeshBasicMaterial({color:0xe6be8a,side:T.DoubleSide}),matrices.length);
 matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.name='cabin-window-lights';mesh.visible=false;mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);
 return {root,kind:'mesh',mesh};
}

/** Add once after the model has loaded. Returns false for unsupported models. */
export function addCabinLights(aircraft){
 const root=modelRoot(aircraft);if(!root)return false;
 const existing=cabins.get(aircraft);
 if(existing?.root===root&&existing.mesh.parent)return true;
 if(existing)removeCabinLights(aircraft);
 if(['a330','b777','a380'].includes(aircraft.type)){
  const state=aircraft.type==='a380'?addA380Lights(root):addTwinLights(aircraft,root);
  if(!state)return false;
  // Some illustrative models also create a generic overlay. Detach it while
  // our model-specific lights are active, so callers cannot draw both layers.
  const placeholder=aircraft.extraCabinLights;
  if(placeholder?.parent){state.placeholder={mesh:placeholder,parent:placeholder.parent};placeholder.visible=false;placeholder.removeFromParent();}
  cabins.set(aircraft,state);return true;
 }
 const fuselage=root.getObjectByName('fuselage#mesh');
 if(!fuselage?.isMesh||fuselage.userData.texture!=='BOE.png'||!fuselage.geometry.getAttribute('uv'))return false;
 const vertices=[],colors=[];
 // A small bevel approximates a rounded window without translucent quads.
 const outline=[[-2.8,-4.5],[2.8,-4.5],[3.3,-3],[3.3,3],[2.8,4.5],[-2.8,4.5],[-3.3,3],[-3.3,-3]];
 let windowIndex=0;
 for(const [y,xs] of WINDOW_ROWS)for(const x of xs){
  const center=uvPoint(fuselage.geometry,x/4096,1-y/1024);
  const points=outline.map(([dx,dy])=>uvPoint(fuselage.geometry,(x+dx)/4096,1-(y+dy)/1024));
  if(!center||points.some(p=>!p))continue;
  // A few darker cabins add variation, but no real lights or bloom are used.
  const tint=new T.Color((windowIndex++%7===0)?0xb69167:0xe6be8a);
  for(let i=0;i<points.length;i++)for(const p of [center,points[i],points[(i+1)%points.length]]){
   vertices.push(p.x,p.y,p.z);colors.push(tint.r,tint.g,tint.b);
  }
 }
 if(!vertices.length)return false;
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeBoundingSphere();
 const material=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
 const mesh=new T.Mesh(geometry,material);mesh.name='cabin-window-lights';mesh.visible=false;mesh.castShadow=false;mesh.receiveShadow=false;
 fuselage.add(mesh);cabins.set(aircraft,{root,kind:'mesh',mesh});return true;
}

/** time is world.time ('day', 'dusk' or 'night'); only night is lit. */
export function updateCabinLights(aircraft,time){
 const state=cabins.get(aircraft);if(!state)return;
 // Freight liveries do not have passenger windows on the main deck.
 const lit=time==='night'&&!['fedex','sf'].includes(String(aircraft.livery||'').toLowerCase());
 if(state.kind==='twin')state.material.emissiveIntensity=lit?.7:0;
 else state.mesh.visible=lit;
}

/** Call when replacing/discarding the aircraft; safe to call more than once. */
export function removeCabinLights(aircraft){
 const state=cabins.get(aircraft);if(!state)return;
 if(state.kind==='twin'){
  if(state.mesh.material===state.material)state.mesh.material=state.original;
  state.material.dispose();
 }else{state.mesh.removeFromParent();state.mesh.geometry.dispose();state.mesh.material.dispose();}
 if(state.placeholder){state.placeholder.mesh.visible=false;state.placeholder.parent.add(state.placeholder.mesh);}
 cabins.delete(aircraft);
}

// The AC wing UVs include negative coordinates. ClampToEdgeWrapping samples
// the edge of the image across whole triangles, producing large grey wedges.
// Clone maps/materials per aircraft: never change the shared loader cache or
// shadow settings. Texture.clone() shares the Source, including pending loads.
export function fixAircraftWingShading(aircraft){
 const root=modelRoot(aircraft);if(!root)return false;
 const prior=wingFixes.get(aircraft);if(prior?.root===root)return true;
 if(prior)removeAircraftWingShading(aircraft);
 const state={root,entries:[],textures:new Map()};
 root.traverse(mesh=>{
  if(!mesh.isMesh||!['747-400_wingtop.png','747-400_wingbottom.png'].includes(mesh.userData.texture))return;
  const original=mesh.material,materials=Array.isArray(original)?original:[original];
  const corrected=materials.map(m=>{
   const clone=m.clone();
   if(m.map){
    let texture=state.textures.get(m.map);
    if(!texture){texture=m.map.clone();texture.wrapS=T.RepeatWrapping;texture.wrapT=T.RepeatWrapping;texture.needsUpdate=true;state.textures.set(m.map,texture);}
    clone.map=texture;
   }
   return clone;
  });
  const replacement=Array.isArray(original)?corrected:corrected[0];
  mesh.material=replacement;state.entries.push({mesh,original,replacement,corrected});
 });
 if(!state.entries.length)return false;
 wingFixes.set(aircraft,state);return true;
}

/** Restore originals and dispose only resources owned by the correction. */
export function removeAircraftWingShading(aircraft){
 const state=wingFixes.get(aircraft);if(!state)return;
 wingFixes.delete(aircraft);
 for(const {mesh,original,replacement,corrected} of state.entries){
  if(mesh.material===replacement)mesh.material=original;
  corrected.forEach(m=>m.dispose());
 }
 for(const texture of state.textures.values())texture.dispose();
}
