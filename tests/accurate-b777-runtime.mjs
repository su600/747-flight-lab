// Offline CPU-only tests: pinned source XML excerpts + synthetic Three.js nodes.
// This does not claim that a real GLB, window seal or FG graph is validated.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import * as T from 'three';
import {AccurateB777Research,B777_SOURCE,extractB777Animations,evaluateB777Animation,
 advanceB777Spin,b777PropertiesFromState,createB777AnimationRig,createB777CabinLighting,findB777PassengerWindows,auditB777AnimationCoverage,B777_CORE_CHANNELS} from '../src/accurate-b777.js';
const fixture=JSON.parse(readFileSync(new URL('./accurate-b777-runtime-fixture.json',import.meta.url)));
// Exact SHA-256 of whole upstream XML, not a hash of the excerpt.
const expectedHashes={
 '777-200LR-v2.xml':'9d0ed62deee7634d92e8f0e51b01ee768e606faaa52aee56a8724a8c34a03630',
 '777-200F-v2.xml':'49d9d98c49179de7c6979bbdbdfbaa4485c85429b55021e14ac2caeeda978e45',
};
// Optional independent check against the complete asset-agent XML files.
if(process.env.B777_TEST_XML_DIR){
 for(const [name,sha] of Object.entries(expectedHashes)){
  if(process.env.B777_TEST_XML_NAME&&process.env.B777_TEST_XML_NAME!==name)continue;
  const path=join(process.env.B777_TEST_XML_DIR,name),bytes=readFileSync(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha,`${name} source hash`);
  const py=`import json,sys,xml.etree.ElementTree as ET\ndef cv(e):\n return {'tagName':e.tag,'textContent':''.join(e.itertext()),'children':[cv(c) for c in e]}\na=ET.parse(sys.argv[1]).getroot().findall('animation')\nprint(json.dumps([cv(x) for x in a]))`;
  const animations=JSON.parse(execFileSync('python3',['-c',py,path],{encoding:'utf8',maxBuffer:12*1024*1024}));
  for(const entry of fixture.files[name].entries)assert.deepEqual(entry.node,animations[entry.index],`${name} animation ${entry.index}`);
  const extracted=extractB777Animations({tagName:'PropertyList',children:animations});
  for(const entry of fixture.files[name].entries)assert.ok(extracted.animations.some(a=>a.index===entry.index),`${name} did not extract ${entry.index}`);
  console.log(`${name}: ${extracted.animations.length} extractable, ${extracted.skipped.length} skipped`);
 }
}
const close=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const vecClose=(a,b,eps=1e-8)=>a.toArray().forEach((v,i)=>close(v,b.toArray()[i],eps));
function docFor(name){
 const f=fixture.files[name];assert.equal(f.sha256,expectedHashes[name]);
 assert.ok(f.path.endsWith(name.includes('200F')?'Liveries-F/777-200F.ac':'Liveries-200LR/777-200LR.ac'));
 const children=Array.from({length:f.count},()=>({tagName:'animation',children:[]}));
 for(const e of f.entries)children[e.index]=e.node;
 return {tagName:'PropertyList',children};
}
const descriptions={};
for(const variant of ['passenger','cargo']){
 // Historical fixture uses the original revision, not the 2048 candidate XML.
 const doc=docFor(variant==='passenger'?'777-200LR-v2.xml':'777-200F-v2.xml'),{animations}=extractB777Animations(doc);
 descriptions[variant]=animations;const index=i=>{const a=animations.find(x=>x.index===i);assert.ok(a,`${variant} #${i}`);return a;};
 const gear=index(variant==='passenger'?94:61);
 assert.equal(gear.names[0],'Frontgear');vecClose(gear.center,new T.Vector3(-19.2902,-2.59959,0));
 for(const [x,y] of [[0,110],[.2,110],[.6,55],[1,0]])close(evaluateB777Animation(gear,{[gear.property]:x}),y);
 assert.equal(evaluateB777Animation(gear,{}),null);
 const fan=index(variant==='passenger'?461:338);assert.equal(fan.names[0],'Lfan');
 vecClose(fan.center,new T.Vector3(-4.14913,-2.8908,9.89412));close(evaluateB777Animation(fan,{[fan.property]:20}),200);
 const flap=index(variant==='passenger'?344:228);
 close(evaluateB777Animation(flap,{[flap.property]:.5}),variant==='passenger'?15:-17.5);
 const translation=index(variant==='passenger'?343:229);
 close(evaluateB777Animation(translation,{[translation.property]:1}),variant==='passenger'?.9:.430000002);
 const rev=index(variant==='passenger'?379:264);close(evaluateB777Animation(rev,{[rev.property]:1}),.7);
 const spoiler=index(variant==='passenger'?352:242);close(evaluateB777Animation(spoiler,{[spoiler.property]:32}),32);
 const rudder=index(variant==='passenger'?337:220);close(evaluateB777Animation(rudder,{[rudder.property]:12}),12);
 const elevator=index(variant==='passenger'?340:223);assert.equal(elevator.axisCount,2);
 if(variant==='cargo'){
  const door=index(209),strut=index(211),hinge=index(214);
  assert.equal(door.names[0],'entry11l');vecClose(door.center,new T.Vector3(16.4585,2.75241,1.4318));
  close(evaluateB777Animation(door,{[door.property]:1}),70);close(evaluateB777Animation(strut,{[strut.property]:1}),90);
  close(evaluateB777Animation(hinge,{[hinge.property]:1}),.02);
 }
}
assert.deepEqual(B777_SOURCE.referenceEnvelopeM,[63.7,18.6,64.8]);
assert.equal(advanceB777Spin(350,2,1),2);assert.equal(advanceB777Spin(0,-1,1),354);assert.throws(()=>advanceB777Spin(0,1,-1));
const props=b777PropertiesFromState({gear:.5,flaps:15,reverse:.8,door:1,mainCargoDoor:.25,lowerCargoDoor:.75,fgProperties:{'engines/engine[0]/rpm':34}},'cargo');
assert.equal(props['gear/gear[1]/position-norm'],.5);assert.equal(props['surface-positions/flap-pos-norm'],.5);
assert.equal(props['sim/multiplay/generic/float[52]'],.25);assert.equal(props['sim/multiplay/generic/float[26]'],.75);
assert.equal(props['engines/engine[0]/rpm'],34);assert.ok(!('engines/engine[1]/rpm' in props));
assert.ok(!('sim/multiplay/generic/float[52]' in b777PropertiesFromState({},'passenger')));
assert.throws(()=>b777PropertiesFromState({},'300F'));
for(const v of ['passenger','cargo'])assert.deepEqual(auditB777AnimationCoverage(v,Object.values(B777_CORE_CHANNELS[v]).flat()).missing,{});
assert.throws(()=>auditB777AnimationCoverage('cargo',[1,'209']),/Invalid/);
const gains=[{state:'aileron',property:'fcs/left-out-aileron/final-deg',gain:20,min:-1,max:1},{state:'aileron',property:'fcs/right-out-aileron/final-deg',gain:-20,min:-1,max:1},{state:'spoiler',property:'sim/multiplay/generic/float[60]',gain:45,min:0,max:1}];
const mapped=b777PropertiesFromState({aileron:2,spoiler:.5,fgProperties:{'fcs/left-out-aileron/final-deg':7}},'passenger',gains);
assert.equal(mapped['fcs/left-out-aileron/final-deg'],7);assert.equal(mapped['fcs/right-out-aileron/final-deg'],-20);assert.equal(mapped['sim/multiplay/generic/float[60]'],22.5);
assert.throws(()=>b777PropertiesFromState({aileron:NaN},'passenger',gains),/Non-finite visual input/);
assert.throws(()=>b777PropertiesFromState({},'passenger',[{state:'x'}]),/Invalid B777 visual mapping/);

