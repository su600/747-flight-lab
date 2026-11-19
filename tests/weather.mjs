import assert from 'node:assert/strict';
import {Flight} from '../src/flight.js';
import * as T from 'three';
import {Weather} from '../src/weather.js';
import {CLOUDS,VISIBILITY,KNOT_MS,windVector,groundVelocity,runwayCrab} from '../src/weather-math.js';
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
near(windVector(0,10).z,10);near(windVector(90,10).x,-10);near(windVector(180,10).z,-10);
const velocity=groundVelocity(90,100,0,10);near(velocity.x,100);near(velocity.z,10);
near(groundVelocity(runwayCrab(100,10,0),100,0,10).z,0);
assert.equal(CLOUDS.clear.sun,1);assert(CLOUDS.overcast.sun<CLOUDS.partly.sun);assert(VISIBILITY.low>VISIBILITY.moderate&&VISIBILITY.moderate>VISIBILITY.good);
const f=new Flight();assert.equal(f.windSpeed,0);f.windDirection=0;f.windSpeed=10;f.reset('free');const start=f.z;for(let i=0;i<120;i++)f.step(1/120,{});assert(f.z-start>9);assert(f.groundSpeed>f.speed*.99);
for(const type of ['airliner','shuttle'])for(const direction of [0,90,180,270])for(const knots of [15,30,40]){
 const s=new Flight();if(type==='shuttle')Object.assign(s,{unpowered:true,chuteAvailable:true,landingGlide:6,landingSpeed:85});
 s.windDirection=direction;s.windSpeed=knots*KNOT_MS;s.reset('land');
 for(let i=0;i<120*220&&!s.failed&&!s.complete;i++)s.step(1/120,{});
 assert(!s.failed&&s.complete,`${type} ${direction}° ${knots} kt: ${s.message}`);assert(Math.abs(s.touchdown.z)<30);
}
for(const direction of [0,90,180,270]){const s=new Flight();s.windDirection=direction;s.windSpeed=40*KNOT_MS;s.reset('takeoff');for(let i=0;i<120*180&&!s.failed&&!s.complete;i++)s.step(1/120,{});assert(!s.failed&&s.complete,`takeoff ${direction}°`);}
const changing=new Flight();changing.windSpeed=30*KNOT_MS;changing.reset('land');for(let i=0;i<120*20;i++)changing.step(1/120,{});changing.windSpeed=0;for(let i=0;i<120*200&&!changing.failed&&!changing.complete;i++)changing.step(1/120,{});assert(changing.complete&&!changing.failed,'landing after switching off crosswind');
// Exercise weather composition over fresh day/dusk/night baselines without a WebGL renderer.
const weather=Object.create(Weather.prototype),material=new T.MeshStandardMaterial({color:0xffffff,roughness:.9});
const world={time:'day',sun:{intensity:3.2},hemi:{intensity:1.15},sky:{material:{uniforms:{skyTint:{value:new T.Vector3(.45,.72,1.7)}}}},scene:{fog:new T.FogExp2(0x8fbde8,.00013),background:null},cloudMat:{color:new T.Color('white')}};
Object.assign(weather,{world,sim:{},cloud:'clear',rain:'off',visibility:'good',low:false,extraClouds:Array.from({length:6},()=>({visible:false})),ground:[{m:material,color:material.color.clone(),roughness:material.roughness}]});
world.setTime=mode=>{world.time=mode;world.sun.intensity=mode==='night'?.35:mode==='dusk'?2.6:3.2;world.hemi.intensity=mode==='night'?.45:mode==='dusk'?.75:1.15;world.sky.material.uniforms.skyTint.value.set(...(mode==='day'?[.45,.72,1.7]:[1,1,1]));world.scene.fog.color.set(mode==='night'?0x142339:mode==='dusk'?0xe0b79c:0x8fbde8);world.scene.fog.density=mode==='night'?.00008:mode==='dusk'?.0001:.00013;world.scene.background=mode==='night'?new T.Color('#081426'):null;world.cloudMat.color.set('white');weather.applyWorld();};
world.setTime('day');near(world.sun.intensity,3.2);near(material.roughness,.9);assert.equal(world.scene.fog.density,.00013);
weather.set({cloud:'overcast',rain:'heavy',visibility:'low'});assert(world.sun.intensity<2);assert(material.roughness<.9);assert.equal(world.scene.fog.density,VISIBILITY.low);assert(weather.extraClouds.every(g=>g.visible));
weather.setQuality(true);assert.equal(weather.extraClouds.filter(g=>g.visible).length,3);
world.setTime('night');assert(world.scene.fog.color.b<.2);weather.set({cloud:'clear',rain:'off',visibility:'good'});near(world.sun.intensity,.35);near(material.roughness,.9);assert.equal(world.scene.fog.density,.00008);assert.equal(world.scene.fog.color.getHex(),0x142339);
world.setTime('dusk');near(world.sun.intensity,2.6);assert.equal(world.scene.fog.color.getHex(),0xe0b79c);
weather.set({cloud:'clear',rain:'heavy'});assert.equal(weather.rain,'off','clear sky cannot rain');weather.set({cloud:'partly',rain:'light'});assert.equal(weather.rain,'light');weather.set({cloud:'clear'});assert.equal(weather.rain,'off','switching to clear stops rain');
{const src=(await import('node:fs')).readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert(src.includes("clear=$('#weatherCloud').value==='clear';if(clear)rain.value='off';rain.disabled=clear"),'panel disables the rain choice under a clear sky');}
console.log('weather: presets, composition, wind drift and guided crosswind demos passed');
