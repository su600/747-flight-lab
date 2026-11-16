import assert from 'node:assert/strict';
import * as T from 'three';
import {Scenery,SCENERY_ZONES,inSceneryZone} from '../src/world/scenery.js';

// The full reservation, not just object centres, must clear the runway's extended
// centreline and all the existing pavement/terminal/vehicle-route envelope.
for(const zone of SCENERY_ZONES){
 assert(zone.maxZ < -600 || zone.minZ > 600,`${zone.name} clears the approach corridor`);
 assert(zone.maxX < -2300 || zone.minX > 2300 || zone.maxZ < -850 || zone.minZ > 250,`${zone.name} clears airport surfaces`);
 assert(inSceneryZone((zone.minX+zone.maxX)/2,(zone.minZ+zone.maxZ)/2));
}
const scene=new T.Scene(),scenery=new Scenery(scene,new T.MeshStandardMaterial());
const matrix=new T.Matrix4(),bounds=new T.Box3();
function checkBounds(){
 scene.updateMatrixWorld(true);
 scenery.root.traverse(o=>{
  if(!o.isMesh||o===scenery.beam)return; // light is transparent, not an obstacle
  o.geometry.computeBoundingBox();
  const n=o.isInstancedMesh?o.count:1;
  for(let i=0;i<n;i++){
   if(o.isInstancedMesh){o.getMatrixAt(i,matrix);matrix.premultiply(o.matrixWorld);}else matrix.copy(o.matrixWorld);
   bounds.copy(o.geometry.boundingBox).applyMatrix4(matrix);
   assert(bounds.max.z < -600 || bounds.min.z > 600,`${o.name} approaches the runway centreline`);
   assert(bounds.max.x < -2300 || bounds.min.x > 2300 || bounds.max.z < -850 || bounds.min.z > 250,`${o.name} overlaps airport`);
   assert(SCENERY_ZONES.some(z=>bounds.min.x>=z.minX&&bounds.max.x<=z.maxX&&bounds.min.z>=z.minZ&&bounds.max.z<=z.maxZ),`${o.name} escapes its reserved zone: ${JSON.stringify(bounds)}`);
  }
 });
}
checkBounds();
for(let i=0;i<60;i++){scenery.update(10);checkBounds();}
const high=scenery.batches.reduce((n,b)=>n+b.mesh.count,0);
scenery.setQuality(true);
const low=scenery.batches.reduce((n,b)=>n+b.mesh.count,0);
assert(low<high*.8,`low quality reduces instances (${low} vs ${high})`);
assert(!scenery.boats[1].visible);
// Reduced rooftop batches must never leave floating roofs or antennas without a tower.
const batch=name=>scenery.batches.find(b=>b.mesh.name===name).mesh;
const positions=mesh=>Array.from({length:mesh.count},(_,i)=>{mesh.getMatrixAt(i,matrix);return [matrix.elements[12],matrix.elements[14]];});
const towers=positions(batch('city-towers'));
for(const name of ['city-setbacks','city-roofs','city-antennas','city-obstruction-lights'])for(const [x,z] of positions(batch(name)))assert(towers.some(p=>p[0]===x&&p[1]===z),`${name} has no supporting low-quality tower`);
scenery.setQuality(false);assert.equal(scenery.batches.reduce((n,b)=>n+b.mesh.count,0),high);
scenery.setTime('night');assert(scenery.beam.visible&&scenery.lantern.visible);
scenery.setTime('day');assert(!scenery.beam.visible&&!scenery.beacons.visible);
const before=scenery.blades.instanceMatrix.array.slice();scenery.update(1);
assert.notDeepEqual(scenery.blades.instanceMatrix.array,before,'turbine blades rotate');
console.log(`Scenery clearance, animation, lighting and quality passed (${high} high / ${low} low instances).`);
