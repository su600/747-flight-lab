// Airport ground: ICAO runway paint, taxiway lead-on lines and a realistic apron, plus the grass-through-apron fix.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RUNWAY} from '../src/flight.js';
import {runwayMarkingLayout,taxiwayMarkingLayout,apronMarkingLayout,STANDS,STOP_Z,TAXILANE_Z,yawOf} from '../src/world/airport-markings.js';
const near=(a,b,e=1e-6)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
near(yawOf(1,0),0);near(Math.cos(yawOf(0,1)),0);
const rw=runwayMarkingLayout();
for(const end of [-1,1]){
 const keys=rw.white.filter(([x,,l,w])=>l===30&&w===1.8&&end*x>RUNWAY.end-40);assert.equal(keys.length,16,'16 threshold stripes per end');
 const aim=rw.white.filter(([x,,l,w])=>l===60&&w===10&&end*x>0);assert.equal(aim.length,2,'aiming point pair');
 for(const [x] of aim)near(Math.abs(RUNWAY.end-6-end*x),430,1e-6);
 const tdz=rw.white.filter(([x,,l])=>l===22.5&&end*x>0);assert.equal(tdz.length,2*(3+3+2+2+1+1),'touchdown-zone bars');
}
assert(rw.white.every(([,z,,w])=>Math.abs(z)+w/2<=RUNWAY.width/2+1e-9),'runway paint stays on the runway');
const centre=rw.white.filter(([,z,l,w])=>z===0&&l===30&&w===.9);assert(centre.length>60,'centreline 30 m stripes');
assert.equal(rw.yellow.length,12,'blast-pad chevrons at both ends');
const tw=taxiwayMarkingLayout();assert(tw.yellow.length>100,'connector centrelines, fillets and lead-on curves');
const ap=apronMarkingLayout();
for(const x of STANDS){
 const lead=ap.yellow.find(([lx,z,l,w])=>lx===x&&l===.45&&w>150);assert(lead,'lead-in line per stand');near(lead[1]-lead[3]/2,STOP_Z,1e-9);
 assert(ap.yellow.some(([lx,z,l])=>lx===x&&z===STOP_Z&&l===8),'stop bar at the nose position');
 assert(ap.red.filter(([rx])=>Math.abs(rx-x)<=26.01).length>=3,'equipment restraint area');
}
assert(ap.yellow.some(([x,z,l])=>z===TAXILANE_Z&&l>2000),'apron taxilane centreline');
assert.equal(ap.black.length,ap.yellow.length,'every yellow apron line has a black contrast border');
const world=readFileSync(new URL('../src/world.js',import.meta.url),'utf8'),main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(world,/function groundPlane\(w,d\)/,'large ground quads are tessellated');
assert.match(world,/new T\.Mesh\(groundPlane\(w,d\),m\)/);
assert.doesNotMatch(world,/const concrete=mat\(/,'apron concrete no longer shares the cached tree material');
assert.match(main,/\[\[-1200,-406\],\[-510,-406\],\[180,-406\],\[640,-406\]\]\)\{[^}]*p\.rotation\.y=Math\.PI\/2/,'parked 747s are nose-in');
console.log('Airport markings passed: ICAO runway paint, taxiway lead-on lines, apron stands and tessellated ground.');
