// Run: node tools/check-model-paint.mjs
// Uses the real twin meshes and A380 GLBs, without a browser/GPU or network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {TwinAircraft} from '../src/twin-aircraft.js';
import {addModelPaint} from '../src/model-paint.js';
import {LIVERIES} from '../src/aircraft.js';
import {addCabinLights,updateCabinLights,removeCabinLights} from '../src/aircraft-lighting.js';

globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, options) {this.type=type;Object.assign(this,options);} };
const images=[],canvases=[];
globalThis.Image=class {constructor(){images.push(this);} set src(s){this.url=s;} get src(){return this.url;}};
globalThis.document={createElement(type){
 assert.equal(type,'canvas');const calls=[];
 const ctx={calls,clearRect(...x){calls.push(['clear',...x]);},drawImage(...x){calls.push(['image',...x]);},fillText(...x){calls.push(['text',this.fillStyle,...x]);},fillRect(...x){calls.push(['rect',this.fillStyle,...x]);},beginPath(){calls.push(['begin']);},moveTo(...x){calls.push(['move',...x]);},lineTo(...x){calls.push(['line',...x]);},closePath(){calls.push(['close']);},fill(){calls.push(['fill',this.fillStyle]);}};
 const canvas={getContext(){return ctx;},ctx};canvases.push(canvas);return canvas;
}};

