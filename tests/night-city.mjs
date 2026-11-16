// Night city: roofs must not carry the window grid, and only a sparse share of windows glows.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {facadeBoxGeometry,FACADE_ROOF_V,FACADE_LIT_SHARE} from '../src/world/procedural.js';
const g=facadeBoxGeometry(),uv=g.attributes.uv,n=g.attributes.normal;
let roofs=0,sides=new Set();
for(let i=0;i<uv.count;i++){if(Math.abs(n.getY(i))>.9){roofs++;assert.equal(uv.getX(i),.5);assert.ok(Math.abs(uv.getY(i)-FACADE_ROOF_V)<1e-6,'roof samples the blank parapet band');}else sides.add(uv.getX(i)+','+uv.getY(i));}
assert.equal(roofs,8);assert.ok(sides.has('0,0')&&sides.has('1,1'),'side faces keep the full window grid');
assert.ok(FACADE_LIT_SHARE<=.3,'night windows are sparse');
const world=readFileSync(new URL('../src/world.js',import.meta.url),'utf8'),scenery=readFileSync(new URL('../src/world/scenery.js',import.meta.url),'utf8');
assert.match(world,/InstancedMesh\(facadeBoxGeometry\(\),this\.cityMat/);
assert.match(scenery,/batch\('city-towers',facadeBox,/);assert.match(scenery,/batch\('city-setbacks',facadeBox,/);
console.log('Night city passed: window-free roofs and sparse warm window glow.');
