export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export const approach=(a,b,rate,dt)=>a+clamp(b-a,-rate*dt,rate*dt);
export const D2R=Math.PI/180,R2D=180/Math.PI;
export const KNOT=.514444;

export const RUNWAY={start:-1900,end:1900,width:60,touch:-1550};
// Powered approaches begin in a descent above the glide path, with the gear still up,
// so the gear extension is part of the demo. Below this height the gear lowers.
export const LANDING_START_ALTITUDE=300,GEAR_DOWN_ALTITUDE=260;

// Nose-up ground lift used by the renderer and the tail-clearance limit. It keeps
// wheels on the surface at rotation and fades out over the first two metres of
// altitude, so ground and air use one continuous formula.
export function groundLift(pitchDeg,altitude){
 return Math.max(0,Math.sin(pitchDeg*D2R)*4)*(1-clamp(altitude/2,0,1));
}
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
 vmo:188,                   // m/s indicated (equivalent) airspeed, ~365 KIAS
 mmo:.92,
 maxAltitude:12500
};