async function geometryOnlyGLB(name){
 const data=await readFile(new URL(`../assets/a380/${name}.glb`,import.meta.url));
 const size=data.readUInt32LE(12), json=JSON.parse(data.subarray(20,20+size).toString());
 // Strip texture references, not geometry/transforms/material sides; Node has no image decoder.
 for(const m of json.materials||[]){delete m.normalTexture;delete m.emissiveTexture;delete m.occlusionTexture;if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}}
 delete json.images;delete json.textures;delete json.samplers;
 const text=Buffer.from(JSON.stringify(json)), n=(text.length+3)&~3, bin=data.subarray(20+size);
 const out=Buffer.alloc(20+n+bin.length,0x20);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(n,12);out.write('JSON',16);text.copy(out,20);bin.copy(out,20+n);
 return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');
}
async function a380(){
 const root=new T.Group(),model=new T.Group();model.rotation.y=Math.PI/2;root.add(model);
 for(const name of ['fuselage','wings','nose','wing-left','wing-right','body-left','body-right']){
  const gltf=await geometryOnlyGLB(name);model.add(gltf.scene);const invisible=[];
  gltf.scene.traverse(o=>{if(o.isMesh&&[o.material].flat().every(m=>m.userData.viewerInvisible||/^Material\.00[12]$/.test(m.name)))invisible.push(o);});invisible.forEach(o=>o.removeFromParent());
 }
 root.updateMatrixWorld(true);let box=new T.Box3().setFromObject(root,true),size=box.getSize(new T.Vector3());model.scale.setScalar(79.8/size.z);
 root.updateMatrixWorld(true);box.setFromObject(root,true);model.position.sub(box.getCenter(new T.Vector3()));root.updateMatrixWorld(true);
 const aircraft={root,type:'a380'},params={sideZ:3.55,sideY:-4.2,tailX:-31,tailY:7.5,length:39};
 // Projection must not bake an existing root world transform into the decals.
 root.position.set(13,2,-9);root.rotation.y=.37;root.updateMatrixWorld(true);addModelPaint(aircraft,params);
 root.position.set(0,0,0);root.rotation.y=0;root.updateMatrixWorld(true);return {aircraft,params};
}
function sources(aircraft){
 const body=[],fin=[];aircraft.root.traverse(o=>{
  if(!o.isMesh)return;
  if(aircraft.type==='a380'){
   if(o.isSkinnedMesh&&[o.material].flat().some(m=>/^A380X_FUSE[123]$/.test(m.name)))body.push(o);
   if(o.name==='Mesh_44002')fin.push(o);
  }else if(o.name==='original-fuselage')body.push(o);
  else if(o.geometry.type==='ExtrudeGeometry'&&o.position.z===-.19)fin.push(o);
 });return {body,fin};
}
function verifySurface(aircraft,params){
 const root=aircraft.root,{body,fin}=sources(aircraft),is380=aircraft.type==='a380';root.updateMatrixWorld(true);
 assert(body.length&&fin.length,`${aircraft.type}: source skin not found`);
 const ray=new T.Raycaster(),counts=[];
 for(const sign of [-1,1]){
  for(const kind of ['side','tail']){
   const decal=root.getObjectByName(`livery-${kind}-${sign>0?'right':'left'}`);
   assert(decal,`${aircraft.type} ${kind} ${sign}: missing projection`);
   assert.equal(decal.material.side,kind==='tail'&&!is380?T.FrontSide:T.DoubleSide);
   assert.equal(decal.material.depthWrite,false);assert.equal(decal.material.depthTest,true);
   let hits=0,skinHits=0,maxGap=0;const sideLength=params.length*(is380?.82:.45);
   for(let i=0;i<9;i++)for(let j=0;j<9;j++){
    const u=.15+.7*i/8,v=.15+.7*j/8;
    const y=kind==='side'?params.sideY+(v-.5)*2.2:params.tailY+(v-.5)*(is380?2.4:3.2);
    const x=kind==='side'?(is380?4:aircraft.spec.length*.28)+sign*(u-.5)*sideLength:params.tailX+(is380?.8:0)+sign*(u-.5)*(is380?2.4:3.2)-(is380?.65*(y-params.tailY):0);
    ray.set(new T.Vector3(x,y,sign*10),new T.Vector3(0,0,-sign));
    const skin=ray.intersectObjects(kind==='side'?body:fin,false)[0],paint=ray.intersectObject(decal,false)[0];
    if(skin)skinHits++;
    if(skin&&paint){
     hits++;const gap=sign*(paint.point.z-skin.point.z);maxGap=Math.max(maxGap,gap);
     assert(gap>=-.001&&gap<=.03,`${aircraft.type} ${kind} ${sign}: invalid surface gap ${gap}`);
     if(kind==='tail'){
      assert(Math.abs(paint.uv.x-u)<.001&&Math.abs(paint.uv.y-v)<.001,`${aircraft.type} ${sign}: mirrored, clipped or distorted tail UV`);
      if(!is380)assert(gap>=.019&&gap<=.021,`${aircraft.type} ${sign}: twin tail must sit 2 cm outside the fin, got ${gap}`);
     }
    }
   }
   assert(skinHits>=65,`${aircraft.type} ${kind} ${sign}: only ${skinHits}/81 samples have source skin`);
   assert.equal(hits,skinHits,`${aircraft.type} ${kind} ${sign}: projection misses source skin`);
   if(kind==='tail'&&!is380){
    const p=decal.geometry.attributes.position,a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),normal=new T.Vector3();
    for(let i=0;i<p.count;i+=3){
     a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
     normal.subVectors(b,a).cross(c.sub(a));assert(normal.z*sign>0,`${aircraft.type}: tail triangle faces the wrong side`);
    }
    for(const u of [.25,.5,.75])for(const v of [.25,.5,.75]){
     const x=params.tailX+sign*(u-.5)*3.2,y=params.tailY+(v-.5)*3.2;
     ray.set(new T.Vector3(x,y,-sign*3),new T.Vector3(0,0,sign));
     assert.equal(ray.intersectObject(decal,false).length,0,`${aircraft.type}: opposite tail marking visible from behind`);
    }
    const windows=root.children.find(o=>o.isInstancedMesh&&o.count===84);assert(windows);
    const windowBox=new T.Box3().setFromObject(windows),tailBox=new T.Box3().setFromObject(decal);
    assert(tailBox.min.y>windowBox.max.y&&!tailBox.intersectsBox(windowBox),`${aircraft.type}: tail marking overlaps cabin windows`);
   }
   counts.push(`${kind}${sign>0?'+':'-'} ${hits}/${skinHits} skin samples (of 81), outward≤${maxGap.toFixed(4)}m`);
  }
 }
 console.log(`${aircraft.type}: ${counts.join(', ')}`);
}
const start=performance.now(),models=[await a380()];
for(const type of ['a330','b777']){
 const aircraft=await new TwinAircraft(type).load(),s=aircraft.spec;
 models.push({aircraft,params:{sideZ:s.radius+.08,sideY:-.3,tailX:-s.length*.43,tailY:s.tail*.64,length:s.length*.63}});
}
for(const {aircraft,params} of models){
 verifySurface(aircraft,params);
 const root=aircraft.root,{body,fin}=sources(aircraft),is380=aircraft.type==='a380';root.updateMatrixWorld(true);
 const ray=new T.Raycaster(),stripeUV=new Map();
 if(!is380){
  // The outward separation and one-sidedness must survive aircraft motion and
  // distant views; the offsets live in the moving root's local coordinates.
  const position=root.position.clone(),quaternion=root.quaternion.clone();
  root.position.set(123,456,-321);root.rotation.set(.2,.8,.25);root.updateMatrixWorld(true);
  for(const sign of [-1,1])for(const distance of [3,60,1500]){
   const decal=root.getObjectByName(`livery-tail-${sign>0?'right':'left'}`),x=params.tailX,y=params.tailY;
   ray.set(root.localToWorld(new T.Vector3(x,y,sign*distance)),new T.Vector3(0,0,-sign).transformDirection(root.matrixWorld));
   const skin=ray.intersectObjects(fin,false)[0],paint=ray.intersectObject(decal,false)[0];
   assert(skin&&paint,`${aircraft.type}: moving tail missing from ${distance}m`);
   assert(Math.abs((skin.distance-paint.distance)-.02)<.001,`${aircraft.type}: moving tail depth gap`);
   ray.set(root.localToWorld(new T.Vector3(x,y,-sign*distance)),new T.Vector3(0,0,sign).transformDirection(root.matrixWorld));
   assert.equal(ray.intersectObject(decal,false).length,0,`${aircraft.type}: moved tail visible through reverse face`);
  }
  root.position.copy(position);root.quaternion.copy(quaternion);root.updateMatrixWorld(true);
 }
 for(const sign of [-1,1]){
  const stripe=root.getObjectByName(`livery-stripe-${sign>0?'right':'left'}`),y=is380?params.sideY-2.55:-1.35;
  let tested=0;
  for(const x of [-15,-7,7,15]){
   ray.set(new T.Vector3(x,y,sign*10),new T.Vector3(0,0,-sign));
   const skin=ray.intersectObjects(body,false)[0],paint=ray.intersectObject(stripe,false)[0];
   if(!skin){assert(!paint,'stripe must not float across an opening');continue;}
   assert(paint,`${aircraft.type}: stripe missing at ${x}, ${sign}`);tested++;
   const gap=sign*(paint.point.z-skin.point.z);assert(gap>=-.001&&gap<=.03,`${aircraft.type}: invalid stripe surface gap ${gap}`);
   if(stripeUV.has(x))assert(Math.abs(stripeUV.get(x)-paint.uv.x)<.001,'stripe sweep must point toward the tail on both sides');else stripeUV.set(x,paint.uv.x);
  }
  assert(tested>=3,`${aircraft.type}: insufficient stripe surface samples`);
 }
 assert(stripeUV.get(-15)<stripeUV.get(15),'red sweep oriented tailward');
 if(is380){
  for(const sign of [-1,1]){
   const decal=root.getObjectByName(`livery-sf-side-${sign>0?'right':'left'}`);assert(decal);
   let tested=0;for(const x of [10,15,20,23]){
    ray.set(new T.Vector3(x,params.sideY,sign*10),new T.Vector3(0,0,-sign));
    const skin=ray.intersectObjects(body,false)[0],paint=ray.intersectObject(decal,false)[0];
    if(!skin)continue;assert(paint,'SF forward decal must follow the actual skin');
    const gap=sign*(paint.point.z-skin.point.z);assert(gap>=-.001&&gap<=.03,`SF forward decal has invalid surface gap ${gap}`);
    assert(paint.uv.x>=0&&paint.uv.x<=18/(params.length*.82),'SF logo must use the correct portion of its fixed-size canvas');tested++;
   }
   assert(tested>=3,'SF markings must be on the forward fuselage on both sides');
  }
  const caps=root.children.filter(o=>o.name==='livery-freight-window-caps'),centers=caps.flatMap(o=>o.userData.windowCenters);
  // Every sampled cap boundary must be an original skinned-hull vertex, not
  // a rectangle hovering above (or penetrating) the fuselage.
  for(const cap of caps){
   const source=body.find(o=>o.material===cap.material&&o.geometry.attributes.position.count>5000);assert(source);
   const pos=cap.geometry.attributes.position,uv=cap.geometry.attributes.uv,original=source.geometry.attributes.position,originalUV=source.geometry.attributes.uv;
   const matrix=new T.Matrix4().copy(root.matrixWorld).invert().multiply(source.matrixWorld),v=new T.Vector3(),p=new T.Vector3();
   for(let i=1;i<pos.count;i+=Math.max(3,Math.floor(pos.count/30/3)*3)){
    p.fromBufferAttribute(pos,i);let match=false;
    for(let j=0;j<original.count;j++){
     source.getVertexPosition(j,v);v.applyMatrix4(matrix);
     if(v.distanceToSquared(p)<1e-10&&Math.abs(originalUV.getX(j)-uv.getX(i))<.01&&Math.abs(originalUV.getY(j)-uv.getY(i))<.01){match=true;break;}
    }
    assert(match,'cap boundary/UV must coincide with the source hull');
   }
  }
  for(const sign of [-1,1])for(const row of [params.sideY-1.635,params.sideY+1.06]){
   const rowCenters=centers.filter(p=>Math.sign(p[2])===sign&&p[0]<0&&Math.abs(p[1]-row)<.2);
   assert(rowCenters.length>=10,`missing A380 aft window patches for row ${row}, side ${sign}`);
   for(const p of rowCenters.filter((_,i)=>i%Math.max(1,Math.floor(rowCenters.length/4))===0)){
    ray.set(new T.Vector3(p[0],p[1],sign*10),new T.Vector3(0,0,-sign));
    const cap=ray.intersectObjects(caps,false).find(h=>Math.abs(h.point.z-p[2])<.01);
    assert(cap,`A380 opening not capped at ${p}`);
    const skin=ray.intersectObjects(body,false).find(h=>Math.abs(h.point.z-p[2])<.01);
    assert(!skin,`window cap not located in a genuine opening: ${p}`);
   }
  }
  console.log(`A380: ${centers.length} hull-boundary window caps; both decks and sides include aft openings.`);
 }
}
console.log(`Geometry preparation and checks: ${((performance.now()-start)/1000).toFixed(2)}s (Node, includes GLB decode).`);

