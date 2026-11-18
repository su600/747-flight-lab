import assert from 'node:assert/strict';
import * as T from 'three';
import {LIGHTING_PRESETS,bloomProfile,effectQualityProfile,isIPadLike,renderingProfile} from '../src/render-quality.js';
import {applyAircraftMaterialQuality} from '../src/aircraft-lighting.js';

assert.equal(isIPadLike({platform:'MacIntel',maxTouchPoints:5}),true);
assert.equal(isIPadLike({platform:'Win32',maxTouchPoints:0}),false);

const desktop=renderingProfile({width:3840,height:2160,devicePixelRatio:2});
assert.ok(desktop.pixelRatio<=1.5&&desktop.pixelRatio>1);
assert.ok(3840*2160*desktop.pixelRatio**2<=8_300_100);
assert.equal(desktop.shadowMapSize,2048);
assert.equal(desktop.postprocess,true);

const ipad=renderingProfile({width:1366,height:1024,devicePixelRatio:2,tablet:true});
assert.equal(ipad.pixelRatio,1.25);
assert.equal(ipad.shadowMapSize,1024);

const low=renderingProfile({width:1366,height:1024,devicePixelRatio:2,tablet:true,low:true});
assert.equal(low.pixelRatio,1);
assert.equal(low.postprocess,false);
assert.equal(low.shadowMapSize,0);

const legacy=renderingProfile({floatTargets:false});
assert.equal(legacy.bloom,false);
assert.equal(legacy.antialias,true);
for(const mode of ['day','dusk','night']){
 const preset=LIGHTING_PRESETS[mode],bloom=bloomProfile(mode);
 assert.ok(preset.exposure>0&&preset.sun>0&&preset.hemi>0&&preset.fill>0);
 assert.ok(bloom.strength>=.05&&bloom.threshold>0);
}
assert.ok(bloomProfile('night').strength>bloomProfile('day').strength);
assert.ok(LIGHTING_PRESETS.night.fill>LIGHTING_PRESETS.day.fill);
const effectsDesktop=effectQualityProfile(),effectsTablet=effectQualityProfile({tablet:true}),effectsLow=effectQualityProfile({low:true});
for(const key of ['vortex','exhaust','contrail','smoke','streaks','rainLines','windshieldDrops']){
 assert(effectsTablet[key]<effectsDesktop[key],`tablet ${key} budget is below desktop`);
 assert(effectsLow[key]<effectsTablet[key],`low ${key} budget is below tablet`);
}
assert.equal(desktop.effects.vortex,effectsDesktop.vortex);
assert(effectQualityProfile({reducedMotion:true}).streaks===0);
assert(effectQualityProfile({tablet:true,reducedMotion:true}).emission<effectsTablet.emission);

const material=new T.MeshPhysicalMaterial({map:new T.Texture(),metalness:.05,roughness:.5,clearcoat:.1,envMapIntensity:.4});
const root=new T.Group();root.add(new T.Mesh(new T.BoxGeometry(),material));
applyAircraftMaterialQuality(root,false);
assert.ok(material.envMapIntensity>.4);
assert.ok(material.clearcoat>.1);
applyAircraftMaterialQuality(root,true);
assert.equal(material.envMapIntensity,.4);
assert.equal(material.clearcoat,.1);
root.traverse(object=>object.geometry?.dispose());
material.map.dispose();material.dispose();
console.log('render quality profiles ok');
