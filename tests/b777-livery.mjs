import assert from 'node:assert/strict';
import * as T from 'three';
import {LIVERIES} from '../src/aircraft.js';
import {B777_LIVERY_IDS, b777LiveryVariant, createB777LiveryController, createB777LiveryLoader} from '../src/b777-livery.js';

const sourceName = 'Liveries-F/AFR1blanc.png';
const manifest = id => ({id, variant:b777LiveryVariant(id), maps:[{sourceTexture:sourceName, url:`/${id}.png`}]});
function fixture(variant='cargo') {
 const scene = new T.Group();
 const mesh = (name, material, role) => {
  const o = new T.Mesh(new T.BoxGeometry(), material); o.userData.fgName = name;
  if (role) o.userData.role = role; scene.add(o); return o;
 };
 const base = new T.Texture(); base.flipY = false; base.wrapS = T.RepeatWrapping;
 base.offset.set(.2,.3); base.repeat.set(.4,.5); base.colorSpace = T.SRGBColorSpace;
 const material = new T.MeshStandardMaterial({map:base}); material.userData.sourceTexture = variant === 'cargo' ? sourceName : 'Liveries-200LR/AFR1blanc.png';
 const hull = mesh('Fuselage', material);
 const other = new T.MeshStandardMaterial();
 const glass = mesh('cockpit-glass', other);
 const door = mesh('entry11l', material);
 const seal = mesh('hublot', material, variant === 'cargo' ? 'cargo-window-seal' : undefined);
 if (variant === 'passenger') mesh('glassehublot', other);
 return {scene, material, base, hull, door, seal, glass, other};
}
function textureLease() {
 const texture = new T.Texture({}); let releases = 0;
 return {texture, dispose(){releases++; texture.dispose();}, get releases(){return releases;}};
}
const tick = () => new Promise(resolve => setTimeout(resolve,0));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

