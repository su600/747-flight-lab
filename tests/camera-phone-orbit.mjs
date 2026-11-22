// Run: node tests/camera-phone-orbit.mjs (real local meshes, no browser/GPU).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {parseXml} from './xml-fixture-parser.mjs';
import {Aircraft} from '../src/aircraft.js';
import {ConcordeAircraft} from '../src/concorde-aircraft.js';
import {SpaceShuttle} from '../src/space-shuttle.js';
import {AccurateA330} from '../src/accurate-a330.js';
import {createCamera,overviewOrbitDistance} from '../src/camera.js';
import {cameraPose,applyCameraPose} from '../src/camera-follow.js';

const originalLoad=T.TextureLoader.prototype.load,originalFetch=globalThis.fetch,originalParser=globalThis.DOMParser;
const xmlPrototype=Object.getPrototypeOf(parseXml('<root/>').documentElement);
xmlPrototype.querySelectorAll=function(selector){
 const scoped=selector.startsWith(':scope > '),tags=selector.replace(/^:scope\s*>\s*/,'').split(/\s*>\s*/);
 let candidates=[];
 if(scoped)candidates=[...this.children];else{const visit=node=>{for(const child of node.children){candidates.push(child);visit(child);}};visit(this);}
 let result=candidates.filter(node=>node.tagName===tags[0]);
 for(const tag of tags.slice(1))result=result.flatMap(node=>node.children.filter(child=>child.tagName===tag));
 return result;
};
xmlPrototype.querySelector=function(selector){return this.querySelectorAll(selector)[0]||null;};
globalThis.DOMParser=class{parseFromString(xml){return parseXml(xml);}};
T.TextureLoader.prototype.load=function(_url,onLoad){const texture=new T.Texture({width:1024,height:1024,naturalWidth:1024});queueMicrotask(()=>onLoad?.(texture));return texture;};
const root=fileURLToPath(new URL('../assets/',import.meta.url));
globalThis.fetch=async url=>{
 const pathname=new URL(String(url),'http://flight-lab.test').pathname;
 assert(pathname.startsWith('/assets/'),pathname);
 return {ok:true,status:200,text:()=>readFile(join(root,pathname.slice('/assets/'.length)),'utf8')};
};

