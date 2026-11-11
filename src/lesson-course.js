// Staged takeoff course for manual practice. Each stage is unlocked by a
// condition on the simulator state; stages only move forward, so a bump in
// speed after a stage is passed never re-opens an earlier instruction.
//
// Units: speed in m/s, altitude in m, gear/flaps in the simulator's own
// 0..1 / degree values as exposed on the Flight instance.

export const TAKEOFF_COURSE=[
 {id:'checklist',title:'起飞检查',
  text:'检查襟翼 20°、起落架已放下，然后按 P 松开停留刹车。',
  done:s=>!s.park&&s.flaps>=19.5&&s.gear>=.99},
 {id:'taxi',title:'慢车滑行',
  text:'轻推推力杆让飞机慢慢滑动，速度保持在 3–12 m/s（约 10–45 km/h），沿跑道中线滑行。',
  done:s=>s.onGround&&s.speed>=3&&s.speed<=12},
 {id:'roll',title:'加速滑跑',
  text:'把推力杆推到 TO，持续加速；速度接近 270 km/h 时准备抬轮。',
  done:s=>s.onGround&&s.speed>=70},
 {id:'liftoff',title:'离地',
  text:'轻轻拉杆抬头，让机翼产生足够升力，主轮离开跑道。',
  done:s=>!s.onGround},
 {id:'climb',title:'收起落架爬升',
  text:'离地后保持平缓爬升，高度超过 100 m 时按 G 收起落架。',
  done:s=>!s.onGround&&s.altitude>=100&&s.gear<=.01},
 {id:'clean',title:'收襟翼，爬升到 500 m',
  text:'稳定爬升后，在“部件”面板逐步把襟翼收到 0°，爬升到 500 m。',
  done:s=>!s.onGround&&s.flaps<=.5&&s.altitude>=500},
];

export function createCourseProgress(){
 return {index:0,complete:false};
}

// Advance the course for the current snapshot and return the active stage.
// `snapshot` is { onGround, park, speed, altitude, gear, flaps }.
export function advanceCourse(progress,snapshot){
 while(!progress.complete&&TAKEOFF_COURSE[progress.index].done(snapshot)){
  progress.index++;
  if(progress.index>=TAKEOFF_COURSE.length)progress.complete=true;
 }
 if(progress.complete)return {no:`${TAKEOFF_COURSE.length} / ${TAKEOFF_COURSE.length}`,title:'课程完成',text:'手动起飞课程完成！你已离地、收起落架和襟翼，并爬升到 500 m。可以继续练习，或从菜单重新选择起飞演示。',complete:true};
 const stage=TAKEOFF_COURSE[progress.index];
 return {no:`${progress.index+1} / ${TAKEOFF_COURSE.length}`,title:stage.title,text:stage.text,complete:false};
}
