// World-level visuals that need no GPU: fog/horizon colour parity between render paths, the fitted shadow box,
// the contact shadow, cloud variants and the aircraft reflection finish.
import assert from 'node:assert/strict';
import * as T from 'three';
import {World} from '../src/world.js';
import {applyAircraftFinish} from '../src/aircraft-lighting.js';
import {LIGHTING,acesFilmic,inverseAces,hexToRgb} from '../src/world/lighting.js';
import {createSky} from '../src/world/sky.js';
const near=(a,b,e=1e-3,m='')=>assert(Math.abs(a-b)<e,`${m} ${a} != ${b}`);
const toSrgb=c=>c<=.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-.055;
const displayHex=(rgbLinear)=>rgbLinear.map(c=>Math.round(toSrgb(Math.min(1,Math.max(0,c)))*255));
const hexBytes=hex=>hexToRgb(hex).map(c=>Math.round(c*255));
const close=(a,b,e,m)=>a.forEach((v,i)=>assert(Math.abs(v-b[i])<=e,`${m}: ${a} vs ${b}`));

function horizonWorld(post){
 const w=Object.create(World.prototype);
 return Object.assign(w,{post,time:'day',renderer:{toneMappingExposure:LIGHTING.day.exposure},scene:{fog:new T.FogExp2(0,.0001)},
  sky:{material:{uniforms:{horizonColor:{value:new T.Vector3()}}}}});
}

// Fog and sky horizon show the same colour on screen whichever way the frame is tone-mapped.
{
 const hex=LIGHTING.day.horizon,direct=horizonWorld(false),post=horizonWorld(true);
 direct.setHorizon(hex);post.setHorizon(hex);
 assert.equal(direct.scene.fog.color.getHex(),hex,'direct path shows the fog colour as written');
 const raw=post.sky.material.uniforms.horizonColor.value.toArray();
 close(displayHex(acesFilmic(raw,LIGHTING.day.exposure)),hexBytes(hex),2,'sky horizon after tone mapping');
 close(displayHex(acesFilmic([post.scene.fog.color.r,post.scene.fog.color.g,post.scene.fog.color.b],LIGHTING.day.exposure)),hexBytes(hex),2,'post fog after tone mapping');
 assert.deepEqual(direct.sky.material.uniforms.horizonColor.value.toArray(),raw,'sky shader gets the same raw colour in both paths');
 // Weather pulls the horizon towards grey; amount 0 changes nothing, amount 1 reaches the target.
 post.blendHorizon(0xa2adb4,0);close(displayHex(acesFilmic(post.sky.material.uniforms.horizonColor.value.toArray(),LIGHTING.day.exposure)),hexBytes(hex),2,'blend 0');
 post.blendHorizon(0xa2adb4,1);close(displayHex(acesFilmic(post.sky.material.uniforms.horizonColor.value.toArray(),LIGHTING.day.exposure)),hexBytes(0xa2adb4),2,'blend 1');
 // A colour for the night background shows as written too.
 near(displayHex(acesFilmic([...post.displayColor(0x081426).toArray()],LIGHTING.day.exposure))[2],0x26,2,'night background blue');
 assert.equal(direct.displayColor(0x081426).getHex(),0x081426,'direct path uses the colour as written');
}

// setTime drives clouds from the presets, including the HDR gain, and keeps every cloud variant in step.
{
 const w=horizonWorld(false);const colour=()=>new T.Color(),variants=[0,1,2].map(()=>({color:colour(),opacity:0,fog:true}));
 Object.assign(w,{scene:{environment:null,environmentIntensity:0,background:null,fog:new T.FogExp2(0,0)},renderer:{toneMappingExposure:0},
  sun:{intensity:0,color:colour()},fill:{intensity:0,color:colour()},hemi:{intensity:0,color:colour(),groundColor:colour()},
  sky:createSky(),
  stars:{visible:false},envs:{},envFor:mode=>({mode}),cloudVariants:variants,cityMat:{emissiveIntensity:0},glass:{emissive:colour(),emissiveIntensity:0},
  glow:{material:{opacity:0},visible:false},scaleLamps(){}});
 w.cloudMat=variants[0];
 w.setTime('day');
 near(w.renderer.toneMappingExposure,LIGHTING.day.exposure);near(w.fill.intensity,LIGHTING.day.fill);
 assert(w.cloudMat.color.r>2,'day clouds are lifted above the HDR sky');assert.equal(w.cloudMat.fog,false);near(w.cloudMat.opacity,LIGHTING.day.cloud.opacity);
 for(const v of variants){near(v.color.r,w.cloudMat.color.r);near(v.opacity,w.cloudMat.opacity);assert.equal(v.fog,false,'variants follow the fog setting');}
 w.setTime('dusk');assert.equal(variants[2].fog,true);assert(variants[1].color.r>variants[1].color.b,'dusk clouds are warm');
 w.setTime('night');assert.equal(w.scene.background.getHex(),0x081426);assert(w.cloudMat.color.r<.5,'night clouds are dim');
 near(w.scene.fog.density,LIGHTING.night.fogDensity);
}

