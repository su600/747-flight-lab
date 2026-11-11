// Animation-channel parsing, evaluation and rig binding for the adapted FlightGear 777
// models. Pure Three.js + data; no DOM or loader state.
import * as T from 'three';
// FlightGear XML (x forward/aft, y lateral, z up) -> AC/Three native frame.
// The AC is nose -X; Aircraft.native rotates it 180 degrees for the app.
export const fgToNative = (x,y,z) => new T.Vector3(x,z,-y);
export const B777_SOURCE = Object.freeze({
 revision:'cfa61378d1210a33e0520d4459d0baf1cf1511f5', // legacy cargo alias; use variant.revision
 passenger:Object.freeze({model:'777-200LR',revision:'b64215060a0591ee39b9ecd7558db274014be223',xml:'source-alternatives/2048/777-200LR-v2.xml',asset:'777-200LR-2048.candidate.glb',identity:'FlightGear 777-200LR, independent 2048 repository',ac:'Models/Liveries-200LR/777-200LR.ac'}),
 cargo:Object.freeze({model:'777-200F',revision:'cfa61378d1210a33e0520d4459d0baf1cf1511f5',xml:'777-200F-v2.xml',asset:'777-200F-refined.candidate.glb',identity:'FlightGear Boeing 777-200F',ac:'Models/Liveries-F/777-200F.ac'}),
 // Reference envelope supplied by the user, NOT the converted model bounds.
 referenceEnvelopeM:Object.freeze([63.7,18.6,64.8]), // length, height, span
});

// Representative source animation indices, NOT an exhaustive FG graph. This
// structural checklist cannot validate hierarchy, target coverage or poses.
const freezeChannels=groups=>Object.freeze(Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,Object.freeze(v)])));
export const B777_CORE_CHANNELS=Object.freeze({
 passenger:freezeChannels({gear:[67,86,126],gearDoors:[87,127],rudder:[293],elevators:[296,298],ailerons:[299,334],flaps:[301,302,317,318],spoilers:[315,332],slats:[371],reversers:[337,338,339,340],fans:[412,413]}),
 cargo:freezeChannels({gear:[61,80,120],gearDoors:[81,121],rudder:[220],elevators:[223,225],ailerons:[226,261],flaps:[228,229,230,231,244,245,246,247],spoilers:[242,259],slats:[298],reversers:[264,265,266,267],fans:[338,339],mainCargoDoor:[209,210,211,212,213,214,215,216]}),
});
export function auditB777AnimationCoverage(variant,indices){
 const required=B777_CORE_CHANNELS[variant];
 if(!required||!Array.isArray(indices)||indices.some(i=>!Number.isInteger(i)))throw Error('Invalid B777 coverage input');
 const present=new Set(indices),missing={};
 for(const [part,ids] of Object.entries(required)){
  const absent=ids.filter(id=>!present.has(id));if(absent.length)missing[part]=absent;
 }
 return {missing};
}

export const direct=(node,name)=>Array.from(node?.children||[]).filter(n=>n.tagName===name);
export const text=(node,name,def='')=>direct(node,name)[0]?.textContent.trim()??def;
function numeric(node,name,def=0){
 const value=text(node,name,'');if(value==='')return def;
 const n=Number(value);if(!Number.isFinite(n))throw Error(`Invalid XML number ${name}: ${value}`);return n;
}
const vector=(node,suffix='')=>fgToNative(numeric(node,'x'+suffix),numeric(node,'y'+suffix),numeric(node,'z'+suffix));

// Extract *descriptions*, not an animation graph. XML group/select/conditions,
// expressions, hierarchy, nested objects and repeated transforms require a
// FlightGear-aware converter/binder. Never apply these as independent hinges and
// call the result accurate. `skipped` makes unimplemented constructs visible.
export function extractB777Animations(doc){
 const root=doc?.documentElement||doc, animations=[], skipped=[];
 if(root?.tagName!=='PropertyList'||root.querySelector?.('parsererror'))throw Error('Invalid B777 XML document');
 for(const [index,a] of direct(root,'animation').entries()){
  const type=text(a,'type'), property=text(a,'property');
  if(!['rotate','translate','spin'].includes(type))continue;
  const names=direct(a,'object-name').map(n=>n.textContent.trim()).filter(Boolean);
  const axes=direct(a,'axis');
  let reason='';
  if(!property)reason='missing property or expression';
  else if(direct(a,'expression').length)reason='expression';
  else if(direct(a,'condition').length)reason='condition';
  else if(!names.length||!axes.length)reason='missing targets or axis';
  if(reason){skipped.push({index,type,property,reason});continue;}
  const ax=axes[0];let center,axis;
  if(text(ax,'x1-m')!==''){
   center=vector(ax,'1-m');axis=vector(ax,'2-m').sub(center);
  }else{center=vector(direct(a,'center')[0],'-m');axis=vector(ax);}
  if(axis.lengthSq()<1e-20){skipped.push({index,type,property,reason:'zero axis'});continue;}
  axis.normalize();
  const table=direct(direct(a,'interpolation')[0],'entry').map(e=>[numeric(e,'ind'),numeric(e,'dep')]);
  if(table.some((e,i)=>i>0&&e[0]<=table[i-1][0])){skipped.push({index,type,property,reason:'unordered interpolation'});continue;}
  animations.push({index,type,property,names,center,axis,table,axisCount:axes.length,
   factor:numeric(a,'factor',1),offset:numeric(a,'offset-deg',numeric(a,'offset',0))});
 }
 return {animations,skipped};
}

