export function setCockpitAirframeVisibility(aircraft,cameraMode){
 const inCockpit=cameraMode==='cockpit';
 if(aircraft.type==='b747'){
  aircraft.root.visible=true;
  // The B747 loads its exterior in order: fuselage, wings, gear, engines.
  // Cut away the shell around the pilot, while keeping the outward parts
  // available through the windows when the user looks left or right.
  const [fuselage,...externalParts]=aircraft.native?.children||[];
  if(fuselage)fuselage.visible=!inCockpit;
  for(const part of externalParts)part.visible=true;
  return;
 }
 // Other airframes share the simplified 747 cockpit and have no matching
 // interior, so keep their exterior hidden from this camera.
 aircraft.root.visible=!inCockpit;
}

// The cockpit eye is fixed to the airframe, so the camera must not ease toward it:
// a lagging camera trails the aircraft and shows the cockpit model from outside.
export function cameraFollowFactor(cameraMode,firstCamera,dt){
 if(firstCamera||cameraMode==='cockpit')return 1;
 return 1-Math.exp(-dt*6);
}

export function cameraModeForWiperToggle(cameraMode,wipersOn){
 return wipersOn&&cameraMode!=='cockpit'?'cockpit':cameraMode;
}

// 0 is parked (flat on the lower windshield edge); the sweep rises from 0 to 50 degrees and back.
export function cockpitWiperSweepAngle(time){
 return (1-Math.cos((Number(time)||0)*3))/2*50;
}
