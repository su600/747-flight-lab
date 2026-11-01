// Livery asset and asynchronous switching regression checks. Run with: npm run check:liveries
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';

// Exercise the real Aircraft switching logic without a browser or network.
const requests=[];
THREE.TextureLoader.prototype.load=function(url,onLoad,_onProgress,onError){
 const texture=new THREE.Texture();
 requests.push({url,texture,onLoad,onError});
 return texture;
};
const {Aircraft,LIVERIES}=await import('../src/aircraft.js');
const ids=LIVERIES.map(livery=>livery.id);
assert.equal(new Set(ids).size,ids.length,'livery IDs must be unique');
for(const id of ['BOE','CCA','CEA','CSN','CHH','UAE','BAW','KLM','DLH','DLH100','AF1_CLASSIC','AF1_2026'])assert(ids.includes(id),`missing livery ${id}`);
for(const {id,name,en,color,symbol,logo} of LIVERIES){
 assert(name&&en&&color&&symbol&&/^[a-z-]+\.png$/.test(logo),`missing or invalid card metadata: ${id}`);
 const logoImage=await readFile(new URL(`../assets/livery-logos/${logo}`,import.meta.url));
 assert.equal(logoImage.subarray(0,8).toString('hex'),'89504e470d0a1a0a',`${id}: invalid logo PNG`);
 assert(logoImage.readUInt32BE(16)>0&&logoImage.readUInt32BE(20)>0,`${id}: empty logo`);
 const png=await readFile(new URL(`../assets/aircraft/${id}.png`,import.meta.url));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a',`${id}: invalid PNG`);
 assert.equal(png.readUInt32BE(16),4096,`${id}: incorrect atlas width`);
 assert.equal(png.readUInt32BE(20),1024,`${id}: incorrect atlas height`);
}
const aircraft=new Aircraft();
const material={};aircraft.liveryMats=[material];
const first=aircraft.setLivery('CEA');
const second=aircraft.setLivery('CSN');
const cea=requests.find(r=>r.url.endsWith('/CEA.png'));
const csn=requests.find(r=>r.url.endsWith('/CSN.png'));
csn.texture.image={naturalWidth:4096};csn.onLoad(csn.texture);
assert.equal(await second,true);assert.equal(aircraft.livery,'CSN');assert.equal(material.map,csn.texture);
cea.texture.image={naturalWidth:4096};cea.onLoad(cea.texture);
assert.equal(await first,false);assert.equal(aircraft.livery,'CSN');assert.equal(material.map,csn.texture,'stale load must not overwrite latest selection');
assert.equal(await aircraft.setLivery('NOT_A_LIVERY'),false);
const failed=aircraft.setLivery('AF1_2026');
requests.at(-1).onError(new Error('network error'));
await assert.rejects(failed,/载入失败/);
assert.equal(aircraft.livery,'CSN','failed load must preserve current livery');
const retry=aircraft.setLivery('AF1_2026');
requests.at(-1).texture.image={naturalWidth:4096};requests.at(-1).onLoad(requests.at(-1).texture);
assert.equal(await retry,true);assert.equal(aircraft.livery,'AF1_2026');
console.log(`Livery checks passed: ${ids.length} atlases and logos, last selection wins, load errors and retry.`);