// FG values are supplied in their native units; absent properties return null,
// not zero. Spins return RPM (not angle); caller owns integration and phase.
export function evaluateB777Animation(a,properties){
 const v=properties[a.property];if(v===undefined)return null;
 if(!Number.isFinite(v))throw Error(`Non-finite property: ${a.property}`);
 let result=v;const t=a.table;
 if(t.length){
  if(v<=t[0][0])result=t[0][1];
  else if(v>=t[t.length-1][0])result=t[t.length-1][1];
  else for(let i=1;i<t.length;i++)if(v<=t[i][0]){const [x0,y0]=t[i-1],[x1,y1]=t[i];result=y0+(t[i][1]-y0)*(v-x0)/(x1-x0);break;}
 }
 return result*a.factor+a.offset;
}
export function advanceB777Spin(phaseDegrees,rpm,dt){
 if(![phaseDegrees,rpm,dt].every(Number.isFinite)||dt<0)throw Error('Invalid spin input');
 return ((phaseDegrees+rpm*6*dt)%360+360)%360;
}

// The converter/integrator must construct the FG grouping/order and insert
// identity wrappers. It must supply each pivot/axis in that wrapper's *parent*
// coordinates. This executor does not infer a graph from object names; using it
// does not prove that the provided hierarchy or multi-axis interpretation is FG.
export function createB777AnimationRig({scene,animations,bindings}){
 if(!scene?.isObject3D||!Array.isArray(animations)||!Array.isArray(bindings))throw Error('B777 rig requires scene, animations and bindings');
 const byIndex=new Map(animations.map(a=>[a.index,a])),used=new Set(),indices=new Set();
 const entries=bindings.map(binding=>{
  const a=byIndex.get(binding.index);
  if(!a||indices.has(binding.index))throw Error(`B777 rig invalid/duplicate animation ${binding.index}`);
  indices.add(binding.index);
  if(a.axisCount>1&&!binding.allowAmbiguousAxis)throw Error(`B777 rig unresolved multiple axes: ${a.index}`);
  if(!Array.isArray(binding.targets)||!binding.targets.length)throw Error(`B777 rig has no targets: ${a.index}`);
  const targets=binding.targets.map(({wrapper,pivot,axis})=>{
   if(!wrapper?.isObject3D||wrapper===scene||used.has(wrapper)||!wrapper.matrixAutoUpdate)throw Error('B777 rig wrapper invalid or reused');
   let p=wrapper.parent;while(p&&p!==scene)p=p.parent;
   if(p!==scene)throw Error('B777 rig wrapper outside scene');
   if(wrapper.position.lengthSq()>1e-20||Math.abs(wrapper.quaternion.w-1)>1e-10||Math.abs(wrapper.quaternion.x)+Math.abs(wrapper.quaternion.y)+Math.abs(wrapper.quaternion.z)>1e-10||wrapper.scale.distanceToSquared(new T.Vector3(1,1,1))>1e-20)throw Error('B777 rig wrapper must be neutral');
   const vec=v=>v?.isVector3?v.clone():Array.isArray(v)&&v.length===3?new T.Vector3().fromArray(v):null;
   const c=vec(pivot),d=vec(axis);
   if(!c||!d||![...c.toArray(),...d.toArray()].every(Number.isFinite)||d.lengthSq()<1e-20)throw Error('B777 rig pivot/axis invalid');
   used.add(wrapper);return {wrapper,pivot:c,axis:d.normalize()};
  });
  return {a,targets,phase:0};
 });
 let disposed=false;
 return {
  indices:Object.freeze(entries.map(e=>e.a.index)),
  update(properties,dt=0){
   if(disposed)throw Error('B777 rig disposed');
   if(!Number.isFinite(dt)||dt<0)throw Error('Invalid B777 rig dt');
   // Validate all property inputs before changing any wrapper.
   const values=entries.map(e=>evaluateB777Animation(e.a,properties));
   entries.forEach((e,i)=>{
    let v=values[i];if(v===null)return;
    if(e.a.type==='spin'){e.phase=advanceB777Spin(e.phase,v,dt);v=e.phase;}
    for(const {wrapper,pivot,axis} of e.targets){
     if(e.a.type==='translate')wrapper.position.copy(axis).multiplyScalar(v);
     else{wrapper.quaternion.setFromAxisAngle(axis,T.MathUtils.degToRad(v));wrapper.position.copy(pivot).sub(pivot.clone().applyQuaternion(wrapper.quaternion));}
    }
   });
  },
  dispose(){if(disposed)return;disposed=true;for(const e of entries)for(const {wrapper} of e.targets){wrapper.position.set(0,0,0);wrapper.quaternion.identity();}entries.length=0;},
 };
}

// Experimental per-model binders. XML generated groups precede the selected
// source-order wrappers on actual fgName nodes. This is a *subset*, not a
// FlightGear interpreter. Each list corresponds to its own pinned source XML.
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
export const CANDIDATE_INDICES={
 cargo:new Set([...range(60,68),73,...range(79,83),...range(85,90),...range(93,106),
  ...range(119,123),...range(125,143),...range(203,216),...range(220,298),338,339,344,347]),
 passenger:new Set([...range(66,74),79,...range(85,89),...range(91,93),...range(96,112),
  ...range(125,129),...range(131,149),...range(284,292),...range(293,371),412,413,418,421]),
};
