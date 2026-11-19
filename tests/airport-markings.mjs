// Airport ground: ICAO runway paint, taxiway lead-on lines and a realistic apron, plus the grass-through-apron fix.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {RUNWAY} from '../src/flight.js';
import {AirportMarkings,configureMarkingAntialias,runwayMarkingLayout,taxiwayMarkingLayout,apronMarkingLayout,STANDS,STOP_Z,TAXILANE_Z,yawOf} from '../src/world/airport-markings.js';
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
// Coverage filtering works on both rectangle axes and does not let transparent feather pixels write depth.
const material=new T.MeshStandardMaterial(),uniforms={resolution:{value:new T.Vector2(800,600)},minPixels:{value:1}};
configureMarkingAntialias(material,uniforms);
assert.equal(material.transparent,false,'paint stays in the opaque draw queue');assert.equal(material.blending,T.CustomBlending);
assert.equal(material.blendSrc,T.SrcAlphaFactor);assert.equal(material.blendDst,T.OneMinusSrcAlphaFactor);
assert.equal(material.depthWrite,false);assert.equal(material.depthTest,true);
const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
material.onBeforeCompile(shader);
assert.equal(shader.uniforms.uMarkResolution,uniforms.resolution);assert.equal(shader.uniforms.uMarkMinPixels,uniforms.minPixels);
assert.match(shader.vertexShader,/gl_Position\.w>0\.001/,'avoid unsafe near-plane perspective division');
assert.match(shader.vertexShader,/instanceMatrix\*vec4\(1\.0,0\.0,0\.0,0\.0\)/,'filter local X axis');
assert.match(shader.vertexShader,/instanceMatrix\*vec4\(0\.0,1\.0,0\.0,0\.0\)/,'filter local Y axis');
assert.match(shader.vertexShader,/vMarkEnergy=clamp\(width\.x\/target\.x/,'preserve subpixel projected area');
assert.match(shader.fragmentShader,/fwidth\(vMarkCoord\)/,'integrate edge coverage over a pixel');
assert.match(shader.fragmentShader,/diffuseColor\.a\*=markCoverage\.x\*markCoverage\.y\*vMarkEnergy/,'apply coverage to both axes');
assert.equal(material.customProgramCacheKey(),'airport-markings-analytic-coverage-v2');
// Verify the actual scene ordering (black under yellow), texture signs and drawing-buffer resize integration.
const previousDocument=globalThis.document,ctx={fillRect(){},strokeRect(){},fillText(){}};
globalThis.document={createElement(){return {width:0,height:0,getContext(){return ctx;}};}};
try{
 const scene=new T.Scene(),size=new T.Vector2(800,600),renderer={getDrawingBufferSize(v){return v.copy(size);}};
 const markings=new AirportMarkings(scene,renderer);
 assert.equal(markings.markUniforms.minPixels.value,1);assert.deepEqual(markings.markUniforms.resolution.value.toArray(),[800,600]);
 for(const mesh of markings.meshes.slice(0,7)){assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.blending,T.CustomBlending);assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.material.depthTest,true);}
 assert(markings.meshes[4].renderOrder<markings.meshes[5].renderOrder,'black apron border draws before yellow paint');
 assert(markings.meshes[0].renderOrder<markings.meshes[2].renderOrder,'runway paint draws before the higher taxiway lead-on lines');
 assert.equal(markings.meshes[7].material.transparent,false,'painted sign texture retains its original material');
 size.set(1440,900);markings.setResolution();assert.deepEqual(markings.markUniforms.resolution.value.toArray(),[1440,900]);
}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
const world=readFileSync(new URL('../src/world.js',import.meta.url),'utf8'),main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(world,/function groundPlane\(w,d\)/,'large ground quads are tessellated');
assert.match(world,/new T\.Mesh\(groundPlane\(w,d\),flatGround\(m\)\)/);
assert.match(world,/configureMarkingAntialias\(taxiPaint,this\.markings\.markUniforms\)/,'filter independent taxiway paint too');
assert.match(world,/markings\.meshes\.push\(groundRects\(\[\[0,-130,3760,\.3\]\],taxiPaint,\.065,65\)\)/,'taxiway centreline uses analytic coverage');
assert.match(world,/groundRects\(taxiEdges,taxiPaint,\.078,82\)/,'taxiway edges use analytic coverage');
assert.match(world,/groundRects\(\[\.\.\.holdSolid,\.\.\.holdDashed\],taxiPaint,\.081,84\)/,'holding lines use analytic coverage');
assert.doesNotMatch(world,/const concrete=mat\(/,'apron concrete no longer shares the cached tree material');
assert.match(main,/\[\[-1200,-406\],\[-510,-406\],\[180,-406\],\[640,-406\]\]\)\{[^}]*p\.rotation\.y=Math\.PI\/2/,'parked 747s are nose-in');
console.log('Airport markings passed: ICAO runway paint, taxiway lead-on lines, apron stands and tessellated ground.');