// Concrete animation executor: source-extracted channels, but explicitly
// supplied synthetic hierarchy/pivots, not a claim about a converted model.
for(const variant of ['passenger','cargo']){
 const animations=descriptions[variant],scene=new T.Group(), ids=variant==='passenger'?[94,343,344,379,461]:[61,228,229,264,338,209,211,214];
 const wrappers=new Map(),bindings=[];
 for(const id of ids){
  const desc=animations.find(a=>a.index===id),wrapper=new T.Group();scene.add(wrapper);wrappers.set(id,wrapper);
  const child=new T.Object3D();child.position.copy(desc.center).add(new T.Vector3(0,1,0));wrapper.add(child);
  bindings.push({index:id,allowAmbiguousAxis:desc.axisCount>1,targets:[{wrapper,pivot:desc.center,axis:desc.axis}]});
 }
 const rig=createB777AnimationRig({scene,animations,bindings});
 assert.deepEqual(rig.indices,ids);const coverage=auditB777AnimationCoverage(variant,rig.indices);
 assert.ok(coverage.missing.gear.length>0);if(variant==='cargo')assert.ok(coverage.missing.mainCargoDoor.includes(210));
 const s=b777PropertiesFromState({gear:0,flaps:30,reverse:1,door:1,fgProperties:{'engines/engine[0]/rpm':20}},variant);
 rig.update(s,.01);
 const gear=wrappers.get(ids[0]);close(gear.quaternion.angleTo(new T.Quaternion().setFromAxisAngle(animations.find(a=>a.index===ids[0]).axis,110*Math.PI/180)),0,1e-7);
 const translate=wrappers.get(variant==='passenger'?343:229);close(translate.position.x,variant==='passenger'?.9:.430000002);
 const fan=wrappers.get(variant==='passenger'?461:338);close(fan.quaternion.angleTo(new T.Quaternion().setFromAxisAngle(new T.Vector3(-1,0,0),12*Math.PI/180)),0,1e-7);
 if(variant==='cargo'){
  const door=wrappers.get(209),desc=animations.find(a=>a.index===209);const q=new T.Quaternion().setFromAxisAngle(desc.axis,70*Math.PI/180);
  vecClose(door.position,desc.center.clone().sub(desc.center.clone().applyQuaternion(q)));
  close(wrappers.get(214).position.y,.02);
 }
 const before=gear.quaternion.clone();assert.throws(()=>rig.update({...s,'engines/engine[0]/rpm':NaN},.1),/Non-finite/);vecClose(new T.Vector3(gear.quaternion.x,gear.quaternion.y,gear.quaternion.z),new T.Vector3(before.x,before.y,before.z));
 rig.dispose();assert.equal(gear.position.lengthSq(),0);rig.dispose();assert.throws(()=>rig.update(s,0),/disposed/);
}
// Explicit nested stabilizer/elevator wrappers compose in parent space;
// applying a second update changes them from neutral, not cumulatively.
{
 const scene=new T.Group(),mount=new T.Group(),outer=new T.Group(),inner=new T.Group(),point=new T.Object3D();
 scene.add(mount);mount.position.set(3,4,-2);mount.rotation.y=.4;mount.add(outer);outer.add(inner);inner.add(point);point.position.set(2,0,1);
 const a=descriptions.cargo.find(x=>x.index===222),b=descriptions.cargo.find(x=>x.index===223);
 const rig=createB777AnimationRig({scene,animations:[a,b],bindings:[
  {index:222,targets:[{wrapper:outer,pivot:[1,0,0],axis:[0,1,0]}]},
  {index:223,allowAmbiguousAxis:true,targets:[{wrapper:inner,pivot:[0,0,1],axis:[1,0,0]}]},
 ]});
 const inputs={'fcs/stabilizer/final-deg':10,'fcs/left-elevator/final-deg':20};rig.update(inputs,0);scene.updateMatrixWorld(true);
 const q1=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-10*Math.PI/180),q2=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-20*Math.PI/180);
 const expected=point.position.clone().sub(new T.Vector3(0,0,1)).applyQuaternion(q2).add(new T.Vector3(0,0,1)).sub(new T.Vector3(1,0,0)).applyQuaternion(q1).add(new T.Vector3(1,0,0)).applyMatrix4(mount.matrixWorld);
 vecClose(point.getWorldPosition(new T.Vector3()),expected);rig.update(inputs,0);scene.updateMatrixWorld(true);vecClose(point.getWorldPosition(new T.Vector3()),expected);rig.dispose();
}
// Ambiguous XML axes and accidental wrapper reuse must not silently pass.
{
 const scene=new T.Group(),wrapper=new T.Group();scene.add(wrapper);const a=descriptions.passenger.find(x=>x.index===344);
 const target={wrapper,pivot:a.center,axis:a.axis};
 assert.throws(()=>createB777AnimationRig({scene,animations:[a],bindings:[{index:a.index,targets:[target]}]}),/multiple axes/);
 assert.throws(()=>createB777AnimationRig({scene,animations:[a],bindings:[{index:a.index,allowAmbiguousAxis:true,targets:[target,target]}]}),/reused/);
}

