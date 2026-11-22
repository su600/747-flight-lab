// CPU-only wheel projection, fade, integration and incremental draw budget.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {parseXml} from './xml-fixture-parser.mjs';
import {WheelContactShadow,wheelShadowFade,WHEEL_SHADOW_MAX,WHEEL_SHADOW_Y} from '../src/world/wheel-contact-shadow.js';
import {GROUND_Y,World} from '../src/world.js';
import {AirportMarkings} from '../src/world/airport-markings.js';
import {parseAC} from '../src/aircraft.js';
const near=(a,b,e=1e-5)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const scene=new T.Scene(),shadow=new WheelContactShadow(scene),mesh=shadow.mesh;
assert.equal(scene.children.length,1);assert(mesh.isInstancedMesh);assert.equal(mesh.instanceMatrix.count,WHEEL_SHADOW_MAX);
assert.equal(mesh.geometry.index.count,6);assert.equal(mesh.material.isMeshBasicMaterial,true);
assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.blending,T.CustomBlending);
assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.material.depthTest,true);
assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false);assert.equal(mesh.material.map,null);
assert(WHEEL_SHADOW_Y>GROUND_Y.yellowPaint+.05,'physical gap instead of ineffective polygon offset');
assert(mesh.renderOrder>Math.round(GROUND_Y.rubber*1000));
const shader={vertexShader:T.ShaderLib.basic.vertexShader,fragmentShader:T.ShaderLib.basic.fragmentShader};
mesh.material.onBeforeCompile(shader);
assert.match(shader.vertexShader,/attribute float contactOpacity/);assert.match(shader.vertexShader,/vContactCoord=position.xy\*2.0/);
assert.match(shader.fragmentShader,/1.0-smoothstep\(0.0,1.0,length\(vContactCoord\)\)/);
assert.match(shader.fragmentShader,/diffuseColor.a\*=vContactOpacity\*contactFalloff/);
assert.notEqual(mesh.material.blending,T.NormalBlending,'Three must not define OPAQUE and force alpha to 1');

// Real opaque markings follow the blended patch, so the latter cannot mask paint.
const previousDocument=globalThis.document;
globalThis.document={createElement(){return {getContext(){return {fillRect(){},strokeRect(){},fillText(){}};}};}};
try{
 const markings=new AirportMarkings(new T.Scene(),{getDrawingBufferSize:v=>v.set(800,600)});
 for(const marking of markings.meshes)assert(marking.renderOrder>mesh.renderOrder,'all AirportMarkings paint draws later');
}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}