// Collect the actual visible rest-pose vertices in aircraft-root coordinates,
// including the wing tips, nose, tail, landing gear and deployed lights.
function vertices(craft){
 craft.root.updateMatrixWorld(true);
 const points=[];
 const visit=(object,visible=true)=>{
  visible=visible&&object.visible;
  if(!visible)return;
  const attr=object.isMesh&&object.geometry?.attributes.position;
  if(attr){
   const v=new T.Vector3();
   for(let i=0;i<attr.count;i++){v.fromBufferAttribute(attr,i).applyMatrix4(object.matrixWorld);points.push(v.x,v.y,v.z);}
  }
  for(const child of object.children)visit(child,visible);
 };
 visit(craft.root);
 assert(points.length>1000,'expected actual model geometry');
 return points;
}
function bounds(points,camera){
 camera.updateMatrixWorld(true);
 const m=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).elements;
 let x=0,y=0,minX=Infinity,maxX=-Infinity;
 for(let i=0;i<points.length;i+=3){
  const a=points[i],b=points[i+1],c=points[i+2];
  const w=m[3]*a+m[7]*b+m[11]*c+m[15];
  assert(w>0,'geometry behind camera');
  const px=(m[0]*a+m[4]*b+m[8]*c+m[12])/w;
  minX=Math.min(minX,px);maxX=Math.max(maxX,px);x=Math.max(x,Math.abs(px));
  y=Math.max(y,Math.abs((m[1]*a+m[5]*b+m[9]*c+m[13])/w));
 }
 return {x,y,width:maxX-minX};
}
function legacyDistance(plane,width,height){
 if(width>=760)return plane.type==='shuttle'?80:125;
 const aspect=Math.max(.1,width/Math.max(1,height));
 const half=Math.atan(Math.tan(43*Math.PI/360)*aspect);
 const span=plane.dimensions?Math.max(plane.dimensions.x,plane.dimensions.z):70;
 const min=plane.type==='shuttle'?70:165;
 return Math.max(min,Math.min(1200,Math.max(min,span*.58/Math.sin(half)*1.35)));
}
try{
 const crafts=[await new Aircraft().load(),await new ConcordeAircraft().load(),await new SpaceShuttle().load(),await new AccurateA330().load()];
 const phoneSizes=[[280,1000],[320,900],[320,1100],[360,800],[390,844],[430,932],[599,900]];
 for(const craft of crafts){
  const points=vertices(craft),position=new T.Vector3(),target=new T.Vector3();
  let worstX=0,worstY=0;
  for(const [width,height] of phoneSizes){
   const distance=overviewOrbitDistance(craft,width,height);
   const camera=new T.PerspectiveCamera(43,width/height,.2,10000);
   // Reset angle plus a complete azimuth orbit at the reset elevation. This
   // deliberately uses level aircraft and the actual cameraPose/lookAt path.
   for(const angle of [.87,...Array.from({length:72},(_,i)=>i*Math.PI/36)]){
    cameraPose({mode:'orbit',planePosition:new T.Vector3(),planeQuaternion:new T.Quaternion(),heading:90,orbitAngle:angle,orbitHeight:.25,orbitDistance:distance,focus:new T.Vector3(0,2,0)},position,target);
    applyCameraPose(camera,position,target,new T.Quaternion(),'orbit');
    const result=bounds(points,camera);worstX=Math.max(worstX,result.x);worstY=Math.max(worstY,result.y);
    assert(result.x<.93&&result.y<.93,`${craft.type} ${width}x${height}, angle ${angle}: ${JSON.stringify(result)}`);
   }
  }
  if(craft.type==='b747'||craft.type==='concorde'){
   const width=390,height=844,old=legacyDistance(craft,width,height),distance=overviewOrbitDistance(craft,width,height);
   const camera=new T.PerspectiveCamera(43,width/height,.2,10000);
   const project=d=>{
    cameraPose({mode:'orbit',planePosition:new T.Vector3(),planeQuaternion:new T.Quaternion(),heading:90,orbitAngle:.87,orbitHeight:.25,orbitDistance:d,focus:new T.Vector3(0,2,0)},position,target);
    applyCameraPose(camera,position,target,new T.Quaternion(),'orbit');return bounds(points,camera);
   };
   const oldBounds=project(old),newBounds=project(distance);
   assert(old/distance>1.18,`${craft.type} distance should be noticeably closer`);
   assert(newBounds.width/oldBounds.width>1.18,`${craft.type} reset must actually appear larger on screen`);
   console.log(`${craft.type} 390x844 distance ${old.toFixed(1)} -> ${distance.toFixed(1)}, screen width ratio ${(newBounds.width/oldBounds.width).toFixed(2)}x`);
  }
  console.log(`${craft.type}: ${points.length/3} vertices, worst NDC |x|=${worstX.toFixed(3)}, |y|=${worstY.toFixed(3)}`);
 }
}finally{
 T.TextureLoader.prototype.load=originalLoad;globalThis.fetch=originalFetch;globalThis.DOMParser=originalParser;
}

// Desktop, tablets and landscape are byte-for-byte the former distance policy.
for(const type of ['b747','concorde','shuttle']){
 const plane={type,dimensions:new T.Vector3(70,20,64)};
 for(const [w,h] of [[1920,1080],[1024,1366],[768,1024],[760,900],[600,900],[600,2000],[700,1000],[844,390],[700,390],[390,320],[599,599]]){
  assert.equal(overviewOrbitDistance(plane,w,h),legacyDistance(plane,w,h),`${type} ${w}x${h} legacy policy`);
 }
 assert(overviewOrbitDistance(plane,599,900)<legacyDistance(plane,599,900));
 assert.equal(overviewOrbitDistance({...plane,dimensions:new T.Vector3(100,20,64)},1,10000),1200,'existing extreme-aspect cap remains');
}
assert(Number.isFinite(overviewOrbitDistance({type:'b747'},390,844)),'missing dimensions use fallback');

