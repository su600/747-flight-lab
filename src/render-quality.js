export const LIGHTING_PRESETS=Object.freeze({
 day:Object.freeze({sun:2.65,fill:.28,hemi:1.15,environment:1,exposure:.8,fog:0x8fb8ca,fogDensity:.00007}),
 dusk:Object.freeze({sun:2.15,fill:.38,hemi:.82,environment:.82,exposure:.95,fog:0xd9ad91,fogDensity:.0001}),
 night:Object.freeze({sun:.28,fill:.58,hemi:.7,environment:.62,exposure:1.05,fog:0x14243a,fogDensity:.000055}),
});

export function isIPadLike({platform='',userAgent='',maxTouchPoints=0}={}){
 const touchDevice=maxTouchPoints>1;
 return touchDevice&&(/iPad/i.test(userAgent)||/MacIntel/i.test(platform)||(!/iPhone/i.test(userAgent)&&/Mac/i.test(platform)));
}

export function effectQualityProfile({low=false,tablet=false,reducedMotion=false}={}){
 const level=low?'low':tablet?'tablet':'desktop';
 return Object.freeze(level==='desktop'
  ?{level,vortex:520,exhaust:260,contrail:700,smoke:1100,streaks:reducedMotion?0:150,rainLines:1400,windshieldDrops:200,emission:reducedMotion?.65:1,touchdownPuffs:24}
  :level==='tablet'
   ?{level,vortex:260,exhaust:130,contrail:280,smoke:520,streaks:reducedMotion?0:70,rainLines:700,windshieldDrops:100,emission:reducedMotion?.4:.62,touchdownPuffs:14}
   :{level,vortex:120,exhaust:55,contrail:110,smoke:240,streaks:reducedMotion?0:24,rainLines:360,windshieldDrops:55,emission:reducedMotion?.22:.32,touchdownPuffs:8});
}

export function renderingProfile({low=false,width=1280,height=720,devicePixelRatio=1,tablet=false,floatTargets=true}={}){
 const cap=tablet?1.25:1.5;
 const pixelBudget=tablet?3_700_000:8_300_000;
 const requested=Math.max(.5,Number(devicePixelRatio)||1);
 const area=Math.max(1,(Number(width)||1)*(Number(height)||1));
 const pixelRatio=low?1:Math.max(.5,Math.min(requested,cap,Math.sqrt(pixelBudget/area)));
 return {
  low:!!low,
  tablet:!!tablet,
  pixelRatio,
  postprocess:!low,
  bloom:!low&&!!floatTargets,
  antialias:!low,
  shadowMapSize:low?0:tablet?1024:2048,
  effects:effectQualityProfile({low,tablet}),
 };
}

export function bloomProfile(time='day',tablet=false){
 if(time==='night')return tablet?{strength:.12,threshold:.64}:{strength:.15,threshold:.62};
 if(time==='dusk')return tablet?{strength:.09,threshold:.8}:{strength:.11,threshold:.76};
 return tablet?{strength:.055,threshold:1.15}:{strength:.075,threshold:1.05};
}
