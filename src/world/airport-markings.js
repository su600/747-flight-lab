import * as T from 'three';
import {RUNWAY} from '../flight.js';

// Runway, taxiway and apron surface markings laid out after ICAO Annex 14 for a 60 m wide, 3800 m runway
// (designators 09/27). Every rectangle is [x, z, length along X, width along Z, yaw]; one instanced mesh per paint colour.
export const THRESHOLD_INSET=6;
export const CONNECTORS=[-1750,-850,200,1550];
const TAXI_Z=-130,HOLD_Z=-57;

const thresholdX=end=>end*(RUNWAY.end-THRESHOLD_INSET);
// x of a point `d` metres past the threshold at runway end `end` (-1 = runway 09 threshold, +1 = runway 27).
const along=(end,d)=>thresholdX(end)-end*d;
const span=(end,from,len)=>along(end,from+len/2);
// A plane laid flat with rotation (-90°, 0, yaw) points its local +X along world (cos yaw, 0, -sin yaw).
export const yawOf=(dx,dz)=>Math.atan2(-dz,dx);

export function runwayMarkingLayout(){
 const white=[],yellow=[];
 // Side stripes: 0.9 m, outer edge on the runway edge.
 const half=RUNWAY.width/2;
 for(const z of [-half+.45,half-.45])white.push([0,z,2*thresholdX(1),.9,0]);
 for(const end of [-1,1]){
  // Threshold "piano keys": 16 stripes (8 each side), 30 m x 1.8 m.
  for(let k=0;k<8;k++)for(const s of [-1,1])white.push([span(end,0,30),s*(3.6+k*3.4),30,1.8,0]);
  // Aiming point: 400 m from the threshold, 60 m x 10 m bars, inner edges 18 m apart.
  for(const s of [-1,1])white.push([span(end,400,60),s*14,60,10,0]);
  // Touchdown-zone bars: 22.5 m x 1.8 m, three, three, two, two, one and one per side.
  for(const [d,n] of [[150,3],[300,3],[600,2],[750,2],[900,1],[1050,1]])
   for(let k=0;k<n;k++)for(const s of [-1,1])white.push([span(end,d,22.5),s*(9.9+k*3.3),22.5,1.8,0]);
  // Blast pad beyond the runway end: yellow chevrons pointing at the threshold.
  for(let k=0;k<3;k++){
   const apex=end*(RUNWAY.end+6+k*14);
   for(const s of [-1,1])yellow.push([apex+end*7,s*12,Math.hypot(14,24),.9,yawOf(end*14,s*24)]);
  }
 }
 // Centreline: 30 m stripes, 20 m gaps, 0.9 m wide, between the designators.
 const start=along(-1,30+12+22+12),stop=along(1,30+12+22+12);
 for(let x=start;x+30<=stop;x+=50)white.push([x+15,0,30,.9,0]);
 return {white,yellow};
}

export function taxiwayMarkingLayout(){
 const yellow=[];
 // Arc of centreline paint around (cx,cz) from angle a0 to a1 (radians, x = cos, z = sin).
 const arc=(cx,cz,r,a0,a1,steps=10,w=.3)=>{for(let i=0;i<steps;i++){const a=a0+(a1-a0)*(i+.5)/steps;yellow.push([cx+r*Math.cos(a),cz+r*Math.sin(a),r*Math.abs(a1-a0)/steps+.06,w,yawOf(-Math.sin(a),Math.cos(a))]);}};
 for(const cx of CONNECTORS){
  // Continuous connector centreline from the parallel taxiway to the runway edge.
  yellow.push([cx,(TAXI_Z-34)/2,.3,-34-TAXI_Z,0]);
  // Fillets from the parallel taxiway into the connector, from both directions.
  for(const s of [-1,1])arc(cx+s*25,TAXI_Z+25,25,-Math.PI/2,s>0?-Math.PI:0);
  // Lead-on/lead-off lines curving onto the runway centreline in both directions.
  for(const s of [-1,1])arc(cx+s*34,-34,34,s>0?Math.PI:0,Math.PI/2,12);
  // Enhanced taxiway centreline: dashed lines either side for the last 45 m before the holding position.
  for(let z=HOLD_Z-48;z<HOLD_Z-3;z+=4)for(const s of [-1,1])yellow.push([cx+s*.55,z+1.5,.15,3,0]);
 }
 return {yellow};
}

