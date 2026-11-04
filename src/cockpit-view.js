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

export function cameraModeForWiperToggle(cameraMode,wipersOn){
 return wipersOn&&cameraMode!=='cockpit'?'cockpit':cameraMode;
}

export function cockpitWipersVisible(cameraMode,wipersOn,lookYaw=0,lookPitch=0){
 return cameraMode==='cockpit'&&Boolean(wipersOn)&&Math.abs(lookYaw)<.65&&Math.abs(lookPitch)<.55;
}

export function cockpitWiperSweepAngle(time){
 return Math.sin((Number(time)||0)*3)*26;
}
