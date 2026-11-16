import {windVector} from '../weather-math.js';
import {clamp,D2R,R2D,KNOT,RUNWAY,GEAR_DOWN_ALTITUDE} from './constants.js';

export class Guidance{
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
  const glide=this.landingGlide||3,approach=this.landingSpeed||77;
  // A tailwind shortens the orbiter's time to flare on the runway approach.
  const tailwind=this.unpowered?Math.max(0,windVector(this.windDirection,this.windSpeed).x):0;
  const flareAlt=this.unpowered?24+tailwind*.9:14;
  const pathAltitude=Math.max(0,(distance-30)*Math.tan(glide*D2R));
  const minGamma=this.unpowered?-12:-4.5;
  let gammaTarget=this.altitude>flareAlt?clamp(-glide+(pathAltitude-this.altitude)*.06,minGamma,-1):clamp(-.8-this.altitude*.06,-1.6,-.6);
  const targetSpeed=this.unpowered?approach:(distance>350?77:73);
  const alpha=this.trimAlpha(this.speed,this.flaps,0)*R2D;
  this.guidanceGamma=gammaTarget;
  this.guidanceAltitude=pathAltitude;
  this.guidanceSpeed=targetSpeed;
  // The lower limit allows the steeper descent from the start altitude back to the glide path.
  return clamp(gammaTarget+alpha+(gammaTarget-this.gamma*R2D)*2,-6,12);
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
  const glide=this.landingGlide||3,approach=this.landingSpeed||77;
  this.flapTarget=this.unpowered?0:30;
  this.gearTarget=this.altitude<(this.unpowered?120:GEAR_DOWN_ALTITUDE)?1:0;
  if(!this.onGround){
   const targetSpeed=this.unpowered?approach:(distance>350?77:73);
   this.throttle=this.unpowered?0:clamp(this.trimThrottle(-glide*D2R)+(targetSpeed-this.speed)*.03,.04,.75);
   if(!this.unpowered&&this.altitude<9)this.throttle=0;
   this.reverseTarget=0;this.landingBrake=0;this.spoilerTarget=0;
  }else if(this.speed>2){
   // An unpowered orbiter has no reversers; it relies on wheel brakes, the
   // speed brake and the drag chute.
   this.throttle=this.unpowered?0:(this.speed>60*KNOT?.6:0);
   this.reverseTarget=this.unpowered?0:(this.speed>60*KNOT?1:0);
   this.landingBrake=this.speed>25?.55:.28;
   this.spoilerTarget=1;
   // The orbiter pops its drag chute right after main-gear touchdown and jettisons it near 30 kt.
   if(this.chuteAvailable){
    if(this.speed<=15){if(this.chuteTarget===1||this.chute>.05)this.chuteJettisoned=true;this.chuteTarget=0;}
    else if(this.speed<95&&!this.chuteJettisoned)this.chuteTarget=1;
   }
  }else{
   this.throttle=0;this.reverseTarget=0;this.landingBrake=0;this.park=true;
   if(!this.unpowered){this.spoilerTarget=0;this.autoGroundSpoilers=false;}
  }
 }
}
