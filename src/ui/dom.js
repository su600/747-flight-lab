// DOM lookup and change-guarded text helpers shared by the HUD and menus.
const domCache=new Map();
export const $=s=>{let e=domCache.get(s);if(!e){e=document.querySelector(s);if(e)domCache.set(s,e);}return e;},all=s=>Array.from(document.querySelectorAll(s));
const lastText=new WeakMap();
export const setText=(el,v)=>{if(lastText.get(el)!==v){lastText.set(el,v);el.textContent=v;}};
export const setHTML=(el,v)=>{if(lastText.get(el)!==v){lastText.set(el,v);el.innerHTML=v;}};