const tick=()=>new Promise(r=>setTimeout(r,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const bundles=[],leases=[];
function makeBundle(variant){
 const scene=new T.Group(),geo=new T.BoxGeometry(1,1,1),mat=new T.MeshStandardMaterial({color:0xdddddd});
 // The shared material tests that only the supplied passenger window gets an
 // overlay; these boxes are NOT aircraft geometry.
 const body=new T.Mesh(geo,mat),window=new T.Mesh(geo,mat);scene.add(body,window);
 const b={scene,model:B777_SOURCE[variant].model,sourceRevision:B777_SOURCE[variant].revision,
  contact:variant==='passenger'?5.2:5.6,dimensions:variant==='passenger'?[63.7,18.6,64.8]:[63.6,18.55,64.7],
  cabinWindows:variant==='passenger'?[{mesh:window,indices:[0]}]:[],body,window,baseMaterial:mat,disposed:0,updates:[],
  update(p,dt){this.updates.push([p,dt]);},dispose(){this.restored=this.window.material===mat;this.disposed++;geo.dispose();mat.dispose();}};
 bundles.push(b);return b;
}
function makeLease(){const l={disposed:0,dispose(){this.disposed++;}};leases.push(l);return l;}
let failure=true,gate=null;
const plane=new AccurateB777Research({timeoutMs:1000,
 geometryLoader:async({variant,source})=>{assert.equal(source,B777_SOURCE[variant]);if(failure){failure=false;throw Error('network');}if(gate)return gate.promise;return makeBundle(variant);},
 liveryLoader:async()=>makeLease()});
await assert.rejects(plane.load(),/network/);await plane.load();
const first=bundles.at(-1),firstLease=leases.at(-1);
assert.equal(plane.type,'b777');assert.equal(plane.contact,5.2);assert.deepEqual(plane.dimensions.toArray(),[63.7,18.6,64.8]);
const lamp=mesh=>mesh.children.find(o=>o.userData.role==='b777-cabin-window-light');
assert.equal(plane.animationCoverage,null);assert.equal(plane.native.children[0],first.scene);assert.equal(first.window.material,first.baseMaterial);assert.equal(first.body.material,first.baseMaterial);
assert.ok(lamp(first.window));assert.equal(lamp(first.window).visible,false);assert.equal(lamp(first.body),undefined);
plane.setCabinLights(true);assert.equal(lamp(first.window).visible,true);assert.equal(first.body.material.emissiveIntensity,1);
plane.setCabinLights(false);assert.equal(lamp(first.window).visible,false);plane.setCabinLights(true);
plane.update({gear:.25},.1);assert.equal(first.updates.at(-1)[0]['gear/gear[0]/position-norm'],.25);
assert.equal(await plane.setLivery('fedex'),true);
const cargo=bundles.at(-1),cargoLease=leases.at(-1);
assert.equal(first.disposed,1);assert.equal(first.restored,true);assert.equal(firstLease.disposed,1);
assert.equal(plane.contact,5.6);assert.deepEqual(plane.dimensions.toArray(),[63.6,18.55,64.7]);assert.equal(plane.native.children[0],cargo.scene);
const cargoMat=cargo.window.material;plane.setCabinLights(true);assert.equal(cargo.window.material,cargoMat);assert.equal(cargoMat.emissive.getHex(),0);
plane.update({door:1,mainCargoDoor:.5},.1);assert.equal(cargo.updates.at(-1)[0]['sim/multiplay/generic/float[52]'],.5);
assert.equal(await plane.setLivery('CCA'),true);assert.equal(cargo.disposed,1);assert.equal(cargoLease.disposed,1);
assert.equal(plane.contact,5.2);assert.deepEqual(plane.dimensions.toArray(),[63.7,18.6,64.8]);assert.equal(lamp(bundles.at(-1).window).visible,true);
const active=bundles.at(-1);
gate=deferred();const stale=plane.setLivery('fedex');assert.equal(await plane.setLivery('unknown'),false);assert.equal(await stale,false);
const late=makeBundle('cargo');gate.resolve(late);await tick();assert.equal(late.disposed,1);assert.equal(plane.native.children[0],active.scene);gate=null;
plane.geometryLoader=async()=>{const b=makeBundle('cargo');b.model='777-300F';return b;};
await assert.rejects(plane.setLivery('sf'),/model\/source mismatch/);assert.equal(bundles.at(-1).disposed,1);assert.equal(plane.contact,5.2);assert.equal(plane.native.children[0],active.scene);
plane.geometryLoader=async()=>{const b=makeBundle('cargo');b.cabinWindows=[{mesh:b.window,indices:[0]}];return b;};
await assert.rejects(plane.setLivery('sf'),/cabin window targets/);assert.equal(bundles.at(-1).disposed,1);
plane.geometryLoader=async({variant})=>makeBundle(variant);plane.liveryLoader=async()=>{throw Error('paint error');};
await assert.rejects(plane.setLivery('CSN'),/paint error/);assert.equal(bundles.at(-1).disposed,1);assert.equal(plane.livery,'CCA');
plane.dispose();plane.dispose();assert.equal(active.disposed,1);assert.equal(active.restored,true);assert.equal(plane.native.children.length,0);await assert.rejects(plane.setLivery('BOE'),/disposed/);

// Distinct caller-selected visual mappings are applied on each variant, with
// real FG property overrides taking precedence.
{
 const p=new AccurateB777Research({geometryLoader:async({variant})=>makeBundle(variant),liveryLoader:async()=>makeLease(),visualMappings:{passenger:gains,cargo:[{state:'rudder',property:'fcs/rudder/final-deg',gain:30,min:-1,max:1}]}});
 await p.load();p.update({aileron:.5},0);assert.equal(bundles.at(-1).updates.at(-1)[0]['fcs/right-out-aileron/final-deg'],-10);
 await p.setLivery('sf');p.update({rudder:.5},0);assert.equal(bundles.at(-1).updates.at(-1)[0]['fcs/rudder/final-deg'],15);p.dispose();
}

// Candidate-converter fgName/sourceMaterial contract, including multi-primitive
// node nesting, must not mistake cockpit glass or cargo hublot for windows.
{
 const scene=new T.Group(),group=new T.Group(),geo=new T.BoxGeometry(),m=new T.MeshStandardMaterial(),other=new T.MeshStandardMaterial();
 m.userData.sourceMaterial=7;group.userData.fgName='glassehublot';scene.add(group);const mesh=new T.Mesh(geo,[other,m]);group.add(mesh);
 const cockpit=new T.Mesh(geo,m);cockpit.userData.fgName='windshield';scene.add(cockpit);
 const found=findB777PassengerWindows(scene);assert.equal(found.length,1);assert.equal(found[0].mesh,mesh);assert.deepEqual(found[0].indices,[1]);
 group.userData.fgName='hublot';assert.throws(()=>findB777PassengerWindows(scene),/not found/);geo.dispose();m.dispose();other.dispose();
}

// Actual geometry/slot isolation, day/night visibility and material disposal.
{
 const scene=new T.Group(),geo=new T.BoxGeometry(),windowMat=new T.MeshStandardMaterial(),otherMat=new T.MeshStandardMaterial();
 const mesh=new T.Mesh(geo,[otherMat,windowMat]);scene.add(mesh);
 const lights=createB777CabinLighting(scene,[{mesh,indices:[1]}]),overlay=lamp(mesh);let disposed=0,geometryDisposed=0;
 overlay.material[1].addEventListener('dispose',()=>disposed++);geo.addEventListener('dispose',()=>geometryDisposed++);
 assert.equal(overlay.visible,false);assert.equal(overlay.geometry,geo);assert.equal(overlay.material[0].visible,false);
 assert.equal(mesh.material[0],otherMat);assert.equal(mesh.material[1],windowMat);lights.set(true);assert.equal(overlay.visible,true);assert.equal(windowMat.emissive.getHex(),0);
 lights.set(false);assert.equal(overlay.visible,false);lights.dispose();lights.dispose();assert.equal(lamp(mesh),undefined);assert.equal(disposed,1);assert.equal(geometryDisposed,0);
 assert.throws(()=>createB777CabinLighting(scene,[{mesh,indices:[2]}]),/material index/);assert.equal(mesh.material[1],windowMat);
 geo.dispose();windowMat.dispose();otherMat.dispose();
}
const slow=deferred();let signal;
const timed=new AccurateB777Research({timeoutMs:20,geometryLoader:({signal:s})=>{signal=s;return slow.promise;},liveryLoader:async()=>makeLease()});
await assert.rejects(timed.load(),/timed out/);assert.equal(signal.aborted,true);
const timedLate=makeBundle('passenger');slow.resolve(timedLate);await tick();assert.equal(timedLate.disposed,1);
timed.geometryLoader=async({variant})=>makeBundle(variant);await timed.load();timed.dispose();
const racing=deferred();let count=0;
const racePlane=new AccurateB777Research({geometryLoader:async({variant})=>++count===2?racing.promise:makeBundle(variant),liveryLoader:async()=>makeLease()});
await racePlane.load();const losing=racePlane.setLivery('CCA');assert.equal(await racePlane.setLivery('sf'),true);assert.equal(await losing,false);
const lost=makeBundle('passenger');racing.resolve(lost);await tick();assert.equal(lost.disposed,1);assert.equal(racePlane.livery,'sf');racePlane.dispose();
const errs=new AccurateB777Research({geometryLoader:async({variant})=>makeBundle(variant),liveryLoader:async()=>makeLease()});
await errs.load();errs._current.lease.dispose=()=>{throw Error('release');};assert.equal(await errs.setLivery('CCA'),true);assert.equal(errs.releaseErrors.length,1);errs.dispose();
const paintGate=deferred();let paintStarted;const started=new Promise(r=>{paintStarted=r;});
const p2=new AccurateB777Research({timeoutMs:20,geometryLoader:async({variant})=>makeBundle(variant),liveryLoader:()=>{paintStarted();return paintGate.promise;}});
const pending=p2.load();await started;const painting=bundles.at(-1);await assert.rejects(pending,/timed out/);assert.equal(painting.disposed,0);
const paintLate=makeLease();paintGate.resolve(paintLate);await tick();assert.equal(paintLate.disposed,1);assert.equal(painting.disposed,1);p2.dispose();
// Airline changes on the same airframe repaint in place; only a passenger ↔
// freighter change may load another large model. Cabin time follows the variant.
{
 let loads=0,paints=0,disposed=0;
 const p=new AccurateB777Research({geometryLoader:async({variant})=>{loads++;return makeBundle(variant);},
  liveryLoader:async()=>({async setLivery(){paints++;return true;},dispose(){disposed++;}})});
 await p.load();const passenger=p.native.children[0];
 assert.equal(await p.setLivery('BOE'),true);assert.equal(loads,1);assert.equal(paints,0,'reselecting current paint must not reload');
 assert.equal(await p.setLivery('CCA'),true);assert.equal(p.native.children[0],passenger);assert.equal(loads,1);assert.equal(paints,1);
 p.setCabinTime('night');assert.equal(p._night,true);assert.equal(p.cargoMode,false);
 assert.equal(await p.setLivery('fedex'),true);assert.equal(loads,2);assert.equal(disposed,1);assert.equal(p.cargoMode,true);
 const freighter=p.native.children[0];assert.equal(await p.setLivery('sf'),true);assert.equal(p.native.children[0],freighter);assert.equal(loads,2);assert.equal(paints,2);
 p.setCabinTime('day');assert.equal(p._night,false);p.dispose();assert.equal(disposed,2);
}
console.log('accurate-b777 200LR/200F runtime: OK');
