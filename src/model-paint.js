import * as T from 'three';
import {DecalGeometry} from 'three/addons/geometries/DecalGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Close the actual window-shaped boundaries of the A380 skin, rather than
// floating rectangles over it. Boundary vertices retain the source UVs and
// meet the hull exactly; the caps are visible only for windowless liveries.
function closeA380Windows(source,geometry,matrix,sideY,excluded=[],minVertices=5000){
 const position=geometry.attributes.position,uv=source.geometry.attributes.uv,index=geometry.index;
 if(!index||!uv||position.count<minVertices)return null;
 const keys=new Array(position.count),vertices=new Map(),edges=new Map(),v=new T.Vector3();
 const rows=[sideY-1.635,sideY+1.06];
 for(let i=0;i<position.count;i++){
  v.fromBufferAttribute(position,i).applyMatrix4(matrix);
  if(v.x< -20||v.x>30||Math.abs(v.z)<2.2||!rows.some(y=>Math.abs(v.y-y)<.48))continue;
  const key=[v.x,v.y,v.z].map(x=>Math.round(x*1000)).join(',');
  keys[i]=key;
  if(!vertices.has(key))vertices.set(key,[v.x,v.y,v.z,uv.getX(i),uv.getY(i)]);
 }
 for(let i=0;i<index.count;i+=3){
  const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
  for(let j=0;j<3;j++){
   const a=keys[ids[j]],b=keys[ids[(j+1)%3]];if(!a||!b||a===b)continue;
   const key=a<b?a+'|'+b:b+'|'+a,edge=edges.get(key);
   if(edge)edge.count++;else edges.set(key,{a,b,count:1});
  }
 }
 const adjacent=new Map();
 for(const {a,b,count} of edges.values())if(count===1){
  if(!adjacent.has(a))adjacent.set(a,new Set());if(!adjacent.has(b))adjacent.set(b,new Set());
  adjacent.get(a).add(b);adjacent.get(b).add(a);
 }
 const positions=[],uvs=[],centers=[];
 while(adjacent.size){
  const pending=[adjacent.keys().next().value],component=new Set();
  while(pending.length){const key=pending.pop();if(component.has(key))continue;component.add(key);for(const n of adjacent.get(key)||[])pending.push(n);}
  const ring=[...component].map(key=>vertices.get(key));for(const key of component)adjacent.delete(key);
  if(ring.length<18||ring.length>45)continue;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const p of ring)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
  const width=max[0]-min[0],height=max[1]-min[1],cy=(min[1]+max[1])/2;
  if(width<.23||width>.34||height<.25||height>.43||!rows.some(y=>Math.abs(cy-y)<.2))continue;
  const center=Array.from({length:5},(_,k)=>ring.reduce((sum,p)=>sum+p[k],0)/ring.length);
  // Some source windows already contain fixed fuselage plugs. Never overlay
  // those existing triangles or create z-fighting on their surface.
  if(excluded.some(p=>Math.abs(p[0]-center[0])<.03&&Math.abs(p[1]-center[1])<.03&&Math.abs(p[2]-center[2])<.05))continue;
  ring.sort((a,b)=>Math.atan2(a[1]-center[1],a[0]-center[0])-Math.atan2(b[1]-center[1],b[0]-center[0]));
  // The original hull is curved; the midpoint is slightly outside the chord.
  center[2]+=Math.sign(center[2])*.001;
  centers.push(center.slice(0,3));
  const push=p=>{positions.push(p[0],p[1],p[2]);uvs.push(p[3],p[4]);};
  for(let i=0;i<ring.length;i++){push(center);push(ring[i]);push(ring[(i+1)%ring.length]);}
 }
 if(!positions.length)return null;
 const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(positions,3));result.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));result.computeVertexNormals();
 const mesh=new T.Mesh(result,source.material);mesh.name='livery-freight-window-caps';mesh.visible=false;mesh.userData.windowCenters=centers;
 return mesh;
}