// Exercise the real controller: reset/resize/craft switching must not overwrite
// user zoom, pan, focusPart, setOrbit, or other camera modes.
const oldDocument=globalThis.document,oldWidth=globalThis.innerWidth,oldHeight=globalThis.innerHeight;
try{
 globalThis.innerWidth=390;globalThis.innerHeight=844;
 const overlay={hidden:false};
 globalThis.document={querySelector:s=>s==='#cockpitOverlay'?overlay:null,querySelectorAll:()=>[],body:{classList:{toggle(){}}}};
 const plane=type=>({type,dimensions:new T.Vector3(type==='concorde'?62:70,20,type==='concorde'?25:64),root:new T.Group(),native:{children:[],scale:new T.Vector3(1,1,1)}});
 let craft=plane('b747'),cancels=0,resizes=0;
 const camera=new T.PerspectiveCamera(),display={width:390,height:844,requestResize(){resizes++;}};
 const control=createCamera({renderer:{domElement:{clientHeight:844}},camera,display,sim:{heading:90,paused:true},getPlane:()=>craft,getCockpit:()=>null,getPanel:()=>null,cancelCameraGestures:()=>{cancels++;}});
 control.setCam('orbit');control.updateCamera();
 assert.equal(control.orbitDistance,overviewOrbitDistance(craft,390,844));
 assert.equal(control.orbitAngle,.87);assert.equal(control.orbitHeight,.25);
 control.rotateCamera(10,12);
 const rotated=[control.orbitAngle,control.orbitHeight];
 globalThis.innerWidth=320;globalThis.innerHeight=900;display.width=320;display.height=900;control.resize();control.updateCamera();
 assert.equal(control.orbitDistance,overviewOrbitDistance(craft,320,900));
 assert.deepEqual([control.orbitAngle,control.orbitHeight],rotated,'rotation persists through overview resize');
 craft=plane('concorde');control.updateCamera();
 assert.equal(control.orbitDistance,overviewOrbitDistance(craft,320,900),'overview tracks selected aircraft');
 control.zoomCamera(.5);control.panCamera(10,20);const custom=control.cameraView();
 globalThis.innerWidth=430;globalThis.innerHeight=932;display.width=430;display.height=932;control.resize();craft=plane('b747');control.updateCamera();
 assert.deepEqual(control.cameraView(),custom,'zoom and pan persist across resize and aircraft switch');
 control.focusPart('wing');const focused=control.cameraView();control.resize();control.updateCamera();
 assert.deepEqual(control.cameraView(),focused,'part focus persists across resize');
 control.setOrbit(.4,.1,33,[5,6,7]);const explicit=control.cameraView();control.resize();control.updateCamera();
 assert.deepEqual(control.cameraView(),explicit,'explicit orbit persists across resize');
 control.setCam('cockpit');control.zoomCamera(.8);const cockpit=control.cameraView();control.resize();control.updateCamera();
 assert.deepEqual(control.cameraView(),cockpit,'cockpit FOV is independent of overview resize');
 control.setCam('tower');control.zoomCamera(.7);const tower=control.cameraView();control.resize();control.updateCamera();
 assert.deepEqual(control.cameraView(),tower,'tower zoom is independent of overview resize');
 control.setCam('chase');control.beginCameraGesture('rotate');assert.equal(control.mode,'orbit','chase gesture still enters orbit');
 assert(cancels>0&&resizes>0);
 console.log('Camera controller passed: legacy viewports, resize, craft switching, gestures, custom focus/zoom and other modes.');
}finally{
 globalThis.document=oldDocument;globalThis.innerWidth=oldWidth;globalThis.innerHeight=oldHeight;
}
