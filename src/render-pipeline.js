import * as T from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {bloomProfile,isIPadLike,renderingProfile} from './render-quality.js';

class ScaledBloomPass extends UnrealBloomPass{
 constructor(scale,...args){super(...args);this.scale=scale;}
 setSize(width,height){super.setSize(Math.max(1,Math.round(width*this.scale)),Math.max(1,Math.round(height*this.scale)));}
}

export class RenderingPipeline{
 constructor(renderer,scene,camera,{low=false}={}){
  this.renderer=renderer;this.scene=scene;this.camera=camera;this.low=!!low;
  const size=renderer.getSize(new T.Vector2());
  this.width=size.x;this.height=size.y;
  this.tablet=isIPadLike(globalThis.navigator||{});
  this.floatTargets=renderer.extensions.has('EXT_color_buffer_float');
  this.time='day';this.composer=null;this.passes=[];this.fallbackCount=0;this.renderFailures=0;this.fallback=false;
  this.rebuild();
 }
 rebuild(){
  this.dispose();
  this.profile=renderingProfile({low:this.low,width:this.width,height:this.height,devicePixelRatio:globalThis.devicePixelRatio||1,tablet:this.tablet,floatTargets:this.floatTargets});
  if(!this.profile.postprocess)return;
  try{
   const size=Number.isFinite(this.width)&&Number.isFinite(this.height)?[Math.max(1,this.width),Math.max(1,this.height)]:[1,1];
   const target=new T.WebGLRenderTarget(size[0],size[1],{
    type:this.floatTargets?T.HalfFloatType:T.UnsignedByteType,
    depthBuffer:true,
    stencilBuffer:false,
   });
   this.composer=new EffectComposer(this.renderer,target);
   const render=new RenderPass(this.scene,this.camera);
   this.composer.addPass(render);this.passes.push(render);
   if(this.profile.bloom){
    this.bloom=new ScaledBloomPass(this.tablet?.5:.72,new T.Vector2(size[0],size[1]),.075,.2,1.05);
    this.composer.addPass(this.bloom);this.passes.push(this.bloom);this.setTime(this.time);
   }
   const output=new OutputPass();this.composer.addPass(output);this.passes.push(output);
   this.fxaa=new ShaderPass(FXAAShader);this.composer.addPass(this.fxaa);this.passes.push(this.fxaa);
   this.resize(this.width,this.height);
   this.fallback=false;
  }catch(error){
   this.fallbackCount++;this.fallback=true;this.dispose();console.warn('Postprocessing unavailable; using the direct renderer.',error);
  }
 }
 setQuality(low){
  this.low=!!low;
  this.rebuild();
 }
 setTime(time){
  this.time=time;
  if(!this.bloom)return;
  Object.assign(this.bloom,bloomProfile(time,this.tablet));
 }
 restore(){if(!this.low)this.rebuild();}
 resize(width,height){
  this.width=Math.max(1,Math.round(width));this.height=Math.max(1,Math.round(height));
  this.profile=renderingProfile({low:this.low,width:this.width,height:this.height,devicePixelRatio:globalThis.devicePixelRatio||1,tablet:this.tablet,floatTargets:this.floatTargets});
  if(!this.composer)return;
  this.composer.setPixelRatio(this.profile.pixelRatio);
  this.composer.setSize(this.width,this.height);
  const px=this.width*this.profile.pixelRatio,py=this.height*this.profile.pixelRatio;
  this.fxaa.uniforms.resolution.value.set(1/Math.max(1,px),1/Math.max(1,py));
 }
 render(){
  if(!this.composer||this.fallback){
   try{this.renderer.render(this.scene,this.camera);return true;}
   catch(error){this.renderFailures++;console.warn('A frame could not be presented; keeping the last image.',error);return false;}
  }
  const autoReset=this.renderer.info.autoReset;
  this.renderer.info.autoReset=false;this.renderer.info.reset();
  try{this.composer.render();}
  catch(error){
   this.fallbackCount++;this.fallback=true;this.dispose();
   this.renderer.info.autoReset=autoReset;
   try{this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);}
   catch(directError){this.renderFailures++;console.warn('A recovery frame could not be presented; keeping the last image.',directError);return false;}
   console.warn('Postprocessing failed; continuing with direct rendering.',error);
  }
  this.renderer.info.autoReset=autoReset;
  return true;
 }
 diagnostics(){
  return {...this.profile,time:this.time,floatTargets:this.floatTargets,bloomEnabled:!!this.composer&&!!this.bloom,fallback:this.fallback,fallbacks:this.fallbackCount,renderFailures:this.renderFailures};
 }
 dispose(){
  for(const pass of this.passes)pass.dispose?.();
  this.passes.length=0;
  this.composer?.dispose();this.composer=null;this.bloom=null;this.fxaa=null;
 }
}
