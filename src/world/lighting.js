// Time-of-day lighting in one table, plus the small colour maths needed to keep the sky horizon and the
// distance fog the same colour on screen in both render paths.
//
// With post-processing the scene is drawn to a linear float target and tone-mapped afterwards, so fog colour is
// tone-mapped too. Without it (low quality) three applies fog after tone mapping, so the fog colour is shown as
// written. `horizon` is therefore specified as the colour you want to SEE; inverseAces() recovers what the sky
// shader must output so that, once tone-mapped, it lands on that colour.

const srgbToLinear=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
export const hexToRgb=hex=>[(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255];

// Same curve as three's ACESFilmicToneMapping, so CPU-side colours match the shaders.
export function acesFilmic([r,g,b],exposure=1){
 const k=exposure/.6;r*=k;g*=k;b*=k;
 let x=.59719*r+.35458*g+.04823*b,y=.076*r+.90834*g+.01566*b,z=.0284*r+.13383*g+.83777*b;
 const fit=v=>(v*(v+.0245786)-.000090537)/(v*(.983729*v+.432951)+.238081);
 x=fit(x);y=fit(y);z=fit(z);
 const o=[1.60475*x-.53108*y-.07367*z,-.10208*x+1.10813*y-.00605*z,-.00327*x-.07276*y+1.07602*z];
 return o.map(v=>Math.min(1,Math.max(0,v)));
}

// Linear colour that acesFilmic() maps to the given display (sRGB) hex colour.
const inverseCache=new Map();
export function inverseAces(hex,exposure=1){
 const key=hex+'|'+exposure,hit=inverseCache.get(key);if(hit)return hit.slice();
 const target=hexToRgb(hex).map(srgbToLinear);
 let v=target.slice();
 for(let sweep=0;sweep<24;sweep++){
  for(let c=0;c<3;c++){
   let lo=0,hi=64;
   for(let i=0;i<32;i++){
    const mid=(lo+hi)/2,probe=v.slice();probe[c]=mid;
    if(acesFilmic(probe,exposure)[c]<target[c])lo=mid;else hi=mid;
   }
   v[c]=(lo+hi)/2;
  }
 }
 inverseCache.set(key,v);return v.slice();
}

export const LIGHTING=Object.freeze({
 day:Object.freeze({
  sun:3.2,sunColor:0xfff2d8,hemi:1.15,hemiSky:0xbddcff,hemiGround:0x72835f,env:1,exposure:.72,
  fill:.22,fillColor:0xf0eae0,fogDensity:.000075,sunHeight:360,
  horizon:0xa0c4e6,
  sky:{tint:[.44,.76,2.4],turbidity:1.5,rayleigh:1.2,mie:.005,mieG:.8,haze:.7,hazePower:3.4,glow:0xfff0d2,glowWide:.1,glowTight:.9,disc:0xfff6e4,discPower:110},
  cloud:{color:0xffffff,gain:3.2,opacity:.96,fog:false},
  bloom:{strength:.09,threshold:2.6,radius:.55},
  grade:{saturation:1.14,contrast:1.1,vignette:.2,tint:[1.045,1.015,.955]}
 }),
 dusk:Object.freeze({
  sun:2.6,sunColor:0xffa868,hemi:.75,hemiSky:0xffcfa8,hemiGround:0x6a5a56,env:.8,exposure:.95,
  fill:.34,fillColor:0x93a4d6,fogDensity:.0001,sunHeight:90,
  horizon:0xe8c09a,
  sky:{tint:[.72,.8,1.15],turbidity:6,rayleigh:2.2,mie:.012,mieG:.86,haze:.9,hazePower:2.6,glow:0xffb878,glowWide:.4,glowTight:1.3,disc:0xffd9a0,discPower:40},
  cloud:{color:0xffcaa4,gain:2.2,opacity:.85,fog:true},
  bloom:{strength:.16,threshold:.95,radius:.6},
  grade:{saturation:1.12,contrast:1.05,vignette:.24,tint:[1,.995,.975]}
 }),
 night:Object.freeze({
  sun:.35,sunColor:0x9db4ff,hemi:.45,hemiSky:0x6b86bf,hemiGround:0x1e2a3a,env:.55,exposure:1,
  fill:.18,fillColor:0x7f98d0,fogDensity:.00008,sunHeight:160,
  horizon:0x142339,
  sky:{tint:[1,1,1],turbidity:2.2,rayleigh:2.3,mie:.003,mieG:.82,haze:0,hazePower:2,glow:0x000000,glowWide:0,glowTight:0,disc:0x000000,discPower:0},
  cloud:{color:0x2c3a58,gain:1,opacity:.7,fog:true},
  bloom:{strength:.22,threshold:.8,radius:.65},
  grade:{saturation:1.04,contrast:1.04,vignette:.28,tint:[.97,.99,1.04]}
 })
});

export const lightingFor=mode=>LIGHTING[mode]||LIGHTING.day;

