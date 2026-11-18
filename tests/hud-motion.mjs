import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [html,css,main,input,hud]=await Promise.all([
 readFile(new URL('../index.html',import.meta.url),'utf8'),
 readFile(new URL('../src/hud.css',import.meta.url),'utf8'),
 readFile(new URL('../src/main.js',import.meta.url),'utf8'),
 readFile(new URL('../src/input.js',import.meta.url),'utf8'),
 readFile(new URL('../src/ui/hud.js',import.meta.url),'utf8'),
]);

assert.match(html,/class="flight-lab" data-ui-stage="loading"/);
for(const id of ['speedDigits','altDigits','headingDigits'])assert.match(html,new RegExp(`id="${id}"`));
assert.match(css,/\.flight-lab\[data-ui-stage="scene"\] #viewport canvas/);
assert.match(css,/\.flight-lab\[data-ui-stage="hud"\].*hud-region-enter/s);
assert.match(css,/hud-control-enter/);
assert.match(css,/\.flight-lab\[data-motion="simplified"\].*backdrop-filter:none/s);
assert.match(css,/prefers-reduced-motion:reduce[\s\S]*\.flight-lab,/);
assert.doesNotMatch(css,/@media\(prefers-reduced-motion:reduce\)\{\*/);
assert.match(main,/dataset\.uiStage='scene'/);
assert.match(main,/dataset\.uiStage='hud'/);
assert.match(main,/drawer\.classList\.add\('is-open'\)/);
assert.match(main,/aria-busy/);
assert.match(main,/airflow\?\.setReducedMotion\(reducedMotionQuery\.matches\)/);
assert.match(main,/landingLights\?\.setReducedMotion\(reducedMotionQuery\.matches\)/);
assert.match(hud,/setAnimatedText\(\$\('#speedDigits'\)/);
assert.match(input,/setAnimatedText\(\$\('#throttleValue'\)/);
assert.doesNotMatch(hud,/setHTML\(\$\('#(?:speedValue|altValue|headingValue)'/);

globalThis.document={body:{dataset:{motion:'full'}}};
const {setAnimatedText}=await import('../src/ui/dom.js');
const animated={textContent:'',calls:[],animate(frames,options){this.calls.push({frames,options});}};
assert(setAnimatedText(animated,123,0));
assert.equal(animated.textContent,'123');
assert.equal(animated.calls.length,1);
assert(!setAnimatedText(animated,123,0),'unchanged instruments should not write or animate');
document.body.dataset.motion='reduced';
const reduced={textContent:'',calls:[],animate(frames,options){this.calls.push({frames,options});}};
assert(setAnimatedText(reduced,124,0));
assert.equal(reduced.calls.length,0,'reduced motion must not animate numbers');
document.body.dataset.motion='simplified';
const simplified={textContent:'',calls:[],animate(frames,options){this.calls.push({frames,options});}};
setAnimatedText(simplified,125,0);
assert.equal(simplified.calls.length,0,'low-quality and touch profiles must not animate numbers');
console.log('HUD motion: staged entrance, drawer state, numeric gating and reduced-motion checks passed.');
