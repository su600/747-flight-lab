// Per-airframe engine sound checks. Run with: node tests/audio-profiles.mjs
import assert from 'node:assert/strict';
import {AUDIO_PROFILES,audioTargets} from '../src/audio.js';
import {AIRCRAFT_INFO} from '../src/ui/aircraft-info.js';

const types=['b747','a380','a330','b777','shuttle'];
for(const t of types)assert(AUDIO_PROFILES[t],`${t} needs its own sound profile`);
assert.deepEqual(Object.keys(AUDIO_PROFILES).sort(),[...types].sort(),'profiles should match the selectable airframes');
for(const t of types)assert(AIRCRAFT_INFO[t],`${t} should be a known airframe`);

const idle={engine:.22,speed:0},cruise={engine:.85,speed:110};
const power=(type,sim)=>{const x=audioTargets(type,sim);return x.core.gain+x.fan.gain+x.roar.gain;};
// Quad turbofans are louder than twins at the same thrust, and the 747 roars more than the A380.
assert(power('b747',cruise)>power('a330',cruise)*1.3,'four engines should sound louder than two');
assert(power('a380',cruise)<power('b747',cruise),'the A380 engines should be quieter than the 747-400s');
// Each powered airframe must have its own pitch and fan whine.
const pitches=['b747','a380','a330','b777'].map(t=>audioTargets(t,cruise).core.hz.toFixed(1)+'/'+audioTargets(t,cruise).fan.hz.toFixed(1));
assert.equal(new Set(pitches).size,4,`powered airframes should differ: ${pitches}`);
// Throttle moves the engine pitch and level.
assert(audioTargets('b747',cruise).fan.hz>audioTargets('b747',idle).fan.hz);
assert(audioTargets('b747',cruise).core.gain>audioTargets('b747',idle).core.gain);
// The orbiter has no engines: no engine hum at any throttle, only airflow that grows with speed.
for(const sim of [idle,cruise,{engine:1,speed:0}]){const x=audioTargets('shuttle',sim);assert.equal(x.core.gain,0,'orbiter core must be silent');assert.equal(x.fan.gain,0);assert.equal(x.roar.gain,0);}
assert(audioTargets('shuttle',{engine:0,speed:0}).wind.gain===0,'no airflow when stationary');
assert(audioTargets('shuttle',{engine:0,speed:80}).wind.gain>audioTargets('shuttle',{engine:0,speed:30}).wind.gain,'airflow should rise with speed');
// Unknown types fall back to the 747 sound rather than silence or NaN.
assert.deepEqual(audioTargets('unknown',cruise),audioTargets('b747',cruise));
for(const t of types)for(const sim of [idle,cruise])for(const v of Object.values(audioTargets(t,sim)).flatMap(o=>Object.values(o)).filter(v=>typeof v==='number'))assert(Number.isFinite(v),`${t} produced ${v}`);
console.log('Audio profiles passed: quad/twin/glider engine sounds and airflow checks.');
