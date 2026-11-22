// Real AC geometry and adapter contract; no browser, network or GPU required.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as T from 'three';
import {ConcordeAircraft,CONCORDE_ASSETS} from '../src/concorde-aircraft.js';

const originalLoad=T.TextureLoader.prototype.load,originalFetch=globalThis.fetch;
const deferred=[];let delayAF=false,requests=[];
T.TextureLoader.prototype.load=function(url,onLoad){
 requests.push(url);const texture=new T.Texture({width:1024,height:1024});
 const complete=()=>onLoad?.(texture);
 if(url.endsWith('/AF.png')&&delayAF)deferred.push(complete);else queueMicrotask(complete);
 return texture;
};
globalThis.fetch=async url=>({ok:true,status:200,text:()=>readFile(new URL('..'+url,import.meta.url),'utf8')});
let craft,initial;
try{
 assert.equal(CONCORDE_ASSETS.length,4);
 const total=(await Promise.all(CONCORDE_ASSETS.map(url=>stat(new URL('..'+url,import.meta.url))))).reduce((n,s)=>n+s.size,0);
 assert(total<7*1024*1024,`runtime assets too large: ${total}`);
 craft=await new ConcordeAircraft().load();
 assert.equal(craft.type,'concorde');assert.equal(craft.livery,'CONCORDE_BAW');
 assert(craft.dimensions.x>61&&craft.dimensions.x<63);assert(craft.dimensions.z>24&&craft.dimensions.z<26);
 assert(craft.contact>3.9&&craft.contact<4.2);
 assert.equal(craft.enginePoints.length,4);assert.equal(craft.wingtipPoints.length,2);
 assert.equal(craft.paintMaterials.length,6);
 assert(!requests.some(url=>/fx\.png|cockpit-textures/.test(url)),'unneeded textures requested');
 const box=name=>new T.Box3().setFromObject(craft.model.getObjectByName(name));
 craft.update({gear:1,concordeNose:0,concordeVisor:1},0);craft.root.updateMatrixWorld(true);
 const noseUp=box('Nose_0').getCenter(new T.Vector3()),visorUp=box('Screen_0').getCenter(new T.Vector3());
 craft.update({gear:1,concordeNose:12.5,concordeVisor:1},0);craft.root.updateMatrixWorld(true);
 const noseDown=box('Nose_0').getCenter(new T.Vector3());
 assert(noseDown.y<noseUp.y-1.6,'nose tip must droop');
 assert(Math.abs(craft.nose.quaternion.angleTo(new T.Quaternion())-12.5*Math.PI/180)<1e-8);
 craft.update({gear:1,concordeNose:0,concordeVisor:0},0);craft.root.updateMatrixWorld(true);
 const visorDown=box('Screen_0').getCenter(new T.Vector3());
 assert(visorDown.distanceTo(visorUp)>.3,'visor must retract');
 craft.update({gear:1,concordeNose:5},0);assert(craft.visor.quaternion.angleTo(new T.Quaternion())>0,'visor defaults down for drooped nose');
 craft.update({gear:0,concordeNose:0},0);
 assert(!craft.frontGear.visible&&!craft.mainGear[0].visible&&!craft.mainGear[1].visible);
 assert(Math.abs(craft.frontGear.quaternion.angleTo(new T.Quaternion())-97*Math.PI/180)<1e-8);
 craft.update({gear:.5,concordeNose:0},0);
 assert(craft.frontGear.visible);assert(craft.doors[2].object.quaternion.angleTo(new T.Quaternion())>1);
 craft.update({gear:1,elevator:1,aileron:.4,rudder:1,onGround:true,speed:30},.1);
 assert(craft.mainGear.every(g=>g.visible));assert(craft.rudder.quaternion.angleTo(new T.Quaternion())>.5);
 assert(craft.elevons.every(e=>e.outer.quaternion.angleTo(new T.Quaternion())>.1));
 assert(craft.wheels.every(w=>w.object.quaternion.angleTo(new T.Quaternion())>.1));
 craft.update({gear:1,mach:0,reverse:0},0);
 const nozzleNeutral=craft.nozzles[0].top.quaternion.angleTo(new T.Quaternion());
 assert(Math.abs(nozzleNeutral-14.5*Math.PI/180)<1e-8);
 craft.update({gear:1,mach:0,reverse:1},0);
 assert(craft.nozzles.every(n=>Math.abs(n.top.quaternion.angleTo(new T.Quaternion())-40.5*Math.PI/180)<1e-8));
 assert(craft.nozzles[0].top.quaternion.z*craft.nozzles[0].bottom.quaternion.z<0,'bucket halves rotate in opposite directions');
 craft.update({gear:1,mach:1.1,reverse:0},0);
 assert(Math.abs(craft.nozzles[0].top.quaternion.angleTo(new T.Quaternion())-4*Math.PI/180)<1e-8);
 assert.equal(await craft.setLivery('BOE'),false);
 const baw=craft.paintMaterials[0].map;
 assert(await craft.setLivery('CONCORDE_AFR'));assert.equal(craft.livery,'CONCORDE_AFR');
 assert(craft.paintMaterials.every(m=>m.map===craft.afTexture));assert.notEqual(craft.afTexture,baw);
 assert(await craft.setLivery('CONCORDE_BAW'));assert(craft.paintMaterials.every(m=>m.map===baw));
 // A late AF callback must not overwrite a newer BA selection.
 delayAF=true;const pending=craft.setLivery('CONCORDE_AFR');
 assert(await craft.setLivery('CONCORDE_BAW'));assert.equal(deferred.length,1);deferred.shift()();
 assert.equal(await pending,false);assert.equal(craft.livery,'CONCORDE_BAW');assert(craft.paintMaterials.every(m=>m.map===baw));
 delayAF=false;initial=await new ConcordeAircraft({initialLivery:'CONCORDE_AFR'}).load();
 assert.equal(initial.livery,'CONCORDE_AFR');assert(initial.paintMaterials.every(m=>m.map===initial.afTexture));
 const count=requests.filter(u=>u.endsWith('/AF.png')).length;
 assert(await initial.setLivery('CONCORDE_AFR'));assert.equal(requests.filter(u=>u.endsWith('/AF.png')).length,count,'same livery should not refetch');
 craft.dispose();assert.equal(await craft.setLivery('NOPE'),false);
 await assert.rejects(()=>craft.setLivery('CONCORDE_BAW'),/not ready/);
 console.log(`Concorde adapter passed: real AC geometry, ${total} bytes, nose/visor/gear/elevon/rudder/wheels/reverse, airline paints and stale-load cancellation.`);
}finally{
 craft?.dispose();initial?.dispose();T.TextureLoader.prototype.load=originalLoad;globalThis.fetch=originalFetch;
}
