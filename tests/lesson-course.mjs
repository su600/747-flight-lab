// Staged takeoff course: stages unlock in order from simulator-like snapshots and never reopen.
import assert from 'node:assert/strict';
import {TAKEOFF_COURSE,createCourseProgress,advanceCourse} from '../src/lesson-course.js';

const base={onGround:true,park:true,speed:0,altitude:0,gear:1,flaps:0};
const p=createCourseProgress();

let stage=advanceCourse(p,base);
assert.equal(stage.title,'起飞检查');
assert.equal(stage.no,`1 / ${TAKEOFF_COURSE.length}`);

// Brake released and flaps/gear ready: checklist passes, taxi begins.
stage=advanceCourse(p,{...base,park:false,flaps:20});
assert.equal(stage.title,'慢车滑行');

// Skipping straight to takeoff speed must not skip taxi (speed too high for taxi window).
stage=advanceCourse(p,{...base,park:false,flaps:20,speed:40});
assert.equal(stage.title,'慢车滑行','high speed does not satisfy taxi');

stage=advanceCourse(p,{...base,park:false,flaps:20,speed:6});
assert.equal(stage.title,'加速滑跑','taxi at low speed unlocks roll');

stage=advanceCourse(p,{...base,park:false,flaps:20,speed:80});
assert.equal(stage.title,'离地');

stage=advanceCourse(p,{onGround:false,park:false,flaps:20,gear:1,speed:80,altitude:5});
assert.equal(stage.title,'收起落架爬升');

stage=advanceCourse(p,{onGround:false,park:false,flaps:20,gear:0,speed:80,altitude:150});
assert.equal(stage.title,'收襟翼，爬升到 500 m');

// Dropping speed later does not reopen earlier stages.
stage=advanceCourse(p,{onGround:true,park:true,flaps:0,gear:1,speed:0,altitude:0});
assert.equal(stage.title,'收襟翼，爬升到 500 m','progress is monotonic');

stage=advanceCourse(p,{onGround:false,park:false,flaps:0,gear:0,speed:90,altitude:520});
assert.equal(stage.complete,true);
assert.match(stage.title,/课程完成/);
console.log('Lesson course passed: staged unlocks, taxi before takeoff, monotonic progress and completion.');
