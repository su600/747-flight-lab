// Gentle "rest your eyes" reminder for young pilots. The scheduler is pure (it is fed elapsed seconds), so it can be
// tested without a browser; bindEyeRest() wires it to the banner in index.html.

export const EYE_REST_DEFAULTS=Object.freeze({intervalMin:10,restSec:10});

// ?eyerest=N sets the reminder interval in minutes; ?eyerest=0 turns it off. Anything else keeps the default.
export function eyeRestSettings(search=''){
 const match=/[?&]eyerest=([^&]+)/.exec(search),value=match?Number(decodeURIComponent(match[1])):NaN;
 if(!match||!Number.isFinite(value)||value<0)return {...EYE_REST_DEFAULTS,enabled:true};
 return {...EYE_REST_DEFAULTS,intervalMin:value,enabled:value>0};
}

export function createEyeRest({intervalSec=EYE_REST_DEFAULTS.intervalMin*60,restSec=EYE_REST_DEFAULTS.restSec}={}){
 let active=0,resting=false,left=0;
 return {
  // Advance by dt seconds of real time. Returns what the banner should show now.
  tick(dt){
   if(!(dt>0))return this.state();
   if(resting){left=Math.max(0,left-dt);if(left===0){resting=false;active=0;}}
   else{active+=dt;if(active>=intervalSec){resting=true;left=restSec;}}
   return this.state();
  },
  // "I'm resting" (or closed the banner): start counting the next interval from zero.
  dismiss(){resting=false;active=0;left=0;return this.state();},
  state(){return {resting,secondsLeft:Math.ceil(left),untilNext:resting?0:Math.max(0,Math.ceil(intervalSec-active))};}
 };
}

export function bindEyeRest({root,search=globalThis.location?.search||'',setTimer=setInterval,now=()=>performance.now(),visible=()=>!document.hidden}={}){
 const settings=eyeRestSettings(search);
 if(!root||!settings.enabled)return null;
 const text=root.querySelector('[data-eye-text]'),count=root.querySelector('[data-eye-count]'),close=root.querySelector('[data-eye-close]');
 const rest=createEyeRest({intervalSec:settings.intervalMin*60,restSec:settings.restSec});
 let last=now(),shown=false;
 const render=state=>{
  if(state.resting!==shown){shown=state.resting;root.hidden=!shown;root.classList.toggle('is-open',shown);}
  if(shown){count.textContent=String(state.secondsLeft);}
 };
 text.textContent='看看远处，让眼睛歇一歇';
 close.onclick=()=>render(rest.dismiss());
 const id=setTimer(()=>{
  const t=now(),dt=Math.min((t-last)/1000,5);last=t;
  // Time spent in a hidden tab is not screen time, so it does not count.
  if(visible())render(rest.tick(dt));
 },1000);
 return {rest,stop(){clearInterval(id);root.hidden=true;}};
}