// Apron (terminal side). Stands are nose-in at x = STANDS[i], the terminal face is near z = -560 and the
// apron taxilane runs parallel to it at z = TAXILANE_Z, joined to the parallel taxiway through two entrances.
export const STANDS=Array.from({length:9},(_,i)=>-1200+i*230);
export const TAXILANE_Z=-205,STOP_Z=-436,APRON_ENTRANCES=[-1030,235];
export function apronMarkingLayout(){
 const yellow=[],white=[],red=[];
 const arc=(list,cx,cz,r,a0,a1,steps=10,w=.45)=>{for(let i=0;i<steps;i++){const a=a0+(a1-a0)*(i+.5)/steps;list.push([cx+r*Math.cos(a),cz+r*Math.sin(a),r*Math.abs(a1-a0)/steps+.06,w,yawOf(-Math.sin(a),Math.cos(a))]);}};
 // Taxilane centreline and its two links to the parallel taxiway (with fillets on both sides).
 yellow.push([-300,TAXILANE_Z,2160,.45,0]);
 for(const x of APRON_ENTRANCES){
  yellow.push([x,(TAXI_Z-20+TAXILANE_Z+20)/2,.45,(TAXI_Z-20)-(TAXILANE_Z+20),0]);
  for(const s of [-1,1]){arc(yellow,x+s*20,TAXI_Z-20,20,Math.PI/2,s>0?Math.PI:0);arc(yellow,x+s*20,TAXILANE_Z+20,20,-Math.PI/2,s>0?-Math.PI:0);}
 }
 // Apron edge where the concrete meets the grass islands: double continuous yellow lines, broken at the entrances.
 const edge=[[-1400,APRON_ENTRANCES[0]-24],[APRON_ENTRANCES[0]+24,APRON_ENTRANCES[1]-24],[APRON_ENTRANCES[1]+24,800]];
 for(const [a,b] of edge)for(const dz of [0,.45])yellow.push([(a+b)/2,-176.5-dz,b-a,.15,0]);
 for(const [i,x] of STANDS.entries()){
  // Lead-in line: curves off the taxilane from both directions, then runs straight to the stop position.
  const r=28;
  for(const s of [-1,1])arc(yellow,x+s*r,TAXILANE_Z-r,r,Math.PI/2,s>0?Math.PI:0);
  yellow.push([x,(TAXILANE_Z-r+STOP_Z)/2,.45,(TAXILANE_Z-r)-STOP_Z,0]);
  // Stop bar (T-bar) for the nose wheel, with a shorter alternative stop for smaller types 12 m earlier.
  yellow.push([x,STOP_Z,8,.6,0],[x,STOP_Z+12,5,.45,0]);
  // Alignment bar across the stand entry and a lead-in arrow tip.
  white.push([x,STOP_Z-1.4,1,.45,0]);
  // Equipment restraint area: red box in front of the nose and bridge; nothing may stand inside on arrival.
  for(const dx of [-26,26])red.push([x+dx,-470,.4,62,0]);
  red.push([x,-439,52,.4,0]);
  // Wingtip clearance lines (red) and stand boundary (white dashed) halfway to the neighbour.
  for(const s of [-1,1]){
   const bx=x+s*115;
   if(i===0&&s<0||i===STANDS.length-1&&s>0||s>0)for(let z=-250;z>-500;z-=8)white.push([bx,z-2,.25,4,0]);
  }
  // Ground-equipment parking boxes beside the stand, near the service road.
  for(const s of [-1,1]){const gx=x+s*72;for(const [dx,dz,l,w] of [[0,-12,26,.25],[0,12,26,.25],[-13,0,.25,24],[13,0,.25,24]])white.push([gx+dx,-492+dz,l,w,0]);}
 }
 // Apron service road in front of the terminal: solid edges, dashed centre line and zebra crossings.
 for(const z of [-522,-548])white.push([-300,z,2180,.3,0]);
 for(let x=-1385;x<785;x+=8)white.push([x+2,-535,4,.25,0]);
 for(const x of STANDS)for(let k=0;k<6;k++)white.push([x+44+(k-2.5)*1.6,-535,.8,22,0]);
 // Hatched no-parking zones under the passenger bridges' drive wheels.
 for(const x of STANDS)for(let k=0;k<7;k++)red.push([x-12+k*1.6,-500,.35,12,.785]);
 // Yellow on light concrete gets a black border, as on real aprons, so the guidance reads from the flight deck.
 const black=yellow.map(([x,z,l,w,yaw])=>[x,z,l+.5,w+.5,yaw]);
 return {yellow,white,red,black};
}

