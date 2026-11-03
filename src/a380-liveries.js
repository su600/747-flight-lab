// Per-livery A380 settings that are not painted into the atlas: the flat colours
// of the stabilizers, engine cowls and wingtip fences (all part of each real
// scheme), and whether the cabin windows are closed (freighter adaptations).
const WHITE='#f4f5f6';
const style=(o={})=>({stabilizer:WHITE,nacelle:WHITE,winglet:WHITE,freight:false,...o});

export const A380_STYLE={
 BOE:style({winglet:'#14307a'}),
 CCA:style(),
 CEA:style(),
 CSN:style({winglet:'#0b3a8f'}),
 CHH:style({stabilizer:'#d5102b'}),
 UAE:style({stabilizer:'#f7f6f2',nacelle:'#f7f6f2',winglet:'#f7f6f2'}),
 BAW:style({nacelle:'#1f2a6b',winglet:'#1f2a6b'}),
 KLM:style({stabilizer:'#00a1de'}),
 DLH:style(),
 DLH100:style(),
 AF1_CLASSIC:style({nacelle:'#6aaed6'}),
 AF1_2026:style({nacelle:'#0b1f44',winglet:'#0b1f44'}),
 fedex:style({freight:true,stabilizer:'#4d148c'}),
 sf:style({freight:true,stabilizer:'#1c1d1f',nacelle:'#1c1d1f',winglet:'#1c1d1f'}),
};
