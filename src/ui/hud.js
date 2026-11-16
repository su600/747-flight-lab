import {advanceCourse} from '../lesson-course.js';
import {AIRCRAFT_INFO} from './aircraft-info.js';
import {$,setText,setHTML} from './dom.js';
const radians=x=>x*Math.PI/180;

export function createHUD({sim,attitude,keys,touch,getPlane,getManualTakeoffGuide,getCourseProgress,syncThrottleUI,notify}){
 const copilotHidden=()=>getComputedStyle(document.querySelector('.copilot')).display==='none';
function drawAttitude(){
 const c=attitude,W=200,H=150,y=sim.pitch*2.6;
 c.clearRect(0,0,W,H);c.save();c.beginPath();c.roundRect(0,0,W,H,14);c.clip();
 c.translate(100,75);c.rotate(-radians(sim.bank));
 let g=c.createLinearGradient(0,-260+y,0,y);g.addColorStop(0,'#0d4468');g.addColorStop(1,'#56b9e6');c.fillStyle=g;c.fillRect(-340,-460+y,680,460);
 g=c.createLinearGradient(0,y,0,260+y);g.addColorStop(0,'#a07c46');g.addColorStop(1,'#33230f');c.fillStyle=g;c.fillRect(-340,y,680,460);
 c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.moveTo(-340,y);c.lineTo(340,y);c.stroke();
 c.font='600 9px Consolas,monospace';c.textAlign='center';c.textBaseline='middle';c.fillStyle='rgba(255,255,255,.92)';c.lineWidth=1.4;c.strokeStyle='rgba(255,255,255,.85)';
 for(let i=-30;i<=30;i+=5){if(!i)continue;const t=y-i*2.6,w=i%10?12:26;c.beginPath();c.moveTo(-w,t);c.lineTo(w,t);c.stroke();if(!(i%10)){c.fillText(String(Math.abs(i)),-w-10,t);c.fillText(String(Math.abs(i)),w+10,t);}}
 c.restore();
 c.save();c.translate(100,75);
 c.strokeStyle='rgba(255,255,255,.8)';c.lineWidth=1.5;
 for(const a of [-45,-30,-20,-10,0,10,20,30,45]){const r=a*Math.PI/180,len=a%30===0?9:5;c.beginPath();c.moveTo(Math.sin(r)*64,-Math.cos(r)*64);c.lineTo(Math.sin(r)*(64-len),-Math.cos(r)*(64-len));c.stroke();}
 c.rotate(-radians(sim.bank));c.fillStyle='#ffb23e';c.beginPath();c.moveTo(0,-63);c.lineTo(-5,-53);c.lineTo(5,-53);c.closePath();c.fill();
 c.restore();
 c.save();c.translate(100,75);c.strokeStyle='#ffb23e';c.lineWidth=3;c.lineJoin='round';c.beginPath();c.moveTo(-46,0);c.lineTo(-17,0);c.lineTo(-17,8);c.moveTo(46,0);c.lineTo(17,0);c.lineTo(17,8);c.stroke();c.fillStyle='#ffb23e';c.fillRect(-2.5,-2.5,5,5);c.restore();
 g=c.createRadialGradient(100,75,60,100,75,120);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,10,20,.55)');c.fillStyle=g;c.fillRect(0,0,W,H);
 c.fillStyle='rgba(255,255,255,.9)';c.font='600 10px Consolas,monospace';c.textAlign='center';c.textBaseline='alphabetic';c.fillText(String(Math.round(sim.heading)).padStart(3,'0')+'\u00b0',100,143);
}
const viewHint=matchMedia('(pointer:coarse)').matches?'单指拖动环绕，双指移动或张合可平移、缩放；点重置按钮回到默认视角。':'左键拖动环绕，右键拖动平移，滚轮缩放；点重置按钮回到默认视角。';
const lessons={inspect:['01 / EXPLORE',viewHint],takeoff:['02 / TAKEOFF','起飞需要足够的速度：推力杆推到 TO，速度够了再轻轻抬头，机翼就产生升力。'],land:['03 / LANDING','着陆要放下襟翼和起落架。主轮轻轻接地后，扰流板、反推和脚刹一起帮你减速。'],free:['04 / YOUR TURN','方向键控制飞机，Shift 推油门、Ctrl 收油门。松开左右键，辅助驾驶会帮你把机翼放平。'],manual:['04 / YOUR TURN','你正在驾驶飞机。推力杆给能量，操纵杆改变姿态；速度太慢或抬头太高就会失速。']};
function manualTakeoffLesson(){
 if(!getManualTakeoffGuide())return null;
 const stage=advanceCourse(getCourseProgress(),{onGround:sim.onGround,park:sim.park,speed:sim.speed,altitude:sim.altitude,gear:sim.gear,flaps:sim.flaps});
 return [`${stage.no} · ${stage.title}`,stage.text];
}
function warningList(){
 const list=[];
 if(sim.stalled)list.push('失速 · 松杆并加推力');
 else if(sim.buffet)list.push('接近失速 · 松一点杆');
 if(sim.overspeed)list.push('速度过大 · 收油门');
 if(sim.gearOverspeed)list.push('起落架超速 · 请减速');
 if(sim.tailStrike)list.push('机尾擦地 · 抬头轻一点');
 return list;
}
function updateUI(){
 document.body.classList.toggle('ground-inspect',sim.mode==='inspect');
 setText($('#phase'),sim.paused?'已暂停 · 可以转动镜头仔细观察':sim.mode==='inspect'?'认识你的 '+AIRCRAFT_INFO[getPlane().type].name:(copilotHidden()&&manualTakeoffLesson()?.join(' · '))||sim.phase);$('#takeControl').hidden=!['takeoff','land'].includes(sim.mode);setText($('#pause'),sim.paused?'▶':'Ⅱ');$('#pause').ariaLabel=sim.paused?'继续飞行':'暂停飞行';
 setHTML($('#speedValue'),Math.round(sim.speed*3.6)+'<small> km/h</small>');setText($('#speedKts'),Math.round(sim.speed*1.94384)+' KTS · M '+sim.mach.toFixed(2));
 setHTML($('#altValue'),Math.round(sim.altitude)+'<small> m</small>');setText($('#verticalValue'),'垂直速度 '+(sim.vs>=0?'+':'')+sim.vs.toFixed(1)+' m/s');
 setHTML($('#headingValue'),String(Math.round(sim.heading)%360).padStart(3,'0')+'<small> °</small>');
 setText($('#flightState'),(sim.onGround?'地面':'空中')+' · α '+sim.alpha.toFixed(1)+'° · '+sim.loadFactor.toFixed(1)+' G');
 syncThrottleUI();
 const gearText=Math.abs(sim.gear-sim.gearTarget)>.02?'运动中…':sim.gear>.98?'已放下':'已收起';
 setText($('#gear'),gearText);$('#gear').classList.toggle('active',sim.gear>.98);
 setText($('#quickGearState'),gearText);$('#quickGear').classList.toggle('active',sim.gear>.98);
 setText($('#flapsValue'),Math.round(sim.flaps)+'°');if(document.activeElement!==$('#flaps'))$('#flaps').value=sim.flapTarget;
 setText($('#quickFlapsState'),sim.flaps<.5?'收起 0°':Math.round(sim.flaps)+'°');$('#quickFlaps').classList.toggle('active',sim.flaps>.5);
 const press=sim.brakePressure||0,held=keys.has('KeyB')||touch.has('brake');
 $('#brake').classList.toggle('active',held);$('#brake').setAttribute('aria-pressed',String(held));
 setText($('#brakeState'),sim.park?'停留刹车中':press>.05?'刹车中…':held?'刹车中…':'按住不放');
 setText($('#parkState'),sim.park?'已拉起':'已松开');$('#parkBrake').classList.toggle('active',sim.park);
 for(const [id,val,mult] of [['aileron',sim.aileron,18],['elevator',sim.elevator,20],['rudder',sim.rudder,29]])setText($('#'+id+'Value'),Math.round(val*mult)+'°');
 for(const [id,on,a,b] of [['spoiler',sim.spoilerTarget,'升起','收起'],['reverse',sim.reverseTarget,'打开','关闭'],['door',sim.doorTarget,'打开','关闭'],['lights',sim.lights,'开启','关闭'],['wipers',sim.wipers,'开启','关闭'],['chute',sim.chuteTarget,'放出','收起']]){$('#'+id).classList.toggle('active',!!on);setText($('#'+id+' span'),id==='door'&&$('#door').disabled?(sim.door>.02?'关闭中…':'仅货运外观可用'):on?a:b);}
 const n1=Math.round(sim.engineN1*100);
 for(const id of ['n1a','n1b','n1c','n1d']){const el=$('#'+id);el.style.setProperty('--n1',n1+'%');el.parentElement.querySelector('b').textContent=n1;}
 const [no,text]=manualTakeoffLesson()||lessons[sim.mode]||lessons.manual;$('#lessonNo').textContent=no;$('#lesson').textContent=text;$('#modeLabel').textContent={inspect:'观察模式',takeoff:'自动起飞演示',land:'自动降落演示',free:'自由飞行',manual:getManualTakeoffGuide()?'手动起飞练习':'手动驾驶'}[sim.mode];drawAttitude();
 const warnings=warningList();
 if(warnings.length){$('#warningText').textContent=warnings[0];$('#warningBadge').hidden=false;}else $('#warningBadge').hidden=true;
 if(sim.events.length){const events=sim.events.splice(0,sim.events.length);notify(events[events.length-1]);}
}
const COMPASS_PX=3.2,compassStrip=document.createElement('div');compassStrip.className='compass-strip';
(function buildCompass(){let h='';for(let d=-360;d<=720;d+=5){const x=d*COMPASS_PX,deg=((d%360)+360)%360,major=d%30===0,cardinal=d%90===0;h+=`<i class="tick${d%10===0?' mid':''}" style="left:${x}px"></i>`;if(major){const t=cardinal?({0:'N',90:'E',180:'S',270:'W'})[deg]:String(deg/10).padStart(2,'0');h+=`<span class="tick-label${cardinal?' card':''}" style="left:${x}px">${t}</span>`;}}compassStrip.innerHTML=h;const host=document.querySelector('#compass');if(host)host.appendChild(compassStrip);})();
return {updateUI,warningList,compassStrip,COMPASS_PX};
}