function signTexture(text,fg,bg,border){
 const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d');
 x.fillStyle=bg;x.fillRect(0,0,512,256);if(border){x.strokeStyle=border;x.lineWidth=16;x.strokeRect(14,14,484,228);}
 x.fillStyle=fg;x.font='bold 176px "DIN Alternate","Arial Narrow",Arial,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,256,138);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;
}

const paint=(color,roughness=.62)=>new T.MeshStandardMaterial({color,roughness,metalness:0,envMapIntensity:.35,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
const PLANE=new T.PlaneGeometry(1,1);

// Pre-filter each paint rectangle in screen space. A subpixel feature is widened only for rasterization and
// its opacity is reduced in proportion to its original area; unlike opaque widening this preserves coverage.
// Both local axes matter: some layout rectangles encode their narrow dimension in X, others in Y.
export function configureMarkingAntialias(material,uniforms){
 // Custom blending preserves fractional coverage without moving paint to Three.js's transparent queue.
 // Ground layers, signs and foreground glass/rain depend on the original opaque-before-transparent order.
 material.transparent=false;material.depthWrite=false;material.blending=T.CustomBlending;
 material.blendEquation=T.AddEquation;material.blendSrc=T.SrcAlphaFactor;material.blendDst=T.OneMinusSrcAlphaFactor;
 material.blendEquationAlpha=T.AddEquation;material.blendSrcAlpha=T.OneFactor;material.blendDstAlpha=T.OneMinusSrcAlphaFactor;
 material.onBeforeCompile=shader=>{
  shader.uniforms.uMarkResolution=uniforms.resolution;
  shader.uniforms.uMarkMinPixels=uniforms.minPixels;
  const varyings='varying vec2 vMarkCoord;\nvarying vec2 vMarkHalfBounds;\nvarying float vMarkEnergy;';
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nuniform vec2 uMarkResolution;\nuniform float uMarkMinPixels;\n${varyings}`);
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
 vMarkCoord=position.xy;
 vMarkHalfBounds=vec2(0.5);
 vMarkEnergy=1.0;
#ifdef USE_INSTANCING
 // Differentiate the perspective divide at this vertex, instead of projecting a distant segment endpoint.
 // This keeps long runway lines stable even when their other end is behind the camera.
 if(gl_Position.w>0.001){
  vec4 markX=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(1.0,0.0,0.0,0.0);
  vec4 markY=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(0.0,1.0,0.0,0.0);
  float invW2=1.0/(gl_Position.w*gl_Position.w);
  vec2 px=(markX.xy*gl_Position.w-gl_Position.xy*markX.w)*invW2*uMarkResolution*0.5;
  vec2 py=(markY.xy*gl_Position.w-gl_Position.xy*markY.w)*invW2*uMarkResolution*0.5;
  float lx=length(px),ly=length(py);
  if(lx>0.0001&&ly>0.0001){
   vec2 nx=vec2(-py.y,py.x)/ly,ny=vec2(-px.y,px.x)/lx;
   nx*=dot(nx,px)<0.0?-1.0:1.0;ny*=dot(ny,py)<0.0?-1.0:1.0;
   vec2 width=abs(vec2(dot(px,nx),dot(py,ny)));
   vec2 target=max(width,vec2(uMarkMinPixels));
   const float feather=0.75;
   vec2 expand=0.5*(target-width)+feather;
   gl_Position.xy+=(nx*sign(position.x)*expand.x+ny*sign(position.y)*expand.y)*2.0/uMarkResolution*gl_Position.w;
   vMarkHalfBounds=0.5*target/(target+2.0*feather);
   vMarkEnergy=clamp(width.x/target.x,0.0,1.0)*clamp(width.y/target.y,0.0,1.0);
  }
 }
#endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${varyings}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 // fwidth integrates the rectangle edge across approximately one screen pixel, including short dash ends.
 vec2 markDerivative=max(fwidth(vMarkCoord),vec2(0.00001));
 vec2 markCoverage=clamp((vMarkHalfBounds-abs(vMarkCoord))/markDerivative+0.5,0.0,1.0);
 diffuseColor.a*=markCoverage.x*markCoverage.y*vMarkEnergy;`);
 };
 material.customProgramCacheKey=()=> 'airport-markings-analytic-coverage-v2';
 material.needsUpdate=true;
}
function instanced(scene,rects,material,y,order){
 const mesh=new T.InstancedMesh(PLANE,material,Math.max(1,rects.length)),o=new T.Object3D();
 rects.forEach(([x,z,l,w,yaw=0],i)=>{o.position.set(x,y,z);o.rotation.set(-Math.PI/2,0,yaw);o.scale.set(l,w,1);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);});
 mesh.count=rects.length;mesh.instanceMatrix.needsUpdate=true;mesh.renderOrder=order;mesh.receiveShadow=true;mesh.castShadow=false;mesh.frustumCulled=false;scene.add(mesh);return mesh;
}

