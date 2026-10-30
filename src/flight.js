// Flight Lab flight model.
//
// This is a deliberately simplified but physically consistent point-mass model:
//   * ISA atmosphere, true airspeed, Mach and dynamic pressure are derived from altitude.
//   * Lift follows a CL(alpha) curve with a flap-dependent CLmax and a post-stall break.
//   * Drag combines parasite, induced (Oswald), flap/gear/spoiler and compressibility drag.
//   * Engine thrust depends on N1, air density and Mach, with realistic spool-up lag.
//   * The body rotates from aerodynamic pitching/rolling moments (inertia, static
//     stability, pitch/roll damping and elevator/aileron authority), not directly from
//     the joystick, so releasing the controls behaves like a trimmed aircraft.
//   * Ground motion uses wheel reactions: rolling resistance, carbon brakes, reverse
//     thrust, nose-wheel steering and a rotation model that only works above Vr.
//
// Everything is tuned to be readable for young pilots; it is an educational
// approximation, not a trainer-level aerodynamic database.

export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const approach=(a,b,rate,dt)=>a+clamp(b-a,-rate*dt,rate*dt);
const D2R=Math.PI/180,R2D=180/Math.PI;
const KNOT=.514444;

export const RUNWAY={start:-1900,end:1900,width:60,touch:-1550};
export const FLAP_DETENTS=[0,5,10,20,25,30];
export const THRUST_DETENTS=[
 {id:'idle',label:'慢车',en:'IDLE',value:0},
 {id:'cruise',label:'巡航',en:'CRZ',value:.66},
 {id:'climb',label:'爬升',en:'CLB',value:.84},
 {id:'takeoff',label:'起飞',en:'TO',value:1}
];

export const AIRCRAFT={
 mass:330000,
 landingMass:300000,
 wingArea:525,
 wingSpan:64.4,
 chord:8.6,
 engines:4,
 engineThrust:252000,       // N per engine, CF6-80C2B1F class
 gravity:9.80665,
 rho0:1.225,
 liftSlope:5.0,             // CL per rad, whole aircraft
 cleanLiftAtZero:.22,
 flapLiftGain:1.05,
 cleanMaxLift:1.58,
 flapMaxLiftGain:.98,
 cleanStallAngle:15.5,      // deg
 flapStallAngleGain:1.5,    // deg at full flaps
 oswald:.78,
 cd0:.019,
 gearDrag:.016,
 spoilerDrag:.10,
 cmAlpha:-1.4,              // static pitch stability, per rad
 cmElevator:.65,            // elevator power, per rad deflection
 cmPitchRate:-40,           // pitch damping
 clAileron:.042,            // roll power
 clRollRate:-.45,           // roll damping
 pitchInertia:6.5e7,
 rollInertia:1.9e7,
 brakeMu:.35,
 rollingMu:.018,
 reverseFactor:.45,
 noseGearShare:.035,
 noseGearArm:20,
 wheelbase:22,
 vmo:188,                   // m/s, ~365 kt
 mmo:.92,
 maxAltitude:12500
};

const M=AIRCRAFT.mass,S=AIRCRAFT.wingArea,G=AIRCRAFT.gravity,W=M*G;
const RHO0=AIRCRAFT.rho0;
const AR=AIRCRAFT.wingSpan*AIRCRAFT.wingSpan/S;
const INDUCED=1/(Math.PI*AR*AIRCRAFT.oswald);
const FLAP_DRAG=[0,.006,.013,.030,.045,.062];

export function atmosphere(altitude){
 const h=clamp(altitude,-500,20000);
 const hTrop=Math.min(h,11000);
 const temperature=288.15-.0065*hTrop;
 const pressure=101325*Math.pow(temperature/288.15,G/(287.053*.0065));
 return pressure/(287.053*temperature);
}
export function temperature(altitude){
 return 288.15-.0065*Math.min(clamp(altitude,-500,20000),11000);
}
export function speedOfSound(altitude){return Math.sqrt(1.4*287.053*temperature(altitude));}
function flapDrag(flaps){
 const idx=clamp(flaps/5,0,5),i=Math.floor(idx),f=idx-i;
 return mix(FLAP_DRAG[i],FLAP_DRAG[Math.min(5,i+1)],f);
}

