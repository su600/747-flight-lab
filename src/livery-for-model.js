// BOE is the persistent manufacturer-default ID, not a claim that every
// aircraft is Boeing. These markings are original, illustrative artwork, not
// an exact Airbus demonstration-aircraft livery or an official logo.
const AIRBUS_HOUSE={name:'空客原厂 · 示意',en:'AIRBUS HOUSE',color:'#164a83',symbol:'AIRBUS',logo:'airbus-house.png'};
const A380_HOUSE_PAINT={
 bodyColor:'#f6f7f8',tailColor:'#164a83',engineColor:'#f6f7f8',
 color:'#164a83',sideText:'AIRBUS A380',logo:'airbus-house.png',
 cargo:false,hideWindows:false,stripes:false,
};

// Air Force One schemes belong to the 747 model family only. Other aircraft
// must not offer them as fictitious liveries. BOE remains the manufacturer
// default adaptation for Airbus models; every other supported entry stays intact.
const AF1_747_ONLY=new Set(['AF1_CLASSIC','AF1_2026']);
// The orbiter has one built-in NASA paint scheme; airliner paints are not offered on it.
const SHUTTLE_ONLY=new Set(['NASA_SHUTTLE']);
export function liveryForModel(livery,type){
 if(!livery)return livery;
 if(type==='shuttle')return SHUTTLE_ONLY.has(livery.id)?livery:null;
 if(SHUTTLE_ONLY.has(livery.id))return null;
 if(AF1_747_ONLY.has(livery.id)&&type!=='b747')return null;
 if(livery.id!=='BOE'||(type!=='a380'&&type!=='a330'))return livery;
 return {...livery,...AIRBUS_HOUSE,modelPaint:{...livery.modelPaint,
  ...(type==='a380'?{a380:{...livery.modelPaint?.a380,...A380_HOUSE_PAINT}}:{}),
 }};
}
