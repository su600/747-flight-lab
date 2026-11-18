// DOM lookup and change-guarded text helpers shared by the HUD and menus.
const domCache=new Map();
export const $=s=>{let e=domCache.get(s);if(!e){e=document.querySelector(s);if(e)domCache.set(s,e);}return e;},all=s=>Array.from(document.querySelectorAll(s));
const lastText=new WeakMap();
export const setText=(el,v)=>{if(lastText.get(el)!==v){lastText.set(el,v);el.textContent=v;}};
export const setHTML=(el,v)=>{if(lastText.get(el)!==v){lastText.set(el,v);el.innerHTML=v;}};
const numberMotion=new WeakMap();
export function setAnimatedText(el,v,interval=180){
 const value=String(v);
 if(lastText.get(el)===value)return false;
 const state=numberMotion.get(el)||{lastAt:-Infinity,lastValue:null,animation:null};
 const previous=Number(state.lastValue),next=Number(value.replace(/[^\d.-]/g,''));
 lastText.set(el,value);el.textContent=value;
 const motion=document.body?.dataset.motion||'full',now=performance.now();
 if(motion==='full'&&typeof el.animate==='function'&&now-state.lastAt>=interval){
  state.animation?.cancel?.();
  const offset=Number.isFinite(previous)&&Number.isFinite(next)&&previous>next?-2:2;
  state.animation=el.animate(
   [{opacity:.62,transform:`translate3d(0,${offset}px,0)`},{opacity:1,transform:'translate3d(0,0,0)'}],
   {duration:150,easing:'cubic-bezier(.2,.8,.2,1)'}
  );
  state.lastAt=now;
 }
 state.lastValue=value;numberMotion.set(el,state);return true;
}
