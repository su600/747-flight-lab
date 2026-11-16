import * as T from 'three';
import {Aircraft,LIVERIES} from './aircraft.js';
import {realityFor} from './livery-reality.js';
import {preloadAircraft,prefetchInOrder,isPreloaded,installPreloadedFetch} from './preload.js';
installPreloadedFetch();
import {fixAircraftWingShading,addCabinLights,updateCabinLights} from './aircraft-lighting.js';
import {World} from './world.js';
import {Weather} from './weather.js';
import {KNOT_MS} from './weather-math.js';
import {Flight,groundLift} from './flight.js';
import {tailSamples,makePitchLimit} from './tail-clearance.js';
import {Cockpit} from './cockpit.js';
import {setCockpitAirframeVisibility,cameraModeForWiperToggle} from './cockpit-view.js';
import {createCamera} from './camera.js';
import {StableDisplay} from './display.js';
import {Airflow} from './airflow.js';
import {LandingLights} from './landing-lights.js';
import {EngineSound} from './audio.js';
import {createInput} from './input.js';
import {createCourseProgress} from './lesson-course.js';
import {createHUD} from './ui/hud.js';
import {$,all} from './ui/dom.js';
const _euler=new T.Euler(0,0,0,'YZX');
const radians=x=>x*Math.PI/180;
let renderer;
// Keep millimetre-separated runway paint stable even with the cockpit's close near plane.
try{
 const canvas=document.createElement('canvas');
 // Supply our own context: Three r170 otherwise requests an alpha-enabled drawing buffer.
 // preserveDrawingBuffer costs a full-buffer copy on many GPUs; StableDisplay
 // keeps its own throttled backup instead. Ask for the discrete GPU when present.
 const context=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
 if(!context)throw Error('WebGL2 unavailable');
 renderer=new T.WebGLRenderer({canvas,context,alpha:false,logarithmicDepthBuffer:true});
}catch(e){$('#loadingText').textContent='浏览器暂时不能显示三维画面。请用 Chrome 或 Edge，并开启硬件加速后重试。';throw e;}
renderer.setClearColor(0xa9c6da,1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.83;$('#viewport').appendChild(renderer.domElement);
const display=new StableDisplay(renderer,$('#viewport'));display.beginFrame();
const scene=new T.Scene(),camera=new T.PerspectiveCamera(43,innerWidth/innerHeight,.2,120000);
const world=new World(scene,renderer),sim=new Flight(),weather=new Weather(world,scene,sim);
const landingLights=new LandingLights(scene);
let plane=new Aircraft(),cockpit=null,airflow=null;
const aircraftCache=new Map();const parkedAircraft=[];let aircraftRequest=0,liveryVersion=0,desiredLivery='BOE';
import {REALITY_TAGS,AIRCRAFT_INFO} from './ui/aircraft-info.js';
let originalAbout='',originalEmitters=null;
let rate=1,panel=null,toastTimer,frameCount=0,elapsed=0,fps=0;
let cancelCameraGestures=()=>{};
const keys=new Set(),touch=new Set(),surface={roll:0,pitch:0,yaw:0};
let manualTakeoffGuide=false;
let courseProgress=createCourseProgress();
const attitude=$('#attitude').getContext('2d');
function notify(s){if(!s)return;$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
const sound={enabled:false,ctx:null,engine:null};
const cameraControl=createCamera({renderer,camera,display,sim,getPlane:()=>plane,getCockpit:()=>cockpit,getPanel:()=>panel,cancelCameraGestures:()=>cancelCameraGestures()});
const {setCam,beginCameraGesture,rotateCamera,panCamera,zoomCamera,focusPart,updateCamera,resize,setOrbit,cameraView}=cameraControl;
display.onSuspend=()=>{keys.clear();touch.clear();cancelCameraGestures();if(sound.engine)sound.engine.master.gain.setTargetAtTime(0,sound.ctx.currentTime,.05);};
function initAudio(){if(sound.ctx)return;const ctx=new AudioContext();sound.ctx=ctx;sound.engine=new EngineSound(ctx);sound.engine.setAircraft(plane.type);}
function updateAudio(){if(sound.engine)sound.engine.update(sim,sound.enabled,sim.paused);}
function go(mode){manualTakeoffGuide=false;courseProgress=createCourseProgress();plane.clearDroppedChutes?.();sim.reset(mode);surface.roll=surface.pitch=surface.yaw=0;all('#aileron,#elevator,#rudder').forEach(s=>s.value=0);rate=1;$('#rate').textContent='1×';$('#retryDialog').close();all('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));if(mode==='inspect'){setCam('orbit');}else if(mode==='land'){setCam('chase');}else if(mode==='takeoff'){setCam('orbit');cameraControl.orbitAngle=2;cameraControl.orbitHeight=.24;}else setCam('chase');$('#drawer').hidden=true;panel=null;all('[data-panel]').forEach(b=>b.classList.remove('active'));syncThrottleUI();updateUI();}
function openPanel(name){panel=panel===name?null:name;$('#drawer').hidden=!panel;all('[data-panel]').forEach(b=>b.classList.toggle('active',b.dataset.panel===panel));all('.drawer-content').forEach(s=>s.hidden=s.id!==panel+'Panel');$('#drawerTitle').textContent={aircraft:'选择飞机',parts:'可动部件',livery:'换一身新涂装',world:'天空，由你选择',about:'认识这架飞机'}[panel]||'';}
function toggleGear(){notify(sim.control('gear',sim.gearTarget?0:1));}
function flapStep(){const list=[0,5,10,20,25,30],i=list.indexOf(sim.flapTarget);notify(sim.control('flaps',list[(i+1)%list.length]));}
function manualControl(){if(['takeoff','land'].includes(sim.mode)){sim.mode='manual';sim.complete=false;sim.phase='你已接管飞机';rate=1;$('#rate').textContent='1×';notify('现在由你驾驶！方向键控制机头与转弯');}}
const {setThrottle,syncThrottleUI,bindInput,readInput}=createInput({sim,renderer,keys,touch,surface,manualControl,notify,toggleGear,flapStep,setCam,beginCameraGesture,rotateCamera,panCamera,zoomCamera,cancelCameraGestures:()=>cancelCameraGestures(),setCancelCameraGestures:fn=>{cancelCameraGestures=fn;}});
// Model-specific code (GLTF decoding, decals, livery atlases) is only fetched when that aircraft is first requested.
const b777VisualMappings=[
 ...['left','right'].flatMap(side=>['in','out'].map(part=>({state:'aileron',property:`fcs/${side}-${part}-aileron/final-deg`,gain:side==='left'?-20:20,min:-1,max:1}))),
 ...['left','right'].map(side=>({state:'elevator',property:`fcs/${side}-elevator/final-deg`,gain:20,min:-1,max:1})),
 {state:'rudder',property:'fcs/rudder/final-deg',gain:25,min:-1,max:1},
 // The candidate's four spoiler channels take degrees, with their own hinge signs in the source XML.
 ...[50,51,60,61].map(i=>({state:'spoiler',property:`sim/multiplay/generic/float[${i}]`,gain:45,min:0,max:1})),
 ...[0,1].map(i=>({state:'engine',property:`engines/engine[${i}]/rpm`,gain:80,min:0,max:1})),
];
let b777LiveryLoader;
async function modelFactory(type,initialLivery=desiredLivery){
 if(type==='a380'){const {A380Aircraft}=await import('./a380-aircraft.js');return new A380Aircraft();}
 if(type==='a330'){const {AccurateA330}=await import('./accurate-a330.js');return new AccurateA330();}
 if(type==='shuttle'){const {SpaceShuttle}=await import('./space-shuttle.js');return new SpaceShuttle();}
 const [{AccurateB777Candidate},{createB777LiveryLoader,b777CargoManifest},{b777PassengerManifest}]=await Promise.all([import('./accurate-b777.js'),import('./b777-livery.js'),import('./b777-passenger-liveries.js')]);
 b777LiveryLoader??=createB777LiveryLoader({timeoutMs:180000,manifestFor:request=>request.variant==='cargo'?b777CargoManifest(request):b777PassengerManifest(request)});
 return new AccurateB777Candidate({initialLivery,liveryLoader:b777LiveryLoader,timeoutMs:420000,visualMappings:{passenger:b777VisualMappings,cargo:b777VisualMappings}});
}
// Thin loading bar plus a status line; a newer request owns the display, so a superseded load never clears it.
let loadToken=0,loadHideTimer;
const progressText=({loaded,total,fraction})=>`已下载 ${(loaded/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MB · ${fraction>=1?100:Math.floor(fraction*100)}%`;
function beginLoad(type,livery=desiredLivery){
 const token=++loadToken,bar=$('#loadBar'),fill=bar.firstElementChild,status=$('#aircraftStatus'),name=AIRCRAFT_INFO[type].name;
 const cached=aircraftCache.get(type),downloading=!cached?.ready&&!isPreloaded(type,{livery:cached?.preloadLivery??livery})&&!(type==='b747'&&cached);
 clearTimeout(loadHideTimer);bar.hidden=!downloading;bar.classList.remove('busy');fill.style.width='0%';
 status.textContent=downloading?`正在载入 ${name}…`:`正在切换到 ${name}…`;$('#loadProgress').textContent=status.textContent;
 return {
  update(progress){
   if(token!==loadToken)return;
   const {fraction}=progress,pct=fraction>=1?100:Math.floor(fraction*100);
   bar.hidden=false;fill.style.width=pct+'%';
   if(fraction>=1)bar.classList.add('busy');
   status.textContent=`${name} · ${progressText(progress)}`+(fraction>=1?' · 正在构建模型…':'');$('#loadProgress').textContent=status.textContent;
  },
  done(){
   if(token!==loadToken)return;
   bar.classList.remove('busy');
   loadHideTimer=setTimeout(()=>{if(token===loadToken)bar.hidden=true;},380);
  },
 };
}
// Cache each complete model for the session, including in-flight loads. This bounds GPU
// allocations to four models and avoids disposing geometry shared by the parked 747s.
function syncCabinTime(craft){if(typeof craft.setCabinTime==='function')craft.setCabinTime(world.time);else updateCabinLights(craft,world.time);}
function getAircraft(type,onProgress,livery=desiredLivery){
 if(!aircraftCache.has(type)){
  const p=(async()=>{
   // Download first (reported as progress); the loader below then reads from the HTTP cache.
   await preloadAircraft(type,{livery,priority:'high',onProgress:isPreloaded(type,{livery})?undefined:onProgress});
   const craft=await modelFactory(type,livery);
   let loaded=false;
   try{await craft.load();loaded=true;fixAircraftWingShading(craft);if(typeof craft.setCabinTime!=='function')addCabinLights(craft);syncCabinTime(craft);return craft;}
   // Both externally loaded aircraft already clean up a failed load; only
   // dispose here if a later coordinator step failed after successful loading.
   catch(error){if(loaded)craft.dispose?.();throw error;}
  })();
  p.preloadLivery=livery;aircraftCache.set(type,p);p.then(()=>{p.ready=true;},()=>{if(aircraftCache.get(type)===p)aircraftCache.delete(type);});
 }else{
  const cached=aircraftCache.get(type),requested=cached.preloadLivery??livery;
  if(type!=='b747'&&!cached.ready&&!isPreloaded(type,{livery:requested}))preloadAircraft(type,{livery:requested,priority:'high',onProgress});
 }
 return aircraftCache.get(type);
}
function showLivery(){
 const l=Aircraft.liveryForModel(plane.livery,plane.type);$('#liveryName').textContent=l?.name||plane.livery;
 // Update the existing button rather than rebuilding the list: focus, keyboard
 // activation, listeners and the persistent selected ID survive a model switch.
 all('[data-livery]').forEach(x=>{
  const supported=!!Aircraft.liveryForModel(x.dataset.livery,plane.type);x.hidden=!supported;x.disabled=!supported;
  const active=supported&&x.dataset.livery===plane.livery;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));x.querySelector('.check').textContent=active?'✓':'';
  if(x.dataset.livery==='BOE'&&Aircraft.liveryForModel('BOE',plane.type)){
   const house=Aircraft.liveryForModel('BOE',plane.type);
   x.querySelector('b').textContent=house.name;x.querySelector('small').textContent=house.en;x.querySelector('img').src='/assets/livery-logos/'+house.logo;
  }
  const tag=x.querySelector('.reality-tag');
  if(tag){const r=realityFor(plane.type,x.dataset.livery);tag.textContent=REALITY_TAGS[r.status];tag.className='reality-tag '+r.status;tag.title=r.label+(r.note?'：'+r.note:'');}
 });
 // Say plainly whether a real aircraft ever wore this paint on this type.
 const details=$('#liveryDetails'),reality=realityFor(plane.type,plane.livery);
 details.hidden=false;details.className='fine-print reality-'+reality.status;
 details.textContent=`【${reality.label}】${reality.note}`+(plane.cargoMode&&plane.liveryInfo?.disclosure?' '+plane.liveryInfo.disclosure:'');
}
function showAircraft(){
 const info=AIRCRAFT_INFO[plane.type],isA330=plane.type==='a330',cargo=isA330&&plane.cargoMode,is777Cargo=plane.type==='b777'&&plane.cargoMode,isShuttle=plane.type==='shuttle';document.body.classList.toggle('shuttle-mode',isShuttle);
 $('#aircraftSelect').value=plane.type;$('#aircraftName').textContent=cargo?'AIRBUS A330–300 · 货运外观示意':is777Cargo?'BOEING 777F':info.name;$('#gearDescription').textContent=info.gear;$('#engineLabel').textContent=info.engine;
 const door=$('#door');door.disabled=(isA330&&!cargo)||isShuttle;$('#doorLabel').textContent=isA330?'主货舱门（示意）':'下层货舱门';
 door.title=door.disabled?(isShuttle?'航天飞机仅提供降落与地面观察':'A330 客运外观无可动主货舱门；选择货运涂装可查看示意门'):'';
 // A passenger airframe has no supported main-deck cargo door. Close any
 // previously open door without leaving the shared flight-model interlock stuck.
 if(door.disabled)sim.doorTarget=0;
 all('[data-aircraft]').forEach(b=>{const active=b.dataset.aircraft===plane.type;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 all('.engine-meter').forEach((el,i)=>el.hidden=i>=info.engines);
 $('#aboutDetails').innerHTML=plane.type==='b747'?originalAbout:isA330?`<div class="about-number">A330<span>–303</span></div><p>${info.description}</p><div class="spec-grid"><div><strong>63.7<small> m</small></strong><span>参考机长</span></div><div><strong>60.3<small> m</small></strong><span>参考翼展</span></div><div><strong>16.8<small> m</small></strong><span>约高</span></div><div><strong>2<small> 台</small></strong><span>GE CF6-80E1</span></div></div><p class="hint">${cargo?'当前为 A330-300 货运外观示意，并非 A330-200F；主货舱门与涂装均为近似。':'涂装是否有真机见涂装面板的标签，不保证机号及发动机与实机一致。'}参考尺寸不等于网格工程校核；飞行力学和驾驶舱沿用 747 简化版本，动画不代表真实系统时序。</p><a class="source-link" href="/assets/accurate-a330/NOTICE" target="_blank">A330 模型来源、署名与 GPL 许可 ↗</a>`:plane.type==='shuttle'?`<div class="about-number">SPACE<span> SHUTTLE</span></div><p>${info.description}</p><div class="spec-grid"><div><strong>37.2<small> m</small></strong><span>轨道器全长</span></div><div><strong>23.8<small> m</small></strong><span>翼展</span></div><div><strong>17.3<small> m</small></strong><span>约高（含起落架）</span></div><div><strong>6<small> 个</small></strong><span>起落架轮胎</span></div></div><p class="hint">外形、贴图与起落架来自 FlightGear 官方 SpaceShuttle 机型（GPL-2.0），货舱门按着陆构型闭合。航天飞机没有发动机与襟翼，本模式不提供起飞、自由飞行与驾驶舱视角。</p><a class="source-link" href="/assets/space-shuttle/CREDITS.txt" target="_blank">航天飞机模型来源与许可 ↗</a>`:plane.type==='a380'?`<div class="about-number">A380<span>–800</span></div><p>空客 A380 是有史以来载客量最大的客机，全长双层客舱，设计目标是在“80 米箱”机场规则内运营大型远程航线。宽体双层布局与四台大推力发动机让它成为超远程、高密度运输的代表。2019 年空客宣布停止生产，最后一架于 2021 年 12 月交付。</p><div class="spec-grid"><div><strong>72.7<small> m</small></strong><span>全长</span></div><div><strong>79.8<small> m</small></strong><span>翼展</span></div><div><strong>24.1<small> m</small></strong><span>机高</span></div><div><strong>575<small> t</small></strong><span>最大起飞重量</span></div><div><strong>525<small> 座</small></strong><span>典型座位（最多 853）</span></div><div><strong>14,800<small> km</small></strong><span>航程（约 8,000 nm）</span></div><div><strong>0.85<small> Ma</small></strong><span>典型巡航马赫数</span></div><div><strong>4<small> 台</small></strong><span>Trent 900 / GP7200</span></div></div><p class="hint">首飞 2005 年 4 月 27 日；2007 年 10 月由新加坡航空投入商业运营；全部生产 254 架（含 3 架试飞机）。外形采用 FlyByWire A380X 模型，非商业用途；数据为参考值，部分可能因构型不同而有差异。</p><a class="source-link" href="/assets/a380/CREDITS.txt" target="_blank">A380 模型来源与许可 ↗</a>`:`<div class="about-number">777</div><p>${info.description}</p><p class="hint">飞行力学为通用简化模型，驾驶舱为通用示意座舱，部件运动并非真实系统时序。</p>`;
}
function setEmitters(craft){
 airflow.plane=craft;
 if(craft.type==='shuttle'){airflow.engines=[];airflow.tips=craft.wingtipPoints.map(p=>p.clone());airflow.mainGear=craft.wheelContacts.map(p=>p.clone());return;}
 if(craft.type==='b747'){Object.assign(airflow,originalEmitters);if(craft.wingtipPoints)airflow.tips=craft.wingtipPoints.map(p=>p.clone());return;}
 if(craft.type==='a330'){
  airflow.engines=[-9.41,9.41].map(z=>new T.Vector3(-1.5,-2.35,z));
  airflow.tips=craft.wingtipPoints?.map(p=>p.clone())||[-29.48,29.48].map(z=>new T.Vector3(-14.57,1.71,z));
  airflow.mainGear=[-6.77,-4.9].flatMap(x=>[-5.02,4.99].map(z=>new T.Vector3(x,-craft.contact,z)));return;
 }
 if(craft.type==='b777'){
  airflow.engines=[-9.89,9.89].map(z=>new T.Vector3(4.15,-2.89,z));
  airflow.tips=[-32.4,32.4].map(z=>new T.Vector3(-17,0,z));
  airflow.mainGear=[-4.2,4.2].map(z=>new T.Vector3(-3,-craft.contact,z));return;
 }
 const isA380=craft.type==='a380',span=isA380?79.8:60.3;
 const positions=isA380?[-.27,-.15,.15,.27]:[-.22,.22];
 airflow.engines=positions.map(z=>new T.Vector3(0,-2,span*z));
 // A380 points are raycast onto its normalized wing and shared with its nav lights.
 airflow.tips=isA380?craft.wingtipPoints.map(p=>p.clone()):[new T.Vector3(-17,0,-span/2),new T.Vector3(-17,0,span/2)];
 // A380 body and wing bogie centres, measured from the loaded tyre meshes in root coordinates.
 airflow.mainGear=(isA380?[[-.6,-2.63],[-.6,2.63],[3.1,-6.16],[3.1,6.16]]:[[-3,-4.2],[-3,4.2]]).map(([x,z])=>new T.Vector3(x,-craft.contact,z));
}
async function selectAircraft(type){
 if(!AIRCRAFT_INFO[type])return false;
 const request=++aircraftRequest;
 if(type===plane.type){$('#loadBar').hidden=true;$('#aircraftStatus').textContent='';$('#aircraftSelect').value=type;return true;}
 const initialLivery=Aircraft.liveryForModel(desiredLivery,type)?desiredLivery:(type==='shuttle'?'NASA_SHUTTLE':'BOE');
 $('#aircraftSelect').value=type;
 const load=beginLoad(type,initialLivery);
 try{
  const next=await getAircraft(type,progress=>{if(request===aircraftRequest)load.update(progress);},initialLivery);if(request!==aircraftRequest)return false;
  // Reconcile changes made to the livery while the model was loading.
  let selected,applied,retries=0;do{
   const requestedLivery=desiredLivery;
   selected=Aircraft.liveryForModel(requestedLivery,type)?requestedLivery:initialLivery;
   try{applied=await next.setLivery(selected);}catch(error){if(request!==aircraftRequest)return false;if(requestedLivery!==desiredLivery)continue;throw error;}
   if(request!==aircraftRequest)return false;
   if(requestedLivery===desiredLivery&&selected!==desiredLivery){desiredLivery=selected;liveryVersion++;}
   if(!applied&&selected===desiredLivery&&++retries>2)throw Error('涂装切换未完成，请重试');
  }while(!applied||selected!==desiredLivery);
  const wasUnpowered=!!plane.unpowered;
  next.root.position.copy(plane.root.position);next.root.quaternion.copy(plane.root.quaternion);next.root.visible=plane.root.visible;
  next.update(sim,0);syncCabinTime(next);
  // Detached chutes are scene children, not part of the old aircraft root.
  plane.clearDroppedChutes?.();scene.remove(plane.root);plane=next;sound.engine?.setAircraft(plane.type);scene.add(plane.root);setEmitters(plane);sim.pitchLimit=makePitchLimit(tailSamples(plane.root),plane.contact);
  // Only the orbiter carries a drag chute; stow it when leaving that aircraft.
  sim.chuteAvailable=!!plane.hasDragChute;sim.chuteJettisoned=false;if(!sim.chuteAvailable){sim.chuteTarget=0;sim.chute=0;}
  // Unpowered gliders (the orbiter) use their own approach profile.
  sim.unpowered=!!plane.unpowered;sim.landingGlide=plane.landingGlide??3;sim.landingSpeed=plane.landingSpeed??77;
  // The orbiter offers only landing and ground observation: leave takeoff/free-flight states and cockpit/wing views.
  if(plane.type==='shuttle'&&!['land','inspect'].includes(sim.mode))go('inspect');
  // The approach profile differs between powered airliners and the gliding orbiter,
  // so restart the landing demo rather than finish another aircraft's approach.
  else if(sim.mode==='land'&&sim.unpowered!==wasUnpowered)go('land');
  else if(plane.type==='shuttle'&&(cameraControl.mode==='cockpit'||cameraControl.mode==='wing'))setCam('orbit');
  if(window.flightLab)window.flightLab.plane=plane;
  $('#aircraftStatus').textContent='已切换 · 飞行状态保持不变';showAircraft();showLivery();return true;
 }catch(error){if(request===aircraftRequest){$('#aircraftStatus').textContent='载入失败，请重试';$('#aircraftSelect').value=plane.type;notify(error.message||'机型载入失败');}return false;}
 finally{load.done();}
}
async function selectLivery(id){
 if(!LIVERIES.some(l=>l.id===id))return false;
 if(!Aircraft.liveryForModel(id,plane.type)){notify('当前机型不支持这款涂装');return false;}
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
 $('#spoiler').onclick=()=>notify(sim.control('spoiler',sim.spoilerTarget?0:1));$('#reverse').onclick=()=>notify(sim.control('reverse',sim.reverseTarget?0:1));$('#chute').onclick=()=>notify(sim.control('chute',sim.chuteTarget?0:1));$('#door').onclick=()=>{focusPart('engine');cameraControl.orbitAngle=-.8;if(plane.type==='a330')cameraControl.focus.set(13.6,1,-2.8);else cameraControl.focus.set(16,-1,0);cameraControl.orbitDistance=46;notify(sim.control('door',sim.doorTarget?0:1));};
 $('#lights').onclick=()=>sim.lights=!sim.lights;$('#wipers').onclick=()=>{sim.wipers=!sim.wipers;const next=cameraModeForWiperToggle(cameraControl.mode,sim.wipers);if(next!==cameraControl.mode)setCam(next);};
 $('#landingLights').onclick=()=>{sim.landingLights=!sim.landingLights;};
 $('#home')?.addEventListener('click',()=>go('inspect'));
 $('#pause').onclick=()=>sim.paused=!sim.paused;
 $('#rate').onclick=()=>{rate=rate===1?2:rate===2?4:1;$('#rate').textContent=rate+'×';};
 $('#takeControl').onclick=manualControl;const startTakeoffCourse=()=>{go('manual');manualTakeoffGuide=true;sim.flapTarget=20;sim.park=true;setCam('chase');syncThrottleUI();updateUI();notify('手动起飞练习已开始，请按左侧步骤提示操作');};$('#runwayStart').onclick=startTakeoffCourse;$('#courseStart').onclick=startTakeoffCourse;
 $('#assist').onclick=()=>{sim.assist=!sim.assist;$('#assist').classList.toggle('active',sim.assist);};
 all('[data-time]').forEach(b=>b.onclick=()=>{world.setTime(b.dataset.time);syncCabinTime(plane);document.body.dataset.time=b.dataset.time;all('[data-time]').forEach(x=>x.classList.toggle('active',x===b));});
 const syncRainChoice=()=>{const rain=$('#weatherRain'),clear=$('#weatherCloud').value==='clear';if(clear)rain.value='off';rain.disabled=clear;rain.title=clear?'晴空没有降雨，先选择局部多云或阴天':'';};
 const updateWeather=()=>{syncRainChoice();const knots=Number($('#windSpeed').value);weather.set({cloud:$('#weatherCloud').value,rain:$('#weatherRain').value,visibility:$('#weatherVisibility').value,windDirection:$('#windDirection').value,windKnots:knots});$('#windSpeedValue').textContent=`${knots} kt / ${(knots*KNOT_MS).toFixed(1)} m/s`;};
 for(const id of ['weatherCloud','weatherRain','weatherVisibility','windDirection','windSpeed'])$('#'+id).addEventListener('input',updateWeather);syncRainChoice();
 all('[data-aircraft]').forEach(b=>{b.onclick=()=>selectAircraft(b.dataset.aircraft);const warm=()=>{if(b.dataset.aircraft!=='b747')preloadAircraft(b.dataset.aircraft,{livery:desiredLivery,priority:'high'});};b.addEventListener('pointerenter',warm);b.addEventListener('focus',warm);b.addEventListener('touchstart',warm,{passive:true});});$('#aircraftSelect').onchange=e=>selectAircraft(e.target.value);
 $('#quality').onchange=e=>{const low=e.target.value==='low';display.setQuality(low);world.setQuality(low);renderer.shadowMap.enabled=!low;airflow?.setQuality(low);world.airportLights.setQuality(low);weather.setQuality(low);for(const p of parkedAircraft)p.visible=!low;};
 $('#sound').onclick=()=>{initAudio();sound.enabled=!sound.enabled;sound.ctx.resume();$('#sound').classList.toggle('on',sound.enabled);$('#sound').ariaLabel=sound.enabled?'关闭声音':'开启声音';notify(sound.enabled?'发动机声音已开启':'声音已关闭');};
 $('#help').onclick=()=>$('#helpDialog').showModal();all('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
 $('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notify('请使用浏览器的全屏按钮');}};
 $('#liveries').innerHTML=LIVERIES.map((l,i)=>`<button class="livery-card ${i===0?'active':''}" data-livery="${l.id}" aria-pressed="${i===0}"><span class="livery-swatch" aria-hidden="true"><img src="/assets/livery-logos/${l.logo}" alt="" decoding="async"></span><span><b>${l.name}</b><small>${l.en}</small></span><em class="reality-tag none"></em><span class="check" aria-hidden="true">${i===0?'✓':''}</span></button>`).join('');
 all('[data-livery]').forEach(b=>b.onclick=()=>selectLivery(b.dataset.livery));
 bindInput();
}
const {updateUI,warningList,compassStrip,COMPASS_PX}=createHUD({sim,attitude,keys,touch,getPlane:()=>plane,getManualTakeoffGuide:()=>manualTakeoffGuide,getCourseProgress:()=>courseProgress,syncThrottleUI,notify});
addEventListener('resize',resize);
let running=true;
async function start(){
 try{const line=document.querySelector('.loading-line i');line.classList.add('progress');
 await preloadAircraft('b747',{priority:'high',onProgress:progress=>{line.style.width=Math.floor(progress.fraction*100)+'%';$('#loadingText').textContent=progressText(progress)+(progress.fraction>=1?' · 正在构建模型…':'');}});
 await plane.load();fixAircraftWingShading(plane);sim.chuteAvailable=!!plane.hasDragChute;sim.unpowered=!!plane.unpowered;sim.landingGlide=plane.landingGlide??3;sim.landingSpeed=plane.landingSpeed??77;sim.pitchLimit=makePitchLimit(tailSamples(plane.root),plane.contact);aircraftCache.set('b747',Promise.resolve(plane));scene.add(plane.root);airflow=new Airflow(scene,plane);originalEmitters={engines:airflow.engines,tips:airflow.tips,mainGear:airflow.mainGear};originalAbout=$('#aboutDetails').innerHTML;
 // Parked aircraft share geometry and textures, with animations fixed at their current neutral state.
 // Parked 747s sit nose-in on their stands, nose wheel on the stop bar near the boarding bridge.
 for(const [x,z] of [[-1200,-406],[-510,-406],[180,-406],[640,-406]]){const p=plane.root.clone(true),materials=new Map();p.position.set(x,plane.contact,z);p.rotation.y=Math.PI/2;world.softShadow(x,z-4,66,76);p.traverse(o=>{if(o.isMesh){o.castShadow=false;const copy=m=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);}});scene.add(p);p.updateMatrixWorld(true);p.traverse(o=>{o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;});p.visible=$('#quality')?.value!=='low';parkedAircraft.push(p);}
 addCabinLights(plane);syncCabinTime(plane);
 bindUI();world.setQuality($('#quality').value==='low');showLivery();resize();setCam('orbit');$('#loading').remove();
 // Background download of every other aircraft, in picker order, right after the first scene is shown.
 if(!/[?&]prefetch=0/.test(location.search)){
  const order=all('[data-aircraft]').map(b=>b.dataset.aircraft).filter(t=>t!=='b747');
  const badge=(type,text,state)=>{const b=document.querySelector(`[data-aircraft="${type}"]`);if(!b)return;let tag=b.querySelector('.dl-state');if(!tag){tag=document.createElement('i');tag.className='dl-state';b.querySelector('b')?.after(tag);}tag.textContent=text;tag.dataset.state=state;};
  order.forEach(t=>badge(t,'排队下载','queued'));
  setTimeout(()=>prefetchInOrder(order,{livery:()=>desiredLivery,onStatus:(type,p)=>p.done?badge(type,'已下载','ready'):p.failed?badge(type,'下载未完成，选择机型可重试','failed'):p.retrying?badge(type,`下载中断，${Math.round(p.delay/1000)} 秒后重试`,'failed'):p.fraction>=1?badge(type,'校验中…','loading'):badge(type,`后台下载 ${Math.round((p.fraction||0)*100)}%`,'loading')}),600);
 }
 window.flightLab={sim,landingLights,plane,cockpit:()=>cockpit,world,weather,airflow,camera,renderer,display,go,soundEngine:()=>sound.engine,setCam,focusPart,setThrottle,selectAircraft,selectLivery,preloadAircraft,setOrbit,cameraView,advance(seconds){for(let i=0;i<seconds*120;i++)sim.step(1/120,{});},snapshot(){return{mode:sim.mode,phase:sim.phase,x:sim.x,z:sim.z,altitude:sim.altitude,speed:sim.speed,mach:sim.mach,alpha:sim.alpha,stallSpeed:sim.stallSpeed,loadFactor:sim.loadFactor,throttle:sim.throttle,engineN1:sim.engineN1,gear:sim.gear,flaps:sim.flaps,park:sim.park,onGround:sim.onGround,failed:sim.failed,complete:sim.complete,stalled:sim.stalled,warnings:warningList(),aircraft:plane.type,livery:plane.livery,dimensions:plane.dimensions.toArray(),contact:plane.contact,engines:AIRCRAFT_INFO[plane.type].engines,animations:plane.a330Animations?.length??plane.bindings?.length??(plane.type==='b777'?(plane._current?.bundle?.animationIndices?.length||0):plane.type==='b747'?plane.animations.length:Object.values(plane.parts||{}).reduce((n,items)=>n+items.length,0)),paint:plane.type==='a330'?'a330-atlas':plane.type==='b777'?'b777-atlas':plane.paintLivery?'airline-markings':'747-atlas',model:plane.liveryInfo?.model||plane.modelLabel||AIRCRAFT_INFO[plane.type].name,liveryInfo:plane.liveryInfo?{...plane.liveryInfo}:null,cargoMode:['a330','b777'].includes(plane.type)?plane.cargoMode:null,cabinTime:world.time,cabinLit:plane.type==='b777'?world.time==='night'&&!plane.cargoMode:(plane.cabinWindowLights?.visible??null),fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,display:display.diagnostics()};}};
 let last=performance.now(),uiTime=0;display.onResume=()=>{last=performance.now();};
 function frame(now){if(!running)return;requestAnimationFrame(frame);if(!display.beginFrame()){last=now;return;}let realDt=Math.min((now-last)/1000,.05);last=now;const input=readInput(realDt);const dt=realDt*rate;const n=Math.max(1,Math.ceil(dt*120));for(let i=0;i<n;i++)sim.step(dt/n,input);
 plane.root.position.set(sim.x,plane.contact+sim.altitude+groundLift(sim.pitch,sim.altitude),sim.z);plane.root.quaternion.setFromEuler(_euler.set(radians(sim.bank),radians(90-sim.heading),radians(sim.pitch)));setCockpitAirframeVisibility(plane,cameraControl.mode);plane.update(sim,sim.paused?0:dt);plane.root.position.y-=plane.groundSettle||0;if(cockpit){cockpit.root.visible=cameraControl.mode==='cockpit';if(cockpit.root.visible){cockpit.root.position.copy(plane.root.position);cockpit.root.quaternion.copy(plane.root.quaternion);cockpit.update(sim,sim.paused?0:dt);cockpit.draw(sim);}}world.update(sim.paused?0:dt,plane.root.position);airflow?.update(sim,dt,cameraControl.mode,world.time);landingLights?.update(sim,world.time,plane,dt);compassStrip.style.transform=`translateX(${-sim.heading*COMPASS_PX}px)`;updateCamera();world.airportLights.setView(renderer.domElement.height,camera.fov,world.scene.fog?.density??0);world.airportLights.update(now/1000,camera.position);weather.update(sim.paused?0:dt,camera,cameraControl.mode,sim);renderer.render(scene,camera);display.captureAfterRender();display.presented(now);updateAudio();
 uiTime+=realDt;if(uiTime>.09){updateUI();uiTime=0;}if(sim.failed&&!$('#retryDialog').open){$('#retryReason').textContent=sim.message;$('#retryDialog').showModal();}
 elapsed+=realDt;frameCount++;if(elapsed>1){fps=Math.round(frameCount/elapsed);elapsed=0;frameCount=0;}
 }requestAnimationFrame(frame);
 // The cockpit is only needed for the cockpit camera; build it after the first frame instead of holding up start-up.
 const cockpitScale=plane.native.scale.clone();
 const loadCockpit=()=>new Cockpit().loadInterior(cockpitScale,$('#attitude')).then(c=>{cockpit=c;scene.add(c.root);if(cameraControl.mode==='cockpit')$('#cockpitOverlay').hidden=true;}).catch(e=>{console.warn('驾驶舱使用简化视角',e);cockpit=null;});
 if(window.requestIdleCallback)requestIdleCallback(loadCockpit,{timeout:1500});else setTimeout(loadCockpit,300);
 }catch(e){console.error(e);$('#loadingText').textContent='载入遇到了问题：'+e.message+'。请刷新重试。';}
}
start();
