const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

export function createVisualControls(state={}){
 return {
  gear:clamp(state.gear??1,0,1),
  flaps:Number(state.flaps)||0,
  spoiler:clamp(state.spoiler??0,0,1),
  reverse:clamp(state.reverse??0,0,1),
  door:clamp(state.door??0,0,1),
  lowerCargoDoor:clamp(state.lowerCargoDoor??state.door??0,0,1),
  mainCargoDoor:clamp(state.mainCargoDoor??state.door??0,0,1),
  engine:clamp(state.engine??0,0,1),
  aileron:clamp(state.aileron??0,-1,1),
  elevator:clamp(state.elevator??0,-1,1),
  rudder:clamp(state.rudder??0,-1,1),
  chute:clamp(state.chute??0,0,1),
 };
}

export function dampVisual(current,target,rate,dt){
 if(!(dt>0))return target;
 if(!Number.isFinite(rate)||rate<=0)return target;
 return current+(target-current)*(1-Math.exp(-rate*dt));
}

// These values are visual actuation rates only. They never write to simulator
// targets, positions, lift, drag or control interlocks.
export function updateVisualControls(visual,state,dt=0){
 const target=state||{},step=Math.max(0,Number.isFinite(dt)?dt:0);
 visual.gear=dampVisual(visual.gear,clamp(target.gear??1,0,1),2.4,step);
 visual.flaps=dampVisual(visual.flaps,Number(target.flaps)||0,2.8,step);
 visual.spoiler=dampVisual(visual.spoiler,clamp(target.spoiler??0,0,1),5.5,step);
 visual.reverse=dampVisual(visual.reverse,clamp(target.reverse??0,0,1),4.2,step);
 visual.door=dampVisual(visual.door,clamp(target.door??0,0,1),1.8,step);
 visual.lowerCargoDoor=dampVisual(visual.lowerCargoDoor,clamp(target.lowerCargoDoor??target.door??0,0,1),1.8,step);
 visual.mainCargoDoor=dampVisual(visual.mainCargoDoor,clamp(target.mainCargoDoor??target.door??0,0,1),1.8,step);
 visual.engine=dampVisual(visual.engine,clamp(target.engine??0,0,1),5.5,step);
 visual.aileron=dampVisual(visual.aileron,clamp(target.aileron??0,-1,1),14,step);
 visual.elevator=dampVisual(visual.elevator,clamp(target.elevator??0,-1,1),14,step);
 visual.rudder=dampVisual(visual.rudder,clamp(target.rudder??0,-1,1),14,step);
 visual.chute=dampVisual(visual.chute,clamp(target.chute??0,0,1),3.2,step);
 return visual;
}