assert.deepEqual(B777_LIVERY_IDS, LIVERIES.filter(x=>!x.embedded).map(x=>x.id));
assert.equal(B777_LIVERY_IDS.length, 14);
for (const id of B777_LIVERY_IDS) assert.equal(b777LiveryVariant(id), ['fedex','sf'].includes(id)?'cargo':'passenger');
assert.throws(()=>b777LiveryVariant('777-300F'));
{
 const f=fixture(), leases=[];
 const paint=createB777LiveryController(f.scene,{variant:'cargo',manifestFor:({id})=>manifest(id),loadTexture:()=>{const l=textureLease();leases.push(l);return l;}});
 assert.equal(await paint.setLivery('fedex'),true);
 assert.notEqual(f.hull.material, f.material); assert.equal(f.hull.material,f.door.material);
 assert.equal(f.hull.material,f.seal.material); assert.equal(f.glass.material,f.other);
 assert.equal(f.seal.visible,true); assert.equal(f.door.visible,true);
 assert.equal(f.hull.material.map.flipY,false); assert.equal(f.hull.material.map.wrapS,T.RepeatWrapping);
 assert.equal(f.hull.material.map.colorSpace,T.SRGBColorSpace);
 assert.deepEqual(f.hull.material.map.offset.toArray(),[.2,.3]);
 assert.notEqual(f.hull.material.map,leases[0].texture); assert.equal(f.material.map,f.base);
 let cloneDisposals=0, mapDisposals=0;
 f.hull.material.addEventListener('dispose',()=>cloneDisposals++);
 f.hull.material.map.addEventListener('dispose',()=>mapDisposals++);
 assert.equal(await paint.setLivery('sf'),true);
 assert.equal(cloneDisposals,1); assert.equal(mapDisposals,1); assert.equal(leases[0].releases,1);
 assert.equal(paint.livery,'sf');
 const current=f.hull.material;
 await assert.rejects(paint.setLivery('CCA'),/different aircraft variant/);
 assert.equal(f.hull.material,current);
 paint.dispose();paint.dispose();assert.equal(f.hull.material,f.material);assert.equal(f.door.material,f.material);
 assert.equal(f.seal.material,f.material);assert.equal(leases[1].releases,1);assert.equal(f.base.version,0);
 await assert.rejects(paint.setLivery('sf'),/disposed/);
}
// Latest request wins even when a provider completely ignores abort.
{
 const f=fixture(), wait=deferred(), late=textureLease(), next=textureLease();let n=0;
 const paint=createB777LiveryController(f.scene,{variant:'cargo',manifestFor:({id})=>manifest(id),loadTexture:()=>++n===1?wait.promise:next});
 const first=paint.setLivery('fedex'); await tick();
 assert.equal(await paint.setLivery('sf'),true);assert.equal(await first,false);
 const selected=f.hull.material;wait.resolve(late);await tick();
 assert.equal(late.releases,1);assert.equal(f.hull.material,selected);assert.equal(paint.livery,'sf');
 paint.dispose();assert.equal(next.releases,1);
}
// An invalid request and disposal cancel pending work, including late arrivals.
{
 const f=fixture(), wait=deferred(), late=textureLease();
 const paint=createB777LiveryController(f.scene,{variant:'cargo',manifestFor:({id})=>manifest(id),loadTexture:()=>wait.promise});
 const p=paint.setLivery('fedex');await tick();await assert.rejects(paint.setLivery('bogus'),/Unknown/);assert.equal(await p,false);
 paint.dispose();wait.resolve(late);await tick();assert.equal(late.releases,1);assert.equal(f.hull.material,f.material);
}
{
 const f=fixture(), wait=deferred(), late=textureLease();
 const paint=createB777LiveryController(f.scene,{variant:'cargo',manifestFor:({id})=>manifest(id),loadTexture:()=>wait.promise,timeoutMs:10});
 await assert.rejects(paint.setLivery('fedex'),e=>e.name==='TimeoutError');
 wait.resolve(late);await tick();assert.equal(late.releases,1);paint.dispose();
}
{
 const f=fixture(), ac=new AbortController(), wait=deferred(), late=textureLease();
 const paint=createB777LiveryController(f.scene,{variant:'cargo',manifestFor:({id})=>manifest(id),loadTexture:()=>wait.promise});
 const p=paint.setLivery('fedex',{signal:ac.signal});await tick();ac.abort();assert.equal(await p,false);
 wait.resolve(late);await tick();assert.equal(late.releases,1);paint.dispose();
}
// Failure never changes the previous paint, even after partial atlas loading.
{
 const f=fixture(), first=textureLease(), partial=textureLease();let mode=0,n=0;
 const paint=createB777LiveryController(f.scene,{variant:'cargo',manifestFor:({id})=> mode ? {id,variant:'cargo',maps:[{sourceTexture:sourceName,url:'/a'}, {sourceTexture:'Liveries-F/other.png',url:'/b'}]} : manifest(id),loadTexture:()=>++n===1?first:partial});
 await paint.setLivery('fedex');const selected=f.hull.material;
 mode=1;await assert.rejects(paint.setLivery('sf'),/target not found/);assert.equal(f.hull.material,selected);assert.equal(n,1);
 mode=0;f.hull.material=new T.MeshStandardMaterial();
 await assert.rejects(paint.setLivery('sf'),/ownership conflict/);assert.equal(partial.releases,1);
 const external=f.hull.material;paint.dispose();assert.equal(f.hull.material,external);assert.equal(first.releases,1);
}
{
 const f=fixture();let releases=0;
 const paint=createB777LiveryController(f.scene,{variant:'cargo',manifestFor:({id})=>manifest(id),loadTexture:()=>({texture:f.base,dispose(){releases++;}})});
 await assert.rejects(paint.setLivery('fedex'),/shared map/);assert.equal(releases,0);assert.equal(f.hull.material,f.material);paint.dispose();
}
{
 const f=fixture();const missing=createB777LiveryController(f.scene,{variant:'cargo',manifestFor:()=>null,loadTexture:()=>{throw Error('should not load');}});
 await assert.rejects(missing.setLivery('fedex'),/No B777 cargo atlas/);missing.dispose();
 assert.throws(()=>createB777LiveryController(f.scene,{variant:'passenger',manifestFor:()=>{},loadTexture:()=>{}}),/source texture directory/);
 const p=fixture('passenger');assert.throws(()=>createB777LiveryController(p.scene,{variant:'cargo',manifestFor:()=>{},loadTexture:()=>{}}),/source texture directory/);
}
// Passenger atlas application leaves the explicit cabin and cockpit windows alone.
{
 const f=fixture('passenger'), l=textureLease();let cabin;
 f.scene.traverse(o=>{if(o.userData.fgName==='glassehublot')cabin=o;});
 const paint=createB777LiveryController(f.scene,{variant:'passenger',
  manifestFor:({id})=>({id,variant:'passenger',maps:[{sourceTexture:'Liveries-200LR/AFR1blanc.png',url:'/fixture'}]}),loadTexture:()=>l});
 await paint.setLivery('CCA');assert.equal(cabin.material,f.other);assert.equal(f.glass.material,f.other);
 paint.dispose();assert.equal(l.releases,1);
}
// All targeted slots of an array are cloned; untouched slots retain identity.
{
 const f=fixture(), l=textureLease();const untouched=new T.MeshBasicMaterial();
 f.hull.material=[f.material,untouched];
 const original=f.hull.material;
 const paint=createB777LiveryController(f.scene,{variant:'cargo',manifestFor:({id})=>manifest(id),loadTexture:()=>l});
 await paint.setLivery('sf');assert.notEqual(f.hull.material,original);assert.equal(f.hull.material[1],untouched);
 paint.dispose();assert.equal(f.hull.material,original);assert.equal(l.releases,1);
}
{
 const f=fixture(), l=textureLease();
 const loader=createB777LiveryLoader({manifestFor:({id})=>manifest(id),loadTexture:()=>l});
 const lease=await loader({bundle:{scene:f.scene},livery:{id:'fedex'},variant:'cargo'});
 assert.equal(lease.livery,'fedex');lease.dispose();assert.equal(l.releases,1);assert.equal(f.hull.material,f.material);
}
console.log('b777-livery: catalog, isolation, atlas lifecycle, cancellation and ownership checks passed');