export class AirportMarkings{
 constructor(scene,renderer){
  this.renderer=renderer;this.markUniforms={resolution:{value:renderer.getDrawingBufferSize(new T.Vector2())},minPixels:{value:1}};
  this.white=paint('#ecede6');this.yellow=paint('#e2b23a');this.red=paint('#b33a2e');this.black=paint('#1b1d1e',.8);
  this.materials=[this.white,this.yellow,this.red,this.black];this.materials.forEach(m=>configureMarkingAntialias(m,this.markUniforms));
  const rw=runwayMarkingLayout(),tw=taxiwayMarkingLayout(),ap=apronMarkingLayout();
  this.meshes=[
   // With depth writes disabled, draw runway paint after rubber and before higher taxiway paint.
   instanced(scene,rw.white,this.white,.074,81.5),instanced(scene,rw.yellow,this.yellow,.074,81.5),
   instanced(scene,tw.yellow,this.yellow,.08,86),
   instanced(scene,ap.white,this.white,.06,80),instanced(scene,ap.black,this.black,.061,80.5),instanced(scene,ap.yellow,this.yellow,.062,81),instanced(scene,ap.red,this.red,.064,82),
  ];
  // Painted signs read by a pilot taxiing toward the runway (+Z): mandatory "A | 09-27" on the taxiway before every holding position, and the location letter.
  const hold=new T.MeshStandardMaterial({map:signTexture('09-27','#ffffff','#c21f1f'),roughness:.66,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const loc=new T.MeshStandardMaterial({map:signTexture('A','#f2c230','#16191a','#f2c230'),roughness:.7,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  this.materials.push(hold,loc);
  const holdRects=[],locRects=[];
  for(const cx of CONNECTORS){for(const s of [-1,1])holdRects.push([cx+s*7.5,HOLD_Z-8,9,4.5,Math.PI]);locRects.push([cx-6,TAXI_Z+8,4.2,4.2,Math.PI]);}
  this.meshes.push(instanced(scene,holdRects,hold,.082,87),instanced(scene,locRects,loc,.083,88));
 }
 setResolution(){this.markUniforms.resolution.value.copy(this.renderer.getDrawingBufferSize(new T.Vector2()));}
}