const makePlane=type=>({type,contact:6,root:new T.Group(),native:{scale:new T.Vector3(1,1,1)}});
const sim={gear:1,altitude:0,onGround:true};
const m=new T.Matrix4(),point=new T.Vector3();
const centre=i=>{mesh.getMatrixAt(i,m);return point.setFromMatrixPosition(m).clone();};
const cases=[
 ['b747',[[21.991,0],[-2.0835,-5.5155],[-2.0835,5.5155],[-5.461,-1.906],[-5.461,1.906]]],
 ['a330',[[18.7084,0],[-5.834,-5.02],[-5.834,4.99]]],
 ['b777',[[19.1793,0],[-6.996,-5.62],[-6.996,5.62]]],
 ['a380',[[31.57,0],[-.6,-2.63],[-.6,2.63],[3.1,-6.16],[3.1,6.16]]],
 ['shuttle',[[16.01,0],[-4.59,3.5],[-4.59,-3.5]]],
 ['concorde',[[-5.35,-3.7],[-5.35,3.7],[12.12,0]]],
];
for(const [type,expected] of cases){
 const plane=makePlane(type);plane.root.position.set(123,6,-45);
 if(type==='shuttle')plane.wheelContacts=[new T.Vector3(-4.59,-5.47,3.5),new T.Vector3(-4.59,-5.47,-3.5)];
 if(type==='concorde')plane.wheelContacts=expected.map(([x,z])=>new T.Vector3(x,-6,z));
 shadow.update(plane,sim,'day');assert(mesh.visible,type);assert.equal(mesh.count,expected.length);
 assert(mesh.count<=WHEEL_SHADOW_MAX,'at most five quads in one instanced draw');
 expected.forEach(([x,z],i)=>{const p=centre(i);near(p.x,123+x);near(p.z,-45+z);near(p.y,WHEEL_SHADOW_Y);near(shadow.opacity.getX(i),.32*wheelShadowFade(1,0,type==='b747'&&i>0?.462:0));});
 // Turn 90 degrees: centres follow the root quaternion, not a hardcoded heading.
 plane.root.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2);
 shadow.update(plane,sim,'day');expected.forEach(([x,z],i)=>{const p=centre(i);near(p.x,123+z);near(p.z,-45-x);});
 mesh.getMatrixAt(0,m);const axis=new T.Vector3(1,0,0).transformDirection(m);near(axis.x,0);near(axis.z,-1);
}
// Shuttle's native ground tilt is removed in flight; its nose rises and moves forward.
const shuttle=makePlane('shuttle');shuttle.root.position.set(0,6,0);
shuttle.wheelContacts=[new T.Vector3(-4.59,-5.47,3.5),new T.Vector3(-4.59,-5.47,-3.5)];
shadow.update(shuttle,sim,'day');const groundNose=centre(0).x;
shadow.update(shuttle,{gear:1,altitude:.3,onGround:false},'day');near(centre(0).x-groundNose,.435);assert(shadow.opacity.getX(0)<shadow.opacity.getX(1),'raised orbiter nose fades before mains');
// 747 geometry has nonuniform source scaling; apply it to both wheel axes.
const b747=makePlane('b747');b747.native.scale.set(1.1,1,1.2);b747.root.position.set(0,6,0);
shadow.update(b747,sim,'day');near(centre(0).x,21.991*1.1);near(centre(1).z,-5.5155*1.2);
// Compare the source gear mesh bogies to the scaled, rotated runtime projections.
const oldLoad=T.TextureLoader.prototype.load;
try{
 T.TextureLoader.prototype.load=function(){return new T.Texture({width:1,height:1});};
 const gear=parseAC(readFileSync(new URL('../assets/aircraft/747-400_gear.ac',import.meta.url),'utf8'));gear.updateMatrixWorld(true);
 const sourceCentre=name=>new T.Box3().setFromObject(gear.getObjectByName(name),true).getCenter(new T.Vector3());
 const nose=sourceCentre('GearNoseWheels'),wing=sourceCentre('wlg.lf').add(sourceCentre('wlg.lr')).multiplyScalar(.5),body=sourceCentre('blg.lf').add(sourceCentre('blg.lr')).multiplyScalar(.5);
 near(centre(0).x,-nose.x*1.1,.01);near(centre(1).x,-wing.x*1.1,.02);near(centre(1).z,-wing.z*1.2,.02);
 near(centre(3).x,-body.x*1.1,.02);near(centre(3).z,-body.z*1.2,.02);
}finally{T.TextureLoader.prototype.load=oldLoad;}
// Pitch/bank and translation project the actual contact point and fade each independently.
const plane=makePlane('concorde');plane.wheelContacts=[new T.Vector3(-5.35,-6,-3.7),new T.Vector3(-5.35,-6,3.7),new T.Vector3(12.12,-6,0)];
plane.root.position.set(100,6.35,200);plane.root.quaternion.setFromEuler(new T.Euler(.18,.7,.04,'YZX'));
shadow.update(plane,sim,'day');
plane.wheelContacts.forEach((v,i)=>{const p=v.clone().applyQuaternion(plane.root.quaternion).add(plane.root.position),actual=centre(i);near(actual.x,p.x);near(actual.z,p.z);near(shadow.opacity.getX(i),.32*wheelShadowFade(1,0,p.y));});
assert.notEqual(shadow.opacity.getX(0),shadow.opacity.getX(1),'bank independently fades left/right contacts');