// Real catalog/logo assets, both cargo marks, asynchronous ordering, failures and disposal.
for(const livery of LIVERIES){
 const bytes=await readFile(new URL(`../assets/livery-logos/${livery.logo}`,import.meta.url));
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',livery.id);
}
for(const {aircraft} of models){
 const root=aircraft.root,side=root.getObjectByName('livery-side-right').material,tail=root.getObjectByName('livery-tail-right').material;
 const stripes=['left','right'].map(s=>root.getObjectByName('livery-stripe-'+s));assert(stripes.every(Boolean));
 const caps=root.children.filter(o=>o.name==='livery-freight-window-caps');
 if(aircraft.type==='a380'){assert.equal(caps.length,3);assert(caps.reduce((n,m)=>n+m.userData.windowCenters.length,0)>100);}else assert.equal(caps.length,0);
 const initialCanvasCount=canvases.length,{body,fin}=sources(aircraft),originalBody=body[0].material,originalFin=fin[0].material;
 const tailPieces=[];root.traverse(o=>{if(!o.isMesh)return;if(aircraft.type==='a380'){if([o.material].flat().some(m=>m.name==='A380X_FUSE4')&&!/^Static_Discharger/.test(o.name)){for(let p=o;p&&p!==root;p=p.parent)if(p.name==='VTP'){tailPieces.push(o);break;}}}else if(o===fin[0]||aircraft.parts.rudders.includes(o))tailPieces.push(o);});
 assert(aircraft.type==='a380'?tailPieces.length>20:tailPieces.length===2);const originalTail=tailPieces.map(o=>o.material);
 const engines=[];root.traverse(o=>{if(!o.isMesh)return;if(aircraft.type==='a380'?/^(?:FrontCase0(?:40|42|44|46)|Bucket0(?:28|29|30|31))$/.test(o.name)&&[o.material].flat().some(m=>/^A380_EXTERIOR_ENG_/.test(m.name)):o.material===originalBody&&o.geometry.type==='CylinderGeometry'&&o.geometry.parameters.radiusTop>1.4&&o.geometry.parameters.height>=2)engines.push(o);});
 assert.equal(engines.length,aircraft.type==='a380'?8:4);const originalEngines=engines.map(o=>o.material);
 const windows=[];root.traverse(o=>{if(aircraft.type==='a380'?o.isMesh&&/^Window[ _]Texture[ _]Main[ _]Deck/i.test(o.name)&&[o.material].flat().every(m=>m.name==='A380_PAX_WINDOW'):o.isInstancedMesh&&o.count===84)windows.push(o);});
 assert.equal(windows.length,aircraft.type==='a380'?18:1);assert(windows.every(o=>o.visible));
 // The real lighting module owns the day/night overlays and is synchronised by main.
 aircraft.livery='CCA';assert(addCabinLights(aircraft));updateCabinLights(aircraft,'night');
 const lights=root.getObjectByName('cabin-window-lights');
 if(lights)assert(lights.visible);else assert(windows[0].material.emissiveIntensity>0);
 const untouched=[];root.traverse(o=>{if(o.isMesh&&!windows.includes(o)&&o!==lights&&!o.name.startsWith('livery-'))untouched.push([o,o.visible]);});
 const fedex=LIVERIES.find(x=>x.id==='fedex'),sf=LIVERIES.find(x=>x.id==='sf');
 aircraft.paintLivery(fedex);const first=images.at(-1),late=first.onload,sideMap=side.map,tailMap=tail.map;
 const sideCanvas=sideMap.image,tailCanvas=tailMap.image,stripeCanvas=stripes[0].material.map.image,canvasSize=[sideMap.image.width,sideMap.image.height];
 assert(stripes.every(o=>!o.visible));assert(caps.every(o=>o.visible));
 assert(windows.every(o=>!o.visible),'freighter cabin windows hidden');
 for(const [mesh,visible] of untouched)assert.equal(mesh.visible,visible,`unexpected visibility change: ${mesh.name}`);
 if(lights)assert.equal(lights.visible,false,'cargo selection immediately hides night lights');else assert.equal(windows[0].material.emissiveIntensity,0);
 aircraft.livery='fedex';for(const time of ['day','night']){updateCabinLights(aircraft,time);if(lights)assert.equal(lights.visible,false);else assert.equal(windows[0].material.emissiveIntensity,0);}
 assert.notEqual(body[0].material,originalBody);assert.notEqual(fin[0].material,originalFin);
 assert.equal(body[0].material.color.getHexString(),new T.Color(fedex.colors.base).getHexString());
 assert.equal(fin[0].material.color.getHexString(),new T.Color(fedex.colors.primary).getHexString());
 for(const piece of tailPieces)assert.equal(piece.material.color.getHexString(),new T.Color(fedex.colors.primary).getHexString(),'entire fin and rudder recolored');
 if(aircraft.type==='a380')assert.equal(new Set(tailPieces.map(o=>o.material)).size,1,'share one cloned tail material');
 assert(first.src.endsWith('/fedex.png'));assert(sideCanvas.ctx.calls.some(x=>x[0]==='text'&&x[1]===fedex.color&&x[2].includes('CARGO')));
 assert(sideCanvas.ctx.calls.some(x=>x[0]==='rect'&&x[1]===fedex.colors.accent));
 first.onload();assert.equal(tailCanvas.ctx.calls.at(-1)[1],first,'FedEx tail must use its selected logo');
 // Verified model-specific colors and text can be supplied later, independently
 // of the current, deliberately non-prescriptive SF palette.
 const custom={...sf,modelPaint:{default:{bodyColor:'#b0c0d0',tailColor:'#405060',sideText:'顺丰速运 SF EXPRESS CARGO'},[aircraft.type]:{tailColor:'#102030'}}};
 aircraft.paintLivery(custom);const second=images.at(-1),calls=tailCanvas.ctx.calls.length;
 assert(stripes.every(o=>o.visible));assert(caps.every(o=>o.visible));
 assert(stripeCanvas.ctx.calls.some(x=>x[0]==='fill'&&x[1]===sf.colors.accent));
 assert(stripeCanvas.ctx.calls.some(x=>x[0]==='rect'&&x[1]===sf.colors.secondary));
 assert(stripeCanvas.ctx.calls.some(x=>x[0]==='rect'&&x[1]===sf.colors.primary));
 assert.equal(body[0].material.color.getHexString(),new T.Color('#b0c0d0').getHexString());
 assert.equal(fin[0].material.color.getHexString(),new T.Color('#102030').getHexString());
 for(const engine of engines)assert.equal(engine.material.color.getHexString(),new T.Color(sf.colors.primary).getHexString(),'SF nacelle tint');
 assert(sideCanvas.ctx.calls.some(x=>x[0]==='text'&&x[2]==='顺丰速运 SF EXPRESS CARGO'));
 assert(second.src.endsWith('/'+sf.logo));late();assert.equal(tailCanvas.ctx.calls.length,calls,'stale image must not repaint');
 second.onload();assert.equal(tailCanvas.ctx.calls.at(-1)[1],second,'tail uses actual selected image');
 assert(sideCanvas.ctx.calls.some(x=>x[0]==='text'&&x[1]===sf.color&&x[2].includes('CARGO')));
 assert.equal(side.map,sideMap);assert.equal(tail.map,tailMap);assert.equal(canvases.length,initialCanvasCount+3,'reuse canvases/textures on switch');
 aircraft.paintLivery(sf);
 assert.deepEqual([sideCanvas.width,sideCanvas.height],canvasSize,'switching must not resize an uploaded GPU texture');
 if(aircraft.type==='a380'){assert(root.getObjectByName('livery-sf-side-left').visible&&root.getObjectByName('livery-sf-side-right').visible);assert(!root.getObjectByName('livery-side-left').visible&&!root.getObjectByName('livery-side-right').visible);}
 assert(['AIRLINES','顺丰航空','CARGO'].every(text=>sideCanvas.ctx.calls.some(x=>x[0]==='text'&&x[2]===text)),'SF front lockup');
 assert.equal(fin[0].material.color.getHexString(),new T.Color(sf.colors.primary).getHexString(),'SF black fin');
 aircraft.paintLivery({...sf,modelPaint:{[aircraft.type]:{logo:'boeing.png',tailLogo:'klm.png',color:'#123456',hideWindows:false,stripes:false,sideLines:['CUSTOM','定制']}}});
 const sideImage=images.at(-2),tailImage=images.at(-1),lateSide=sideImage.onload;
 assert(sideImage.src.endsWith('/boeing.png'));assert(tailImage.src.endsWith('/klm.png'));
 tailImage.onload();assert.equal(tailCanvas.ctx.calls.at(-1)[1],tailImage);
 assert(sideCanvas.ctx.calls.some(x=>x[0]==='text'&&x[1]==='#123456'&&x[2]==='定制'));
 assert(windows.every(o=>o.visible),'explicit window override');assert(caps.every(o=>!o.visible));assert(stripes.every(o=>!o.visible),'explicit stripe override');
 aircraft.paintLivery(LIVERIES[1]);const afterSwitch=tailCanvas.ctx.calls.length;lateSide();assert.equal(tailCanvas.ctx.calls.length,afterSwitch,'late split-logo load');
 const failed=images.at(-1);failed.onerror();aircraft.livery='CCA';updateCabinLights(aircraft,'night');
 assert(windows.every(o=>o.visible),'passenger windows restored');assert(caps.every(o=>!o.visible));assert(stripes.every(o=>!o.visible));
 if(aircraft.type==='a380')assert(root.getObjectByName('livery-side-left').visible&&!root.getObjectByName('livery-sf-side-left').visible);
 if(lights)assert(lights.visible);else assert(windows[0].material.emissiveIntensity>0);
 assert.equal(body[0].material.color.getHexString(),originalBody.color.getHexString());
 assert.equal(fin[0].material.color.getHexString(),originalFin.color.getHexString());
 engines.forEach((engine,i)=>assert.equal(engine.material.color.getHexString(),originalEngines[i].color.getHexString(),'nacelle restored'));
 tailPieces.forEach((piece,i)=>assert.equal(piece.material.color.getHexString(),originalTail[i].color.getHexString(),'fin and rudder restored'));
 aircraft.paintLivery(LIVERIES[1]);const retry=images.at(-1);retry.onload();assert.equal(tailCanvas.ctx.calls.at(-1)[1],retry);
 aircraft.paintLivery({...LIVERIES[2],modelPaint:{default:{tailLogo:'klm.png'}}});const pendingSide=images.at(-2),pending=images.at(-1),onload=pending.onload,before=tailCanvas.ctx.calls.length;
 side.dispose();onload();assert.equal(tailCanvas.ctx.calls.length,before,'disposed paint must not repaint');assert.equal(pending.src,'');assert.equal(pendingSide.src,'');
 removeCabinLights(aircraft);tail.dispose();stripes[0].material.dispose();sideMap.dispose();tailMap.dispose();stripes[0].material.map.dispose();
}
console.log(`Paint checks: ${LIVERIES.length} real logo files, configurable model colors/text, cargo windows/day-night lights, independent logo loads, latest selection wins, error/retry and disposal.`);
