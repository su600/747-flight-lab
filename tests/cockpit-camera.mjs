// The cockpit camera snaps to the eye point; other views keep their smoothing.
// Run: node tests/cockpit-camera.mjs.
import assert from 'node:assert/strict';
import {cameraFollowFactor} from '../src/cockpit-view.js';

assert.equal(cameraFollowFactor('cockpit',false,1/60),1,'cockpit camera does not lag behind the aircraft');
assert.equal(cameraFollowFactor('cockpit',false,1/240),1,'cockpit camera stays locked at any frame rate');
assert.equal(cameraFollowFactor('chase',true,1/60),1,'first frame always snaps');
const smooth=cameraFollowFactor('chase',false,1/60);
assert(smooth>0&&smooth<1,'chase camera keeps its smoothing');
console.log('Cockpit camera passed: eye point is locked; other views keep smoothing.');
