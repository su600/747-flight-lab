// Ground interlock, aircraft eligibility, and the existing parts panel wiring.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Flight} from '../src/flight.js';

const sim=new Flight(),button={hidden:true,disabled:true,active:false,pressed:'false',setAttribute(name,value){assert.equal(name,'aria-pressed');this.pressed=value;}};
button.classList={toggle(name,value){assert.equal(name,'active');button.active=value;}};
const label={textContent:''},messages=[],views=[];
const context=vm.createContext({sim,$:s=>s==='#noseCargoDoor'?button:label,notify:text=>messages.push(text),setText:(el,txt)=>el.textContent=txt,
 setCam:mode=>views.push(mode),setOrbit:(...spec)=>views.push(spec),updateUI:()=>context.updateDoor()});
const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const hud=await readFile(new URL('../src/ui/hud.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const slice=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start+1);assert(start>=0&&end>start);return s.slice(start,end);};
vm.runInContext(`${slice(main,'function syncNoseCargoDoor(','\nfunction showAircraft(')}
${slice(main," $('#noseCargoDoor').onclick=", "\n all('[data-concorde-nose]')")}
function updateDoor(){${slice(hud," const noseDoor=$('#noseCargoDoor');",'\n if(concorde){')}}`,context);
assert.match(html,/<button id="noseCargoDoor"[^>]*\baria-pressed="false"[^>]*\bhidden>机头货舱门/);
assert.match(main,/function showAircraft\(\)\{\s*syncNoseCargoDoor\(plane\)/);
assert.match(main,/sim\.noseCargoDoor=sim\.noseCargoDoorTarget=0;next\.update\(sim,0\)/);

for(const craft of [{type:'b747',canOpenNoseCargoDoor:false},{type:'b777',canOpenNoseCargoDoor:true},{type:'a380'},{type:'a330'},{type:'shuttle'}]){
 context.syncNoseCargoDoor(craft);
 assert(button.hidden&&button.disabled);
 assert.match(sim.control('noseCargoDoor',1),/仅 747/);
}
context.syncNoseCargoDoor({type:'b747',canOpenNoseCargoDoor:true});
assert(!button.hidden&&!button.disabled);
for(const unsafe of [{onGround:false},{speed:2},{throttle:.1}]){
 Object.assign(sim,{onGround:true,speed:0,throttle:0},unsafe);button.onclick();
 assert.match(messages.pop(),/停稳/);assert.equal(sim.noseCargoDoorTarget,0);assert.equal(views.length,0);
}
Object.assign(sim,{onGround:true,speed:0,throttle:0});
button.onclick();
assert.equal(sim.noseCargoDoorTarget,1);assert.equal(sim.doorTarget,0);assert.equal(views[0],'orbit');
assert.equal(label.textContent,'开启中…');assert(button.active);assert.equal(button.pressed,'true');
// No acceleration even in the instant between a command and its first animation frame.
assert.match(sim.control('throttle',.5),/关闭机头/);assert.equal(sim.throttle,0);
for(let i=0;i<16;i++)sim.step(.1);
assert(sim.noseCargoDoor>.45&&sim.noseCargoDoor<.6);
for(let i=0;i<16;i++)sim.step(.1);
context.updateDoor();assert.equal(label.textContent,'已开启');assert.equal(sim.noseCargoDoor,1);
button.onclick();assert.equal(label.textContent,'关闭中…');assert.equal(button.pressed,'false');
assert.match(sim.control('throttle',.5),/关闭机头/);
for(let i=0;i<32;i++)sim.step(.1);
context.updateDoor();assert.equal(label.textContent,'关闭');assert.equal(sim.noseCargoDoor,0);
assert.equal(sim.control('throttle',.1),'');

sim.reset('inspect');assert(sim.noseCargoDoorAvailable);
sim.control('noseCargoDoor',1);sim.updateSystems(1);assert(sim.noseCargoDoor>0);
sim.speed=2;sim.updateSystems(.1);assert.equal(sim.noseCargoDoorTarget,0,'movement stows the nose');
context.syncNoseCargoDoor({type:'b747',canOpenNoseCargoDoor:false});
assert(button.hidden&&button.disabled);assert.equal(sim.noseCargoDoor,0);
console.log('747 cargo nose: independent parts switch, ground/throttle interlocks, animation, HUD and reset passed.');