// The shadow box follows the aircraft and its resolution follows the device.
{
 const w=Object.create(World.prototype),camera=new T.OrthographicCamera(-150,150,150,-150,10,1600);
 const disposed=[];
 w.sun={shadow:{camera,mapSize:new T.Vector2(2048,2048),normalBias:.08,map:{dispose(){disposed.push('map');}}}};
 w.fitShadow({x:70.7,y:19.4,z:64.4});
 assert(camera.right>60&&camera.right<100,`747 box ${camera.right}`);assert.equal(camera.left,-camera.right);assert.equal(camera.top,camera.right);
 const fitted=camera.right,bias=w.sun.shadow.normalBias;
 w.fitShadow({x:70.7,y:19.4,z:64.4});assert.equal(camera.right,fitted,'repeated fits are free');
 near(bias,(2*fitted/2048)*.9,1e-9,'normal bias follows the texel size');
 w.fitShadow({x:73,y:24,z:80});assert(camera.right>fitted,'bigger aircraft, bigger box');
 const scenery=[];w.scenery={setQuality:l=>scenery.push(l)};
 w.setQuality(true);assert.equal(w.sun.shadow.map,null,'low quality frees the shadow map');assert.deepEqual(disposed,['map']);
 w.setQuality(false,true);assert.equal(w.sun.shadow.mapSize.x,1024,'touch devices use a small map');
 w.sun.shadow.map={dispose(){disposed.push('map2');}};
 w.setQuality(false,false);assert.equal(w.sun.shadow.mapSize.x,2048);assert(disposed.includes('map2'),'a resized map is released');
 const sizeBefore=w.sun.shadow.mapSize.x;w.sun.shadow.map={dispose(){throw Error('must not dispose an unchanged map');}};
 w.setQuality(false,false);assert.equal(w.sun.shadow.mapSize.x,sizeBefore);
 assert.deepEqual(scenery,[true,false,false,false],'scenery quality still follows');
}

// Contact shadow: dark under a parked aircraft, gone by 40 m.
{
 const w=Object.create(World.prototype),mesh=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({transparent:true}));
 w.contactShadow=mesh;w.time='day';const dims=new T.Vector3(70,19,64),pos=new T.Vector3(120,3,-40);
 w.updateContactShadow(pos,dims,0,90);
 assert.equal(mesh.visible,true);near(mesh.material.opacity,.38);near(mesh.position.x,120);near(mesh.position.z,-40);assert(mesh.position.y>.08&&mesh.position.y<.1,'sits above the pavement layers');
 near(mesh.rotation.y,0,1e-9,'heading 090 points along +x');near(mesh.scale.x,77,1e-9);
 w.updateContactShadow(pos,dims,20,90);assert(mesh.material.opacity>0&&mesh.material.opacity<.38,'fades while climbing');
 w.updateContactShadow(pos,dims,45,90);assert.equal(mesh.visible,false,'hidden in the air');
 w.time='night';w.updateContactShadow(pos,dims,0,180);assert(mesh.material.opacity<.38,'subtler at night');near(mesh.rotation.y,-Math.PI/2,1e-9);
 Object.create(World.prototype).updateContactShadow(pos,dims,0,0);
}

// Aircraft reflection finish.
{
 const glass=new T.MeshStandardMaterial({name:'Cockpit_Glass',roughness:.4,envMapIntensity:1,transparent:true,opacity:.5});
 const metal=new T.MeshStandardMaterial({name:'Engine',roughness:.7,metalness:.9,envMapIntensity:.8});
 const paint=new T.MeshStandardMaterial({name:'Fuselage',roughness:.8,metalness:.1,map:new T.Texture(),envMapIntensity:1});
 const dark=new T.MeshStandardMaterial({name:'Interior',roughness:1,envMapIntensity:0});
 const plain=new T.MeshStandardMaterial({name:'Tyre',roughness:.9});
 const physical=new T.MeshPhysicalMaterial({name:'Skin',roughness:.9,map:new T.Texture()});
 const root=new T.Group();for(const m of [glass,metal,paint,dark,plain,[paint,glass]])root.add(new T.Mesh(new T.BoxGeometry(1,1,1),m));root.add(new T.Mesh(new T.BoxGeometry(1,1,1),physical));
 const before=[glass,metal,paint,dark,plain].map(m=>[m.envMapIntensity,m.roughness]);
 assert.equal(applyAircraftFinish({root},true),true);
 assert(glass.envMapIntensity>=1.9&&glass.roughness<=.1,'glass reflects the sky');
 assert(metal.envMapIntensity>=1.5&&metal.roughness<=.4,'metal shows highlights');
 assert(paint.envMapIntensity>=1.15&&paint.roughness<=.46,'paint gains a soft sheen');
 assert.equal(dark.envMapIntensity,0,'surfaces authored to ignore the environment stay dark');assert.equal(plain.roughness,.9,'untextured rubber is left alone');
 assert(physical.roughness<=.46,'physical materials are handled too');
 const enhanced=[glass,metal,paint].map(m=>[m.envMapIntensity,m.roughness]);applyAircraftFinish({root},true);
 assert.deepEqual([glass,metal,paint].map(m=>[m.envMapIntensity,m.roughness]),enhanced,'idempotent');
 applyAircraftFinish({root},false);
 assert.deepEqual([glass,metal,paint,dark,plain].map(m=>[m.envMapIntensity,m.roughness]),before,'low quality restores the authored finish exactly');
 applyAircraftFinish({root},true);assert(glass.envMapIntensity>=1.9,'and it can be re-enabled');
 const livery=new T.MeshStandardMaterial({name:'Livery',roughness:.9,map:new T.Texture()});root.add(new T.Mesh(new T.BoxGeometry(1,1,1),livery));
 applyAircraftFinish({root},true);assert(livery.roughness<=.46,'a material introduced by a livery change is finished too');
 assert.equal(applyAircraftFinish(null,true),false);assert.equal(applyAircraftFinish({},true),false);
 assert.equal(applyAircraftFinish(root,true),true,'accepts a bare root');
}
console.log('World visuals passed: horizon/fog parity, cloud presets, fitted shadows, contact shadow and aircraft finish.');
