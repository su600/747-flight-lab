// Meteorological direction is where the wind comes FROM: north is -Z, east is +X.
export const KNOT_MS=.514444;
export const VISIBILITY={good:0,moderate:.0004,low:.0015}; // FogExp2 density; good retains the time-of-day default.
export const CLOUDS={clear:{sun:1,hemi:1},partly:{sun:.82,hemi:.94},overcast:{sun:.48,hemi:.78}};
export function windVector(direction,speed){const a=direction*Math.PI/180;return {x:-Math.sin(a)*speed,z:Math.cos(a)*speed};}
export function groundVelocity(heading,airspeed,direction,speed){const a=(heading-90)*Math.PI/180,w=windVector(direction,speed);return {x:Math.cos(a)*airspeed+w.x,z:Math.sin(a)*airspeed+w.z};}
// Runway 09: cancel crosswind and gently recover any lateral displacement.
export function runwayCrab(speed,windZ,z){return 90+Math.asin(Math.max(-.8,Math.min(.8,(-windZ-Math.max(-12,Math.min(12,z*.08)))/Math.max(20,speed))))*180/Math.PI;}
