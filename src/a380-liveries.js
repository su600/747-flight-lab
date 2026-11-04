// Per-livery A380 settings that are not painted into the atlas: the flat colours
// of the stabilizers, engine cowls and wingtip fences (all part of each real
// scheme), and whether the cabin windows are closed (freighter adaptations).
const WHITE='#f4f5f6';
const style=(o={})=>({stabilizer:WHITE,nacelle:WHITE,winglet:WHITE,freight:false,...o});

// Liveries that ship the paint shop's own A380X UV atlas instead of the
// side-projected artwork. Keys are model material names, values are files in
// assets/a380-liveries/native/. D-AIMH's centenary scheme is the first: the
// 47 m crane, the 1926 | 2026 dates and the door stencils are all part of the
// real texture, so nothing has to be redrawn by hand.
// Source: FlyByWire A380X "Lufthansa 100 Year Anniversary D-AIMH" livery by
// steffieth (flightsim.to addon 101026), freeware, used with attribution.
export const A380_NATIVE={
 DLH100:{
  A380X_FUSE1:'DLH100-FUSE1.webp',
  A380X_FUSE2:'DLH100-FUSE2.webp',
  A380X_FUSE3:'DLH100-FUSE3.webp',
  A380X_FUSE4:'DLH100-FUSE4.webp',
  A380X_FUSE5:'DLH100-FUSE5.webp',
 },
};

export const A380_STYLE={
 BOE:style({winglet:'#14307a'}),
 CCA:style(),
 CEA:style(),
 CSN:style({winglet:'#0b3a8f'}),
 CHH:style({stabilizer:'#ed1c24',winglet:'#ed1c24'}),
 UAE:style({stabilizer:'#f7f6f2',nacelle:'#f7f6f2',winglet:'#f7f6f2'}),
 BAW:style({nacelle:'#1f2a6b',winglet:'#1f2a6b'}),
 KLM:style({stabilizer:'#00a1de',nacelle:'#00a1de'}),
 DLH:style(),
 DLH100:style(),
 AF1_CLASSIC:style({nacelle:'#6aaed6'}),
 AF1_2026:style({nacelle:'#0b1f44',winglet:'#0b1f44'}),
 fedex:style({freight:true,stabilizer:'#4d148c'}),
 sf:style({freight:true,stabilizer:'#1c1d1f',nacelle:'#1c1d1f',winglet:'#1c1d1f'}),
};
