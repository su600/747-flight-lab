// BOE is the persistent manufacturer-default ID, not a claim that every
// aircraft is Boeing. These markings are original, illustrative artwork, not
// an exact Airbus demonstration-aircraft livery or an official logo.
const AIRBUS_HOUSE={name:'空客原厂 · 示意',en:'AIRBUS HOUSE',color:'#164a83',symbol:'AIRBUS',logo:'airbus-house.png'};
const A380_HOUSE_PAINT={
 bodyColor:'#f6f7f8',tailColor:'#164a83',engineColor:'#f6f7f8',
 color:'#164a83',sideText:'AIRBUS A380',logo:'airbus-house.png',
 cargo:false,hideWindows:false,stripes:false,
};

// Return the original catalog entry unchanged for every other ID/type. In
// particular, freight metadata must never inherit passenger-default paint.
export function liveryForModel(livery,type){
 if(!livery||livery.id!=='BOE'||(type!=='a380'&&type!=='a330'))return livery;
 return {...livery,...AIRBUS_HOUSE,modelPaint:{...livery.modelPaint,
  ...(type==='a380'?{a380:{...livery.modelPaint?.a380,...A380_HOUSE_PAINT}}:{}),
 }};
}
