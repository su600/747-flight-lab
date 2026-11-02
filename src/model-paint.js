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

// Project only onto the exterior skin, not the windows, doors, rivets or controls.
// Geometry is prepared at load time; selecting a livery only repaints textures.
export function addModelPaint(aircraft, {sideZ, sideY=0, tailX, tailY, length=38}) {
 const root=aircraft.root, a380=aircraft.type==='a380';
 const body=[],fin=[],tailPaint=[],engines=[],windows=[];
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
 const tailMaterial=sideMaterial.clone(),stripeMaterial=sideMaterial.clone(),stripes=[],caps=[],sides=[],sfSides=[];
 // Twin fin faces have outward winding. Single-sided rendering prevents the
 // opposite badge showing through from behind; A380 source winding differs.
 if(!a380)tailMaterial.side=T.FrontSide;
 // The twins' wing and engines obscure a mid-body title in side view. Place
 // their markings on the forward fuselage, still within its tapered skin.
 const sideHeight=2.2, sideX=a380?4:(aircraft.spec?.length??length/.63)*.28, sideLength=length*(a380?.82:.45);
 const sfSideLength=a380?18:sideLength;
 const tailCenter=a380?tailX+.8:tailX;
 const tailWidth=a380?2.4:3.2, tailHeight=a380?2.4:3.2;
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
   // Reuse a fixed-size canvas: the shorter SF decal samples just its left
   // portion, preserving artwork aspect without resizing a live GPU texture.
   if(kind==='sf-side'){const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)*sfSideLength/sideLength);}
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
     if(!a380)p.setZ(i,p.getZ(i)+sign*.02);
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
  if(a380){const sfSide=project(body,sign,new T.Vector3(16,sideY,sign*sideZ),new T.Vector3(sfSideLength,sideHeight,Math.max(2,sideZ*.8)),sideMaterial,'sf-side');if(sfSide){sfSide.visible=false;sfSides.push(sfSide);}}
  // The A380 fin at this height is about ±0.3–0.4 m, not ±0.25 m.
  project(fin,sign,new T.Vector3(tailCenter,tailY,sign*.75),new T.Vector3(a380?5:tailWidth,tailHeight,1.5),tailMaterial,'tail');
  const stripe=project(body,sign,new T.Vector3(0,stripeY,sign*sideZ),new T.Vector3(stripeLength,stripeHeight,Math.max(3.6,sideZ)),stripeMaterial,'stripe');
  if(stripe){stripe.visible=false;stripes.push(stripe);}
 }
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
 function tint(meshes,color,group){
  for(const mesh of meshes){
   let entry=paintMaterials.get(mesh);
   if(!entry&&color){
    const original=mesh.material;let shared=materialGroups.get(group);if(!shared){shared=new Map();materialGroups.set(group,shared);}
    const pairs=[original].flat().map(m=>{let pair=shared.get(m);if(!pair){pair={copy:m.clone(),color:m.color?.clone()};shared.set(m,pair);}return pair;});
    const copies=pairs.map(p=>p.copy);
    entry={copies,colors:pairs.map(p=>p.color)};paintMaterials.set(mesh,entry);
    mesh.material=Array.isArray(original)?copies:copies[0];
   }
   if(entry)entry.copies.forEach((m,i)=>{if(m.color&&entry.colors[i]){m.color.copy(entry.colors[i]);if(color)m.color.set(color);}});
  }
 }
 let sideCanvas,tailCanvas,stripeCanvas,sideTexture,tailTexture,stripeTexture,version=0,disposed=false;
 const pending=new Set();
 function cancel(){for(const image of pending){image.onload=image.onerror=null;image.src='';}pending.clear();}
 const onDispose=()=>{disposed=true;version++;cancel();};
 sideMaterial.addEventListener('dispose',onDispose);tailMaterial.addEventListener('dispose',onDispose);stripeMaterial.addEventListener('dispose',onDispose);
 function setup(){
  if(sideCanvas)return;
  sideCanvas=document.createElement('canvas');sideCanvas.width=2048;sideCanvas.height=Math.round(2048*sideHeight/sideLength);
  tailCanvas=document.createElement('canvas');tailCanvas.width=512;tailCanvas.height=512;
  stripeCanvas=document.createElement('canvas');stripeCanvas.width=2048;stripeCanvas.height=Math.round(2048*stripeHeight/stripeLength);
  sideTexture=new T.CanvasTexture(sideCanvas);tailTexture=new T.CanvasTexture(tailCanvas);stripeTexture=new T.CanvasTexture(stripeCanvas);
  for(const t of [sideTexture,tailTexture,stripeTexture]){t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;}
  sideMaterial.map=sideTexture;tailMaterial.map=tailTexture;stripeMaterial.map=stripeTexture;sideMaterial.needsUpdate=tailMaterial.needsUpdate=stripeMaterial.needsUpdate=true;
 }
 aircraft.paintLivery=livery=>{
  if(disposed)return;
  const request=++version;cancel();setup();
  const freight=livery.id==='fedex'||livery.id==='sf';
  const paint={...(freight?{bodyColor:livery.colors?.base,tailColor:livery.colors?.primary}:{}),...(livery.id==='sf'?{engineColor:livery.colors?.primary}:{}),...livery.modelPaint?.default,...livery.modelPaint?.[aircraft.type]};
  const cargo=paint.cargo??(livery.id==='fedex'||livery.id==='sf'),sf=livery.id==='sf';
  tint(body,paint.bodyColor,'body');tint(tailPaint,paint.tailColor,'tail');tint(engines,paint.engineColor,'engines');
  if(sfSides.length){for(const mesh of sides)mesh.visible=!sf;for(const mesh of sfSides)mesh.visible=sf;}
  const hideWindows=paint.hideWindows??cargo;
  for(const [mesh,visible] of windows)mesh.visible=visible&&!hideWindows;
  for(const {mesh,source} of caps){mesh.material=source.material;mesh.visible=hideWindows;}
  const showStripes=paint.stripes??(livery.id==='sf');
  for(const mesh of stripes)mesh.visible=showStripes;
  if(showStripes){
   const s=stripeCanvas.getContext('2d'),w=stripeCanvas.width,h=stripeCanvas.height;
   s.clearRect(0,0,w,h);
   s.fillStyle=paint.stripeColor??livery.colors?.primary??'#282a2d';s.fillRect(0,h*.68,w,h*.13);s.fillRect(0,h*.91,w,h*.05);
   s.fillStyle=paint.secondaryColor??livery.colors?.secondary??'#73777a';s.fillRect(0,h*.82,w,h*.07);
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
  const c=sideCanvas.getContext('2d'),b=tailCanvas.getContext('2d');
  const w=sideCanvas.width*(sf&&sfSides.length?sfSideLength/sideLength:1),h=sideCanvas.height;
  let sideImage,tailImage;
  function draw(){
   c.clearRect(0,0,sideCanvas.width,h);b.clearRect(0,0,512,512);
   const sfLockup=livery.id==='sf'&&paint.sideText==null;
   if(sideImage)c.drawImage(sideImage,sfLockup?w-h*.95:h*.05,h*.05,h*.9,h*.9);
   if(tailImage)b.drawImage(tailImage,0,0,512,512);
   c.fillStyle=paint.color??livery.color;c.textAlign='center';c.textBaseline='middle';
   if(sfLockup){
    // Passenger-facing card asset is retained; the aircraft lockup is the
    // two-line AIRLINES / 顺丰航空 lettering from the supplied SF reference.
    const x=(w-h)*.68,lines=Array.isArray(paint.sideLines)?paint.sideLines:['AIRLINES','顺丰航空'];
    c.font=`bold ${Math.round(h*.39)}px Arial, sans-serif`;c.fillText(lines[0]??'AIRLINES',x,h*.28,w-h*1.1);
    c.font=`bold ${Math.round(h*.38)}px Arial, sans-serif`;c.fillText(lines[1]??'顺丰航空',x,h*.67,w-h*1.1);
    if(cargo){c.font=`bold ${Math.round(h*.14)}px Arial, sans-serif`;c.fillText('CARGO',x,h*.94,w-h*1.1);}
   }else{
    c.font=`bold ${Math.round(h*.58)}px Arial, sans-serif`;
    c.fillText(paint.sideText??(livery.en+(cargo?' CARGO':'')),h*.95+(w-h*.95)/2,h*.46,w-h*1.1);
    c.fillRect(h*.95,h*.83,w-h*1.1,Math.max(2,h*.055));
   }
   if(livery.id==='fedex'){c.fillStyle=paint.accentColor??livery.colors?.accent??'#ff6600';c.fillRect(w*.55,h*.83,w*.45-h*.15,Math.max(2,h*.055));}
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
