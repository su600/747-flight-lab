// Educational Concorde approximation, not an aircraft performance database.
// Olympus dry thrust includes a simple ram-recovery term; wave drag peaks in the
// transonic region and falls again in supersonic cruise. Units are SI.
import {AIRCRAFT,clamp} from './flight/constants.js';

export const CONCORDE={
 ...AIRCRAFT,
 mass:155000, landingMass:110000, wingArea:358.25, wingSpan:25.6, chord:12.5,
 engineThrust:140000, cleanLiftAtZero:.10, liftSlope:3.1,
 cleanMaxLift:1.18, cleanStallAngle:20, flapLiftGain:0, flapMaxLiftGain:0,
 flapStallAngleGain:0, oswald:.80, cd0:.0105, gearDrag:.018,
 cmAlpha:-1.1, cmElevator:.48, cmPitchRate:-45, clAileron:.035,
 pitchInertia:4.5e7, rollInertia:1.2e7,
 vmo:205.8, mmo:2.04, maxAltitude:18288
};

export function concordeWaveDrag(mach){
 if(mach<=.8)return 0;
 if(mach<1.15)return .012*(mach-.8)/.35;
 if(mach<1.7)return .012-(.012-.0045)*(mach-1.15)/.55;
 // A rapid drag rise models a soft thermal/envelope protection, not a hard speed clamp.
 return .0045+2*Math.max(0,mach-2.02)**2;
}
export function concordeThrust(rho,mach,n1,reheat){
 const sigma=rho/AIRCRAFT.rho0;
 const lapse=Math.pow(sigma,.72)*(1+.4*mach);
 return CONCORDE.engines*CONCORDE.engineThrust*(.045+.955*Math.pow(clamp(n1,0,1),1.3))*lapse*(1+.25*reheat);
}
