// Slow-link timeout defaults and fast, simulated timeout overrides.
// Run: node tests/slow-load-timeouts.mjs
import assert from 'node:assert/strict';
import * as T from 'three';
import {Aircraft} from '../src/aircraft.js';
import {AccurateA330,waitForA330Textures} from '../src/accurate-a330.js';

// The 747 livery deadline covers a 1.27 MiB file at roughly 117 KB/s, while
// constructor injection keeps timeout/error/retry paths fast in tests.
assert.equal(new Aircraft().liveryTimeoutMs,60000);
assert.equal(new AccurateA330().resourceTimeoutMs,120000);
assert.equal(new AccurateA330().textureTimeoutMs,120000);

const originalLoad=T.TextureLoader.prototype.load;
try{
 const aircraft=new Aircraft({liveryTimeoutMs:15});aircraft.liveryMats=[{needsUpdate:false}];
 let attempt=0;
 T.TextureLoader.prototype.load=function(_url,onLoad){
  const texture=new T.Texture();
  if(++attempt===1)return texture; // Simulate a stalled/expired transfer.
  queueMicrotask(()=>{texture.image={width:2048,height:1024};onLoad(texture);});
  return texture;
 };
 await assert.rejects(aircraft.setLivery('KLM'),/超时/);
 assert.equal(attempt,1);
 assert.equal(await aircraft.setLivery('KLM'),true,'timed-out livery can be retried');
 assert.equal(attempt,2);assert.equal(aircraft.livery,'KLM');assert(aircraft.liveryMats[0].map);

 // A superseded 747 request must expire harmlessly, without replacing the
 // newer paint or turning its eventual timeout into a visible error.
 let staleOnLoad;
 T.TextureLoader.prototype.load=function(url,onLoad){
  const texture=new T.Texture();
  if(url.endsWith('BAW.png'))staleOnLoad=()=>onLoad(texture);
  else queueMicrotask(()=>{texture.image={width:2048,height:1024};onLoad(texture);});
  return texture;
 };
 const stale=aircraft.setLivery('BAW');
 await Promise.resolve();
 assert.equal(await aircraft.setLivery('BOE'),true);
 assert.equal(await stale,false); // Superseded timeout resolves harmlessly.
 staleOnLoad(); // A response arriving after expiry cannot alter the chosen livery.
 assert.equal(aircraft.livery,'BOE');
}finally{T.TextureLoader.prototype.load=originalLoad;}

// Inject a tiny model deadline; verify its fetches are aborted rather than
// waiting for the production 120-second default.
{
 const originalFetch=globalThis.fetch;let aborted=false;
 globalThis.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>{
  signal.addEventListener('abort',()=>{aborted=true;reject(Error('simulated abort'));},{once:true});
 });
 try{
  const aircraft=new AccurateA330({resourceTimeoutMs:15,textureTimeoutMs:15});
  await assert.rejects(aircraft.load(),/超时/);
  assert(aborted,'resource deadline aborts outstanding fetches');
  assert(aircraft.disposed,'partial model is released after load failure');
 }finally{globalThis.fetch=originalFetch;}
}

// Exercise the injectable texture-wait deadline using all expected bindings,
// but leave their decoded images unavailable to simulate a very slow link.
{
 const aircraft=new AccurateA330({textureTimeoutMs:15}),root=new T.Group(),owned=[];
 for(const name of ['323_blank.png','303_blank.png','landing-gears.png','pw_extra.png','windshield_pane.png','windshield.png','wings_main.png','wings_tail.png','ge_extra.png','ge_fan.png','pw_inside.png']){
  const geometry=new T.BufferGeometry(),texture=new T.Texture(),material=new T.MeshBasicMaterial({map:texture});
  const mesh=new T.Mesh(geometry,material);mesh.userData.texture=name;root.add(mesh);owned.push({geometry,material,texture});
 }
 await assert.rejects(waitForA330Textures(root,aircraft.textureTimeoutMs),/textures failed or timed out/);
 for(const {geometry,material,texture} of owned){geometry.dispose();material.dispose();texture.dispose();}
}

console.log('Slow-load timeouts passed: 747 60s/A330 120s defaults, injected fast deadlines, retry, stale response, abort and cleanup.');
