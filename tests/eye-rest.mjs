// Eye-rest reminder: scheduling, URL setting and banner wiring (no browser needed).
import assert from 'node:assert/strict';
import {createEyeRest,eyeRestSettings,bindEyeRest,EYE_REST_DEFAULTS} from '../src/eye-rest.js';

assert.deepEqual([EYE_REST_DEFAULTS.intervalMin,EYE_REST_DEFAULTS.restSec],[10,10]);
assert.deepEqual(eyeRestSettings(''),{intervalMin:10,restSec:10,enabled:true});
assert.equal(eyeRestSettings('?eyerest=0').enabled,false,'?eyerest=0 turns it off');
assert.equal(eyeRestSettings('?a=1&eyerest=15').intervalMin,15);
for(const bad of ['?eyerest=abc','?eyerest=-3','?eyerest='])assert.equal(eyeRestSettings(bad).intervalMin,10,`${bad} falls back`);

// Counts active time, rests for restSec, then starts the next interval from zero.
const r=createEyeRest({intervalSec:60,restSec:10});
assert.equal(r.tick(59).resting,false);assert.equal(r.state().untilNext,1);
let s=r.tick(1);assert.equal(s.resting,true);assert.equal(s.secondsLeft,10);
s=r.tick(2.5);assert.equal(s.resting,true);assert.equal(s.secondsLeft,8,'rounds up while counting down');
assert.equal(r.tick(0).secondsLeft,8,'zero or negative time changes nothing');assert.equal(r.tick(-4).secondsLeft,8);
s=r.tick(8);assert.equal(s.resting,false);assert.equal(s.untilNext,60,'a full interval follows the break');
r.tick(60);s=r.dismiss();assert.equal(s.resting,false);assert.equal(s.untilNext,60,'closing the banner restarts the interval');
assert.equal(r.tick(100).resting,true,'a long frame still triggers exactly one break');

// Banner wiring with a fake clock, fake DOM and a manual timer.
const el=()=>({textContent:'',onclick:null});
const text=el(),count=el(),close=el(),classes=new Set();
const root={hidden:true,classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c)},querySelector:q=>({'[data-eye-text]':text,'[data-eye-count]':count,'[data-eye-close]':close}[q])};
let clock=0,tick=null,isVisible=true,cleared=0;
globalThis.clearInterval=()=>cleared++;
const handle=bindEyeRest({root,search:'?eyerest=1',now:()=>clock,setTimer:fn=>{tick=fn;return 7;},visible:()=>isVisible});
assert(handle&&tick,'bound');assert(text.textContent.includes('眼睛'));assert.equal(root.hidden,true,'hidden at start');
const advance=sec=>{clock+=sec*1000;tick();};
for(let i=0;i<59;i++)advance(1);assert.equal(root.hidden,true,'not yet');
advance(1);assert.equal(root.hidden,false,'appears after one minute');assert(classes.has('is-open'));assert.equal(count.textContent,'10');
advance(4);assert.equal(count.textContent,'6');
close.onclick();assert.equal(root.hidden,true,'closing hides it');assert(!classes.has('is-open'));
isVisible=false;for(let i=0;i<120;i++)advance(1);isVisible=true;
assert.equal(root.hidden,true,'time in a hidden tab does not count');
for(let i=0;i<60;i++)advance(1);assert.equal(root.hidden,false,'comes back after the next full interval');
for(let i=0;i<10;i++)advance(1);assert.equal(root.hidden,true,'hides itself after the break');
advance(600);assert.equal(handle.rest.state().resting,false,'a stalled tab (5 s cap per tick) cannot skip ahead');
handle.stop();assert.equal(cleared,1);assert.equal(root.hidden,true);

assert.equal(bindEyeRest({root,search:'?eyerest=0'}),null,'disabled by URL');assert.equal(bindEyeRest({root:null}),null,'no banner element');
console.log('Eye rest passed: scheduling, URL setting, hidden-tab handling and banner wiring.');
