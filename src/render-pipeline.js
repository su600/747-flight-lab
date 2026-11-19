import * as T from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {renderProfile,bloomFor,gradeFor,isTouchDevice} from './render-profile.js';

// Final look, applied in display space after tone mapping: a little contrast and saturation, a time-of-day tint
// and a soft vignette. Kept to one cheap full-screen pass.
const GradeShader={
 name:'FlightGrade',
 uniforms:{tDiffuse:{value:null},saturation:{value:1},contrast:{value:1},vignette:{value:0},tint:{value:new T.Vector3(1,1,1)}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:`uniform sampler2D tDiffuse;uniform float saturation,contrast,vignette;uniform vec3 tint;varying vec2 vUv;
 void main(){
  vec4 texel=texture2D(tDiffuse,vUv);vec3 c=texel.rgb;
  float luma=dot(c,vec3(.2126,.7152,.0722));
  c=mix(vec3(luma),c,saturation);
  c=(c-.5)*contrast+.5;
  c*=tint;
  vec2 d=vUv-.5;c*=1.-vignette*smoothstep(.35,.95,length(d*vec2(1.15,1.)))*1.2;
  gl_FragColor=vec4(clamp(c,0.,1.),texel.a);
 }`
};

// A single NaN or infinite pixel in the HDR buffer (a degenerate normal, a divide by zero in a model's material)
// would be smeared across the whole screen by the bloom blur and turn the frame black. Direct rendering only ever
// shows one odd pixel, so the bloom input is sanitised: bad pixels become black and brightness is capped (a hot specular glint on a dark part would otherwise glow across half the screen).
const SAMPLE='vec4 texel = texture2D( tDiffuse, vUv );';
const sanitizedHighPass=source=>source.replace(SAMPLE,`${SAMPLE}
			if ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0 );
			texel = min( texel, vec4( 6.0 ) );`);

// UnrealBloomPass sizes its mip chain from the composer size; this runs it at a fraction of that for speed.
class ScaledBloomPass extends UnrealBloomPass{
 constructor(scale,...args){
  super(...args);this.sizeScale=scale;
  const material=this.materialHighPassFilter;material.fragmentShader=sanitizedHighPass(material.fragmentShader);material.needsUpdate=true;
 }
 setSize(width,height){super.setSize(Math.max(1,Math.round(width*this.sizeScale)),Math.max(1,Math.round(height*this.sizeScale)));}
}

// Owns the post-processing chain: scene (MSAA, half-float) -> bloom -> tone map + sRGB -> grade. Anything that goes
// wrong falls back to plain direct rendering, which is also what low quality uses.
//
// EffectComposer draws the scene into its second target and swaps targets after every pass that sets needsSwap
// (output and grade here). An even number of swaps keeps the scene landing in that same, multisampled target every
// frame, so do not add or remove a swapping pass without keeping the count even.
export class RenderingPipeline{
 constructor(renderer,scene,camera,{low=false}={}){
  this.renderer=renderer;this.scene=scene;this.camera=camera;this.low=!!low;
  this.touch=isTouchDevice();
  const size=renderer.getSize(new T.Vector2());this.width=Math.max(1,size.x);this.height=Math.max(1,size.y);
  this.floatTargets=renderer.extensions.has('EXT_color_buffer_float')||renderer.extensions.has('EXT_color_buffer_half_float');
  this.time='day';this.composer=null;this.passes=[];this.bloom=null;this.grade=null;
  this.fallback=false;this.fallbackCount=0;this.renderFailures=0;
  this.profile=this.computeProfile();
  this.build();
 }
 computeProfile(){
  return renderProfile({low:this.low,width:this.width,height:this.height,devicePixelRatio:globalThis.devicePixelRatio||1,touch:this.touch,floatTargets:this.floatTargets});
 }
 targetSize(){return [Math.max(1,Math.floor(this.width*this.profile.pixelRatio)),Math.max(1,Math.floor(this.height*this.profile.pixelRatio))];}
 get active(){return !!this.composer&&!this.fallback;}
 build(){
  this.dispose();this.profile=this.computeProfile();
  if(!this.profile.post)return;
  try{
   const [w,h]=this.targetSize();
   const target=new T.WebGLRenderTarget(w,h,{type:T.HalfFloatType,depthBuffer:true,stencilBuffer:false});
   this.composer=new EffectComposer(this.renderer,target);
   this.composer.renderTarget2.samples=this.profile.samples;
   const add=pass=>{this.composer.addPass(pass);this.passes.push(pass);return pass;};
   add(new RenderPass(this.scene,this.camera));
   if(this.profile.bloom)this.bloom=add(new ScaledBloomPass(this.profile.bloomScale,new T.Vector2(w,h),.1,.55,1.2));
   add(new OutputPass());
   this.grade=add(new ShaderPass(GradeShader));
   this.fallback=false;
   this.setTime(this.time);this.resize(this.width,this.height);
  }catch(error){
   this.fallbackCount++;this.fallback=true;this.dispose();console.warn('Post-processing unavailable; using the direct renderer.',error);
  }
 }
 setQuality(low){this.low=!!low;this.build();}
 setTime(time){
  this.time=time;
  if(this.bloom)Object.assign(this.bloom,bloomFor(time,this.touch));
  if(this.grade){
   const g=gradeFor(time),u=this.grade.uniforms;
   u.saturation.value=g.saturation;u.contrast.value=g.contrast;u.vignette.value=g.vignette;u.tint.value.set(...g.tint);
  }
 }
 // After a lost WebGL context three recreates textures lazily, but targets sized for the old context are rebuilt to be safe.
 restore(){if(!this.low)this.build();}
 resize(width,height){
  this.width=Math.max(1,Math.round(width));this.height=Math.max(1,Math.round(height));
  this.profile=this.computeProfile();
  if(!this.composer)return;
  // Whole pixels, matching the canvas's own drawing-buffer size (a fractional target size is truncated by the GPU).
  const [w,h]=this.targetSize();
  this.composer.setPixelRatio(1);
  this.composer.setSize(w,h);
 }
 // Returns true when a complete frame reached the canvas.
 render(){
  if(!this.active){
   try{this.renderer.render(this.scene,this.camera);return true;}
   catch(error){this.renderFailures++;console.warn('A frame could not be drawn; keeping the last image.',error);return false;}
  }
  // The composer issues several render() calls per frame; keep renderer.info describing the whole frame.
  const info=this.renderer.info,autoReset=info.autoReset;info.autoReset=false;info.reset();
  try{this.composer.render();}
  catch(error){
   this.fallbackCount++;this.fallback=true;this.dispose();info.autoReset=autoReset;
   console.warn('Post-processing failed; continuing with the direct renderer.',error);
   try{this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);}
   catch(directError){this.renderFailures++;return false;}
   return true;
  }
  info.autoReset=autoReset;return true;
 }
 diagnostics(){return {...this.profile,time:this.time,floatTargets:this.floatTargets,active:this.active,bloom:!!this.bloom,grade:!!this.grade,samples:this.profile.samples,fallback:this.fallback,fallbacks:this.fallbackCount,renderFailures:this.renderFailures};}
 dispose(){
  for(const pass of this.passes)pass.dispose?.();
  this.passes.length=0;this.composer?.dispose();this.composer=null;this.bloom=null;this.grade=null;
 }
}
