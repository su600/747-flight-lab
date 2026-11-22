// CPU-only, real 747 AC/XML geometry and the actual Aircraft livery/update path.
// Run: node tests/747-nose-cargo-door.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {parseXml} from './xml-fixture-parser.mjs';
import {noseSeamDistance,NOSE_SEAM,splitNoseGeometry} from '../src/747-nose-cargo-door.js';

T.TextureLoader.prototype.load=function(url,onLoad){const t=new T.Texture();t.image={width:1,height:1};t.userData.url=url;queueMicrotask(()=>onLoad?.(t));return t;};
globalThis.DOMParser=class{parseFromString(xml){return parseXml(xml);}};
const proto=Object.getPrototypeOf(parseXml('<probe/>').documentElement);
const selectAll=(el,selector)=>{const parts=selector.split('>').map(x=>x.trim());let nodes=[el],direct=false;if(parts[0]===':scope'){parts.shift();direct=true;}const descendants=n=>n.children.flatMap(c=>[c,...descendants(c)]);for(const tag of parts){nodes=nodes.flatMap(n=>(direct?n.children:descendants(n)).filter(c=>c.tagName===tag));direct=true;}return nodes;};
proto.querySelectorAll=function(s){return selectAll(this,s);};proto.querySelector=function(s){return selectAll(this,s)[0]??null;};
globalThis.fetch=async url=>({ok:true,text:async()=>readFileSync(new URL('../'+String(url).replace(/^\//,''),import.meta.url),'utf8')});
const {Aircraft}=await import('../src/aircraft.js');
const plane=await new Aircraft().load(),rig=plane.noseCargoDoorRig;
assert(rig,'real fuselage supports nose door');
assert.equal(plane.canOpenNoseCargoDoor,false);
assert.equal(rig.hull.geometry,rig.original);
const cockpit=plane.root.getObjectByName('cockpit.windows#mesh');assert(cockpit);
const cockpitParent=cockpit.parent;plane.root.updateMatrixWorld(true);const cockpitBefore=cockpit.matrixWorld.clone();
const sourceArea=(g,attr)=>{const a=g.getAttribute(attr);let area=0;for(let i=0;i<a.count;i+=3){if(attr==='uv'){const ax=a.getX(i),ay=a.getY(i),bx=a.getX(i+1),by=a.getY(i+1),cx=a.getX(i+2),cy=a.getY(i+2);area+=Math.abs((bx-ax)*(cy-ay)-(by-ay)*(cx-ax))/2;}else{const x=new T.Vector3().fromBufferAttribute(a,i),y=new T.Vector3().fromBufferAttribute(a,i+1),z=new T.Vector3().fromBufferAttribute(a,i+2);area+=y.sub(x).cross(z.sub(x)).length()/2;}}return area;};
for(const attr of ['position','uv']){const before=sourceArea(rig.original,attr),after=sourceArea(rig.body,attr)+sourceArea(rig.panel.geometry,attr);assert(Math.abs(before-after)<before*1e-6,`${attr} area conserved: ${before} / ${after}`);}
for(const [g,sign] of [[rig.body,1],[rig.panel.geometry,-1]]){
 const p=g.attributes.position;assert(g.groups.length);assert.equal(g.attributes.normal.count,p.count);assert.equal(g.attributes.uv.count,p.count);
 for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i);assert(sign===1?(noseSeamDistance(v)>=-5e-6||v.y>=NOSE_SEAM.top-5e-6):(noseSeamDistance(v)<=5e-6&&v.y<=NOSE_SEAM.top+5e-6),'split triangle on correct side');}
}
// Synthetic triangle checks the interpolated attributes, rather than only counts.
const simple=new T.BufferGeometry();simple.setAttribute('position',new T.Float32BufferAttribute([-27,0,0,-25.5,0,0,-25.5,1,0],3));simple.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1],2));simple.setAttribute('normal',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1],3));simple.addGroup(0,3,2);
const split=splitNoseGeometry(simple);let seamVertices=0;
for(const g of [split.body,split.door]){assert.equal(g.groups[0].materialIndex,2);for(let i=0;i<g.attributes.position.count;i++){const p=new T.Vector3().fromBufferAttribute(g.attributes.position,i);if(Math.abs(noseSeamDistance(p))>1e-5)continue;seamVertices++;const u=(p.x+27)/1.5,v=p.y,uv=g.attributes.uv,n=g.attributes.normal;assert(Math.abs(uv.getX(i)-u)<1e-6&&Math.abs(uv.getY(i)-v)<1e-6);assert(new T.Vector3().fromBufferAttribute(n,i).distanceTo(new T.Vector3(1-u,u-v,v))<1e-6);}}
assert(seamVertices>=4);

