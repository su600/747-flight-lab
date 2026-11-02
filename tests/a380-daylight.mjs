// CPU regression for actual A380 GLBs, material lighting and face winding.
// Run: node tests/a380-daylight.mjs (no browser, GPU, external network or deployment).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {A380Aircraft} from '../src/a380-aircraft.js';

globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,props){this.type=type;Object.assign(this,props);}};
const fetchImpl=async url=>{
 const data=await readFile(new URL('../assets/a380/'+url.split('/').pop(),import.meta.url));
 return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
};
const craft=await new A380Aircraft({fetchImpl}).load();craft.root.updateMatrixWorld(true);
const hull=[];const fuselage=craft.root.getObjectByName('MAIN_FUSELAGE');assert(fuselage);
fuselage.traverse(o=>{if(o.isMesh&&/^A380X_FUSE[123]$/.test(o.material?.name))hull.push(o);});
assert.equal(hull.length,3);
const surfaces=[];craft.root.traverse(o=>{if(o.isMesh&&!o.name.startsWith('livery-')&&/^A380(?:X_FUSE[1-5]|_EXTERIOR_WING[12])/.test(o.material?.name||''))surfaces.push(o);});
assert(surfaces.length>100);
for(const o of surfaces){
 const m=o.material;assert(m.isMeshStandardMaterial,`${m.name} must receive scene-environment illumination`);
 assert.equal(m.emissive.getHex(),0,`${m.name} must not self-illuminate at night`);
 assert.equal(m.envMap,null,`${m.name} must use the active world environment`);
 assert.equal(o.castShadow,true);assert.equal(o.receiveShadow,true);
 if(m.map)assert.equal(m.map.colorSpace,T.SRGBColorSpace);
}
// All five sample points must see outward-facing hull normals from above and
// from the right, while preserving the original skinned geometry.
const ray=new T.Raycaster(),normalMatrix=new T.Matrix3();
for(const x of [-25,-15,0,15,25])for(const side of ['top','right']){
 const origin=side==='top'?new T.Vector3(x,20,0):new T.Vector3(x,-4,20),direction=side==='top'?new T.Vector3(0,-1,0):new T.Vector3(0,0,-1);
 ray.set(origin,direction);const hit=ray.intersectObjects(hull,false)[0];assert(hit,`hull hit ${x} ${side}`);
 const normal=hit.face.normal.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld));
 assert(normal.dot(direction)<-.7,`outward surface normal ${x} ${side}`);
}
assert(craft.bindings.some(b=>b.control==='aileron'));assert(craft.bindings.some(b=>b.control==='door'));
craft.dispose();
console.log(`A380 daylight regression passed: ${surfaces.length} PBR surfaces use world environment, no paint emission, shadows retained and skinned hull winding outward.`);
