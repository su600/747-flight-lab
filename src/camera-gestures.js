// Canvas-only gestures: they never consume pointers that started on flight controls.
// onZoom receives a distance/FOV multiplier: <1 zooms in, >1 zooms out.
export function createCameraGestures(canvas,{onStart=()=>{},onRotate,onPan,onZoom}){
 const touches=new Map();let mouse=null;
 const point=e=>({x:e.clientX,y:e.clientY});
 const capture=id=>{try{canvas.setPointerCapture(id);}catch{}};
 const release=id=>{try{if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}catch{}};
 const cancel=()=>{
  const ids=[...touches.keys(),...(mouse?[mouse.id]:[])];touches.clear();mouse=null;
  ids.forEach(release);
 };
 const pointerDown=e=>{
  if(e.pointerType==='touch'){
   if(mouse||touches.size>=2||touches.has(e.pointerId))return;
   if(touches.size===0)onStart('rotate');
   touches.set(e.pointerId,point(e));capture(e.pointerId);e.preventDefault();return;
  }
  if(mouse||touches.size||![0,1,2].includes(e.button))return;
  const kind=e.button===0?'rotate':'pan';onStart(kind);
  mouse={id:e.pointerId,kind,...point(e)};capture(e.pointerId);e.preventDefault();
 };
 const pointerMove=e=>{
  if(touches.has(e.pointerId)){
   const before=[...touches.values()],old=touches.get(e.pointerId),next=point(e);
   touches.set(e.pointerId,next);
   if(before.length===1)onRotate(next.x-old.x,next.y-old.y);
   else{
    const after=[...touches.values()];
    const distance=pts=>Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
    const d0=distance(before),d1=distance(after);
    if(d0>2&&d1>2)onZoom(Math.max(.2,Math.min(5,d0/d1)));
    onPan((after[0].x+after[1].x-before[0].x-before[1].x)/2,
          (after[0].y+after[1].y-before[0].y-before[1].y)/2);
   }
   e.preventDefault();return;
  }
  if(mouse?.id!==e.pointerId)return;
  const next=point(e),dx=next.x-mouse.x,dy=next.y-mouse.y;
  mouse.x=next.x;mouse.y=next.y;
  if(mouse.kind==='pan')onPan(dx,dy);else onRotate(dx,dy);
  e.preventDefault();
 };
 const pointerEnd=e=>{
  if(touches.has(e.pointerId)){touches.delete(e.pointerId);release(e.pointerId);}
  if(mouse?.id===e.pointerId){mouse=null;release(e.pointerId);}
 };
 const wheel=e=>{
  e.preventDefault();onStart('zoom');
  const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight||800:1);
  onZoom(Math.exp(Math.max(-600,Math.min(600,pixels))*.001));
 };
 const contextMenu=e=>e.preventDefault();
 canvas.addEventListener('pointerdown',pointerDown);
 canvas.addEventListener('pointermove',pointerMove);
 canvas.addEventListener('pointerup',pointerEnd);
 canvas.addEventListener('pointercancel',pointerEnd);
 canvas.addEventListener('lostpointercapture',pointerEnd);
 canvas.addEventListener('wheel',wheel,{passive:false});
 canvas.addEventListener('contextmenu',contextMenu);
 return {cancel,dispose(){cancel();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerEnd);canvas.removeEventListener('pointercancel',pointerEnd);canvas.removeEventListener('lostpointercapture',pointerEnd);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('contextmenu',contextMenu);}};
}
