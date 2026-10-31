import * as T from 'three';
import {Aircraft,LIVERIES} from './aircraft.js';
import {World} from './world.js';
import {Flight,clamp,THRUST_DETENTS} from './flight.js';
import {Cockpit} from './cockpit.js';
import {StableDisplay} from './display.js';
import {Airflow} from './airflow.js';
const domCache=new Map();
const $=s=>{let e=domCache.get(s);if(!e){e=document.querySelector(s);if(e)domCache.set(s,e);}return e;},all=s=>Array.from(document.querySelectorAll(s));
const lastText=new WeakMap();
const setText=(el,v)=>{if(lastText.get(el)!==v){lastText.set(el,v);el.textContent=v;}};
const setHTML=(el,v)=>{if(lastText.get(el)!==v){lastText.set(el,v);el.innerHTML=v;}};
const _quat=new T.Quaternion(),_euler=new T.Euler(0,0,0,'YZX'),_yAxis=new T.Vector3(0,1,0),_off=new T.Vector3(),_v1=new T.Vector3(),_shake=new T.Vector3();
const COCKPIT_EYE=new T.Vector3(24.05,3.8,-.55),COCKPIT_LOOK=new T.Vector3(124.05,-13.83,-.55),CHASE_LOOK=new T.Vector3(22,4,0),CHASE_POS=new T.Vector3(-115,35,7),WING_POS=new T.Vector3(3,1.3,3.5),WING_LOOK=new T.Vector3(-12,1,35);
const radians=x=>x*Math.PI/180;
let renderer;
// Keep millimetre-separated runway paint stable even with the cockpit's close near plane.
try{
 const canvas=document.createElement('canvas');
 // Supply our own context: Three r170 otherwise requests an alpha-enabled drawing buffer.
 const context=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false,preserveDrawingBuffer:true,powerPreference:'default'});
 if(!context)throw Error('WebGL2 unavailable');
 renderer=new T.WebGLRenderer({canvas,context,alpha:false,logarithmicDepthBuffer:true});
}catch(e){$('#loadingText').textContent='浏览器暂时不能显示三维画面。请用 Chrome 或 Edge，并开启硬件加速后重试。';throw e;}
renderer.setClearColor(0xb9d2db,1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.83;$('#viewport').appendChild(renderer.domElement);
const display=new StableDisplay(renderer,$('#viewport'));display.beginFrame();
const scene=new T.Scene(),camera=new T.PerspectiveCamera(43,innerWidth/innerHeight,.2,120000);
const world=new World(scene,renderer),sim=new Flight(),plane=new Aircraft();
let cockpit=null,airflow=null;
let camMode='orbit',orbitAngle=.87,orbitHeight=.29,orbitDistance=137,focus=new T.Vector3(0,2,0),firstCamera=true,rate=1,panel=null,toastTimer,frameCount=0,elapsed=0,fps=0;
const keys=new Set(),touch=new Set(),surface={roll:0,pitch:0,yaw:0};
const camPos=new T.Vector3(),camTarget=new T.Vector3(),targetPos=new T.Vector3(),planePos=new T.Vector3();
const attitude=$('#attitude').getContext('2d');
function notify(s){if(!s)return;$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
const sound={enabled:false,ctx:null};
display.onSuspend=()=>{keys.clear();touch.clear();if(sound.ctx)sound.gain.gain.setTargetAtTime(0,sound.ctx.currentTime,.05);};
function initAudio(){if(sound.ctx)return;const ctx=new AudioContext(),gain=ctx.createGain();gain.gain.value=0;gain.connect(ctx.destination);const osc=ctx.createOscillator();osc.type='sawtooth';const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=230;osc.connect(filter);filter.connect(gain);osc.start();const fan=ctx.createOscillator(),fanGain=ctx.createGain();fan.type='sine';fanGain.gain.value=.015;fan.connect(fanGain);fanGain.connect(gain);fan.start();Object.assign(sound,{ctx,gain,osc,fan});}
function updateAudio(){if(!sound.ctx)return;const v=sound.enabled&&!sim.paused?.025+sim.engine*.08:0;sound.gain.gain.setTargetAtTime(v,sound.ctx.currentTime,.15);sound.osc.frequency.setTargetAtTime(35+sim.engine*55,sound.ctx.currentTime,.2);sound.fan.frequency.setTargetAtTime(200+sim.engine*550,sound.ctx.currentTime,.3);}
function setCam(mode){camMode=mode;focus.set(0,2,0);if(mode==='orbit'){orbitAngle=.87;orbitHeight=.25;orbitDistance=innerWidth<760?165:125;}firstCamera=true;all('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===mode));$('#cockpitOverlay').hidden=mode!=='cockpit'||!!cockpit;document.body.classList.toggle('cockpit-mode',mode==='cockpit');}
function focusPart(part){setCam('orbit');const specs={gear:[9,-3,0,52,.1,1.1],wing:[-5,0,17,65,.5,.9],tail:[-31,4,0,53,.25,1.0],engine:[2,-2,13,35,.12,.7]};const [x,y,z,d,h,a]=specs[part];focus.set(x,y,z);orbitDistance=d;orbitHeight=h;orbitAngle=a;}
function go(mode){sim.reset(mode);surface.roll=surface.pitch=surface.yaw=0;all('#aileron,#elevator,#rudder').forEach(s=>s.value=0);rate=1;$('#rate').textContent='1×';$('#retryDialog').close();all('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));if(mode==='inspect'){setCam('orbit');}else if(mode==='land'){setCam('chase');}else if(mode==='takeoff'){setCam('orbit');orbitAngle=2;orbitHeight=.24;}else setCam('chase');$('#drawer').hidden=true;panel=null;all('[data-panel]').forEach(b=>b.classList.remove('active'));syncThrottleUI();updateUI();}
function openPanel(name){panel=panel===name?null:name;$('#drawer').hidden=!panel;all('[data-panel]').forEach(b=>b.classList.toggle('active',b.dataset.panel===panel));all('.drawer-content').forEach(s=>s.hidden=s.id!==panel+'Panel');$('#drawerTitle').textContent={parts:'可动部件',livery:'换一身新涂装',world:'天空，由你选择',about:'认识空中女王'}[panel]||'';}
function toggleGear(){notify(sim.control('gear',sim.gearTarget?0:1));}
function flapStep(){const list=[0,5,10,20,25,30],i=list.indexOf(sim.flapTarget);notify(sim.control('flaps',list[(i+1)%list.length]));}
function manualControl(){if(['takeoff','land'].includes(sim.mode)){sim.mode='manual';sim.complete=false;sim.phase='你已接管飞机';rate=1;$('#rate').textContent='1×';notify('现在由你驾驶！方向键控制机头与转弯');}}
// ---- Thrust lever ---------------------------------------------------------
const throttleEl=$('#throttle');
const DETENT_SNAP=[0,.66,.84,1];
function detentName(t){if(t<.35)return '慢车';if(t<.75)return '巡航';if(t<.92)return '爬升';return '起飞';}
function setThrottle(value,snap=false){
 let v=clamp(value,0,1);
 if(snap){const nearest=DETENT_SNAP.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);if(Math.abs(nearest-v)<.055)v=nearest;}
 if(Math.abs(sim.throttle-v)>.001){manualControl();notify(sim.control('throttle',v));}
 syncThrottleUI();
}
function syncThrottleUI(){
 const value=clamp(sim.throttle,0,1),pct=Math.round(value*100);
 throttleEl.style.setProperty('--p',String(value));
 throttleEl.setAttribute('aria-valuenow',String(pct));
 throttleEl.setAttribute('aria-valuetext',detentName(value)+' '+pct+'%');
 const det=THRUST_DETENTS.find(d=>Math.abs(d.value-value)<.05);
 $('#throttleValue').textContent=(det?det.en+' ':'')+pct+'%';
}
function throttleValueFromPointer(event){
 const rect=throttleEl.getBoundingClientRect();
 return clamp(1-(event.clientY-rect.top)/rect.height,0,1);
}
throttleEl.addEventListener('pointerdown',e=>{
 e.preventDefault();throttleEl.setPointerCapture(e.pointerId);throttleEl.classList.add('dragging');
 setThrottle(throttleValueFromPointer(e));
});
throttleEl.addEventListener('pointermove',e=>{
 if(!throttleEl.hasPointerCapture(e.pointerId))return;
 setThrottle(throttleValueFromPointer(e));
});
const endThrottleDrag=e=>{
 if(throttleEl.hasPointerCapture?.(e.pointerId))throttleEl.releasePointerCapture(e.pointerId);
 throttleEl.classList.remove('dragging');
 setThrottle(sim.throttle,true);
 // Give the arrow keys back to the aircraft after the lever is released.
 throttleEl.blur();
};
['pointerup','pointercancel','lostpointercapture'].forEach(type=>throttleEl.addEventListener(type,endThrottleDrag));
throttleEl.addEventListener('keydown',e=>{
 const step=e.shiftKey?.02:.04;
 if(e.code==='ArrowUp'||e.code==='PageUp'){e.preventDefault();setThrottle(sim.throttle+(e.code==='PageUp'?.2:step));}
 else if(e.code==='ArrowDown'||e.code==='PageDown'){e.preventDefault();setThrottle(sim.throttle-(e.code==='PageDown'?.2:step));}
 else if(e.code==='Home'){e.preventDefault();setThrottle(0);}
 else if(e.code==='End'){e.preventDefault();setThrottle(1);}
});
// ---- UI -------------------------------------------------------------------
function bindUI(){
 all('[data-mode]').forEach(b=>b.onclick=()=>go(b.dataset.mode));all('[data-retry]').forEach(b=>b.onclick=()=>go(b.dataset.retry));
 all('[data-panel]').forEach(b=>b.onclick=()=>openPanel(b.dataset.panel));$('#closeDrawer').onclick=()=>openPanel(panel);
 all('[data-camera]').forEach(b=>b.onclick=()=>setCam(b.dataset.camera));all('[data-focus]').forEach(b=>b.onclick=()=>focusPart(b.dataset.focus));
 $('#resetCamera').onclick=()=>setCam('orbit');$('#quickGear').onclick=$('#gear').onclick=toggleGear;
 $('#quickFlaps').onclick=flapStep;
 $('#flaps').oninput=e=>notify(sim.control('flaps',Number(e.target.value)));
 $('#parkBrake').onclick=()=>notify(sim.control('park',!sim.park));
 for(const [id,key] of [['aileron','roll'],['elevator','pitch'],['rudder','yaw']])$('#'+id).oninput=e=>{surface[key]=Number(e.target.value);if(sim.mode!=='inspect')manualControl();};
 $('#neutral').onclick=()=>{surface.roll=surface.pitch=surface.yaw=0;all('#aileron,#elevator,#rudder').forEach(s=>s.value=0);};
 $('#spoiler').onclick=()=>notify(sim.control('spoiler',sim.spoilerTarget?0:1));$('#reverse').onclick=()=>notify(sim.control('reverse',sim.reverseTarget?0:1));$('#door').onclick=()=>{focusPart('engine');orbitAngle=-.8;focus.set(16,-1,0);orbitDistance=46;notify(sim.control('door',sim.doorTarget?0:1));};
 $('#lights').onclick=()=>sim.lights=!sim.lights;$('#wipers').onclick=()=>{sim.wipers=!sim.wipers;setCam('orbit');focus.set(25,3,0);orbitDistance=28;orbitAngle=.65;orbitHeight=.06;};
 $('#engineInspect').onclick=()=>{focusPart('engine');if(sim.mode==='inspect'){setThrottle(sim.throttle>.4?0:.7);}};
 $('#home')?.addEventListener('click',()=>go('inspect'));
 $('#pause').onclick=()=>sim.paused=!sim.paused;
 $('#rate').onclick=()=>{rate=rate===1?2:rate===2?4:1;$('#rate').textContent=rate+'×';};
 $('#takeControl').onclick=manualControl;$('#runwayStart').onclick=()=>{go('manual');sim.flapTarget=20;sim.park=true;setCam('chase');syncThrottleUI();notify('从跑道开始：襟翼 20°，松开停留刹车，再把推力杆推到 TO');};
 $('#assist').onclick=()=>{sim.assist=!sim.assist;$('#assist').classList.toggle('active',sim.assist);};
 all('[data-time]').forEach(b=>b.onclick=()=>{world.setTime(b.dataset.time);document.body.dataset.time=b.dataset.time;all('[data-time]').forEach(x=>x.classList.toggle('active',x===b));});
 $('#quality').onchange=e=>{const low=e.target.value==='low';display.setQuality(low);renderer.shadowMap.enabled=!low;airflow?.setQuality(low);};
 $('#sound').onclick=()=>{initAudio();sound.enabled=!sound.enabled;sound.ctx.resume();$('#sound').classList.toggle('on',sound.enabled);$('#sound').ariaLabel=sound.enabled?'关闭声音':'开启声音';notify(sound.enabled?'发动机声音已开启':'声音已关闭');};
 $('#help').onclick=()=>$('#helpDialog').showModal();all('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
 $('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notify('请使用浏览器的全屏按钮');}};
 $('#liveries').innerHTML=LIVERIES.map((l,i)=>`<button class="livery-card ${i===0?'active':''}" data-livery="${l.id}"><span class="livery-swatch" style="background:${l.color}">${l.id==='BOE'?'747':l.id==='KLM'?'♕':l.id==='CCA'?'凤':l.id==='BAW'?'↗':'◉'}</span><span><b>${l.name}</b><small>${l.en}</small></span><span class="check">${i===0?'✓':''}</span></button>`).join('');
 all('[data-livery]').forEach(b=>b.onclick=async()=>{try{await plane.setLivery(b.dataset.livery);$('#liveryName').textContent=LIVERIES.find(x=>x.id===plane.livery).name;all('[data-livery]').forEach(x=>{x.classList.toggle('active',x===b);x.querySelector('.check').textContent=x===b?'✓':'';});}catch(e){notify(e.message);}});
 const ignore=()=>document.activeElement?.matches('input,select,textarea,[role=slider]')||!!document.querySelector('dialog[open]');
 addEventListener('keydown',e=>{if(ignore())return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyG')toggleGear();if(e.code==='KeyF')flapStep();if(e.code==='KeyP')$('#parkBrake').click();if(e.code==='KeyT')$('#reverse').click();if(e.code==='KeyH')manualControl();if(e.code==='Space')sim.paused=!sim.paused;if(/^Digit[1-5]$/.test(e.code))setCam(['orbit','chase','cockpit','wing','tower'][+e.code.at(-1)-1]);});
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();touch.clear();});
 document.addEventListener('visibilitychange',()=>{keys.clear();touch.clear();});
 all('[data-hold]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.add(b.dataset.hold);b.classList.add('active');};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>{touch.delete(b.dataset.hold);b.classList.remove('active');};});
 const canvas=renderer.domElement;let drag=null;canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);if(camMode!=='orbit')setCam('orbit');drag={x:e.clientX,y:e.clientY};};canvas.onpointermove=e=>{if(!drag)return;orbitAngle-=(e.clientX-drag.x)*.006;orbitHeight=clamp(orbitHeight+(e.clientY-drag.y)*.005,-.15,1.42);drag={x:e.clientX,y:e.clientY};};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
 canvas.onwheel=e=>{e.preventDefault();if(camMode!=='orbit')setCam('orbit');orbitDistance=clamp(orbitDistance*Math.exp(e.deltaY*.001),18,800);};
}
function readInput(dt){const pressed=(...a)=>a.some(k=>keys.has(k));const pitch=clamp((pressed('ArrowDown','KeyS')||touch.has('down')?1:0)-(pressed('ArrowUp','KeyW')||touch.has('up')?1:0)+surface.pitch,-1,1),roll=clamp((pressed('ArrowRight','KeyD')||touch.has('right')?1:0)-(pressed('ArrowLeft','KeyA')||touch.has('left')?1:0)+surface.roll,-1,1),yaw=clamp((pressed('KeyE')?1:0)-(pressed('KeyQ')?1:0)+surface.yaw,-1,1);if(pitch||roll||yaw)manualControl();if(pressed('ShiftLeft','ShiftRight','Equal')){manualControl();notify(sim.control('throttle',clamp(sim.throttle+dt*.3,0,1)));}if(pressed('ControlLeft','ControlRight','Minus')){manualControl();notify(sim.control('throttle',clamp(sim.throttle-dt*.3,0,1)));}return{pitch,roll,yaw,brake:pressed('KeyB')||touch.has('brake')?1:0};}
function updateCamera(dt){
 planePos.copy(plane.root.position);const heading=_quat.setFromAxisAngle(_yAxis,radians(90-sim.heading));
 if(camMode==='orbit'){const offset=_off.set(Math.cos(orbitAngle)*Math.cos(orbitHeight)*orbitDistance,Math.sin(orbitHeight)*orbitDistance,Math.sin(orbitAngle)*Math.cos(orbitHeight)*orbitDistance).applyQuaternion(heading);targetPos.copy(focus).applyQuaternion(heading).add(planePos);camPos.copy(targetPos).add(offset);}
 if(camMode==='chase'){targetPos.copy(planePos).add(_v1.copy(CHASE_LOOK).applyQuaternion(heading));camPos.copy(planePos).add(_v1.copy(CHASE_POS).applyQuaternion(heading));}
 if(camMode==='cockpit'){camPos.copy(COCKPIT_EYE).multiply(plane.native.scale).applyQuaternion(plane.root.quaternion).add(planePos);targetPos.copy(COCKPIT_LOOK).multiply(plane.native.scale).applyQuaternion(plane.root.quaternion).add(planePos);}
 if(camMode==='wing'){camPos.copy(WING_POS).applyQuaternion(plane.root.quaternion).add(planePos);targetPos.copy(WING_LOOK).applyQuaternion(plane.root.quaternion).add(planePos);}
 if(camMode==='tower'){camPos.set(900,68,-570);targetPos.copy(planePos);camera.fov=clamp(2200/camPos.distanceTo(planePos),2.8,43);}
 else camera.fov=camMode==='cockpit'?66:43;
 if(camMode!=='cockpit')camPos.y=Math.max(camPos.y,1.2);
 // Light buffet shake when the wing is close to the stall, a real cue in the cockpit.
 if(sim.buffet&&!sim.paused){const shake=.28;camPos.x+=(Math.random()-.5)*shake;camPos.y+=(Math.random()-.5)*shake;camTarget.add(_shake.set((Math.random()-.5)*shake,(Math.random()-.5)*shake,0));}
 const t=firstCamera?1:1-Math.exp(-dt*6);camera.position.lerp(camPos,t);camTarget.lerp(targetPos,t);camera.up.set(0,1,0);if(camMode==='cockpit')camera.up.applyQuaternion(plane.root.quaternion);camera.lookAt(camTarget);const w=display.width,h=display.height;camera.setViewOffset(w,h,camMode==='orbit'&&w>760?(panel?w*.035:-w*.055):0,0,w,h);camera.near=camMode==='cockpit'?.03:.2;camera.updateProjectionMatrix();firstCamera=false;
}
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
const lessons={inspect:['01 / EXPLORE','拖动飞机周围的画面，可以从任意角度观察；滚动鼠标滚轮，靠近看看。'],takeoff:['02 / TAKEOFF','起飞需要足够的速度：推力杆推到 TO，速度够了再轻轻抬头，机翼就产生升力。'],land:['03 / LANDING','着陆要放下襟翼和起落架。主轮轻轻接地后，扰流板、反推和脚刹一起帮你减速。'],free:['04 / YOUR TURN','方向键控制飞机，Shift 推油门、Ctrl 收油门。松开左右键，辅助驾驶会帮你把机翼放平。'],manual:['04 / YOUR TURN','你正在驾驶飞机。推力杆给能量，操纵杆改变姿态；速度太慢或抬头太高就会失速。']};
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
 setText($('#phase'),sim.paused?'已暂停 · 可以转动镜头仔细观察':sim.phase);$('#takeControl').hidden=!['takeoff','land'].includes(sim.mode);setText($('#pause'),sim.paused?'▶':'Ⅱ');$('#pause').ariaLabel=sim.paused?'继续飞行':'暂停飞行';
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
 for(const [id,on,a,b] of [['spoiler',sim.spoilerTarget,'升起','收起'],['reverse',sim.reverseTarget,'打开','关闭'],['door',sim.doorTarget,'打开','关闭'],['lights',sim.lights,'开启','关闭'],['wipers',sim.wipers,'开启','关闭']]){$('#'+id).classList.toggle('active',!!on);setText($('#'+id+' span'),on?a:b);}
 const n1=Math.round(sim.engineN1*100);
 for(const id of ['n1a','n1b','n1c','n1d']){const el=$('#'+id);el.style.setProperty('--n1',n1+'%');el.parentElement.querySelector('b').textContent=n1;}
 const [no,text]=lessons[sim.mode]||lessons.manual;$('#lessonNo').textContent=no;$('#lesson').textContent=text;$('#modeLabel').textContent={inspect:'观察模式',takeoff:'自动起飞演示',land:'自动降落演示',free:'自由飞行',manual:'手动驾驶'}[sim.mode];drawAttitude();
 const warnings=warningList();
 if(warnings.length){$('#warningText').textContent=warnings[0];$('#warningBadge').hidden=false;}else $('#warningBadge').hidden=true;
 if(sim.events.length){const events=sim.events.splice(0,sim.events.length);notify(events[events.length-1]);}
}
const COMPASS_PX=3.2,compassStrip=document.createElement('div');compassStrip.className='compass-strip';
(function buildCompass(){let h='';for(let d=-360;d<=720;d+=5){const x=d*COMPASS_PX,deg=((d%360)+360)%360,major=d%30===0,cardinal=d%90===0;h+=`<i class="tick${d%10===0?' mid':''}" style="left:${x}px"></i>`;if(major){const t=cardinal?({0:'N',90:'E',180:'S',270:'W'})[deg]:String(deg/10).padStart(2,'0');h+=`<span class="tick-label${cardinal?' card':''}" style="left:${x}px">${t}</span>`;}}compassStrip.innerHTML=h;const host=document.querySelector('#compass');if(host)host.appendChild(compassStrip);})();
function resize(){display.requestResize();if(innerWidth<760&&camMode==='orbit'&&orbitDistance===137)orbitDistance=165;}
addEventListener('resize',resize);
let running=true;
async function start(){
 try{await plane.load();scene.add(plane.root);airflow=new Airflow(scene,plane);$('#loadingText').textContent='装载驾驶舱、操纵杆和仪表…';
 try{cockpit=await new Cockpit().loadInterior(plane.native.scale,$('#attitude'));scene.add(cockpit.root);}catch(e){console.warn('驾驶舱使用简化视角',e);cockpit=null;}
 // Parked aircraft share geometry and textures, with animations fixed at their current neutral state.
 for(const [x,z] of [[-1200,-390],[-510,-390],[180,-390],[640,-390]]){const p=plane.root.clone(true);p.position.set(x,plane.contact,z);p.rotation.y=-Math.PI/2;world.softShadow(x+6,z+2,66,76);p.traverse(o=>{if(o.isMesh)o.castShadow=false;});scene.add(p);p.updateMatrixWorld(true);p.traverse(o=>{o.matrixAutoUpdate=false;});}
 bindUI();resize();setCam('orbit');$('#loading').remove();
 window.flightLab={sim,plane,world,camera,renderer,display,go,setCam,focusPart,setThrottle,advance(seconds){for(let i=0;i<seconds*120;i++)sim.step(1/120,{});},snapshot(){return{mode:sim.mode,phase:sim.phase,x:sim.x,z:sim.z,altitude:sim.altitude,speed:sim.speed,mach:sim.mach,alpha:sim.alpha,stallSpeed:sim.stallSpeed,loadFactor:sim.loadFactor,throttle:sim.throttle,engineN1:sim.engineN1,gear:sim.gear,flaps:sim.flaps,park:sim.park,onGround:sim.onGround,failed:sim.failed,complete:sim.complete,stalled:sim.stalled,warnings:warningList(),livery:plane.livery,dimensions:plane.dimensions.toArray(),contact:plane.contact,animations:plane.animations.length,fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,display:display.diagnostics()};}};
 let last=performance.now(),uiTime=0;display.onResume=()=>{last=performance.now();};
 function frame(now){if(!running)return;requestAnimationFrame(frame);if(!display.beginFrame()){last=now;return;}let realDt=Math.min((now-last)/1000,.05);last=now;const input=readInput(realDt);const dt=realDt*rate;const n=Math.max(1,Math.ceil(dt*120));for(let i=0;i<n;i++)sim.step(dt/n,input);
 plane.root.position.set(sim.x,plane.contact+sim.altitude+(sim.onGround?Math.max(0,Math.sin(radians(sim.pitch))*4):0),sim.z);plane.root.quaternion.setFromEuler(_euler.set(radians(sim.bank),radians(90-sim.heading),radians(sim.pitch)));plane.root.visible=camMode!=='cockpit';plane.update(sim,sim.paused?0:dt);if(cockpit){cockpit.root.visible=camMode==='cockpit';if(cockpit.root.visible){cockpit.root.position.copy(plane.root.position);cockpit.root.quaternion.copy(plane.root.quaternion);cockpit.update(sim,sim.paused?0:dt);cockpit.draw(sim);}}world.update(sim.paused?0:dt,plane.root.position);airflow?.update(sim,dt,camMode,world.time);compassStrip.style.transform=`translateX(${-sim.heading*COMPASS_PX}px)`;updateCamera(realDt);renderer.render(scene,camera);display.presented(now);updateAudio();
 uiTime+=realDt;if(uiTime>.09){updateUI();uiTime=0;}if(sim.failed&&!$('#retryDialog').open){$('#retryReason').textContent=sim.message;$('#retryDialog').showModal();}
 elapsed+=realDt;frameCount++;if(elapsed>1){fps=Math.round(frameCount/elapsed);elapsed=0;frameCount=0;}
 }requestAnimationFrame(frame);
 }catch(e){console.error(e);$('#loadingText').textContent='载入遇到了问题：'+e.message+'。请刷新重试。';}
}
start();
