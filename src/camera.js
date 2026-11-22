import * as T from 'three';
import {clamp} from './flight.js';
import {setCockpitAirframeVisibility} from './cockpit-view.js';
import {cameraPose,applyCameraBuffet,applyCameraPose} from './camera-follow.js';
import {$,all} from './ui/dom.js';
const radians=x=>x*Math.PI/180;

// Fit the overview footprint to the narrower horizontal FOV on portrait phones.
// A 0.60-span radius and 10% distance margin allow for swept wings and model
// origins that are not quite centred. Other viewport classes retain their
// established distances, including the old narrow-landscape calculation.
export function overviewOrbitDistance(plane,width,height){
 if(width>=760)return plane.type==='shuttle'?80:125;
 const aspect=Math.max(.1,width/Math.max(1,height));
 const halfHorizontal=Math.atan(Math.tan(radians(43)/2)*aspect);
 const span=plane.dimensions?Math.max(plane.dimensions.x,plane.dimensions.z):70;
 const min=plane.type==='shuttle'?70:165;
 const fit=width<600&&width<height?span*.60*1.1/Math.sin(halfHorizontal):span*.58/Math.sin(halfHorizontal)*1.35;
 return clamp(Math.max(min,fit),min,1200);
}

export function createCamera({renderer,camera,display,sim,getPlane,getCockpit,getPanel,cancelCameraGestures}){
 const _yAxis=new T.Vector3(0,1,0);
 let camMode='orbit',orbitAngle=.87,orbitHeight=.29,orbitDistance=137,focus=new T.Vector3(0,2,0);
 let orbitOverview=true,overviewCraft=null,lookYaw=0,lookPitch=0,viewFov=43,towerZoom=1;
 // Cache projection inputs so the camera matrix is only rebuilt when one of them changes.
 let lastViewX=NaN,lastW=0,lastH=0,lastFov=0,lastNear=0;
 const camPos=new T.Vector3(),targetPos=new T.Vector3();
 const panRight=new T.Vector3(),panUp=new T.Vector3(),inverseHeading=new T.Quaternion();
function overviewDistance(){return overviewOrbitDistance(getPlane(),innerWidth,innerHeight);}
function setCam(mode){if(getPlane().type==='concorde'&&['cockpit','wing'].includes(mode))return;cancelCameraGestures();camMode=mode;focus.set(0,2,0);lookYaw=lookPitch=0;viewFov=mode==='cockpit'?66:43;towerZoom=1;if(mode==='orbit'){orbitAngle=.87;orbitHeight=.25;orbitOverview=true;overviewCraft=getPlane();orbitDistance=overviewDistance();}setCockpitAirframeVisibility(getPlane(),camMode);all('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===mode));$('#cockpitOverlay').hidden=mode!=='cockpit'||!!getCockpit();document.body.classList.toggle('cockpit-mode',mode==='cockpit');}
function beginCameraGesture(kind){if(camMode==='chase'||(camMode==='tower'&&kind!=='zoom'))setCam('orbit');}
function rotateCamera(dx,dy){
 if(camMode==='cockpit'||camMode==='wing'){lookYaw-=dx*.005;lookPitch=clamp(lookPitch-dy*.005,-1.3,1.3);}
 else if(camMode==='orbit'){orbitAngle-=dx*.006;orbitHeight=clamp(orbitHeight+dy*.005,-1.48,1.48);}
}
function panCamera(dx,dy){
 if(camMode==='cockpit'||camMode==='wing'){rotateCamera(dx,dy);return;}
 if(camMode!=='orbit')return;
 orbitOverview=false;
 const scale=2*orbitDistance*Math.tan(radians(43)/2)/Math.max(1,renderer.domElement.clientHeight);
 inverseHeading.setFromAxisAngle(_yAxis,-radians(90-sim.heading));
 panRight.set(1,0,0).applyQuaternion(camera.quaternion).applyQuaternion(inverseHeading);
 panUp.set(0,1,0).applyQuaternion(camera.quaternion).applyQuaternion(inverseHeading);
 focus.addScaledVector(panRight,-dx*scale).addScaledVector(panUp,dy*scale).clampLength(0,400);
}
function zoomCamera(factor){
 if(camMode==='orbit'){orbitOverview=false;orbitDistance=clamp(orbitDistance*factor,5,2000);}
 else if(camMode==='cockpit'||camMode==='wing')viewFov=clamp(viewFov*factor,25,100);
 else if(camMode==='tower')towerZoom=clamp(towerZoom*factor,.1,8);
}
function focusPart(part){setCam('orbit');orbitOverview=false;const specs={gear:[9,-3,0,52,.1,1.1],wing:[-5,0,17,65,.5,.9],tail:[-31,4,0,53,.25,1.0],engine:[2,-2,13,35,.12,.7],nose:[28,0,0,33,.12,.8]};if(getPlane().type==='concorde')Object.assign(specs,{gear:[1,-2,0,37,.13,1.18],wing:[-12,0,6,38,.35,1.1],tail:[-24,2,0,34,.27,1.0],engine:[-14,-1,6,33,.15,1.9]});if(getPlane().type==='shuttle')Object.assign(specs,{gear:[-1,-1.5,0,30,.1,1.1],wing:[-7,0,0,40,.5,.9],tail:[-14,4,0,30,.25,1]});if(getPlane().type==='a330'){specs.gear=[-5.8,-4.5,5,45,.1,1.1];specs.engine=[-1.5,-2.35,9.4,32,.12,.7];specs.tail=[-27,4,0,50,.25,1];}const [x,y,z,d,h,a]=specs[part];focus.set(x,y,z);orbitDistance=d;orbitHeight=h;orbitAngle=a;}
function updateCamera(){
 if(camMode==='orbit'&&orbitOverview&&overviewCraft!==getPlane()){overviewCraft=getPlane();orbitDistance=overviewDistance();}
 // Attached views have no world-height clamp (it would cause drift); only the user-driven orbit view keeps one (camera-follow.js).
 cameraPose({mode:camMode,planePosition:getPlane().root.position,planeQuaternion:getPlane().root.quaternion,heading:sim.heading,aircraftType:getPlane().type,cockpitScale:getCockpit()?.native.scale||getPlane().native.scale,orbitAngle,orbitHeight,orbitDistance,focus,lookYaw,lookPitch},camPos,targetPos);
 if(camMode==='tower')camera.fov=clamp(clamp(2200/camPos.distanceTo(getPlane().root.position),2.8,43)*towerZoom,2.8,85);
 else camera.fov=camMode==='cockpit'||camMode==='wing'?viewFov:43;
 applyCameraBuffet(camMode,sim.buffet,sim.paused,camPos,targetPos);
 applyCameraPose(camera,camPos,targetPos,getPlane().root.quaternion,camMode);
 const w=display.width,h=display.height,viewX=camMode==='orbit'&&w>760?(getPanel()?w*.035:-w*.055):0,near=camMode==='cockpit'?.03:.2;
 if(h>0&&(near!==lastNear||camera.fov!==lastFov||w!==lastW||h!==lastH||viewX!==lastViewX)){
  camera.near=near;camera.aspect=w/h;lastNear=near;lastFov=camera.fov;lastW=w;lastH=h;lastViewX=viewX;
  // Both calls rebuild the projection matrix.
  if(viewX)camera.setViewOffset(w,h,viewX,0,w,h);else camera.clearViewOffset();
 }
}
function resize(){cancelCameraGestures();display.requestResize();if(camMode==='orbit'&&orbitOverview){orbitDistance=overviewDistance();overviewCraft=getPlane();}}
 return {setCam,beginCameraGesture,rotateCamera,panCamera,zoomCamera,focusPart,updateCamera,resize,
  get mode(){return camMode;},get focus(){return focus;},
  get orbitAngle(){return orbitAngle;},set orbitAngle(v){orbitAngle=v;},
  get orbitHeight(){return orbitHeight;},set orbitHeight(v){orbitHeight=v;},
  get orbitDistance(){return orbitDistance;},set orbitDistance(v){orbitDistance=v;},
  setOrbit(angle,height,distance,at){orbitOverview=false;orbitAngle=angle;orbitHeight=height;orbitDistance=distance;if(at)focus.fromArray(at);},
  cameraView(){return{mode:camMode,azimuth:orbitAngle,elevation:orbitHeight,distance:orbitDistance,focus:focus.toArray(),lookYaw,lookPitch,viewFov,towerZoom};}
 };
}
