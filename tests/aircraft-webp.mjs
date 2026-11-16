// Runtime GLBs must use EXT_texture_webp and preserve the meshopt decoder contract.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const paths=[...['fuselage','wings','nose','wing-left','wing-right','body-left','body-right'].map(n=>`a380/${n}.glb`),
 'accurate-b777/777-200LR-2048.candidate.glb','accurate-b777/777-200F-refined.candidate.glb'];
for(const path of paths){
 const bytes=await readFile(new URL('../assets/'+path,import.meta.url));
 const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength));
 assert.equal(bytes.readUInt32LE(8),bytes.length,path);
 for(const ext of ['EXT_texture_webp','EXT_meshopt_compression','KHR_mesh_quantization']){
  assert(json.extensionsUsed.includes(ext),`${path}: used ${ext}`);
  assert(json.extensionsRequired.includes(ext),`${path}: required ${ext}`);
 }
 assert(json.images.length>0&&json.textures.length>0,path);
 const binStart=20+jsonLength+8;
 for(const image of json.images){
  assert.equal(image.mimeType,'image/webp',path);assert.equal(image.uri,undefined,path);
  const view=json.bufferViews[image.bufferView],start=binStart+(view.byteOffset??0);
  assert.equal(bytes.toString('ascii',start,start+4),'RIFF',path);
  assert.equal(bytes.toString('ascii',start+8,start+12),'WEBP',path);
 }
 for(const texture of json.textures){
  assert.equal(texture.source,undefined,`${path}: no invalid core WebP source`);
  assert(json.images[texture.extensions?.EXT_texture_webp?.source],`${path}: valid WebP source`);
 }
}
console.log('A380/777 GLBs: WebP extension, image signatures and meshopt declarations passed.');
