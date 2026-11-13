// Space Shuttle asset and integration checks. Run with: node tests/space-shuttle.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../assets/space-shuttle/Models/',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

// --- AC3D sources ----------------------------------------------------------
const body=await read('shuttle_o2.ac');
const gear=await read('LandingGears-slim.ac');
const chute=await read('DragChute.ac');
for(const [name,text] of [['shuttle_o2.ac',body],['LandingGears-slim.ac',gear],['DragChute.ac',chute]]){
 assert(text.startsWith('AC3Db'),`${name} is not an AC3D file`);
 assert(/^MATERIAL /m.test(text),`${name} has no materials`);
}
// The runtime parser needs the objects this loader drives.
for(const object of['payload-bay-door-left','payload-bay-door-right','GearDoorL','GearDoorR','NoseDoorL','NoseDoorR','SpeedBrakeL','SpeedBrakeR','BodyFlap'])
 assert(body.includes(`name "${object}"`),`orbiter is missing ${object}`);
assert(gear.includes('name "Tire"'),'landing gear AC lacks tyres');
assert(chute.includes('name '),'drag chute AC has no objects');

// --- Geometry: measured from the source vertices -------------------------
function bounds(text){
 const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
 const lines=text.split('\n');
 for(let i=0;i<lines.length;i++){
  if(!lines[i].startsWith('numvert '))continue;
  const n=Number(lines[i].slice(8));
  for(let k=1;k<=n;k++){
   const [x,y,z]=lines[i+k].trim().split(/\s+/).map(Number);
   if(!Number.isFinite(x))continue;
   mn[0]=Math.min(mn[0],x);mn[1]=Math.min(mn[1],y);mn[2]=Math.min(mn[2],z);
   mx[0]=Math.max(mx[0],x);mx[1]=Math.max(mx[1],y);mx[2]=Math.max(mx[2],z);
  }
 }
 return {size:mx.map((v,k)=>v-mn[k]),mn,mx};
}
const orbiter=bounds(body);
// Source units are metres: ~36.7 m long, 23.9 m span, 13.6 m tall.
assert(Math.abs(orbiter.size[0]-36.69)<.5,`orbiter length ${orbiter.size[0].toFixed(2)} m`);
assert(Math.abs(orbiter.size[2]-23.85)<.3,`orbiter span ${orbiter.size[2].toFixed(2)} m`);
assert(Math.abs(orbiter.size[1]-13.59)<.5,`orbiter height ${orbiter.size[1].toFixed(2)} m`);
const gearBox=bounds(gear);
// The gear sits under the belly (negative Y) and reaches the tyre contact.
assert(gearBox.mn[1]<-7.5,`gear contact ${gearBox.mn[1].toFixed(2)} m is too shallow`);

// --- Runtime tables ---------------------------------------------------------
const {LIVERIES}=await import('../src/aircraft.js');
const {liveryForModel}=await import('../src/livery-for-model.js');
const {realityFor}=await import('../src/livery-reality.js');
const {AIRCRAFT_INFO}=await import('../src/ui/aircraft-info.js');
const {aircraftFiles}=await import('../src/preload.js');
const {SpaceShuttle}=await import('../src/space-shuttle.js');
const {Flight}=await import('../src/flight.js');

const shuttleLivery=LIVERIES.find(l=>l.id==='NASA_SHUTTLE');
assert(shuttleLivery&&shuttleLivery.embedded,'NASA livery must be embedded in the model');
assert(liveryForModel(shuttleLivery,'shuttle'),'shuttle must offer its NASA livery');
assert.equal(liveryForModel(LIVERIES.find(l=>l.id==='BOE'),'shuttle'),null,'airliner paint must not be offered on the orbiter');
assert.equal(liveryForModel(shuttleLivery,'b747'),null,'NASA livery must not be offered on airliners');
assert.equal(realityFor('shuttle','NASA_SHUTTLE').status,'real');
assert(AIRCRAFT_INFO.shuttle&&AIRCRAFT_INFO.shuttle.engines===0,'shuttle info missing or lists engines');
const files=aircraftFiles('shuttle');
assert(files.some(([path])=>path.endsWith('shuttle_o2.ac')),'preload list lacks the orbiter body');
assert(files.some(([path])=>path.endsWith('LandingGears-slim.ac')),'preload list lacks the gear');
assert(files.some(([path])=>path.endsWith('DragChute.ac')),'preload list lacks the drag chute');
const totalMB=files.reduce((n,[,size])=>n+size,0)/1048576;
assert(totalMB>6&&totalMB<12,`preload budget ${totalMB.toFixed(1)} MB looks wrong`);

// --- Shell entry points -----------------------------------------------------
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
assert(html.includes('<option value="shuttle">'),'aircraft select lacks shuttle option');
assert(html.includes('data-aircraft="shuttle"'),'aircraft card for shuttle missing');
assert(html.includes('id="chute"'),'drag chute control missing');
const css=await readFile(new URL('../src/hud.css',import.meta.url),'utf8');
assert(css.includes('body.shuttle-mode'),'shuttle-mode CSS missing');

// --- Drag chute -------------------------------------------------------------
assert.equal(new SpaceShuttle().hasDragChute,true,'orbiter must expose a drag chute');
const f=new Flight();
f.reset('land');
assert.equal(f.control('chute',1),'这架飞机没有减速伞','chute must be refused without one');
f.chuteAvailable=true;f.onGround=false;
assert.equal(f.control('chute',1),'落地后才能放出减速伞','chute must wait for touchdown');
f.onGround=true;f.speed=60;
assert.equal(f.control('chute',1),'');assert.equal(f.chuteTarget,1);
f.chute=0;f.calculateAero();const dryDrag=f.drag;
f.chute=1;f.calculateAero();const chuteDrag=f.drag;
assert(chuteDrag>dryDrag*1.5,`chute drag ${Math.round(chuteDrag)} N should far exceed ${Math.round(dryDrag)} N`);
f.reset('land');f.chuteAvailable=true;f.onGround=true;f.speed=70;f.landingGuidance();
assert.equal(f.chuteTarget,1,'chute should deploy on rollout');
f.speed=10;f.landingGuidance();
assert.equal(f.chuteTarget,0,'chute should jettison near 30 kt');

console.log(`Space Shuttle checks passed: ${orbiter.size[0].toFixed(2)} m long, ${orbiter.size[2].toFixed(2)} m span, ${totalMB.toFixed(1)} MB preload, drag chute ${Math.round(chuteDrag/1000)} kN at 60 m/s.`);
