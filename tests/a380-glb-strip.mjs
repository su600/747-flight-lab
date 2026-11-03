// CPU regression: dropping unused A380 map references must not touch geometry
// or base-colour maps, and must not fetch normal/emissive/occlusion textures.
// Run: node tests/a380-glb-strip.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {keepBaseColorMapsOnly} from '../src/a380-aircraft.js';

for (const part of ['fuselage','wings','nose','wing-left','wing-right','body-left','body-right']) {
 const raw=await readFile(new URL(`../assets/a380/${part}.glb`,import.meta.url));
 const input=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
 const output=keepBaseColorMapsOnly(input);
 const rawView=new DataView(input),outView=new DataView(output);
 assert.equal(outView.getUint32(0,true),0x46546C67,`${part}: glTF magic kept`);
 assert.equal(outView.getUint32(8,true),output.byteLength,`${part}: header length matches`);
 assert.equal(outView.getUint32(12,true)%4,0,`${part}: JSON chunk is 4-byte aligned`);
 const rawJsonLen=rawView.getUint32(12,true),outJsonLen=outView.getUint32(12,true);
 const rawJson=JSON.parse(new TextDecoder().decode(new Uint8Array(input,20,rawJsonLen)));
 const outJson=JSON.parse(new TextDecoder().decode(new Uint8Array(output,20,outJsonLen)));
 for (const [i,material] of (outJson.materials||[]).entries()) {
  assert.equal(material.normalTexture,undefined,`${part}: normal map reference removed`);
  assert.equal(material.emissiveTexture,undefined,`${part}: emissive map reference removed`);
  assert.equal(material.occlusionTexture,undefined,`${part}: occlusion map reference removed`);
  assert.deepEqual(material.pbrMetallicRoughness?.baseColorTexture,rawJson.materials[i].pbrMetallicRoughness?.baseColorTexture,`${part}: base colour map kept`);
 }
 assert.deepEqual(outJson.meshes,rawJson.meshes,`${part}: mesh and primitive definitions unchanged`);
 assert.deepEqual(outJson.accessors,rawJson.accessors,`${part}: accessors unchanged`);
 assert.deepEqual(outJson.bufferViews,rawJson.bufferViews,`${part}: buffer views unchanged`);
 const rawBin=new Uint8Array(input,20+rawJsonLen),outBin=new Uint8Array(output,20+outJsonLen);
 assert.equal(Buffer.compare(Buffer.from(rawBin),Buffer.from(outBin)),0,`${part}: binary chunk byte-identical`);
}
console.log('A380 GLB strip passed: normal, emissive and occlusion maps are not requested; geometry and base-colour maps are unchanged.');