export class Flight{
 constructor(){this.assist=true;this.reset('inspect');}
 reset(mode='inspect'){
  this.mode=mode;
  this.mass=mode==='land'?AIRCRAFT.landingMass:AIRCRAFT.mass;
  this.weight=this.mass*G;
  this.phase=mode==='inspect'?'认识你的 747':mode==='takeoff'?'起飞前检查':mode==='land'?'对准跑道，开始进近':'你来当机长';
  this.x=mode==='inspect'?-850:mode==='land'?-5300:-1730;
  this.z=mode==='inspect'?-300:0;
  this.altitude=mode==='land'?(RUNWAY.touch-this.x)*Math.tan(3*D2R):mode==='free'?700:0;
  this.heading=90;
  this.bank=0;this.rollRate=0;
  this.gamma=mode==='land'?-3*D2R:0;
  this.speed=mode==='land'?78:mode==='free'?125:0;
  this.pitch=mode==='free'||mode==='land'?0:0;
  this.pitchRate=0;
  this.throttle=0;this.engineN1=.22;this.engine=this.engineN1;
  this.gear=mode==='free'?0:1;this.gearTarget=this.gear;
  this.flaps=mode==='land'?20:0;this.flapTarget=mode==='land'?30:0;
  this.spoiler=0;this.spoilerTarget=0;this.reverse=0;this.reverseTarget=0;
  this.door=0;this.doorTarget=0;
  this.onGround=!['free','land'].includes(mode);
  this.park=mode==='inspect';this.brake=0;this.landingBrake=0;this.brakePressure=0;
  this.aileron=0;this.elevator=0;this.rudder=0;this.trim=0;
  this.elevatorCmd=0;this.rollCmd=0;
  this.lights=true;this.wipers=false;this.paused=false;this.failed=false;this.message='';
  this.touchdown=null;this.complete=false;this.stalled=false;
  this.stallWarning=false;this.overspeed=false;this.buffet=false;this.tailStrike=false;this.gearOverspeed=false;
  this.alpha=0;this.alphaTrim=0;this.lift=0;this.drag=0;this.thrust=0;this.reverseThrust=0;
  this.loadFactor=1;this.normalForce=this.weight;this.cl=0;this.cd=0;this.qbar=0;this.mach=0;
  this.calls={};this.events=[];this.time=0;
  this.onRunway=Math.abs(this.z)<RUNWAY.width/2&&this.x>RUNWAY.start&&this.x<RUNWAY.end;
  this.updateAirData();
  if(!this.onGround){
   this.alphaTrim=this.trimAlpha()*R2D;
   this.pitch=this.gamma*R2D+this.alphaTrim;
   this.throttle=this.trimThrottle(this.gamma);
   this.engineN1=.22+.78*this.throttle;this.engine=this.engineN1;
   this.elevatorCmd=0;
  }
  this.calculateAero();
 }
 say(text){this.events.push(text);}
 control(name,value){
  if(['throttle','pitch','roll','yaw'].includes(name)&&['takeoff','land'].includes(this.mode)){this.mode='manual';this.complete=false;}
  if(name==='gear'){
   if(this.onGround&&this.mode!=='inspect')return '地面滑行时要放下起落架';
   if(value===0&&this.speed>270*KNOT)return '速度超过 270 节，请先减速';
   this.gearTarget=value;
  }
  if(name==='flaps'){
   const maxKts=value<=1?280:value<=5?260:value<=10?240:value<=20?230:value<=25?205:180;
   if(value>this.flapTarget&&this.speed>maxKts*KNOT)return `当前襟翼档位速度限制约 ${Math.round(maxKts)} 节，请减速`;
   this.flapTarget=value;
  }
  if(name==='door'){if(!this.onGround||this.speed>1)return '请停稳飞机后再开货舱门';this.doorTarget=value;}
  if(name==='reverse'){
   if(!this.onGround)return '落地后才能使用反推';
   if(this.speed>170*KNOT)return '速度太高，先接地后再开反推';
   this.reverseTarget=value;
  }
  if(name==='spoiler'){if(!this.onGround&&value&&this.speed>230*KNOT)return '高速飞行时不能完全打开扰流板';this.spoilerTarget=value;}
  if(name==='throttle'){
   if(this.door>.02)return '请先关闭货舱门';
   this.throttle=clamp(value,0,1);
   if(this.mode==='inspect'){this.mode='manual';this.phase='滑行准备';this.gearTarget=1;}
  }
  if(name==='park'){
   if(!this.onGround)return '停留刹车请在地面使用';
   if(value&&this.speed>3)return '请先按住轮刹减速，停稳后再拉停留刹车';
   this.park=!!value;
   if(!value&&this.mode==='inspect'){this.mode='manual';this.gearTarget=1;}
  }
  return '';
 }
 step(dt,input={}){
  if(this.paused||this.failed||dt<=0)return;
  dt=Math.min(dt,.1);
  this.time+=dt;
  const guided=this.mode==='takeoff'||this.mode==='land';
  const pilot={
   pitch:clamp(input.pitch||0,-1,1),
   roll:clamp(input.roll||0,-1,1),
   yaw:clamp(input.yaw||0,-1,1),
   brake:clamp(input.brake||0,0,1)
  };
  if(this.mode==='takeoff')this.takeoffGuidance();
  else if(this.mode==='land')this.landingGuidance();
  this.updateSystems(dt);
  this.updateControlInput(dt,pilot,guided);
  const aero=this.calculateAero();
  if(this.mode==='inspect'){this.updateAirData();return;}
  if(this.onGround)this.integrateGround(dt,pilot,aero);
  else this.integrateAirborne(dt,pilot,aero);
  this.updateAirData();
  this.updateWarnings();
  this.updatePhase();
 }
 updateSystems(dt){
  const n1Target=.22+.78*this.throttle;
  // Big turbofans spool up slower than they spool down.
  const tau=n1Target>this.engineN1?2.4:1.7;
  this.engineN1+=(n1Target-this.engineN1)*(1-Math.exp(-dt/tau));
  this.engine=this.engineN1;
  this.gear=approach(this.gear,this.gearTarget,1/7,dt);
  this.flaps=approach(this.flaps,this.flapTarget,2.3,dt);
  this.spoiler=approach(this.spoiler,this.spoilerTarget,1.4,dt);
  this.reverse=approach(this.reverse,this.reverseTarget,.45,dt);
  this.door=approach(this.door,this.doorTarget,.22,dt);
 }
 updateControlInput(dt,pilot,guided){
  if(guided){
   const target=this.mode==='takeoff'?this.takeoffPitchTarget():this.landingPitchTarget();
   this.autopilotTarget=target;
   this.elevatorCmd=this.autoElevator(target);
   this.rollCmd=clamp(-this.bank*.06,-.5,.5);
  }else{
   let command=pilot.pitch,roll=pilot.roll;
   if(this.assist){
    // Artificial stability: return the wings to level when the pilot lets go.
    if(Math.abs(roll)<.04)roll=clamp(-this.bank*.045,-.55,.55);
    // Gentle pitch damping so a light tap does not start a bobbing motion.
    if(Math.abs(command)<.04&&!this.onGround)command=clamp(-this.pitchRate*.045,-.35,.35);
   }
   this.elevatorCmd=command;this.rollCmd=roll;
   // Kid-friendly envelope protection: headline alpha and pitch are limited so a
   // held key cannot flip the aircraft into an unrecoverable attitude.
   if(this.assist&&!this.onGround){
    // Soft angle-of-attack protection: near the stall the elevator push grows
    // smoothly, so the warning appears but the aircraft stays recoverable.
    this.elevatorCmd=clamp(this.elevatorCmd-.28*Math.max(0,this.alpha-(this.stallAngle-7)),-1,1);
   }
  }
  this.elevator=-this.elevatorCmd;this.aileron=this.rollCmd;
  this.rudder=guided?0:pilot.yaw;
 }
 // Simple flight-director style autopilot used by the demonstration flights: it
 // commands a pitch rate toward the desired attitude, then converts that into an
 // elevator deflection like a pilot would.
 autoElevator(targetPitch){
  if(this.onGround){
   // On the runway the pitch rate is commanded directly by the elevator, so only
   // position feedback is used (a rate loop would fight itself).
   const error=targetPitch-this.pitch;
   const desiredRate=clamp(error*1.6,-8,8);
   const authority=clamp(Math.pow(this.speed/74,2),0,1.5);
   return clamp((desiredRate+this.pitch*.9)/Math.max(1.2,13*authority),-1,1);
  }
  const error=targetPitch-this.pitch;
  const rateCommand=clamp(error*.75,-7,7);
  const rateError=rateCommand-this.pitchRate;
  return clamp(rateError*.32,-1,1);
 }
 atmosphere(){return atmosphere(this.altitude);}
 gust(){return 0;}
 calculateAero(){
  const rho=this.atmosphere(),v=Math.max(0,this.speed);
  const qbar=.5*rho*v*v;
  const flapFrac=clamp(this.flaps/30,0,1);
  const alpha=(this.pitch*D2R)-this.gamma;
  const stallAngle=(AIRCRAFT.cleanStallAngle+AIRCRAFT.flapStallAngleGain*flapFrac)*D2R;
  const cl0=AIRCRAFT.cleanLiftAtZero+AIRCRAFT.flapLiftGain*flapFrac;
  const clMax=AIRCRAFT.cleanMaxLift+AIRCRAFT.flapMaxLiftGain*flapFrac;
  const clLinear=cl0+AIRCRAFT.liftSlope*alpha;
  let cl;
  if(alpha<=stallAngle)cl=Math.min(clLinear,clMax);
  else cl=Math.max(clMax*.62,clMax-2.4*(alpha-stallAngle));
  cl*=1-.55*this.spoiler;
  const groundEffect=Math.exp(-Math.max(0,this.altitude)/(AIRCRAFT.wingSpan*.35));
  const induced=INDUCED*cl*cl*(1-.55*groundEffect);
  const mach=v/speedOfSound(this.altitude);
  const wave=mach>.82?.045*Math.pow((mach-.82)/.1,2):0;
  const stallDrag=alpha>stallAngle?1.4*(alpha-stallAngle):0;
  const cd=AIRCRAFT.cd0+induced+flapDrag(this.flaps)+AIRCRAFT.gearDrag*this.gear
   +AIRCRAFT.spoilerDrag*this.spoiler+wave+stallDrag;
  const n1=clamp((this.engineN1-.22)/.78,0,1);
  const sigma=rho/RHO0;
  const lapse=Math.pow(sigma,.82)*Math.max(.1,1-.28*mach-.10*mach*mach);
  const thrust=AIRCRAFT.engines*AIRCRAFT.engineThrust*(.045+.955*Math.pow(n1,1.3))*lapse;
  const lift=qbar*S*cl;
  const drag=qbar*S*Math.max(0,cd);
  this.alpha=alpha*R2D;
  this.alphaTrimRad=this.trimAlpha();
  this.alphaTrim=this.alphaTrimRad*R2D;
  this.stallAngle=stallAngle*R2D;
  this.cl=cl;this.cd=cd;this.qbar=qbar;this.mach=mach;
  this.lift=lift;this.drag=drag;this.thrust=thrust;
  this.reverseThrust=this.onGround?this.reverse*AIRCRAFT.reverseFactor*thrust:0;
  this.stalled=!this.onGround&&alpha>stallAngle&&v>20;
  this.normalForce=this.onGround?Math.max(0,this.weight-lift-this.thrust*Math.sin(this.pitch*D2R)):lift;
  return{rho,qbar,alpha,flapFrac,cl,cd,lift,drag,thrust,stallAngle,mach};
 }
 trimAlpha(speed=this.speed,flaps=this.flaps,bank=this.bank){
  const rho=this.atmosphere(),qS=.5*rho*Math.max(30,speed)**2*S;
  const f=clamp(flaps/30,0,1);
  const cl0=AIRCRAFT.cleanLiftAtZero+AIRCRAFT.flapLiftGain*f;
  const stallAngle=AIRCRAFT.cleanStallAngle+AIRCRAFT.flapStallAngleGain*f;
  const desired=(this.weight/Math.max(.35,Math.cos(bank*D2R)))/Math.max(1,qS);
  return clamp((desired-cl0)/AIRCRAFT.liftSlope,2.2*D2R,(stallAngle-1.6)*D2R);
 }
 trimThrottle(gamma=this.gamma){
  const a=this.trimAlpha(),f=clamp(this.flaps/30,0,1);
  const cl=AIRCRAFT.cleanLiftAtZero+AIRCRAFT.flapLiftGain*f+AIRCRAFT.liftSlope*a;
  const qbar=.5*this.atmosphere()*Math.max(20,this.speed)**2;
  const cd=AIRCRAFT.cd0+INDUCED*cl*cl+flapDrag(this.flaps)+AIRCRAFT.gearDrag*this.gear;
  const drag=qbar*S*cd;
  const rho=this.atmosphere(),mach=this.speed/speedOfSound(this.altitude);
  const lapse=Math.pow(rho/RHO0,.82)*Math.max(.1,1-.28*mach-.10*mach*mach);
  const available=AIRCRAFT.engines*AIRCRAFT.engineThrust*lapse;
  const power=clamp((drag+this.weight*Math.sin(gamma))/(Math.max(1,available)*Math.cos(a)),.045,1);
  return clamp(Math.pow((power-.045)/.955,1/1.3),0,1);
 }
 takeoffPitchTarget(){
  if(this.speed<72&&this.onGround)return 0;
  if(this.onGround)return 10.5;
  const targetSpeed=this.altitude<200?94:this.altitude<450?112:128;
  const gammaTarget=this.altitude<560?clamp(7+(this.speed-targetSpeed)*.18,2,10):clamp((600-this.altitude)*.05,-2,2);
  return clamp(gammaTarget+this.trimAlpha()*R2D,0,18);
 }
 landingPitchTarget(){
  const distance=RUNWAY.touch-this.x;
  if(this.onGround)return 0;
  const pathAltitude=Math.max(0,(distance-30)*Math.tan(3*D2R));
  let gammaTarget=this.altitude>14?clamp(-3+(pathAltitude-this.altitude)*.06,-4.5,-1):clamp(-.8-this.altitude*.06,-1.6,-.6);
  const targetSpeed=distance>350?77:73;
  const alpha=this.trimAlpha(this.speed,this.flaps,0)*R2D;
  this.guidanceGamma=gammaTarget;
  this.guidanceAltitude=pathAltitude;
  this.guidanceSpeed=targetSpeed;
  return clamp(gammaTarget+alpha+(gammaTarget-this.gamma*R2D)*2,-1,12);
 }
 takeoffGuidance(){
  this.park=false;this.brake=0;this.landingBrake=0;
  if(this.onGround){this.throttle=1;this.flapTarget=20;this.gearTarget=1;}
  else{
   const targetSpeed=this.altitude<200?94:this.altitude<450?112:128;
   this.throttle=this.altitude<480?1:clamp(this.trimThrottle(0)+(targetSpeed-this.speed)*.02,.10,.85);
   this.flapTarget=this.altitude>200?0:20;
   this.gearTarget=this.altitude>30?0:1;
  }
 }
 landingGuidance(){
  const distance=RUNWAY.touch-this.x;
  this.flapTarget=30;this.gearTarget=1;
  if(!this.onGround){
   const targetSpeed=distance>350?77:73;
   this.throttle=clamp(this.trimThrottle(-3*D2R)+(targetSpeed-this.speed)*.03,.04,.75);
   if(this.altitude<9)this.throttle=0;
   this.reverseTarget=0;this.landingBrake=0;this.spoilerTarget=0;
  }else if(this.speed>2){
   this.throttle=this.speed>25?.6:0;
   this.reverseTarget=this.speed>25?1:0;
   this.landingBrake=this.speed>25?.55:.28;
   this.spoilerTarget=1;
  }else{
   this.throttle=0;this.reverseTarget=0;this.landingBrake=0;this.park=true;
  }
 }
 integrateGround(dt,pilot,aero){
  this.gamma=0;this.vs=0;
  const normal=Math.max(0,this.weight-aero.lift-this.thrust*Math.sin(this.pitch*D2R));
  this.normalForce=normal;
  const reverseForce=this.reverse*AIRCRAFT.reverseFactor*this.thrust;
  const drive=this.thrust*Math.cos(this.pitch*D2R)*(1-.8*this.reverse)-reverseForce;
  const rolling=AIRCRAFT.rollingMu*normal;
  const brakePressure=clamp(Math.max(pilot.brake,this.landingBrake||0,this.park?1:0),0,1);
  const brakeForce=brakePressure*AIRCRAFT.brakeMu*normal;
  const resistance=rolling+brakeForce;
  const net=drive-aero.drag;
  this.acceleration=(net-resistance)/this.mass;
  if(net<=resistance&&this.speed<.05)this.speed=0;
  else this.speed=Math.max(0,this.speed+this.acceleration*dt);
  if(this.park&&this.speed<.3)this.speed=0;
  this.brakePressure=brakePressure;
  const steerLimit=clamp((40-this.speed)/40,.12,1)*70*D2R;
  const steer=(this.rudder*steerLimit);
  this.heading=(this.heading+this.speed*Math.tan(steer)/AIRCRAFT.wheelbase*R2D*dt+360)%360;
  const heading=(this.heading-90)*D2R;
  this.x+=Math.cos(heading)*this.speed*dt;
  this.z+=Math.sin(heading)*this.speed*dt;
  this.updateGroundPitch(dt);
  this.onRunway=this.x>RUNWAY.start&&this.x<RUNWAY.end&&Math.abs(this.z)<RUNWAY.width/2;
  if(normal<=0&&this.pitch>3&&!this.park){
   this.onGround=false;
   this.phase='离地！升力超过了飞机重量';
   this.say('升力 > 重量，飞机离地了');
   return;
  }
  if(this.onGround&&(Math.abs(this.z)>55||this.x>RUNWAY.end+80)&&this.mode!=='inspect'){
   this.failed=true;this.message='飞机驶出了跑道。放襟翼、轻轻抬头，并预留足够滑跑距离再试一次';
  }
 }
 // Rotation on the ground is limited by the weight still carried by the nose gear:
 // the elevator can only lift the nose once enough lift has been generated.
 updateGroundPitch(dt){
  const vrTarget=74;
  const authority=clamp(Math.pow(this.speed/vrTarget,2),0,1.5);
  const noseLoad=clamp((this.weight-this.lift)/this.weight,0,1);
  let rate;
  if(this.onGround){
   rate=this.elevatorCmd*13*authority*(1-.55*noseLoad)-this.pitch*.9;
   if(this.pitch<=0&&rate<0)rate=0;
   this.pitchRate=rate;
   this.pitch=clamp(this.pitch+rate*dt,0,11.4);
   if(this.pitch>=11.4&&this.speed>25)this.tailStrike=true;
   if(this.pitch<=0){this.pitch=0;this.pitchRate=0;}
  }
 }
 integrateAirborne(dt,pilot,aero){
  const V=Math.max(12,this.speed);
  const bank=this.bank*D2R;
  const alpha=aero.alpha;
  const along=(aero.thrust*Math.cos(alpha)-aero.drag-this.weight*Math.sin(this.gamma))/this.mass;
  const liftForce=aero.lift+aero.thrust*Math.sin(alpha);
  const normal=(liftForce*Math.cos(bank)-this.weight*Math.cos(this.gamma))/(this.mass*V);
  const turn=liftForce*Math.sin(bank)/(this.mass*V*Math.max(.3,Math.cos(this.gamma)));
  const rudderYaw=this.rudder*1.1*D2R*clamp(V/70,0,1.6);
  // Pitching moment: static stability around the trimmed angle of attack, elevator
  // power and pitch-rate damping, divided by the pitching inertia.
  const qbar=aero.qbar;
  const cm=AIRCRAFT.cmAlpha*(alpha-this.alphaTrimRad)
   +AIRCRAFT.cmElevator*this.elevatorCmd
   +AIRCRAFT.cmPitchRate*(this.pitchRate*D2R*AIRCRAFT.chord/(2*V));
  const pitchAcceleration=qbar*S*AIRCRAFT.chord*cm/AIRCRAFT.pitchInertia;
  this.pitchRate=clamp(this.pitchRate+pitchAcceleration*R2D*dt,-18,18);
  this.pitch=clamp(this.pitch+this.pitchRate*dt,this.assist?-20:-28,this.assist?26:40);
  // Rolling moment with aileron power and roll damping.
  const p=this.rollRate*D2R;
  const clRoll=AIRCRAFT.clAileron*this.rollCmd+AIRCRAFT.clRollRate*(p*AIRCRAFT.wingSpan/(2*V));
  const rollAcceleration=qbar*S*AIRCRAFT.wingSpan*clRoll/AIRCRAFT.rollInertia;
  this.rollRate=clamp(this.rollRate+rollAcceleration*R2D*dt,-40,40);
  const bankLimit=this.assist?38:68;
  this.bank=clamp(this.bank+this.rollRate*dt,-bankLimit,bankLimit);
  if(this.bank>=bankLimit&&this.rollRate>0)this.rollRate=0;
  if(this.bank<=-bankLimit&&this.rollRate<0)this.rollRate=0;
  this.acceleration=along;
  this.speed=Math.max(10,this.speed+along*dt);
  this.heading=(this.heading+(turn*R2D+rudderYaw*R2D)*dt+360)%360;
  this.gamma=clamp(this.gamma+normal*dt,-55*D2R,45*D2R);
  this.vs=this.speed*Math.sin(this.gamma);
  const oldAltitude=this.altitude;
  const nextAltitude=this.altitude+this.vs*dt;
  const groundSpeed=this.speed*Math.cos(this.gamma);
  const heading=(this.heading-90)*D2R;
  this.x+=Math.cos(heading)*groundSpeed*dt;
  this.z+=Math.sin(heading)*groundSpeed*dt;
  if(nextAltitude<=0&&oldAltitude>0)this.touchdownOrCrash(-this.vs);
  else this.altitude=nextAltitude;
  if(this.altitude>AIRCRAFT.maxAltitude){
   this.altitude=AIRCRAFT.maxAltitude;this.gamma=Math.min(this.gamma,0);
   this.vs=this.speed*Math.sin(this.gamma);
  }
 }
 touchdownOrCrash(sink){
  const runway=Math.abs(this.z)<RUNWAY.width/2&&this.x>RUNWAY.start&&this.x<RUNWAY.end;
  const gearDown=this.gear>.97,level=Math.abs(this.bank)<12&&this.pitch>-.5;
  this.touchdown={rate:sink,x:this.x,z:this.z,speed:this.speed};
  this.altitude=0;
  if(!runway||!gearDown||sink>4.6||!level||this.speed>95){
   this.failed=true;
   this.message=!runway?'偏离跑道啦，重新对准再试一次':!gearDown?'记得放下起落架，再轻轻着陆':sink>4.6?'下降有点快，接近地面时轻轻抬头':!level?'先把机翼放平、轻轻抬起机头':'接地速度较快，先减速再尝试着陆';
   this.speed=0;this.vs=0;this.gamma=0;this.pitch=0;this.onGround=true;return;
  }
  this.gamma=0;this.vs=0;this.onGround=true;this.pitchRate=0;
  this.pitch=clamp(this.pitch,0,11.4);
  this.spoilerTarget=1;
  this.phase='主轮轻轻接地 · 扰流板与反推开始减速';
  if(this.mode==='land'){this.reverseTarget=1;this.landingBrake=.4;}
  if(this.mode!=='land')this.mode='manual';
 }
 updateAirData(){
  const rho=this.atmosphere(),V=Math.max(0,this.speed);
  this.vs=this.onGround?0:V*Math.sin(this.gamma);
  this.groundSpeed=this.onGround?V:V*Math.cos(this.gamma);
  this.mach=V/speedOfSound(this.altitude);
  this.qbar=.5*rho*V*V;
  const flapFrac=clamp(this.flaps/30,0,1);
  const clMax=AIRCRAFT.cleanMaxLift+AIRCRAFT.flapMaxLiftGain*flapFrac;
  this.stallSpeed=Math.sqrt(2*this.weight/(Math.max(.1,rho*S*clMax*Math.cos(this.bank*D2R))));
  this.criticalSpeed=this.stallSpeed*1.3;
  if(this.onGround)this.loadFactor=Math.max(0,(this.lift+this.normalForce)/this.weight);
  else this.loadFactor=(this.lift+this.thrust*Math.sin(this.alpha*D2R))/Math.max(1,this.weight*Math.cos(this.gamma));
  this.indicatedSpeed=V*Math.sqrt(rho/RHO0);
 }
 updateWarnings(){
  this.stallWarning=!this.onGround&&this.alpha>this.stallAngle-2.5&&this.speed>22;
  this.buffet=!this.onGround&&this.alpha>this.stallAngle-1.2;
  this.overspeed=this.speed>AIRCRAFT.vmo*1.02||this.mach>AIRCRAFT.mmo*1.01;
  this.gearOverspeed=this.gear>.02&&this.speed>270*KNOT;
  if(this.stallWarning&&!this.calls.stall){this.calls.stall=true;this.say('机翼快失速了，松杆并加推力');}
  if(this.overspeed&&!this.calls.overspeed){this.calls.overspeed=true;this.say('速度太快了，收一点油门');}
 }
 updatePhase(){
  if(this.mode==='inspect')return;
  if(this.mode==='takeoff'){
   this.phase=this.onGround?(this.speed<72?'四台发动机全推力 · 沿跑道加速':'达到抬轮速度 · 轻轻抬头'):this.altitude<35?'升力托起飞机 · 保持爬升':this.altitude<200?'正爬升 · 收起起落架':'收襟翼 · 加速爬升';
   if(this.altitude>585&&Math.abs(this.vs)<2){this.complete=true;this.phase='起飞成功 · 已进入平飞，可以接管';}
  }else if(this.mode==='land'){
   this.phase=!this.onGround?(this.altitude<14?'轻轻拉平 · 减少下降率':'保持进近速度 · 沿下滑道下降'):this.speed>25?'主轮接地 · 轮刹、反推与扰流板减速':'慢慢停稳 · 欢迎抵达';
   if(this.onGround&&this.speed<.2){this.complete=true;this.phase='降落成功 · 飞机已停稳';}
  }else if(this.stalled)this.phase='失速！松杆、压低机头并加推力';
  else if(this.overspeed)this.phase='速度过大 · 收油门并轻轻带杆';
  else if(this.onGround)this.phase=this.speed>30?'滑跑中 · 保持跑道中心线':'地面滑行 · 用 Q / E 转向';
  else if(this.speed<this.stallSpeed*1.1)this.phase='速度偏低 · 减小迎角并加推力';
  else this.phase='手动飞行 · 推力杆给能量，操纵杆改变姿态';
 }
}


