// Engine and airflow sound, tuned per airframe. Each profile follows its powerplant class:
// quad high-bypass turbofans (747-400 CF6, A380 Trent/GP7200), twin turbofans (A330 CF6,
// 777 GE90/Trent) and the unpowered orbiter, which has no engine hum, only airflow.
// audioTargets() is pure so the per-type differences can be tested without an AudioContext.

const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));

export const AUDIO_PROFILES={
 // core: low-frequency rumble (oscillator + lowpass); fan: blade-passage whine; roar: broadband jet noise.
 b747:{engines:4,core:{type:'sawtooth',hz:38,span:55,filter:260},fan:{hz:210,span:550,gain:.015},roar:{hz:900,gain:.05},wind:.7},
 a380:{engines:4,core:{type:'triangle',hz:30,span:42,filter:190},fan:{hz:170,span:430,gain:.011},roar:{hz:650,gain:.032},wind:.8},
 a330:{engines:2,core:{type:'sawtooth',hz:44,span:58,filter:300},fan:{hz:240,span:600,gain:.017},roar:{hz:1100,gain:.045},wind:.7},
 b777:{engines:2,core:{type:'triangle',hz:34,span:50,filter:210},fan:{hz:180,span:460,gain:.013},roar:{hz:800,gain:.04},wind:.75},
 // The orbiter glides: no engines, so only the air rushing past it.
 shuttle:{engines:0,core:null,fan:null,roar:null,wind:1.15}
};

// Level and pitch targets for the current airframe and flight state.
export function audioTargets(type,sim){
 const p=AUDIO_PROFILES[type]||AUDIO_PROFILES.b747;
 const n1=clamp(sim.engine??0,0,1);
 // Twin engines are quieter overall than four: scale by the square root of the engine count.
 const powered=p.engines>0?Math.sqrt(p.engines/4):0;
 const airspeed=clamp((sim.speed??0)/120,0,1);
 const wind=Math.pow(airspeed,1.5)*p.wind*.06;
 if(!p.core)return{core:{gain:0,hz:0,filter:0,type:'sine'},fan:{gain:0,hz:0},roar:{gain:0,hz:0},wind:{gain:wind,hz:500+900*airspeed}};
 return{
  core:{gain:(.025+n1*.08)*powered,hz:p.core.hz+n1*(p.core.span),filter:p.core.filter,type:p.core.type},
  fan:{gain:p.fan.gain*n1*powered,hz:p.fan.hz+n1*p.fan.span},
  roar:{gain:p.roar.gain*n1*powered,hz:p.roar.hz},
  wind:{gain:wind,hz:500+900*airspeed}
 };
}

// Web Audio graph shared by every airframe; the profile switches with the aircraft.
export class EngineSound{
 constructor(ctx){
  this.ctx=ctx;this.type='b747';
  this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
  this.core=ctx.createOscillator();this.coreFilter=ctx.createBiquadFilter();this.coreFilter.type='lowpass';
  this.coreGain=ctx.createGain();this.coreGain.gain.value=0;
  this.core.connect(this.coreFilter);this.coreFilter.connect(this.coreGain);this.coreGain.connect(this.master);this.core.start();
  this.fan=ctx.createOscillator();this.fan.type='sine';this.fanGain=ctx.createGain();this.fanGain.gain.value=0;
  this.fan.connect(this.fanGain);this.fanGain.connect(this.master);this.fan.start();
  // One looped noise buffer feeds both the jet roar and the airflow.
  const noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=noise.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  this.noise=ctx.createBufferSource();this.noise.buffer=noise;this.noise.loop=true;
  this.roarFilter=ctx.createBiquadFilter();this.roarFilter.type='bandpass';this.roarFilter.Q.value=.8;
  this.roarGain=ctx.createGain();this.roarGain.gain.value=0;
  this.windFilter=ctx.createBiquadFilter();this.windFilter.type='bandpass';this.windFilter.Q.value=.6;
  this.windGain=ctx.createGain();this.windGain.gain.value=0;
  this.noise.connect(this.roarFilter);this.roarFilter.connect(this.roarGain);this.roarGain.connect(this.master);
  this.noise.connect(this.windFilter);this.windFilter.connect(this.windGain);this.windGain.connect(this.master);
  this.noise.start();
 }
 setAircraft(type){this.type=AUDIO_PROFILES[type]?type:'b747';}
 // Called once per frame; levels glide so switching aircraft or throttle never clicks.
 update(sim,enabled,paused){
  const t=this.ctx.currentTime,targets=audioTargets(this.type,sim);
  this.master.gain.setTargetAtTime(enabled&&!paused?.9:0,t,.15);
  this.core.type=targets.core.type||'sine';
  this.core.frequency.setTargetAtTime(targets.core.hz,t,.2);
  this.coreFilter.frequency.setTargetAtTime(targets.core.filter||120,t,.2);
  this.coreGain.gain.setTargetAtTime(targets.core.gain,t,.15);
  this.fan.frequency.setTargetAtTime(targets.fan.hz,t,.3);
  this.fanGain.gain.setTargetAtTime(targets.fan.gain,t,.3);
  const roar=AUDIO_PROFILES[this.type].roar;
  this.roarFilter.frequency.setTargetAtTime(roar?roar.hz:800,t,.3);
  this.roarGain.gain.setTargetAtTime(roar?targets.roar.gain:0,t,.2);
  this.windFilter.frequency.setTargetAtTime(targets.wind.hz,t,.2);
  this.windGain.gain.setTargetAtTime(targets.wind.gain,t,.2);
 }
}