near(wheelShadowFade(1,0,0),1);near(wheelShadowFade(0,0,0),0);near(wheelShadowFade(.85,0,0),0);
assert(wheelShadowFade(.93,0,0)>0&&wheelShadowFade(.93,0,0)<1);
near(wheelShadowFade(1,1.5,0),0);near(wheelShadowFade(1,0,1.2),0);
assert(wheelShadowFade(1,.8,.5)>0&&wheelShadowFade(1,.8,.5)<1);
plane.root.quaternion.identity();plane.root.position.set(0,6,0);
shadow.update(plane,{gear:1,altitude:0},'day');const day=shadow.opacity.getX(0);
shadow.update(plane,{gear:1,altitude:0},'night');assert(shadow.opacity.getX(0)<day);
for(const state of [{gear:0,altitude:0},{gear:.85,altitude:0},{gear:1,altitude:1.5},{gear:1,altitude:100}]){
 const matrixVersion=mesh.instanceMatrix.version,opacityVersion=shadow.opacity.version;
 shadow.update(plane,state,'day');assert.equal(mesh.visible,false);
 assert.equal(mesh.instanceMatrix.version,matrixVersion,'hidden flight does not upload matrices');assert.equal(shadow.opacity.version,opacityVersion,'hidden flight does not upload opacity');
}
plane.root.visible=false;shadow.update(plane,sim,'day');assert.equal(mesh.visible,false);
plane.root.visible=true;shadow.update(plane,sim,'day');assert.equal(mesh.visible,true);
shadow.update(makePlane('unknown'),sim,'day');assert.equal(mesh.visible,false);

// Pinned source wheel-animation centres back the static nose/bogie positions.
const children=(e,tag)=>e.children.filter(c=>c.tagName===tag);
function wheelCentre(path,name){
 const root=parseXml(readFileSync(new URL(path,import.meta.url),'utf8')).documentElement;
 const a=children(root,'animation').find(e=>children(e,'type')[0]?.textContent.trim()==='spin'&&children(e,'object-name').some(n=>n.textContent.trim()===name));
 assert(a,`${name} source animation`);const c=children(a,'center')[0];return Number(children(c,'x-m')[0].textContent);
}
near(wheelCentre('../assets/aircraft/747-400_gear.xml','GearNoseWheels'),-21.991);
near(wheelCentre('../assets/accurate-a330/Models/a333-animations.xml','NoseWheel'),-18.7084);
for(const path of ['../assets/accurate-b777/777-200F-v2.xml','../assets/accurate-b777/source-alternatives/2048/777-200LR-v2.xml']){
 near(wheelCentre(path,'FrtWheel'),-19.1793);near(wheelCentre(path,'LHwheel.2'),6.99646);
}
// Frame call is after the pose and compression update, and independent of quality.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(main,/plane\.root\.position\.y-=plane\.groundSettle\|\|0;[\s\S]*?world\.updateContactShadow\(plane,sim\)/);
assert.match(main,/renderer\.shadowMap\.enabled=!low/);assert.match(main,/renderer\.shadowMap\.enabled=!renderLow/);
const w=Object.create(World.prototype);let received;w.time='dusk';w.contactShadow={update(...args){received=args;}};w.updateContactShadow(plane,sim);assert.deepEqual(received,[plane,sim,'dusk']);
const helper=readFileSync(new URL('../src/world/wheel-contact-shadow.js',import.meta.url),'utf8');
assert.doesNotMatch(helper.slice(helper.indexOf(' update(plane,sim,time)')),/\bnew\s+(?:T\.|Array|Float|Object)/,'no allocations constructed in frame update');
console.log('Wheel contact shadows: six airframes, full pose, independent clearance/gear fades, paint ordering and <=1 instanced draw.');
