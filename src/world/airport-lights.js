import * as T from 'three';
import {RUNWAY} from '../flight.js';

// Runway 09 approaches in +X; the left side is negative Z. All distances are metres.
export const PAPI_POSITION={x:RUNWAY.touch,y:.8,z:-55};
export const PAPI_THRESHOLDS=[2.5,2.83,3.17,3.5];
export const RABBIT_PERIOD=.5;
export const RABBIT_DISTANCES=[900,750,600,450,300,150];
const WHITE=0xffffff,RED=0xff2525,GREEN=0x22ff72;

export function papiColors(camera){
 // The longitudinal angle models the glide plane rather than distance to one side of it.
 const angle=Math.atan2(camera.y-PAPI_POSITION.y,PAPI_POSITION.x-camera.x)*180/Math.PI;
 return PAPI_THRESHOLDS.map(threshold=>angle>=threshold?'white':'red');
}

// One lamp fires at a time, starting furthest out; the final 20% is a dark reset.
export function rabbitIndex(time){
 const phase=((time%RABBIT_PERIOD)+RABBIT_PERIOD)%RABBIT_PERIOD/RABBIT_PERIOD;
 return phase<.8?Math.floor(phase/.8*RABBIT_DISTANCES.length):-1;
}

export function airportLightLayout(low=false){
 const edge=[],center=[],threshold=[],end=[],approach=[],papi=[];
 const spacing=low?120:60;
 for(let x=RUNWAY.start;x<=RUNWAY.end;x+=spacing){
  for(const z of [-RUNWAY.width/2,RUNWAY.width/2])edge.push({x,y:.45,z,color:WHITE});
 }
 for(let x=RUNWAY.start+30;x<RUNWAY.end;x+=low?60:30){
  const remaining=RUNWAY.end-x;
  const color=remaining<=300?RED:remaining<=900&&Math.round((x-(RUNWAY.start+30))/(low?60:30))%2?RED:WHITE;
  center.push({x,y:.32,z:0,color});
 }
 for(let z=-27;z<=27;z+=low?6:3){
  threshold.push({x:RUNWAY.start,y:.45,z,color:GREEN});
  end.push({x:RUNWAY.end,y:.45,z,color:RED});
 }
 for(let distance=60;distance<=900;distance+=low?120:60){
  for(const z of (distance===300?[-18,-12,-6,0,6,12,18]:[-4,0,4]))
   approach.push({x:RUNWAY.start-distance,y:.7,z,color:WHITE});
 }
 for(let i=0;i<4;i++)papi.push({x:PAPI_POSITION.x,y:PAPI_POSITION.y,z:PAPI_POSITION.z-(3-i)*9,color:RED});
 return {edge,center,threshold,end,approach,papi};
}

function points(data,texture,size){
 const positions=new Float32Array(data.length*3),colors=new Float32Array(data.length*3),color=new T.Color();
 data.forEach((p,i)=>{positions.set([p.x,p.y,p.z],i*3);color.setHex(p.color);colors.set([color.r,color.g,color.b],i*3);});
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('color',new T.BufferAttribute(colors,3));
 const material=new T.PointsMaterial({map:texture,size,vertexColors:true,transparent:true,blending:T.AdditiveBlending,depthWrite:false,fog:false,toneMapped:false});
 const mesh=new T.Points(geometry,material);mesh.frustumCulled=false;return mesh;
}

export class AirportLights{
 constructor(scene,texture){
  this.time=0;this.mode='day';this.low=false;
  this.fullLayout=airportLightLayout();this.lowLayout=airportLightLayout(true);
  const staticLights=layout=>[...layout.edge,...layout.center,...layout.threshold,...layout.end,...layout.approach];
  this.full=points(staticLights(this.fullLayout),texture,12);
  this.cheap=points(staticLights(this.lowLayout),texture,12);
  this.papi=points(this.fullLayout.papi,texture,16);
  this.rabbit=points([{x:0,y:1,z:0,color:WHITE}],texture,24);
  scene.add(this.full,this.cheap,this.papi,this.rabbit);this.setTime('day');
 }
 setTime(mode){
  this.mode=mode;const brightness=mode==='night'?1:mode==='dusk'?.48:0;
  for(const mesh of [this.full,this.cheap,this.rabbit])mesh.material.opacity=brightness;
  this.papi.material.opacity=mode==='day'?.15:brightness;
  this.full.visible=brightness>0&&!this.low;this.cheap.visible=brightness>0&&this.low;
  this.papi.visible=true;this.rabbit.visible=false;
 }
 setQuality(low){this.low=low;this.setTime(this.mode);}
 // Absolute wall-clock seconds keep the rabbit at 2 Hz even at low frame rates or while paused.
 update(time,camera){
  this.time=time;
  const colors=papiColors(camera),attribute=this.papi.geometry.getAttribute('color'),color=new T.Color();
  colors.forEach((value,i)=>{color.setHex(value==='white'?WHITE:RED);attribute.setXYZ(i,color.r,color.g,color.b);});
  attribute.needsUpdate=true;
  const index=rabbitIndex(this.time);
  this.rabbit.visible=this.mode!=='day'&&index>=0;
  if(this.rabbit.visible){
   const attribute=this.rabbit.geometry.getAttribute('position');attribute.setXYZ(0,RUNWAY.start-RABBIT_DISTANCES[index],1.2,0);attribute.needsUpdate=true;
  }
 }
}
