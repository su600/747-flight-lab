// Present complete frames, and keep the last good picture during browser/GPU interruptions.
export class StableDisplay {
 constructor(renderer,host){
  this.renderer=renderer;this.host=host;this.width=0;this.height=0;this.ratio=0;
  this.lowQuality=false;this.dirty=true;this.lost=false;this.suspended=false;this.hasBackup=false;
  this.stats={frames:0,resizes:0,contextLosses:0,restores:0,backupCaptures:0};
  this.backup=document.createElement('canvas');this.backup.className='last-frame';this.backup.hidden=true;this.backup.setAttribute('aria-hidden','true');host.appendChild(this.backup);
  this.copy=this.backup.getContext('2d',{alpha:false});
  this.observer=new ResizeObserver(()=>this.requestResize());this.observer.observe(host);
  renderer.domElement.addEventListener('webglcontextlost',event=>{
   this.captureBackup();event.preventDefault();this.lost=true;this.stats.contextLosses++;this.showBackup();this.onSuspend?.();
  });
  renderer.domElement.addEventListener('webglcontextrestored',()=>{
   this.lost=false;this.dirty=true;this.stats.restores++;
   // Three.js rebuilds its resources; the cover stays until our first complete render.
  });
  document.addEventListener('visibilitychange',()=>{
   this.suspended=document.hidden;
   if(this.suspended){this.captureBackup();this.showBackup();this.onSuspend?.();}else{this.requestResize();this.onResume?.();}
  });
 }
 requestResize(){this.dirty=true;}
 setQuality(low){this.lowQuality=low;this.requestResize();}
 captureBackup(){
  if(this.width<2||this.height<2||this.renderer.getContext().isContextLost())return;
  const width=Math.min(960,this.width),height=Math.max(1,Math.round(width*this.height/this.width));
  try{
   if(this.backup.width!==width||this.backup.height!==height){this.backup.width=width;this.backup.height=height;}
   this.copy.drawImage(this.renderer.domElement,0,0,width,height);this.hasBackup=true;this.stats.backupCaptures++;
  }catch{}
 }
 showBackup(){if(this.hasBackup)this.backup.hidden=false;}
 beginFrame(){
  if(this.lost||this.suspended||document.hidden)return false;
  const width=Math.floor(this.host.clientWidth),height=Math.floor(this.host.clientHeight);
  if(width<2||height<2)return false;
  const ratio=this.lowQuality?1:Math.min(devicePixelRatio||1,1.7);
  if(width!==this.width||height!==this.height||ratio!==this.ratio){
   if(this.width>1&&this.height>1)this.captureBackup();
   this.showBackup();
   // Unlike repeated setSize calls from resize events, this clears once, immediately before rendering.
   this.renderer.setDrawingBufferSize(width,height,ratio);
   this.width=width;this.height=height;this.ratio=ratio;this.stats.resizes++;
  }
  this.dirty=false;return true;
 }
 presented(now){
  this.stats.frames++;
  this.backup.hidden=true;
 }
 diagnostics(){return{...this.stats,lost:this.lost,width:this.width,height:this.height,pixelRatio:this.ratio,backupVisible:!this.backup.hidden,context:this.renderer.getContext().getContextAttributes()};}
}
