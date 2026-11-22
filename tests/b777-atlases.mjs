// Verify every 777 passenger/freighter livery resolves to a valid local WebP.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LIVERIES} from '../src/aircraft.js';
import {b777CargoManifest,b777LiveryVariant,B777_CARGO_LIVERY_INFO} from '../src/b777-livery.js';
import {b777PassengerManifest,B777_PASSENGER_LIVERY_INFO} from '../src/b777-passenger-liveries.js';
import {realityFor} from '../src/livery-reality.js';

function dimensions(data){
 assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
 assert.equal(data.readUInt32LE(4)+8,data.length,'WebP container length');
 let offset=12;
 while(offset+8<=data.length){
  const kind=data.toString('ascii',offset,offset+4),size=data.readUInt32LE(offset+4),start=offset+8;
  assert(start+size<=data.length,'truncated WebP chunk');
  if(kind==='VP8 '){
   assert(size>=10&&data[start+3]===0x9d&&data[start+4]===0x01&&data[start+5]===0x2a,'invalid VP8 frame');
   return [data.readUInt16LE(start+6)&0x3fff,data.readUInt16LE(start+8)&0x3fff];
  }
  if(kind==='VP8L'){
   assert(size>=5&&data[start]===0x2f,'invalid VP8L frame');const bits=data.readUInt32LE(start+1);
   return [(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];
  }
  if(kind==='VP8X'){
   assert(size>=10,'invalid VP8X header');return [1+data.readUIntLE(start+4,3),1+data.readUIntLE(start+7,3)];
  }
  offset=start+size+(size&1);
 }
 throw Error('WebP image frame missing');
}
let total=0,count=0,anaBytes=0;
for(const {id} of LIVERIES.filter(x=>!x.embedded&&!x.a380Only)){
 const variant=b777LiveryVariant(id),request={id,variant};
 const manifest=variant==='cargo'?b777CargoManifest(request):b777PassengerManifest(request);
 assert.equal(manifest.id,id);assert.equal(manifest.variant,variant);assert.equal(manifest.maps.length,5);
 for(const item of manifest.maps){
  assert.match(item.url,/^\/assets\/b777-liveries\/(?:passenger|cargo)\/[\w-]+\.webp$/);
  const data=await readFile(new URL('..'+item.url,import.meta.url));
  const [w,h]=dimensions(data);assert(w===h&&(w===1024||w===2048),`${id}: atlas dimensions ${w}x${h}`);
  assert(data.length<1024*1024,`${id}: unexpectedly large delivery atlas`);
  total+=data.length;count++;if(id==='ANA')anaBytes+=data.length;
 }
}
const b777Liveries=LIVERIES.filter(x=>!x.embedded&&!x.a380Only);assert.equal(count,b777Liveries.length*5);
for(const {id} of b777Liveries){
 const info=B777_PASSENGER_LIVERY_INFO[id]??B777_CARGO_LIVERY_INFO[id];
 assert(info?.approximate,`${id} must disclose approximation`);
 assert.equal(info.fictional,realityFor('b777',id).status!=='real',`${id} applicability`);
 assert(info.disclosure&&realityFor('b777',id).note,`${id} disclosure`);
}
assert(anaBytes>0&&anaBytes<=1024*1024,`ANA paint must fit in 1 MiB, got ${anaBytes} bytes`);
assert.equal(b777LiveryVariant('ANA'),'passenger');
assert.equal(realityFor('b777','ANA').status,'family');
assert.match(realityFor('b777','ANA').note,/777-200ER.*777-200LR/);
for(const path of ['passenger/UAE-fin.webp','cargo/fedex-fin.webp']){
 const data=await readFile(new URL('../assets/b777-liveries/'+path,import.meta.url));
 assert.deepEqual(dimensions(data),[2048,2048]);
 assert.equal(data.toString('ascii',12,16),'VP8 ',`${path} must use lossy WebP`);
 assert(data.length<=350000,`${path} exceeds selective fin budget`);
}
console.log(`777 atlas checks passed: ${b777Liveries.length} liveries, ${count} WebP files, ${(total/1048576).toFixed(2)} MiB.`);
