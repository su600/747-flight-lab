// CPU regression for 747/A330 nav-light placement and 747 gear suspension.
// Run: node tests/navigation-lights-gear.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {parseXml} from './xml-fixture-parser.mjs';
import {Aircraft} from '../src/aircraft.js';
import {AccurateA330} from '../src/accurate-a330.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
T.TextureLoader.prototype.load = function (_url, onLoad) {
 const texture = new T.Texture();
 texture.image = {width: 1024, height: 1024, naturalWidth: 1024, naturalHeight: 1024};
 queueMicrotask(() => onLoad?.(texture));
 return texture;
};

// The project has a hardened fixture parser; add only the DOM selectors used by
// Aircraft.bind() so the real pinned XML/AC assets can be tested in Node.
const xmlPrototype = Object.getPrototypeOf(parseXml('<root/>').documentElement);
xmlPrototype.querySelectorAll = function (selector) {
 const scoped = selector.startsWith(':scope > ');
 const tags = selector.replace(/^:scope\s*>\s*/, '').split(/\s*>\s*/);
 let candidates;
 if (scoped) candidates = [...this.children];
 else {
  candidates = [];
  const visit = node => { for (const child of node.children) { candidates.push(child); visit(child); } };
  visit(this);
 }
 let result = candidates.filter(node => node.tagName === tags[0]);
 for (const tag of tags.slice(1)) result = result.flatMap(node => node.children.filter(child => child.tagName === tag));
 return result;
};
xmlPrototype.querySelector = function (selector) { return this.querySelectorAll(selector)[0] || null; };
globalThis.DOMParser = class { parseFromString(xml) { return parseXml(xml); } };
globalThis.fetch = async url => {
 const pathname = new URL(String(url), 'http://flight-lab.test').pathname;
 const prefix = '/747/assets/';
 assert(pathname.startsWith(prefix), `unexpected local asset request: ${pathname}`);
 const text = await readFile(join(projectRoot, 'assets', pathname.slice(prefix.length)), 'utf8');
 return {ok: true, status: 200, text: async () => text};
};

function checkMarker(root, surface, point, clearance, label) {
 root.updateMatrixWorld(true);
 const bounds = new T.Box3().setFromObject(surface, true), ray = new T.Raycaster();
 ray.set(new T.Vector3(point.x, bounds.max.y + 2, point.z), new T.Vector3(0, -1, 0));
 const hit = ray.intersectObject(surface, true)[0];
 assert(hit, `${label} marker projects onto the real wing surface`);
 const measured = point.y - hit.point.y;
 assert(Math.abs(measured - clearance) < .002, `${label} marker clears its wing by ${clearance} m (got ${measured})`);
}

const b747 = await new Aircraft().load();
assert.equal(b747.wingtipPoints.length, 2);
for (let i = 0; i < 2; i++) {
 checkMarker(b747.root, b747.wingSurface, b747.wingtipPoints[i], .16, `747 wingtip ${i}`);
 assert(b747.lights[i].position.distanceTo(b747.wingtipPoints[i]) < 1e-6);
}
const wheelTilt = b747.animations.filter(animation => animation.prop?.includes('altitude-agl'));
assert.equal(wheelTilt.length, 4, '747 wing/body main bogies have touchdown-leveling animations');
for (const onGround of [false, true]) {
 b747.update({gear: 1, altitude: 0, onGround}, 0);
 for (const animation of wheelTilt) {
  const degrees = onGround ? 0 : animation.table.at(-1)[1] * animation.factor + animation.offset;
  const expected = new T.Quaternion().setFromAxisAngle(animation.axis, degrees * Math.PI / 180);
  assert(animation.wrappers.every(wrapper => wrapper.quaternion.angleTo(expected) < 1e-6),
   `747 bogie remains tilted airborne and levels only after contact (${animation.prop}, ground=${onGround})`);
 }
}
assert(b747.root.getObjectByName('GearWingLeftWheels'), '747 main-gear wheel group exists');
b747.update({gear: 1, altitude: 0, onGround: false}, 0);
assert.equal(b747.gearCompression, 0, 'airborne gear struts are extended');
b747.update({gear: 1, altitude: 0, onGround: true}, 0);
assert.equal(b747.gearCompression, .25, '747 struts use a partial, loaded compression rather than no compression');
assert(Math.abs(b747.groundSettle - .15 * b747.native.scale.y) < 1e-6);
const compression = b747.animations.find(animation => animation.prop?.includes('gear[1]') && animation.prop.includes('compression-ft'));
assert(compression, '747 wing gear compression animation is bound');
assert(Math.abs(compression.wrappers[0].position.y * b747.native.scale.y - b747.groundSettle) < .002,
 '747 tire compression is balanced by aircraft ground settle');

const a330 = await new AccurateA330({resourceTimeoutMs: 20000, textureTimeoutMs: 20000}).load();
assert.equal(a330.wingtipPoints.length, 2);
for (let i = 0; i < 2; i++) {
 const winglet = a330.root.getObjectByName(i === 0 ? 'winglet0' : 'winglet1');
 checkMarker(a330.root, winglet, a330.wingtipPoints[i], .12, `A330 winglet ${i}`);
 assert(a330.lights[i].position.distanceTo(a330.wingtipPoints[i]) < 1e-6);
}
console.log('Navigation/gear regression passed: 747/A330 lights sit on real wing surfaces; 747 gear compression and ground settle agree.');
a330.dispose();