// Original transparent, simplified freight artwork; menu-card backgrounds are
// deliberately not used on the aircraft. Dimensions are in canvas pixels.
function drawFedEx(c,x,y,height,light,primary,accent){
 c.textBaseline='middle';c.textAlign='left';c.font=`bold ${Math.round(height*.67)}px Arial, sans-serif`;
 const fed=c.measureText('Fed').width,ex=c.measureText('Ex').width,left=x-(fed+ex)/2;
 c.fillStyle=light?'#ffffff':primary;c.fillText('Fed',left,y-height*.1);
 c.fillStyle=accent;c.fillText('Ex',left+fed,y-height*.1);
 c.textAlign='center';c.font=`bold ${Math.round(height*.22)}px Arial, sans-serif`;
 c.fillStyle=light?'#ffffff':primary;c.fillText('Express',x,y+height*.31);
}
function drawSfRoundel(c,x,y,size,color){
 c.strokeStyle=color;c.lineWidth=Math.max(2,size*.065);c.beginPath();
 c.arc(x,y,size*.43,Math.PI*.16,Math.PI*1.84);c.stroke();
 c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;
 c.font=`bold ${Math.round(size*.46)}px Arial, sans-serif`;c.fillText('SF',x,y);
}

// Project only onto the exterior skin, not the windows, doors, rivets or controls.
// Geometry is prepared at load time; selecting a livery only repaints textures.
export function addModelPaint(aircraft, {sideZ, sideY=0, tailX, tailY, length=38}) {
 const root=aircraft.root, a380=aircraft.type==='a380';
 const body=[],fin=[],tailPaint=[],engines=[],windows=[],fairings=[];
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
 root.traverse(o=>{
  if(!o.isMesh||!o.geometry?.attributes.position)return;
  // Only passenger-window meshes: never hide cockpit glass, cargo doors or
  // fuselage materials. Keep each original visibility for passenger liveries.
  const paxWindow=a380&&[o.material].flat().every(m=>m?.name==='A380_PAX_WINDOW');
  if(paxWindow||(!a380&&o.isInstancedMesh&&o.geometry.type==='SphereGeometry'&&o.count===84))windows.push([o,o.visible]);
  if(a380){
   const names=[o.material].flat().map(m=>m?.name);
   if(o.isSkinnedMesh&&names.some(n=>/^A380X_FUSE[123]$/.test(n)))body.push(o);
   // Neutralize only exterior belly-fairing skin for freight; leave mixed
   // landing-gear-bay materials and mechanical components untouched.
   if(/^BELLY[ _]FAIRING/i.test(o.name)&&names.length&&names.every(n=>n==='A380X_FUSE5'))fairings.push(o);
   // Exterior nacelles and their moving reverser buckets, not fans or intakes.
   if(/^(?:FrontCase0(?:40|42|44|46)|Bucket0(?:28|29|30|31))$/.test(o.name)&&names.some(n=>/^A380_EXTERIOR_ENG_/.test(n)))engines.push(o);
   // Project the badge onto the fixed fin. Tint all vertical-tail skin pieces,
   // including the moving rudder, but leave separate rivet decals untouched.
   if(o.name==='Mesh_44002'&&names.includes('A380X_FUSE4'))fin.push(o);
   if(names.includes('A380X_FUSE4')&&!/^Static_Discharger/.test(o.name)){
    for(let p=o;p&&p!==root;p=p.parent)if(p.name==='VTP'){tailPaint.push(o);break;}
   }
  }else if(o.name==='original-fuselage')body.push(o);
  else if(o.geometry.type==='ExtrudeGeometry'&&o.position.z===-.19){fin.push(o);tailPaint.push(o);}
  else if(aircraft.parts?.rudders?.includes(o))tailPaint.push(o);
  else if(o.material===body[0]?.material&&o.geometry.type==='CylinderGeometry'&&o.geometry.parameters.radiusTop>1.4&&o.geometry.parameters.height>=2)engines.push(o);
 });
 const inverseRoot=new T.Matrix4().copy(root.matrixWorld).invert();
 // DecalGeometry reads undeformed positions. Bake the current skinned pose once;
 // otherwise the A380 fuselage projection misses the actual surface entirely.
 const baked=new Map();
 for(const source of body){
  if(!source.isSkinnedMesh)continue;
  const original=source.geometry, positions=original.attributes.position;
  const values=new Float32Array(positions.count*3),vertex=new T.Vector3();
  for(let i=0;i<positions.count;i++){source.getVertexPosition(i,vertex);vertex.toArray(values,i*3);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(values,3));geometry.setIndex(original.index);
  baked.set(source,geometry);
 }
 const sideMaterial=new T.MeshBasicMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const tailMaterial=sideMaterial.clone(),stripeMaterial=sideMaterial.clone(),engineMaterial=sideMaterial.clone();
 const freightMaterials={[-1]:sideMaterial.clone(),[1]:sideMaterial.clone()},stripes=[],caps=[],sides=[],freightSides=[],engineMarks=[];
 // Twin fin faces have outward winding. Single-sided rendering prevents the
 // opposite badge showing through from behind; A380 source winding differs.
 if(!a380)tailMaterial.side=T.FrontSide;
 // The twins' wing and engines obscure a mid-body title in side view. Place
 // their markings on the forward fuselage, still within its tapered skin.
 const sideHeight=2.2, sideX=a380?4:(aircraft.spec?.length??length/.63)*.28, sideLength=length*(a380?.82:.45);
 // Freight lockups occupy the clear forward belt, between A380 doors and
 // ahead of the twin's cargo door, before the cockpit glazing.
 const freightCenter=a380?21:(aircraft.spec?.length??length/.63)*.345;
 const freightLength=a380?14:(aircraft.spec?.length??length/.63)*.13,freightHeight=a380?2.3:1.9;
 const tailCenter=a380?tailX+.8:tailX;
 const tailWidth=a380?3.6:3.2, tailHeight=a380?3.6:3.2;
 const stripeLength=a380?52:(aircraft.spec?.length??length/.63)*.74, stripeHeight=a380?1.3:2.3, stripeY=a380?sideY-2.55:-1.35;
 function project(sources, sign, center, size, material, kind){
  const pieces=[];
  for(const source of sources){
   // DecalGeometry emits world coordinates. Use root-local coordinates so the
   // result remains attached when the aircraft subsequently moves or rotates.
   const proxy={geometry:baked.get(source)||source.geometry,matrixWorld:new T.Matrix4().multiplyMatrices(inverseRoot,source.matrixWorld)};
   const geo=new DecalGeometry(proxy,center,new T.Euler(0,sign<0?Math.PI:0,0),size);
   if(!geo.attributes.position.count){geo.dispose();continue;}
   if(kind==='stripe'&&sign<0){const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));}
   if(kind==='freight-side'||kind==='engine'){
    // A small outward displacement makes the transparent artwork stable with
    // logarithmic depth while remaining on the curved source surface.
    const p=geo.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)+sign*.015);
   }
   if(kind==='tail'){
    const p=geo.attributes.position,uv=geo.attributes.uv;
    for(let i=0;i<p.count;i++){
     // A380's fixed fin sweeps aft with height. Following that sweep keeps
     // the whole badge on the fin instead of clipping it at its leading edge.
     const x=p.getX(i)-tailCenter+(a380?.65*(p.getY(i)-tailY):0);
     uv.setXY(i,.5+sign*x/tailWidth,.5+(p.getY(i)-tailY)/tailHeight);
     // Polygon offset alone is unreliable with the simulator's logarithmic
     // depth buffer. The twin fin is flat at ±0.19 m; move its decal just
     // 2 cm out along the face normal to avoid coplanar depth fighting.
     p.setZ(i,p.getZ(i)+sign*(a380?.012:.02));
    }
   }
   pieces.push(geo);
  }
  if(!pieces.length)return;
  const geometry=pieces.length===1?pieces[0]:mergeGeometries(pieces);
  if(pieces.length>1)pieces.forEach(g=>g.dispose());
  if(!geometry)return;
  const mesh=new T.Mesh(geometry,material);mesh.name=`livery-${kind}-${sign>0?'right':'left'}`;
  root.add(mesh);return mesh;
 }
 for(const sign of [-1,1]){
  // sideZ is approximately the maximum radius, not a flat surface position.
  const side=project(body,sign,new T.Vector3(sideX,sideY,sign*sideZ),new T.Vector3(sideLength,sideHeight,Math.max(2,sideZ*.8)),sideMaterial,'side');
  if(side)sides.push(side);
  const freightSide=project(body,sign,new T.Vector3(freightCenter,sideY,sign*sideZ),new T.Vector3(freightLength,freightHeight,Math.max(3.2,sideZ)),freightMaterials[sign],'freight-side');
  if(freightSide){freightSide.visible=false;freightSide.userData.sign=sign;freightSides.push(freightSide);}
  // The A380 fin at this height is about ±0.3–0.4 m, not ±0.25 m.
  project(fin,sign,new T.Vector3(tailCenter,tailY,sign*.75),new T.Vector3(a380?5:tailWidth,tailHeight,1.5),tailMaterial,'tail');
  const stripe=project(body,sign,new T.Vector3(0,stripeY,sign*sideZ),new T.Vector3(stripeLength,stripeHeight,Math.max(3.6,sideZ)),stripeMaterial,'stripe');
  if(stripe){stripe.visible=false;stripes.push(stripe);}
 }
 // Only the fixed outer front nacelles receive markings; never project onto a
 // fan, intake, pylon, wing or the moving reverser sleeve. Parenting the decal
 // to its source preserves any later engine-mount motion without frame updates.
 const nacelles=engines.filter(o=>a380?/^FrontCase0(?:40|42|44|46)$/.test(o.name):o.geometry.parameters.height>4);
 nacelles.forEach((source,index)=>{
  const matrix=new T.Matrix4().multiplyMatrices(inverseRoot,source.matrixWorld),box=new T.Box3().setFromBufferAttribute(source.geometry.attributes.position).applyMatrix4(matrix);
  const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),width=Math.min(2.2,size.x*.58),height=Math.min(1.1,size.y*.28);
  for(const sign of [-1,1]){
   const at=new T.Vector3(center.x,center.y,sign>0?box.max.z:box.min.z);
   const decal=project([source],sign,at,new T.Vector3(width,height,Math.max(1.4,size.z*.65)),engineMaterial,'engine');
   if(!decal)continue;
   decal.geometry.applyMatrix4(new T.Matrix4().copy(matrix).invert());source.add(decal);
   decal.name=`livery-engine-${index}-${sign>0?'right':'left'}`;decal.visible=false;
   decal.userData={sign,sourceUuid:source.uuid,center:at.toArray(),width,height};engineMarks.push(decal);
  }
 });
 if(a380){
  const plugged=[];
  for(const source of body){
   const geometry=baked.get(source);if(!geometry||geometry.attributes.position.count>=5000)continue;
   const matrix=new T.Matrix4().multiplyMatrices(inverseRoot,source.matrixWorld),existing=closeA380Windows(source,geometry,matrix,sideY,[],0);
   if(existing){plugged.push(...existing.userData.windowCenters);existing.geometry.dispose();}
  }
  for(const source of body){
   const geometry=baked.get(source);if(!geometry)continue;
   const matrix=new T.Matrix4().multiplyMatrices(inverseRoot,source.matrixWorld),cap=closeA380Windows(source,geometry,matrix,sideY,plugged);
   if(cap){root.add(cap);caps.push({mesh:cap,source});}
  }
 }
 baked.forEach(g=>g.dispose());baked.clear();
 // Optional catalog interface: modelPaint.default / modelPaint[aircraft.type]
 // may set bodyColor, tailColor, engineColor, color, accentColor, stripeColor,
 // secondaryColor, stripes, sideText, sideLines, logo, tailLogo, cargo and hideWindows.
 // Model-specific fields override defaults; tinting retains source textures.
 const paintMaterials=new Map(),materialGroups=new Map();
 function tint(meshes,color,group,neutralSurface=false){
  for(const mesh of meshes){
   let entry=paintMaterials.get(mesh);
   if(!entry&&color){
    const original=mesh.material;let shared=materialGroups.get(group);if(!shared){shared=new Map();materialGroups.set(group,shared);}
    const pairs=[original].flat().map(m=>{let pair=shared.get(m);if(!pair){pair={copy:m.clone(),color:m.color?.clone(),map:m.map};shared.set(m,pair);}return pair;});
    const copies=pairs.map(p=>p.copy);
    entry={copies,colors:pairs.map(p=>p.color),maps:pairs.map(p=>p.map)};paintMaterials.set(mesh,entry);
    mesh.material=Array.isArray(original)?copies:copies[0];
   }
   if(entry)entry.copies.forEach((m,i)=>{
    if(m.color&&entry.colors[i]){m.color.copy(entry.colors[i]);if(color)m.color.set(color);}
    // The A380 source atlas contains blue passenger-paint patches. For a
    // cargo adaptation use neutral skin/nacelles rather than multiplying a
    // freight colour over those patches; restore the original map on return.
    if(group==='body'||group==='engines'||group==='fairings'){
     const map=neutralSurface?null:entry.maps[i];
     if(m.map!==map){m.map=map;m.needsUpdate=true;}
    }
   });
  }
 }
 let sideCanvas,tailCanvas,stripeCanvas,sideTexture,tailTexture,stripeTexture,freightCanvases,freightTextures,engineCanvas,engineTexture,version=0,disposed=false;
 const pending=new Set();
 function cancel(){for(const image of pending){image.onload=image.onerror=null;image.src='';}pending.clear();}
 const onDispose=()=>{disposed=true;version++;cancel();};
 for(const material of [sideMaterial,tailMaterial,stripeMaterial,engineMaterial,...Object.values(freightMaterials)])material.addEventListener('dispose',onDispose);
 function setup(){
  if(sideCanvas)return;
  sideCanvas=document.createElement('canvas');sideCanvas.width=2048;sideCanvas.height=Math.round(2048*sideHeight/sideLength);
  tailCanvas=document.createElement('canvas');tailCanvas.width=512;tailCanvas.height=512;
  stripeCanvas=document.createElement('canvas');stripeCanvas.width=2048;stripeCanvas.height=Math.round(2048*stripeHeight/stripeLength);
  sideTexture=new T.CanvasTexture(sideCanvas);tailTexture=new T.CanvasTexture(tailCanvas);stripeTexture=new T.CanvasTexture(stripeCanvas);
  for(const t of [sideTexture,tailTexture,stripeTexture]){t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;}
  sideMaterial.map=sideTexture;tailMaterial.map=tailTexture;stripeMaterial.map=stripeTexture;sideMaterial.needsUpdate=tailMaterial.needsUpdate=stripeMaterial.needsUpdate=true;
 }
 function setupFreight(){
  if(freightCanvases)return;
  freightCanvases={};freightTextures={};
  for(const sign of [-1,1]){
   const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*freightHeight/freightLength);
   const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
   freightCanvases[sign]=canvas;freightTextures[sign]=texture;freightMaterials[sign].map=texture;freightMaterials[sign].needsUpdate=true;
  }
  engineCanvas=document.createElement('canvas');engineCanvas.width=512;engineCanvas.height=256;
  engineTexture=new T.CanvasTexture(engineCanvas);engineTexture.colorSpace=T.SRGBColorSpace;engineTexture.anisotropy=4;
  engineMaterial.map=engineTexture;engineMaterial.needsUpdate=true;
 }
 aircraft.paintLivery=livery=>{
  if(disposed)return;
  const request=++version;cancel();setup();
  const freight=livery.id==='fedex'||livery.id==='sf';
  const paint={...(freight?{bodyColor:livery.colors?.base,tailColor:livery.colors?.primary,engineColor:livery.id==='sf'?livery.colors?.primary:livery.colors?.base}:{}),...livery.modelPaint?.default,...livery.modelPaint?.[aircraft.type]};
  const cargo=paint.cargo??freight,sf=livery.id==='sf';
  tint(body,paint.bodyColor,'body',a380&&cargo);tint(fairings,cargo?paint.bodyColor:null,'fairings',a380&&cargo);tint(tailPaint,paint.tailColor,'tail');tint(engines,paint.engineColor,'engines',a380&&cargo);
  for(const mesh of sides)mesh.visible=!freight;
  for(const mesh of freightSides)mesh.visible=freight;
  for(const mesh of engineMarks)mesh.visible=freight;
  const hideWindows=paint.hideWindows??cargo;
  for(const [mesh,visible] of windows)mesh.visible=visible&&!hideWindows;
  for(const {mesh,source} of caps){mesh.material=source.material;mesh.visible=hideWindows;}
  const showStripes=paint.stripes??(livery.id==='sf');
  for(const mesh of stripes)mesh.visible=showStripes;
  if(showStripes){
   const s=stripeCanvas.getContext('2d'),w=stripeCanvas.width,h=stripeCanvas.height;
   s.clearRect(0,0,w,h);
   s.fillStyle=paint.stripeColor??livery.colors?.primary??'#282a2d';s.fillRect(0,h*.70,w,h*.07);s.fillRect(0,h*.87,w,h*.035);
   s.fillStyle=paint.secondaryColor??livery.colors?.secondary??'#73777a';s.fillRect(0,h*.79,w,h*.05);s.fillRect(0,h*.92,w,h*.03);
   // x=0 is the tail on both sides. The red ribbon rises toward the tail.
   s.fillStyle=paint.accentColor??livery.colors?.accent??'#c8102e';s.beginPath();s.moveTo(0,h*.12);s.lineTo(0,h*.52);s.lineTo(w*.62,h*.67);s.lineTo(w*.62,h*.58);s.closePath();s.fill();
   stripeTexture.needsUpdate=true;
  }
  if(cargo){
   // The lighting owner also checks aircraft.livery on day/night changes; turn
   // off any existing overlay immediately during this selection transition.
   const lights=root.getObjectByName('cabin-window-lights');if(lights)lights.visible=false;
   for(const [mesh] of windows)if(mesh.isInstancedMesh&&mesh.material.emissive)mesh.material.emissiveIntensity=0;
  }
  if(freight){
   setupFreight();
   const primary=paint.color??livery.colors?.primary??livery.color,accent=paint.accentColor??livery.colors?.accent??'#ff6600';
   const lines=Array.isArray(paint.sideLines)?paint.sideLines:['AIRLINES','顺丰航空'];
   for(const sign of [-1,1]){
    const canvas=freightCanvases[sign],c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    c.clearRect(0,0,w,h);
    if(sf){
     // UVs read left-to-right on both sides, but +X is the nose. Reverse only
     // the layout, not the glyphs, so both roundels sit toward the nose.
     const ringX=sign>0?w*.79:w*.21,textX=sign>0?w*.39:w*.61;
     drawSfRoundel(c,ringX,h*.5,h*.78,primary);
     c.textAlign='center';c.textBaseline='middle';c.fillStyle=primary;
     c.font=`bold ${Math.round(h*.34)}px Arial, sans-serif`;c.fillText(lines[0]??'AIRLINES',textX,h*.34,w*.52);
     c.font=`bold ${Math.round(h*.31)}px Arial, sans-serif`;c.fillText(lines[1]??'顺丰航空',textX,h*.68,w*.52);
    }else drawFedEx(c,w*.5,h*.45,h*.95,false,primary,accent);
    freightTextures[sign].needsUpdate=true;
   }
   const b=tailCanvas.getContext('2d');b.clearRect(0,0,512,512);
   if(sf)drawSfRoundel(b,256,256,300,'#ffffff');else drawFedEx(b,256,256,230,true,primary,accent);
   tailTexture.needsUpdate=true;
   const e=engineCanvas.getContext('2d');e.clearRect(0,0,512,256);
   if(sf)drawSfRoundel(e,256,128,175,'#ffffff');else drawFedEx(e,256,128,195,false,primary,accent);
   engineTexture.needsUpdate=true;
   return;
  }
  const c=sideCanvas.getContext('2d'),b=tailCanvas.getContext('2d');
  const w=sideCanvas.width,h=sideCanvas.height;
  let sideImage,tailImage;
  function draw(){
   c.clearRect(0,0,w,h);b.clearRect(0,0,512,512);
   if(sideImage)c.drawImage(sideImage,h*.05,h*.05,h*.9,h*.9);
   if(tailImage)b.drawImage(tailImage,0,0,512,512);
   c.fillStyle=paint.color??livery.color;c.textAlign='center';c.textBaseline='middle';c.font=`bold ${Math.round(h*.58)}px Arial, sans-serif`;
   c.fillText(paint.sideText??(livery.en+(cargo?' CARGO':'')),h*.95+(w-h*.95)/2,h*.46,w-h*1.1);
   c.fillRect(h*.95,h*.83,w-h*1.1,Math.max(2,h*.055));
   sideTexture.needsUpdate=tailTexture.needsUpdate=true;
  }
  draw();
  // A freighter can use different dark-on-light and light-on-dark artwork.
  // Catalog filenames are local asset basenames, never arbitrary URLs.
  const logo=paint.logo??livery.logo, tailLogo=paint.tailLogo??logo;
  function load(name,assign){
   if(!/^[a-z-]+\.png$/.test(name||''))return;
   const image=new Image();pending.add(image);
   image.onload=()=>{pending.delete(image);if(disposed||request!==version)return;assign(image);draw();};
   image.onerror=()=>{pending.delete(image);};
   image.src='/747/assets/livery-logos/'+name;
  }
  if(logo===tailLogo)load(logo,image=>{sideImage=tailImage=image;});
  else{load(logo,image=>{sideImage=image;});load(tailLogo,image=>{tailImage=image;});}
 };
}