for(const id of ['fedex','sf']){
 const doorBefore=rig.hinge.rotation.z,interiorBefore=rig.interior.visible;
 assert(await plane.setLivery(id));assert.equal(plane.canOpenNoseCargoDoor,true);assert.equal(rig.hull.geometry,rig.body);assert(rig.panel.visible);assert(!rig.cap.visible);
 assert.equal(rig.hinge.rotation.z,doorBefore,'repainting between cargo liveries does not snap the door');
 assert.equal(rig.interior.visible,interiorBefore);
 plane.update({noseCargoDoor:0},0);plane.root.updateMatrixWorld(true);
 const coneClosed=rig.cone.localToWorld(new T.Vector3()).clone();
 const ray=new T.Raycaster();const start=rig.hull.parent.localToWorld(new T.Vector3(-40,0,0));const direction=new T.Vector3(1,0,0).transformDirection(rig.hull.parent.matrixWorld);ray.set(start,direction);ray.far=20;
 assert(ray.intersectObject(rig.cone,true).length,'closed nosecone covers front');
 plane.update({noseCargoDoor:1},0);plane.root.updateMatrixWorld(true);
 assert.equal(rig.hinge.rotation.z,NOSE_SEAM.maxAngle);assert(rig.interior.visible);
 assert(rig.cone.localToWorld(new T.Vector3()).distanceTo(coneClosed)>4,'radome actually moves');
 assert.equal(ray.intersectObjects([rig.hull,rig.cone,rig.panel],true).length,0,'no original nose or cap blocking doorway');
 assert.equal(ray.intersectObject(rig.interior,true).length,0,'bulkhead is deeper than the opening, not a blocking plug');
 assert.equal(cockpit.parent,cockpitParent);assert(cockpit.matrixWorld.equals(cockpitBefore),'cockpit windows stay fixed');
 plane.update({noseCargoDoor:9},0);assert.equal(rig.hinge.rotation.z,NOSE_SEAM.maxAngle);
 plane.update({noseCargoDoor:-1},0);assert.equal(Math.abs(rig.hinge.rotation.z),0);assert(!rig.interior.visible);
 plane.update({noseCargoDoor:NaN},0);assert.equal(Math.abs(rig.hinge.rotation.z),0);
 plane.update({noseCargoDoor:.5},0);assert.equal(rig.hinge.rotation.z,NOSE_SEAM.maxAngle*.5);
}
assert(await plane.setLivery('BOE'));assert(!plane.canOpenNoseCargoDoor);assert.equal(rig.hull.geometry,rig.original);assert(!rig.panel.visible);assert(rig.cap.visible);assert(!rig.interior.visible);assert.equal(Math.abs(rig.hinge.rotation.z),0);
plane.update({noseCargoDoor:1},0);assert.equal(Math.abs(rig.hinge.rotation.z),0,'passenger livery ignores stale input');
assert(await plane.setLivery('sf'));assert.equal(Math.abs(rig.hinge.rotation.z),0,'livery changes close immediately');
assert.equal(await plane.setLivery('not-a-livery'),false);assert(plane.canOpenNoseCargoDoor);
plane.type='a380';assert(!plane.canOpenNoseCargoDoor);plane.update({noseCargoDoor:1},0);assert.equal(Math.abs(rig.hinge.rotation.z),0);
console.log('747 nose cargo door passed: real mesh split, UVs/normals, open ray, cockpit, livery switching and input clamping.');