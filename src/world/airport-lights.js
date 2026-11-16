import * as T from 'three';
import {RUNWAY} from '../flight.js';

// Runway 09 approaches in +X; the left side is negative Z. All distances are metres.
export const PAPI_POSITION={x:RUNWAY.touch,y:.8,z:-55};
export const PAPI_THRESHOLDS=[2.5,2.83,3.17,3.5];
export const RABBIT_PERIOD=.5;
export const RABBIT_DISTANCES=[900,750,600,450,300,150];
// Real fixtures are not pure RGB: halogen edge/approach lamps are warm white, the last 600 m of edge lights are yellow caution lamps.
const WHITE=0xffffff,RED=0xff2525,GREEN=0x22ff72;
export const LIGHT_COLORS={edge:0xffe6b8,caution:0xffbf3a,center:0xf2f6ff,approach:0xfff0d6,tdz:0xf6f8ff,red:0xff3020,green:0x2dff86};

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
 const edge=[],center=[],threshold=[],end=[],approach=[],papi=[],tdz=[];
 const C=LIGHT_COLORS,spacing=low?120:60;
 // Elevated edge lights; the final 600 m (in the landing direction) turn yellow.
 for(let x=RUNWAY.start;x<=RUNWAY.end;x+=spacing){
  for(const z of [-RUNWAY.width/2,RUNWAY.width/2])edge.push({x,y:.45,z,color:RUNWAY.end-x<=600?C.caution:C.edge,size:1});
 }
 // Inset centreline: white, alternating red/white from 900 m to go, all red for the last 300 m.
 for(let x=RUNWAY.start+30;x<RUNWAY.end;x+=low?60:30){
  const remaining=RUNWAY.end-x;
  const color=remaining<=300?C.red:remaining<=900&&Math.round((x-(RUNWAY.start+30))/(low?60:30))%2?C.red:C.center;
  center.push({x,y:.12,z:0,color,size:.7});
 }
 for(let z=-27;z<=27;z+=low?6:3){
  threshold.push({x:RUNWAY.start,y:.4,z,color:C.green,size:1.15});
  end.push({x:RUNWAY.end,y:.4,z,color:C.red,size:1});
 }
 // Touchdown-zone barrettes: three inset lamps each side every 60 m for the first 900 m.
 if(!low)for(let x=RUNWAY.start+60;x<=RUNWAY.start+900;x+=60)for(const side of [-1,1])for(const z of [9,10.5,12])tdz.push({x,y:.12,z:side*z,color:C.tdz,size:.75});
 // Approach lighting: five-lamp centre barrettes every 30 m (60 m on low quality), a 1000 ft crossbar, and red side rows for the inner 300 m.
 for(let distance=30;distance<=900;distance+=low?60:30){
  const zs=distance===300?[-22,-18.5,-15,-11.5,-8,-2,-1,0,1,2,8,11.5,15,18.5,22]:distance===150?[-10,-8.5,-7,-2,-1,0,1,2,7,8.5,10]:[-2,-1,0,1,2];
  for(const z of zs)approach.push({x:RUNWAY.start-distance,y:.7+distance*.006,z,color:C.approach,size:1.1});
  if(distance<=270&&!low)for(const side of [-1,1])for(const z of [10,11.5,13])approach.push({x:RUNWAY.start-distance,y:.6,z:side*z,color:C.red,size:.9});
 }
 for(let i=0;i<4;i++)papi.push({x:PAPI_POSITION.x,y:PAPI_POSITION.y,z:PAPI_POSITION.z-(3-i)*9,color:RED,size:1.6});
 return {edge,center,threshold,end,approach,papi,tdz};
}

// Lamps are drawn as screen-space points: a few pixels when far (they never vanish into sub-pixel noise) and a
// small halo when close, instead of 12 m world-space sprites that bloom into blobs as the aircraft approaches.
// The renderer uses a logarithmic depth buffer, so the shader carries three's logdepth chunks to depth-test correctly.
// Fog dims them with the scene's visibility, so low-visibility weather shows lights emerging from the murk.
const VERT=`#include <common>
#include <logdepthbuf_pars_vertex>
attribute float size;varying vec3 vColor;varying float vFade,vCore;uniform float uScale,uFog;
void main(){vColor=color;vec4 mv=modelViewMatrix*vec4(position,1.);float d=max(-mv.z,1.);
float px=size*uScale*2.2/d;gl_PointSize=clamp(px,2.,size*16.);vCore=max(.42,2./gl_PointSize);
// Distant lamps stay a crisp 2 px dot but lose intensity, so the runway reads as converging rows rather than a solid outline.
vFade=exp(-uFog*uFog*d*d*.55)*clamp(px/2.5,.32,1.);gl_Position=projectionMatrix*mv;
#include <logdepthbuf_vertex>
}`;
const FRAG=`#include <logdepthbuf_pars_fragment>
uniform sampler2D map;uniform float opacity;varying vec3 vColor;varying float vFade,vCore;
void main(){
#include <logdepthbuf_fragment>
vec2 c=gl_PointCoord-.5;float r=length(c)*2.;if(r>1.)discard;float core=1.-smoothstep(vCore*.5,vCore,r),halo=texture2D(map,gl_PointCoord).a*.6;
gl_FragColor=vec4(mix(vColor,vec3(1.),core*.55)*(core*1.6+halo)*opacity*vFade,1.);
#include <colorspace_fragment>
}`;
function points(data,texture,size){
 const positions=new Float32Array(data.length*3),colors=new Float32Array(data.length*3),sizes=new Float32Array(data.length),color=new T.Color();
 data.forEach((p,i)=>{positions.set([p.x,p.y,p.z],i*3);color.setHex(p.color);colors.set([color.r,color.g,color.b],i*3);sizes[i]=(p.size??1)*size/12;});
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.setAttribute('size',new T.BufferAttribute(sizes,1));
 const material=new T.ShaderMaterial({uniforms:{map:{value:texture},opacity:{value:1},uScale:{value:600},uFog:{value:0}},vertexShader:VERT,fragmentShader:FRAG,vertexColors:true,transparent:true,blending:T.AdditiveBlending,depthWrite:false});
 // Keep material.opacity as the public brightness knob (tests and callers read it); the uniform follows it.
 Object.defineProperty(material,'opacity',{get(){return this.uniforms.opacity.value;},set(v){this.uniforms.opacity.value=v;},configurable:true});
 const mesh=new T.Points(geometry,material);mesh.frustumCulled=false;return mesh;
}

export class AirportLights{
 constructor(scene,texture){
  this.time=0;this.mode='day';this.low=false;
  this.fullLayout=airportLightLayout();this.lowLayout=airportLightLayout(true);
  const staticLights=layout=>[...layout.edge,...layout.center,...layout.threshold,...layout.end,...layout.approach,...layout.tdz];
  this.full=points(staticLights(this.fullLayout),texture,12);
  this.cheap=points(staticLights(this.lowLayout),texture,12);
  this.papi=points(this.fullLayout.papi,texture,16);
  this.rabbit=points([{x:0,y:1,z:0,color:WHITE,size:1.8}],texture,12);
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
 // Pixel scale follows the viewport height and field of view; fog density follows the current visibility.
 setView(viewportHeight,fovDeg,fogDensity=0){const scale=viewportHeight/2/Math.tan(fovDeg*Math.PI/360);for(const m of [this.full,this.cheap,this.papi,this.rabbit]){m.material.uniforms.uScale.value=scale;m.material.uniforms.uFog.value=fogDensity;}}
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
