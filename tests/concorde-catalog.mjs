import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Aircraft,LIVERIES} from '../src/aircraft.js';
import {realityFor} from '../src/livery-reality.js';
import {aircraftFiles} from '../src/preload.js';
import {AIRCRAFT_INFO} from '../src/ui/aircraft-info.js';
import {CONCORDE_ABOUT} from '../src/ui/concorde-about.js';

const ids=LIVERIES.filter(l=>Aircraft.liveryForModel(l.id,'concorde')).map(l=>l.id);
assert.deepEqual(ids,['CONCORDE_BAW','CONCORDE_AFR'],'no fictional, manufacturer, or cross-aircraft paints');
for(const id of ids){
 assert.equal(realityFor('concorde',id).status,'real');
 for(const type of Object.keys(AIRCRAFT_INFO).filter(t=>t!=='concorde'))assert.equal(Aircraft.liveryForModel(id,type),null);
}
const files=aircraftFiles('concorde');assert(files.some(([path])=>path.endsWith('.ac')||path.endsWith('.glb')));
for(const [path,bytes] of files)assert.equal((await readFile(new URL('../assets/'+path,import.meta.url))).length,bytes);
assert.match(CONCORDE_ABOUT,/62\.1[\s\S]*25\.5[\s\S]*11\.3[\s\S]*Olympus 593[\s\S]*Mach 2\.04[\s\S]*60,000/);
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
for(const angle of [0,5,12.5])assert(html.includes(`data-concorde-nose="${angle}"`));
assert.match(html,/<button[^>]+data-mode="supersonic"[^>]+hidden/);
assert.match(html,/<div id="concordeControls" hidden>/);
console.log('Concorde catalog: real BA and Air France only, manifest, published specifications and dedicated controls passed.');
