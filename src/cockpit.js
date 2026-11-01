import * as T from 'three';
import {Aircraft,parseAC} from './aircraft.js';
export class Cockpit extends Aircraft{
 async loadInterior(scale,attitudeCanvas){
  const origin=new T.Group();origin.position.set(-25.6,2.65,0);this.native.add(origin);this.native.scale.copy(scale);
  for(const [name,pos,angle] of [['cockpit',[0,0,0],0],['forward',[.751,.475,0],22],['overhead',[1.46,1.374,0],-162.5],['yokes',[0,0,0],0],['seats',[0,0,0],0]]){
   const [ac,xml]=await Promise.all(['ac','xml'].map(ext=>fetch('/747/assets/aircraft/cockpit/'+name+'.'+ext).then(r=>{if(!r.ok)throw Error(name);return r.text();})));const g=parseAC(ac,'cockpit/');g.position.fromArray(pos);g.rotation.z=angle*Math.PI/180;origin.add(g);this.bind(g,new DOMParser().parseFromString(xml,'text/xml').documentElement);
  }
  this.root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.metalness=.05;m.roughness=.85;}}});
  this.pfd=new T.CanvasTexture(attitudeCanvas);this.pfd.colorSpace=T.SRGBColorSpace;
  this.navigation=document.createElement('canvas');this.navigation.width=this.navigation.height=256;this.navTex=new T.CanvasTexture(this.navigation);this.navTex.colorSpace=T.SRGBColorSpace;
  this.engineCanvas=document.createElement('canvas');this.engineCanvas.width=this.engineCanvas.height=256;this.engineTex=new T.CanvasTexture(this.engineCanvas);this.engineTex.colorSpace=T.SRGBColorSpace;
  for(const [name,tex] of [['pfdScreen',this.pfd],['ndScreenL',this.navTex],['ndScreenR',this.navTex],['Upper-EICAS-Screen',this.engineTex],['Lower-EICAS-Screen',this.engineTex]]){const o=this.root.getObjectByName(name);o?.traverse(m=>{if(m.isMesh)m.material=new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});});}
  this.root.visible=false;return this;
 }
 value(prop,s){if(prop.includes('controls/flight/aileron'))return s.aileron||0;if(prop.includes('controls/flight/elevator'))return s.elevator||0;if(prop.includes('controls/flight/rudder'))return s.rudder||0;if(prop.includes('throttle'))return s.throttle||0;return super.value(prop,s);}
 draw(s){
  this.pfd.needsUpdate=true;const n=this.navigation.getContext('2d');n.fillStyle='#050d12';n.fillRect(0,0,256,256);n.strokeStyle='#a0b4ba';n.lineWidth=1;n.font='12px monospace';n.textAlign='center';n.fillStyle='#a9c4c7';for(const r of [55,100,140]){n.beginPath();n.arc(128,180,r,Math.PI,2*Math.PI);n.stroke();}n.fillText('TRK '+String(Math.round(s.heading)).padStart(3,'0')+' MAG',128,18);n.strokeStyle='#59df95';n.beginPath();n.moveTo(128,190);n.lineTo(128,40);n.stroke();n.strokeStyle='#d586de';n.beginPath();n.moveTo(128,180);n.lineTo(140,100);n.lineTo(125,40);n.stroke();n.fillStyle='#e4ebcd';n.fillText('STAR BAY 09',128,235);this.navTex.needsUpdate=true;
  const e=this.engineCanvas.getContext('2d');e.fillStyle='#070e13';e.fillRect(0,0,256,256);e.fillStyle='#b6c5b3';e.font='14px monospace';e.textAlign='center';e.fillText('ENGINE N1',128,22);for(let i=0;i<4;i++){const x=35+i*62;for(let j=0;j<2;j++){const y=68+j*78;e.strokeStyle='#a5bca8';e.beginPath();e.arc(x,y,24,-Math.PI*.7,Math.PI*.8);e.stroke();const a=-Math.PI*.7+s.engine*Math.PI*1.5;e.strokeStyle='#a4e898';e.beginPath();e.moveTo(x,y);e.lineTo(x+Math.cos(a)*21,y+Math.sin(a)*21);e.stroke();e.fillStyle='#d6ebca';e.font='11px monospace';e.fillText(j?Math.round(250+s.engine*500):Math.round(s.engine*100),x,y+36);}}e.fillText('FLAPS '+Math.round(s.flaps)+'  GEAR '+(s.gear>.98?'DOWN':'UP'),128,232);this.engineTex.needsUpdate=true;
 }
}
