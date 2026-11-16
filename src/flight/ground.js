import {clamp,approach,D2R,R2D,KNOT,RUNWAY,AIRCRAFT} from './constants.js';
const G=AIRCRAFT.gravity;

export class Ground{
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
  // Wheels on the runway hold the wings level.
  this.bank=approach(this.bank,0,8,dt);this.rollRate=0;
  // Nose-wheel steering is limited by tyre side force: cap the turn so the
  // lateral acceleration stays near 0.3 g at runway speeds while taxi turns stay tight.
  const steerLimit=clamp((40-this.speed)/40,.12,1)*70*D2R;
  const steer=(this.rudder*steerLimit);
  const maxTan=this.speed>1?.3*G*AIRCRAFT.wheelbase/(this.speed*this.speed):Infinity;
  const steerTan=clamp(Math.tan(steer),-maxTan,maxTan);
  this.heading=(this.heading+this.speed*steerTan/AIRCRAFT.wheelbase*R2D*dt+360)%360;
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
 touchdownOrCrash(sink){
  const runway=Math.abs(this.z)<RUNWAY.width/2&&this.x>RUNWAY.start&&this.x<RUNWAY.end;
  const gearDown=this.gear>.97,level=Math.abs(this.bank)<12&&this.pitch>-.5;
  this.touchdown={rate:sink,x:this.x,z:this.z,speed:this.speed,heading:this.heading,time:this.time,valid:false};
  this.altitude=0;
  const maxTouchdown=this.unpowered?120:95;
  if(!runway||!gearDown||sink>4.6||!level||this.speed>maxTouchdown){
   this.failed=true;
   this.message=!runway?'偏离跑道啦，重新对准再试一次':!gearDown?'记得放下起落架，再轻轻着陆':sink>4.6?'下降有点快，接近地面时轻轻抬头':!level?'先把机翼放平、轻轻抬起机头':'接地速度较快，先减速再尝试着陆';
   this.speed=0;this.vs=0;this.gamma=0;this.pitch=0;this.onGround=true;return;
  }
  this.gamma=0;this.vs=0;this.onGround=true;this.pitchRate=0;
  // Simplified de-crab at touchdown; the wheels then track the runway.
  if(this.mode==='land'&&this.windCompensating)this.heading=90;
  this.pitch=clamp(this.pitch,0,11.4);this.touchdown.valid=true;
  // The shuttle retains its existing rudder speed-brake/chute behavior.
  if(this.unpowered)this.spoilerTarget=1;
  else if(this.mode==='land'||this.throttle<=.2){this.spoilerTarget=1;this.autoGroundSpoilers=true;}
  this.phase='主轮轻轻接地 · 开始减速';
  if(this.mode==='land'){if(!this.unpowered&&this.speed>60*KNOT)this.reverseTarget=1;this.landingBrake=.4;}
  if(this.mode!=='land')this.mode='manual';
 }
}
