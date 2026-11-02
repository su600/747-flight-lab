import * as T from 'three';
import {Aircraft,LIVERIES} from './aircraft.js';
import {TwinAircraft} from './twin-aircraft.js';
import {AccurateA330} from './accurate-a330.js';
import {A380Aircraft} from './a380-aircraft.js';
import {fixAircraftWingShading,addCabinLights,updateCabinLights} from './aircraft-lighting.js';
import {World} from './world.js';
import {Flight,clamp,THRUST_DETENTS} from './flight.js';
import {Cockpit} from './cockpit.js';
import {StableDisplay} from './display.js';
import {Airflow} from './airflow.js';
import {createCameraGestures} from './camera-gestures.js';
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
const world=new World(scene,renderer),sim=new Flight();
let plane=new Aircraft(),cockpit=null,airflow=null;
const aircraftCache=new Map();let aircraftRequest=0,liveryVersion=0,desiredLivery='BOE';
const AIRCRAFT_INFO={
 b747:{name:'BOEING 747–400',gear:'18 个轮子，5 组支撑',engines:4,engine:'GE CF6 · N1 %'},
 a380:{name:'AIRBUS A380–800',gear:'22 个轮子，5 组支撑',engines:4,engine:'TRENT 900 · N1 %',description:'全长双层客舱和四台发动机。外形采用 FlyByWire A380X 模型，非商业用途。'},
 a330:{name:'AIRBUS A330–303',gear:'10 个轮子，3 组支撑',engines:2,engine:'GE CF6-80E1 · N1 %',description:'FlightGear A330-303 外部几何与 GE CF6-80E1 发动机，包含按本模拟器状态映射的简化部件动画。'},
 b777:{name:'BOEING 777–300ER',gear:'14 个轮子，3 组支撑',engines:2,engine:'TWIN ENGINE · N1 %',description:'加长的单层宽体机身、两台大直径发动机和后掠翼尖。原创示意模型，非工程级复刻。'}
};
let originalAbout='',originalEmitters=null;
let camMode='orbit',orbitAngle=.87,orbitHeight=.29,orbitDistance=137,focus=new T.Vector3(0,2,0),firstCamera=true,rate=1,panel=null,toastTimer,frameCount=0,elapsed=0,fps=0;
let orbitOverview=true,overviewCraft=null;
let lookYaw=0,lookPitch=0,viewFov=43,towerZoom=1,cancelCameraGestures=()=>{};
const keys=new Set(),touch=new Set(),surface={roll:0,pitch:0,yaw:0};
const camPos=new T.Vector3(),camTarget=new T.Vector3(),targetPos=new T.Vector3(),planePos=new T.Vector3();
const lookDir=new T.Vector3(),lookRight=new T.Vector3(),panRight=new T.Vector3(),panUp=new T.Vector3(),inverseHeading=new T.Quaternion();
const attitude=$('#attitude').getContext('2d');
function notify(s){if(!s)return;$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
const sound={enabled:false,ctx:null};
display.onSuspend=()=>{keys.clear();touch.clear();cancelCameraGestures();if(sound.ctx)sound.gain.gain.setTargetAtTime(0,sound.ctx.currentTime,.05);};
function initAudio(){if(sound.ctx)return;const ctx=new AudioContext(),gain=ctx.createGain();gain.gain.value=0;gain.connect(ctx.destination);const osc=ctx.createOscillator();osc.type='sawtooth';const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=230;osc.connect(filter);filter.connect(gain);osc.start();const fan=ctx.createOscillator(),fanGain=ctx.createGain();fan.type='sine';fanGain.gain.value=.015;fan.connect(fanGain);fanGain.connect(gain);fan.start();Object.assign(sound,{ctx,gain,osc,fan});}
function updateAudio(){if(!sound.ctx)return;const v=sound.enabled&&!sim.paused?.025+sim.engine*.08:0;sound.gain.gain.setTargetAtTime(v,sound.ctx.currentTime,.15);sound.osc.frequency.setTargetAtTime(35+sim.engine*55,sound.ctx.currentTime,.2);sound.fan.frequency.setTargetAtTime(200+sim.engine*550,sound.ctx.currentTime,.3);}
function overviewDistance(){
 if(innerWidth>=760)return 125;
 // Portrait narrows the horizontal field of view. Fit the aircraft's full
 // footprint rather than reusing a fixed desktop distance.
 const aspect=Math.max(.1,innerWidth/Math.max(1,innerHeight));
 const halfHorizontal=Math.atan(Math.tan(radians(43)/2)*aspect);
 const dimensions=plane.dimensions,span=dimensions?Math.max(dimensions.x,dimensions.z):70;
 return clamp(Math.max(165,span*.58/Math.sin(halfHorizontal)*1.35),165,1200);
}
function setCam(mode){cancelCameraGestures();camMode=mode;focus.set(0,2,0);lookYaw=lookPitch=0;viewFov=mode==='cockpit'?66:43;towerZoom=1;if(mode==='orbit'){orbitAngle=.87;orbitHeight=.25;orbitOverview=true;overviewCraft=plane;orbitDistance=overviewDistance();}firstCamera=true;all('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===mode));$('#cockpitOverlay').hidden=mode!=='cockpit'||!!cockpit;document.body.classList.toggle('cockpit-mode',mode==='cockpit');}
function beginCameraGesture(kind){if(camMode==='chase'||(camMode==='tower'&&kind!=='zoom'))setCam('orbit');}
function rotateCamera(dx,dy){
 if(camMode==='cockpit'||camMode==='wing'){lookYaw-=dx*.005;lookPitch=clamp(lookPitch-dy*.005,-1.3,1.3);}
 else if(camMode==='orbit'){orbitAngle-=dx*.006;orbitHeight=clamp(orbitHeight+dy*.005,-1.48,1.48);}
}
function panCamera(dx,dy){
 if(camMode==='cockpit'||camMode==='wing'){rotateCamera(dx,dy);return;}
 if(camMode!=='orbit')return;
 orbitOverview=false;
 const scale=2*orbitDistance*Math.tan(radians(43)/2)/Math.max(1,renderer.domElement.clientHeight);
 inverseHeading.setFromAxisAngle(_yAxis,-radians(90-sim.heading));
 panRight.set(1,0,0).applyQuaternion(camera.quaternion).applyQuaternion(inverseHeading);
 panUp.set(0,1,0).applyQuaternion(camera.quaternion).applyQuaternion(inverseHeading);
 focus.addScaledVector(panRight,-dx*scale).addScaledVector(panUp,dy*scale).clampLength(0,400);
}
function zoomCamera(factor){
 if(camMode==='orbit'){orbitOverview=false;orbitDistance=clamp(orbitDistance*factor,5,2000);}
 else if(camMode==='cockpit'||camMode==='wing')viewFov=clamp(viewFov*factor,25,100);
 else if(camMode==='tower')towerZoom=clamp(towerZoom*factor,.1,8);
}
function focusPart(part){setCam('orbit');orbitOverview=false;const specs={gear:[9,-3,0,52,.1,1.1],wing:[-5,0,17,65,.5,.9],tail:[-31,4,0,53,.25,1.0],engine:[2,-2,13,35,.12,.7]};if(plane.type==='a330'){specs.gear=[-5.8,-4.5,5,45,.1,1.1];specs.engine=[-1.5,-2.35,9.4,32,.12,.7];specs.tail=[-27,4,0,50,.25,1];}const [x,y,z,d,h,a]=specs[part];focus.set(x,y,z);orbitDistance=d;orbitHeight=h;orbitAngle=a;}
function go(mode){sim.reset(mode);surface.roll=surface.pitch=surface.yaw=0;all('#aileron,#elevator,#rudder').forEach(s=>s.value=0);rate=1;$('#rate').textContent='1×';$('#retryDialog').close();all('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));if(mode==='inspect'){setCam('orbit');}else if(mode==='land'){setCam('chase');}else if(mode==='takeoff'){setCam('orbit');orbitAngle=2;orbitHeight=.24;}else setCam('chase');$('#drawer').hidden=true;panel=null;all('[data-panel]').forEach(b=>b.classList.remove('active'));syncThrottleUI();updateUI();}
function openPanel(name){panel=panel===name?null:name;$('#drawer').hidden=!panel;all('[data-panel]').forEach(b=>b.classList.toggle('active',b.dataset.panel===panel));all('.drawer-content').forEach(s=>s.hidden=s.id!==panel+'Panel');$('#drawerTitle').textContent={aircraft:'选择飞机',parts:'可动部件',livery:'换一身新涂装',world:'天空，由你选择',about:'认识这架飞机'}[panel]||'';}
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
// Cache each complete model for the session, including in-flight loads. This bounds GPU
// allocations to four models and avoids disposing geometry shared by the parked 747s.
function syncCabinTime(craft){if(typeof craft.setCabinTime==='function')craft.setCabinTime(world.time);else updateCabinLights(craft,world.time);}
function getAircraft(type){
 if(!aircraftCache.has(type)){
  const p=(async()=>{
   const craft=type==='a380'?new A380Aircraft():type==='a330'?new AccurateA330():new TwinAircraft(type);
   let loaded=false;
   try{await craft.load();loaded=true;fixAircraftWingShading(craft);if(typeof craft.setCabinTime!=='function')addCabinLights(craft);syncCabinTime(craft);return craft;}
   // Both externally loaded aircraft already clean up a failed load; only
   // dispose here if a later coordinator step failed after successful loading.
   catch(error){if(loaded)craft.dispose?.();throw error;}
  })();
  aircraftCache.set(type,p);p.catch(()=>{if(aircraftCache.get(type)===p)aircraftCache.delete(type);});
 }
 return aircraftCache.get(type);
}
function showLivery(){
 const l=LIVERIES.find(x=>x.id===plane.livery);$('#liveryName').textContent=l?.name||plane.livery;
 all('[data-livery]').forEach(x=>{const active=x.dataset.livery===plane.livery;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));x.querySelector('.check').textContent=active?'✓':'';});
 const details=$('#liveryDetails');details.hidden=plane.type!=='a330';details.textContent=plane.liveryInfo?.disclosure||'A330-303 外形；所有 14 款涂装均为移植或近似。';
}
function showAircraft(){
 const info=AIRCRAFT_INFO[plane.type],isA330=plane.type==='a330',cargo=isA330&&plane.cargoMode;
 $('#aircraftSelect').value=plane.type;$('#aircraftName').textContent=cargo?'AIRBUS A330–300 · 货运外观示意':info.name;$('#gearDescription').textContent=info.gear;$('#engineLabel').textContent=info.engine;
 const door=$('#door');door.disabled=isA330&&!cargo;$('#doorLabel').textContent=isA330?'主货舱门（示意）':'下层货舱门';
 door.title=door.disabled?'A330 客运外观无可动主货舱门；选择货运涂装可查看示意门':'';
 // A passenger airframe has no supported main-deck cargo door. Close any
 // previously open door without leaving the shared flight-model interlock stuck.
 if(door.disabled)sim.doorTarget=0;
 all('[data-aircraft]').forEach(b=>{const active=b.dataset.aircraft===plane.type;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 all('.engine-meter').forEach((el,i)=>el.hidden=i>=info.engines);
 $('#aboutDetails').innerHTML=plane.type==='b747'?originalAbout:isA330?`<div class="about-number">A330<span>–303</span></div><p>${info.description}</p><div class="spec-grid"><div><strong>63.7<small> m</small></strong><span>参考机长</span></div><div><strong>60.3<small> m</small></strong><span>参考翼展</span></div><div><strong>16.8<small> m</small></strong><span>约高</span></div><div><strong>2<small> 台</small></strong><span>GE CF6-80E1</span></div></div><p class="hint">${cargo?'当前为 A330-300 货运外观示意，并非 A330-200F；主货舱门与涂装均为近似。':'14 款涂装均为移植或近似，不保证机号及发动机与实机一致。'}参考尺寸不等于网格工程校核；飞行力学和驾驶舱沿用 747 简化版本，动画不代表真实系统时序。</p><a class="source-link" href="/747/assets/accurate-a330/NOTICE" target="_blank">A330 模型来源、署名与 GPL 许可 ↗</a>`:`<div class="about-number">${plane.type==='a380'?'A380':'777'}</div><p>${info.description}</p><p class="hint">飞行力学沿用 747 简化模型，驾驶舱沿用 747 示意座舱，部件运动并非真实系统时序。</p>`;
}
function setEmitters(craft){
 airflow.plane=craft;
 if(craft.type==='b747'){Object.assign(airflow,originalEmitters);return;}
 if(craft.type==='a330'){
  airflow.engines=[-9.41,9.41].map(z=>new T.Vector3(-1.5,-2.35,z));
  airflow.tips=[-29.48,29.48].map(z=>new T.Vector3(-14.57,1.71,z));
  airflow.mainGear=[-6.77,-4.9].flatMap(x=>[-5.02,4.99].map(z=>new T.Vector3(x,-craft.contact,z)));return;
 }
 const span=craft.type==='a380'?79.8:craft.type==='a330'?60.3:64.8;
 const positions=craft.type==='a380'?[-.27,-.15,.15,.27]:[-.22,.22];
 airflow.engines=positions.map(z=>new T.Vector3(0,-2,span*z));
 airflow.tips=[new T.Vector3(-17,0,-span/2),new T.Vector3(-17,0,span/2)];
 airflow.mainGear=[-4.2,4.2].map(z=>new T.Vector3(-3,-craft.contact,z));
}
async function selectAircraft(type){
 if(!AIRCRAFT_INFO[type])return false;
 const request=++aircraftRequest;
 if(type===plane.type){$('#aircraftStatus').textContent='';$('#aircraftSelect').value=type;return true;}
 $('#aircraftSelect').value=type;$('#aircraftStatus').textContent='正在载入 '+AIRCRAFT_INFO[type].name+'…';
 try{
  const next=await getAircraft(type);if(request!==aircraftRequest)return false;
  // Reconcile changes made to the livery while the model was loading.
  let selected,applied,retries=0;do{
   selected=desiredLivery;
   try{applied=await next.setLivery(selected);}catch(error){if(request!==aircraftRequest)return false;if(selected!==desiredLivery)continue;throw error;}
   if(request!==aircraftRequest)return false;
   if(!applied&&selected===desiredLivery&&++retries>2)throw Error('涂装切换未完成，请重试');
  }while(!applied||selected!==desiredLivery);
  next.root.position.copy(plane.root.position);next.root.quaternion.copy(plane.root.quaternion);next.root.visible=plane.root.visible;
  next.update(sim,0);syncCabinTime(next);scene.remove(plane.root);plane=next;scene.add(plane.root);setEmitters(plane);
  if(window.flightLab)window.flightLab.plane=plane;
  $('#aircraftStatus').textContent='已切换 · 飞行状态保持不变';showAircraft();showLivery();return true;
 }catch(error){if(request===aircraftRequest){$('#aircraftStatus').textContent='载入失败，请重试';$('#aircraftSelect').value=plane.type;notify(error.message||'机型载入失败');}return false;}
}
async function selectLivery(id){
 if(!LIVERIES.some(l=>l.id===id))return false;
 const version=++liveryVersion;desiredLivery=id;
 while(version===liveryVersion){
  const target=plane,selection=aircraftRequest;
  try{
   // Always issue the request, even if the paint already matches: it invalidates
   // any older pending request on this particular aircraft.
   const applied=await target.setLivery(id);
   if(version!==liveryVersion)return false;
   if(target!==plane||selection!==aircraftRequest)continue;
   if(!applied)return false;
   syncCabinTime(target);showAircraft();showLivery();return true;
  }catch(error){
   if(version!==liveryVersion)return false;
   // A failure belongs to the craft that attempted the load. It must not undo
   // an independently successful application on a subsequently selected craft.
   if(target!==plane||selection!==aircraftRequest)continue;
   desiredLivery=target.livery;syncCabinTime(target);showAircraft();showLivery();notify(error.message);return false;
  }
 }
 return false;
}
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
 $('#spoiler').onclick=()=>notify(sim.control('spoiler',sim.spoilerTarget?0:1));$('#reverse').onclick=()=>notify(sim.control('reverse',sim.reverseTarget?0:1));$('#door').onclick=()=>{focusPart('engine');orbitAngle=-.8;if(plane.type==='a330')focus.set(13.6,1,-2.8);else focus.set(16,-1,0);orbitDistance=46;notify(sim.control('door',sim.doorTarget?0:1));};
 $('#lights').onclick=()=>sim.lights=!sim.lights;$('#wipers').onclick=()=>{sim.wipers=!sim.wipers;setCam('orbit');orbitOverview=false;focus.set(25,3,0);orbitDistance=28;orbitAngle=.65;orbitHeight=.06;};
 $('#engineInspect').onclick=()=>{focusPart('engine');if(sim.mode==='inspect'){setThrottle(sim.throttle>.4?0:.7);}};
 $('#home')?.addEventListener('click',()=>go('inspect'));
 $('#pause').onclick=()=>sim.paused=!sim.paused;
 $('#rate').onclick=()=>{rate=rate===1?2:rate===2?4:1;$('#rate').textContent=rate+'×';};
 $('#takeControl').onclick=manualControl;$('#runwayStart').onclick=()=>{go('manual');sim.flapTarget=20;sim.park=true;setCam('chase');syncThrottleUI();notify('从跑道开始：襟翼 20°，松开停留刹车，再把推力杆推到 TO');};
 $('#assist').onclick=()=>{sim.assist=!sim.assist;$('#assist').classList.toggle('active',sim.assist);};
 all('[data-time]').forEach(b=>b.onclick=()=>{world.setTime(b.dataset.time);syncCabinTime(plane);document.body.dataset.time=b.dataset.time;all('[data-time]').forEach(x=>x.classList.toggle('active',x===b));});
 all('[data-aircraft]').forEach(b=>b.onclick=()=>selectAircraft(b.dataset.aircraft));$('#aircraftSelect').onchange=e=>selectAircraft(e.target.value);
 $('#quality').onchange=e=>{const low=e.target.value==='low';display.setQuality(low);renderer.shadowMap.enabled=!low;airflow?.setQuality(low);};
 $('#sound').onclick=()=>{initAudio();sound.enabled=!sound.enabled;sound.ctx.resume();$('#sound').classList.toggle('on',sound.enabled);$('#sound').ariaLabel=sound.enabled?'关闭声音':'开启声音';notify(sound.enabled?'发动机声音已开启':'声音已关闭');};
 $('#help').onclick=()=>$('#helpDialog').showModal();all('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
 $('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notify('请使用浏览器的全屏按钮');}};
 $('#liveries').innerHTML=LIVERIES.map((l,i)=>`<button class="livery-card ${i===0?'active':''}" data-livery="${l.id}" aria-pressed="${i===0}"><span class="livery-swatch" aria-hidden="true"><img src="/747/assets/livery-logos/${l.logo}" alt="" decoding="async"></span><span><b>${l.name}</b><small>${l.en}</small></span><span class="check" aria-hidden="true">${i===0?'✓':''}</span></button>`).join('');
 all('[data-livery]').forEach(b=>b.onclick=()=>selectLivery(b.dataset.livery));
 const ignore=()=>document.activeElement?.matches('input,select,textarea,[role=slider]')||!!document.querySelector('dialog[open]');
 addEventListener('keydown',e=>{if(ignore())return;const cameraKeys={KeyI:[0,-24],KeyK:[0,24],KeyJ:[-24,0],KeyL:[24,0]};if(cameraKeys[e.code]){e.preventDefault();beginCameraGesture('rotate');rotateCamera(...cameraKeys[e.code]);return;}if(e.code==='BracketLeft'||e.code==='BracketRight'){e.preventDefault();beginCameraGesture('zoom');zoomCamera(e.code==='BracketLeft'?.9:1.1);return;}if(e.code==='KeyR'){if(!e.repeat)setCam('orbit');return;}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyG')toggleGear();if(e.code==='KeyF')flapStep();if(e.code==='KeyP')$('#parkBrake').click();if(e.code==='KeyT')$('#reverse').click();if(e.code==='KeyH')manualControl();if(e.code==='Space')sim.paused=!sim.paused;if(/^Digit[1-5]$/.test(e.code))setCam(['orbit','chase','cockpit','wing','tower'][+e.code.at(-1)-1]);});
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();touch.clear();cancelCameraGestures();});
 document.addEventListener('visibilitychange',()=>{keys.clear();touch.clear();cancelCameraGestures();});
 all('[data-hold]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.add(b.dataset.hold);b.classList.add('active');};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>{touch.delete(b.dataset.hold);b.classList.remove('active');};});
 const gestures=createCameraGestures(renderer.domElement,{onStart:beginCameraGesture,onRotate:rotateCamera,onPan:panCamera,onZoom:zoomCamera});
 cancelCameraGestures=()=>gestures.cancel();
}
function readInput(dt){const pressed=(...a)=>a.some(k=>keys.has(k));const pitch=clamp((pressed('ArrowDown','KeyS')||touch.has('down')?1:0)-(pressed('ArrowUp','KeyW')||touch.has('up')?1:0)+surface.pitch,-1,1),roll=clamp((pressed('ArrowRight','KeyD')||touch.has('right')?1:0)-(pressed('ArrowLeft','KeyA')||touch.has('left')?1:0)+surface.roll,-1,1),yaw=clamp((pressed('KeyE')?1:0)-(pressed('KeyQ')?1:0)+surface.yaw,-1,1);if(pitch||roll||yaw)manualControl();if(pressed('ShiftLeft','ShiftRight','Equal')){manualControl();notify(sim.control('throttle',clamp(sim.throttle+dt*.3,0,1)));}if(pressed('ControlLeft','ControlRight','Minus')){manualControl();notify(sim.control('throttle',clamp(sim.throttle-dt*.3,0,1)));}return{pitch,roll,yaw,brake:pressed('KeyB')||touch.has('brake')?1:0};}
function updateCamera(dt){
 if(camMode==='orbit'&&orbitOverview&&overviewCraft!==plane){overviewCraft=plane;orbitDistance=overviewDistance();firstCamera=true;}
 planePos.copy(plane.root.position);const heading=_quat.setFromAxisAngle(_yAxis,radians(90-sim.heading));
 if(camMode==='orbit'){const offset=_off.set(Math.cos(orbitAngle)*Math.cos(orbitHeight)*orbitDistance,Math.sin(orbitHeight)*orbitDistance,Math.sin(orbitAngle)*Math.cos(orbitHeight)*orbitDistance).applyQuaternion(heading);targetPos.copy(focus).applyQuaternion(heading).add(planePos);camPos.copy(targetPos).add(offset);}
 if(camMode==='chase'){targetPos.copy(planePos).add(_v1.copy(CHASE_LOOK).applyQuaternion(heading));camPos.copy(planePos).add(_v1.copy(CHASE_POS).applyQuaternion(heading));}
 if(camMode==='cockpit'||camMode==='wing'){
  const inside=camMode==='cockpit';
  camPos.copy(inside?COCKPIT_EYE:WING_POS);lookDir.copy(inside?COCKPIT_LOOK:WING_LOOK);
  if(inside){camPos.multiply(cockpit?.native.scale||plane.native.scale);lookDir.multiply(cockpit?.native.scale||plane.native.scale);}
  else if(plane.type==='a380'){camPos.z=4.5;camPos.y=2;lookDir.z=40;}
  lookDir.sub(camPos);lookRight.crossVectors(lookDir,_yAxis).normalize();
  lookDir.applyAxisAngle(lookRight,lookPitch).applyAxisAngle(_yAxis,lookYaw).applyQuaternion(plane.root.quaternion);
  camPos.applyQuaternion(plane.root.quaternion).add(planePos);targetPos.copy(camPos).add(lookDir);
 }
 if(camMode==='tower'){camPos.set(900,68,-570);targetPos.copy(planePos);camera.fov=clamp(clamp(2200/camPos.distanceTo(planePos),2.8,43)*towerZoom,2.8,85);}
 else camera.fov=camMode==='cockpit'||camMode==='wing'?viewFov:43;
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
const viewHint=matchMedia('(pointer:coarse)').matches?'单指拖动环绕，双指移动或张合可平移、缩放；点重置按钮回到默认视角。':'左键拖动环绕，右键拖动平移，滚轮缩放；点重置按钮回到默认视角。';
const lessons={inspect:['01 / EXPLORE',viewHint],takeoff:['02 / TAKEOFF','起飞需要足够的速度：推力杆推到 TO，速度够了再轻轻抬头，机翼就产生升力。'],land:['03 / LANDING','着陆要放下襟翼和起落架。主轮轻轻接地后，扰流板、反推和脚刹一起帮你减速。'],free:['04 / YOUR TURN','方向键控制飞机，Shift 推油门、Ctrl 收油门。松开左右键，辅助驾驶会帮你把机翼放平。'],manual:['04 / YOUR TURN','你正在驾驶飞机。推力杆给能量，操纵杆改变姿态；速度太慢或抬头太高就会失速。']};
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
 setText($('#phase'),sim.paused?'已暂停 · 可以转动镜头仔细观察':sim.mode==='inspect'?'认识你的 '+AIRCRAFT_INFO[plane.type].name:sim.phase);$('#takeControl').hidden=!['takeoff','land'].includes(sim.mode);setText($('#pause'),sim.paused?'▶':'Ⅱ');$('#pause').ariaLabel=sim.paused?'继续飞行':'暂停飞行';
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
 for(const [id,on,a,b] of [['spoiler',sim.spoilerTarget,'升起','收起'],['reverse',sim.reverseTarget,'打开','关闭'],['door',sim.doorTarget,'打开','关闭'],['lights',sim.lights,'开启','关闭'],['wipers',sim.wipers,'开启','关闭']]){$('#'+id).classList.toggle('active',!!on);setText($('#'+id+' span'),id==='door'&&$('#door').disabled?(sim.door>.02?'关闭中…':'仅货运外观可用'):on?a:b);}
 const n1=Math.round(sim.engineN1*100);
 for(const id of ['n1a','n1b','n1c','n1d']){const el=$('#'+id);el.style.setProperty('--n1',n1+'%');el.parentElement.querySelector('b').textContent=n1;}
 const [no,text]=lessons[sim.mode]||lessons.manual;$('#lessonNo').textContent=no;$('#lesson').textContent=text;$('#modeLabel').textContent={inspect:'观察模式',takeoff:'自动起飞演示',land:'自动降落演示',free:'自由飞行',manual:'手动驾驶'}[sim.mode];drawAttitude();
 const warnings=warningList();
 if(warnings.length){$('#warningText').textContent=warnings[0];$('#warningBadge').hidden=false;}else $('#warningBadge').hidden=true;
 if(sim.events.length){const events=sim.events.splice(0,sim.events.length);notify(events[events.length-1]);}
}
const COMPASS_PX=3.2,compassStrip=document.createElement('div');compassStrip.className='compass-strip';
(function buildCompass(){let h='';for(let d=-360;d<=720;d+=5){const x=d*COMPASS_PX,deg=((d%360)+360)%360,major=d%30===0,cardinal=d%90===0;h+=`<i class="tick${d%10===0?' mid':''}" style="left:${x}px"></i>`;if(major){const t=cardinal?({0:'N',90:'E',180:'S',270:'W'})[deg]:String(deg/10).padStart(2,'0');h+=`<span class="tick-label${cardinal?' card':''}" style="left:${x}px">${t}</span>`;}}compassStrip.innerHTML=h;const host=document.querySelector('#compass');if(host)host.appendChild(compassStrip);})();
function resize(){cancelCameraGestures();display.requestResize();if(camMode==='orbit'&&orbitOverview){orbitDistance=overviewDistance();overviewCraft=plane;firstCamera=true;}}
addEventListener('resize',resize);
let running=true;
async function start(){
 try{await plane.load();fixAircraftWingShading(plane);aircraftCache.set('b747',Promise.resolve(plane));scene.add(plane.root);airflow=new Airflow(scene,plane);originalEmitters={engines:airflow.engines,tips:airflow.tips,mainGear:airflow.mainGear};originalAbout=$('#aboutDetails').innerHTML;$('#loadingText').textContent='装载驾驶舱、操纵杆和仪表…';
 try{cockpit=await new Cockpit().loadInterior(plane.native.scale,$('#attitude'));scene.add(cockpit.root);}catch(e){console.warn('驾驶舱使用简化视角',e);cockpit=null;}
 // Parked aircraft share geometry and textures, with animations fixed at their current neutral state.
 for(const [x,z] of [[-1200,-390],[-510,-390],[180,-390],[640,-390]]){const p=plane.root.clone(true),materials=new Map();p.position.set(x,plane.contact,z);p.rotation.y=-Math.PI/2;world.softShadow(x+6,z+2,66,76);p.traverse(o=>{if(o.isMesh){o.castShadow=false;const copy=m=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);}});scene.add(p);p.updateMatrixWorld(true);p.traverse(o=>{o.matrixAutoUpdate=false;});}
 addCabinLights(plane);syncCabinTime(plane);
 bindUI();resize();setCam('orbit');$('#loading').remove();
 window.flightLab={sim,plane,world,airflow,camera,renderer,display,go,setCam,focusPart,setThrottle,selectAircraft,selectLivery,cameraView(){return{mode:camMode,azimuth:orbitAngle,elevation:orbitHeight,distance:orbitDistance,focus:focus.toArray(),lookYaw,lookPitch,viewFov,towerZoom};},advance(seconds){for(let i=0;i<seconds*120;i++)sim.step(1/120,{});},snapshot(){return{mode:sim.mode,phase:sim.phase,x:sim.x,z:sim.z,altitude:sim.altitude,speed:sim.speed,mach:sim.mach,alpha:sim.alpha,stallSpeed:sim.stallSpeed,loadFactor:sim.loadFactor,throttle:sim.throttle,engineN1:sim.engineN1,gear:sim.gear,flaps:sim.flaps,park:sim.park,onGround:sim.onGround,failed:sim.failed,complete:sim.complete,stalled:sim.stalled,warnings:warningList(),aircraft:plane.type,livery:plane.livery,dimensions:plane.dimensions.toArray(),contact:plane.contact,engines:AIRCRAFT_INFO[plane.type].engines,animations:plane.a330Animations?.length??plane.bindings?.length??(plane.type==='b747'?plane.animations.length:Object.values(plane.parts).reduce((n,items)=>n+items.length,0)),paint:plane.type==='a330'?'a330-atlas':plane.paintLivery?'airline-markings':'747-atlas',model:plane.liveryInfo?.model||AIRCRAFT_INFO[plane.type].name,liveryInfo:plane.liveryInfo?{...plane.liveryInfo}:null,cargoMode:plane.type==='a330'?plane.cargoMode:null,cabinTime:world.time,cabinLit:plane.cabinWindowLights?.visible??null,fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,display:display.diagnostics()};}};
 let last=performance.now(),uiTime=0;display.onResume=()=>{last=performance.now();};
 function frame(now){if(!running)return;requestAnimationFrame(frame);if(!display.beginFrame()){last=now;return;}let realDt=Math.min((now-last)/1000,.05);last=now;const input=readInput(realDt);const dt=realDt*rate;const n=Math.max(1,Math.ceil(dt*120));for(let i=0;i<n;i++)sim.step(dt/n,input);
 plane.root.position.set(sim.x,plane.contact+sim.altitude+(sim.onGround?Math.max(0,Math.sin(radians(sim.pitch))*4):0),sim.z);plane.root.quaternion.setFromEuler(_euler.set(radians(sim.bank),radians(90-sim.heading),radians(sim.pitch)));plane.root.visible=camMode!=='cockpit';plane.update(sim,sim.paused?0:dt);if(cockpit){cockpit.root.visible=camMode==='cockpit';if(cockpit.root.visible){cockpit.root.position.copy(plane.root.position);cockpit.root.quaternion.copy(plane.root.quaternion);cockpit.update(sim,sim.paused?0:dt);cockpit.draw(sim);}}world.update(sim.paused?0:dt,plane.root.position);airflow?.update(sim,dt,camMode,world.time);compassStrip.style.transform=`translateX(${-sim.heading*COMPASS_PX}px)`;updateCamera(realDt);renderer.render(scene,camera);display.presented(now);updateAudio();
 uiTime+=realDt;if(uiTime>.09){updateUI();uiTime=0;}if(sim.failed&&!$('#retryDialog').open){$('#retryReason').textContent=sim.message;$('#retryDialog').showModal();}
 elapsed+=realDt;frameCount++;if(elapsed>1){fps=Math.round(frameCount/elapsed);elapsed=0;frameCount=0;}
 }requestAnimationFrame(frame);
 }catch(e){console.error(e);$('#loadingText').textContent='载入遇到了问题：'+e.message+'。请刷新重试。';}
}
start();
