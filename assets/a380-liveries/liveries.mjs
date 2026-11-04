// A380 livery artwork. Every function draws one side (port or starboard) in
// aircraft-frame metres, see lib.mjs. `real` marks liveries that match an
// actual A380 operator; the others adapt the airline's own scheme.
import {fillBase,FUSE,FIN,keel} from './lib.mjs';

const WHITE='#f4f5f6';
const finShape=(grow=.25)=>[[FIN.le(FIN.root)-grow,FIN.root-grow],[FIN.le(FIN.top+grow)-grow,FIN.top+grow],[FIN.te(FIN.top+grow)+grow,FIN.top+grow],[FIN.te(FIN.root)+grow,FIN.root-grow]];
const finY=sFrac=>FIN.root+sFrac*(FIN.top-FIN.root);
const finPoint=(sFrac,t)=>FIN.pt(finY(sFrac),t);
/** Fin stripe running from height fraction sLe at the leading edge to sTe at the trailing edge, with a gentle wave. */
function finEdge(sLe,sTe,wave=0,n=8){
 const pts=[];for(let i=0;i<=n;i++){const t=-.1+1.2*i/n,u=Math.min(1,Math.max(0,t)),sFrac=sLe+(sTe-sLe)*t+wave*Math.sin(Math.PI*u);pts.push(finPoint(sFrac,t));}
 return pts;
}
function finBand(s,upper,lower,color){s.clip(finShape(),c=>c.poly([...finEdge(...upper),...finEdge(...lower).reverse()],color));}
const xs=(a,b,step=2)=>{const r=[];for(let x=a;x>=b;x-=step)r.push(x);if(r.at(-1)!==b)r.push(b);return r;};
/** Region below a boundary y=keel(x)+thick(x) from nose to tail. */
function bellyBand(s,color,thick){
 const top=xs(37,-37.5).map(x=>[x,keel(x)+thick(x)]);
 s.poly([...top,[-38.5,-12],[38,-12]],color);
}
const interp=(table)=>x=>{for(let i=0;i<table.length-1;i++){const [x0,y0]=table[i],[x1,y1]=table[i+1];if(x<=x0&&x>=x1)return y0+(y1-y0)*(x0-x)/(x0-x1);}return table.at(-1)[1];};
const lineAlong=(s,fn,color,w)=>s.curve(xs(36,-30,3).map(x=>[x,fn(x)]),{stroke:color,width:w});
const stdBelly=interp([[37,.2],[33,.9],[28,1.2],[15,1.9],[0,2.3],[-12,2.3],[-20,1.9],[-28,1.4],[-37.5,1.0]]);

export const ART={
 // ---------------------------------------------------------------- Emirates
 UAE:{real:true,draw(s){
  const RED='#d71920',GREEN='#00732f',BLACK='#12161c',GOLD='#b88a4e';
  fillBase(s,'#f7f6f2');
  s.poly([[-10.3,-6.7],[-19.3,-.2],[-28.9,7.5],[-26.4,4.3],[-21.5,-1.3]],RED);
  s.clip(finShape(),c=>{
   c.poly([[-28.9,7.5],[-26.4,4.3],[-33.7,8.45],[-35.4,12.4],[-30,12.4]],GREEN);
   c.poly([[-24.9,1.7],[-32.4,5.5],[-31.3,2.5],[-22.0,-1.0]],BLACK);
  });
  s.text('Emirates',20.4,-4.95,{cap:2.15,font:'Palatino Linotype',fill:GOLD,width:14.5});
  s.text('الإمارات',8.2,-4.95,{cap:1.7,font:'Dubai',fill:GOLD,width:6.4});
 }},
 // --------------------------------------------------------------- Lufthansa
 DLH:{real:true,draw(s){
  const NAVY='#05164d';
  fillBase(s,'#f1f2f4');
  bellyBand(s,'#d9dce1',x=>interp([[37,.1],[33,.6],[28,.9],[0,1.5],[-20,1.3],[-37.5,.6]])(x));
  s.clip(finShape(),c=>c.rect(-40,-2,-15,13,NAVY));
  s.poly([[-17.2,-1.4],[-24,-1.4],[-24,-.5],[-19,-.5]],NAVY);
  const [cx,cy]=FIN.pt(4.7,.5);
  s.circle(cx,cy,2.62,'#f9ad00');
  s.imageFacing('lufthansa.png',cx,cy,6.9,6.9);
  s.text('Lufthansa',22.7,-5.2,{cap:1.8,font:'Arial',fill:NAVY,width:12.2});
 }},
 DLH100:{real:true,draw(s){
  const NAVY='#05164d',WHITE='#f1f2f4';
  fillBase(s,NAVY);
  // D-AIMH has a navy upper fuselage and nose, pale underside, and a white crane
  // sweeping across both decks.
  bellyBand(s,'#e1e3e6',x=>interp([[37,.15],[30,.35],[23,.8],[12,1.35],[0,1.95],[-14,2.0],[-25,1.55],[-33,1.0],[-37.5,.6]])(x));
  s.clip(finShape(),c=>c.rect(-40,-2,-15,13,NAVY));
  const [cx,cy]=FIN.pt(4.9,.5);
  s.circle(cx,cy,2.65,WHITE);s.circle(cx,cy,2.38,NAVY);
  s.imageFacing('lufthansa-white.png',cx,cy,6.9,6.9,{flip:true});
  // Real D-AIMH: the crane's beak sits over the forward fuselage, pointing to the
  // nose, and its body runs back to the wing root, about 40 m long. The atlas
  // image is stretched to that long, low shape. flip:true points the beak forward on both sides.
  s.imageFacing('lufthansa-crane-white.png',10.5,-1.0,40,5.5,{opacity:.97,flip:true});
  s.text('100',-16,-4.4,{cap:4.7,font:'Arial',fill:'#b6bfce',width:12.5,opacity:.62});
  s.text('1926 | 2026',-23.5,-6.6,{cap:.82,font:'Arial',fill:'#8f9bb0',width:9.5,opacity:.95});
  s.imageFacing('lufthansa-white.png',33.5,-4.8,1.65,1.65);
  s.text('Lufthansa',25.5,-5.7,{cap:1.0,font:'Arial',fill:WHITE,width:7.6});
 }},
 // ------------------------------------------------------------------- British Airways
 BAW:{real:true,draw(s){
  const NAVY='#1c2a5e',RED='#c8102e';
  fillBase(s,'#f6f7f8');
  bellyBand(s,NAVY,interp([[37,.15],[33,.8],[28,1.1],[15,1.9],[0,2.35],[-12,2.35],[-20,2.0],[-28,1.5],[-37.5,1.0]]));
  finBand(s,[.68,.86,.02],[.49,.61,.02],RED);
  finBand(s,[.35,.46,.0],[.34,.24,-.02],NAVY);
  finBand(s,[.21,.15,.03],[-.3,-.3,0],RED);
  s.poly([[-23,-2.4],[-37,-1.4],[-37,-3.4],[-26,-3.6]],RED);
  s.imageFacing('british-airways.png',23.2,-3.55,12.9,12.9);
  s.text('BRITISH AIRWAYS',16.4,-5.2,{cap:1.4,font:'Palatino Linotype',fill:NAVY,width:15.9});
 }},
 // ------------------------------------------------------------ China Southern
 CSN:{real:true,draw(s){
  const SKY='#1b8fd6',DEEP='#0c3b90',MID='#2d7fd0';
  fillBase(s,'#f3f5f7');
  const top=interp([[37,-4.6],[34,-5.4],[30,-6.1],[20,-7.0],[8,-8.2],[-5,-9.3],[-12,-9.6]]);
  s.poly([...xs(37,-12,2).map(x=>[x,top(x)]),[-12,-12],[38,-12]],DEEP);
  s.curve(xs(36,-4,2).map(x=>[x,top(x)+.45]),{stroke:MID,width:.28});
  s.curve(xs(36,-4,2).map(x=>[x,top(x)+.85]),{stroke:'#bcd9f2',width:.16});
  s.clip(finShape(),c=>c.rect(-40,-2,-15,13,SKY));
  const [cx,cy]=FIN.pt(4.9,.52);
  s.imageFacing('csn-flower.png',cx,cy,10.5,10.5);
  s.text('中国南方航空',15.8,-4.75,{cap:1.3,font:'Microsoft YaHei',fill:DEEP,width:15.4});
  s.text('CHINA SOUTHERN',.5,-4.75,{cap:.75,font:'Arial',fill:DEEP,width:10.7,italic:true});
 }},
 // --------------------------------------------- Airbus house colours (F-WWOW style)
 BOE:{real:true,draw(s){
  const NAVY='#13347f',LIGHT='#4a9be0';
  fillBase(s,'#f4f5f6');
  s.poly([[-17.5,-1.1],[-12.2,-9.6],[-12,-12],[-40,-12],[-40,-1.1]],NAVY);
  s.clip(finShape(),c=>{
   c.rect(-40,-2,-15,13,NAVY);
   for(let i=0;i<7;i++)c.curve([[-34.5+i*.2,12.6-i*.4],[-31+i*.9,5+ -i*.6],[-27,1.5-i*.1]],{stroke:i%2?LIGHT:'#dbe9f7',width:.55-i*.04});
   c.poly([[-18.5,-1.2],[-20.8,-1.2],[-24.3,3.2],[-22.9,3.2]],'#f4f5f6');
  });
  s.text('A380',-27.3,.55,{cap:2.3,font:'Arial',fill:'#ffffff',width:7.3});
  s.text('F-WWOW',-23,-4.1,{cap:.28,font:'Arial',weight:'normal',fill:'#ffffff'});
 }},
 // ---------------------------------------------------------------- Air China
 CCA:{real:false,draw(s){
  const BLUE='#17357f',RED='#d6001c';
  fillBase(s,'#f4f5f6');
  bellyBand(s,'#c3c8ce',interp([[37,.2],[30,1.5],[10,2.5],[-12,2.5],[-28,1.6],[-37.5,1.0]]));
  lineAlong(s,x=>-6.6+Math.max(0,x-26)*.15,BLUE,.14);
  lineAlong(s,x=>-6.9+Math.max(0,x-26)*.15,'#5f86cf',.08);
  s.clip(finShape(),c=>c.rect(-40,-2,-15,13,'#eceef0'));
  const [cx,cy]=FIN.pt(5,.5);
  s.imageFacing('air-china.png',cx,cy,7.4,7.4);
  s.text('AIR CHINA',24.5,-4.7,{cap:1.05,font:'Arial',fill:RED,width:8.2,italic:true});
  s.text('中国国际航空公司',3,-4.6,{cap:.8,font:'Microsoft YaHei',fill:'#3b4650',width:12});
 }},
 // ------------------------------------------------------------ China Eastern
 CEA:{real:false,draw(s){
  fillBase(s,'#f4f5f6');
  bellyBand(s,'#d3d7dc',interp([[37,.1],[30,1.0],[10,1.8],[-12,1.8],[-28,1.2],[-37.5,.8]]));
  const [cx,cy]=FIN.pt(5.3,.5);
  s.imageFacing('china-eastern.png',cx,cy,8.2,8.2);
  s.text('CHINA EASTERN',22.5,-4.7,{cap:.95,font:'Arial',fill:'#1b3c8f',width:11.5});
  s.text('中国东方航空',9.5,-4.7,{cap:1.05,font:'Microsoft YaHei',fill:'#d4002a',width:8.5});
 }},
 // --------------------------------------------------------------- Hainan
 CHH:{real:false,draw(s){
  const RED='#d5102b',GOLD='#e9c62c';
  fillBase(s,'#f4f5f6');
  // Red, orange and gold swoosh rising along the lower fuselage.
  const wave=(off,thick,color)=>{
   const up=xs(36,-34,3).map(x=>[x,-7.9+off+Math.max(0,x-26)*.35+(x<-8?(-8-x)*.2:0)]);
   s.curve(up,{stroke:color,width:thick});
  };
  wave(.5,.5,RED);wave(0,.22,GOLD);
  s.clip(finShape(),c=>{
   c.rect(-40,-2,-15,13,RED);
   const g=(pts,w)=>c.curve(pts.map(p=>FIN.pt(...p)),{stroke:GOLD,width:w});
   g([[8.6,.12],[9.2,.35],[8.2,.62],[6.5,.62]],.9);
   g([[7.4,.9],[6.6,.5],[5.9,.15],[5.0,.05]],.5);
   g([[3.3,.2],[3.1,.45],[3.6,.55],[4.2,.5]],.8);
   g([[6.1,.1],[4.6,.3],[3.6,.4],[2.6,.55]],1.2);
  });
  s.text('Hainan Airlines',24,-4.7,{cap:1.0,font:'Arial',fill:RED,width:9.8,italic:true});
  s.text('海南航空',13.5,-4.7,{cap:1.0,font:'Microsoft YaHei',fill:RED,width:5.5});
 }},
 // --------------------------------------------------------------- KLM
 KLM:{real:false,draw(s){
  const BLUE='#00a1de';
  fillBase(s,'#f4f5f6');
  const cut=interp([[37,-3.6],[33,-6.2],[24,-6.3],[-10,-6.3],[-26,-5.2],[-37.5,-3.4]]);
  s.poly([[38,5],...xs(37,-37.5).map(x=>[x,cut(x)]),[-38.5,5]],BLUE);
  s.clip(finShape(),c=>c.rect(-40,-2,-15,13,BLUE));
  const [cx,cy]=FIN.pt(4.6,.5);
  s.imageFacing('klm-white.png',cx,cy,9.4,9.4);
  s.image('klm-white.png',22,-3.7,6.8,6.8);
  s.text('Royal Dutch Airlines',9,-4.6,{cap:.55,font:'Arial',fill:'#ffffff',width:9,weight:'normal',italic:true});
 }},
 // ------------------------------------------------------------ Air Force One
 AF1_CLASSIC:{real:false,draw(s){
  const CY='#6cb4e0',NAVY='#143a6b';
  fillBase(s,'#f5f6f7');
  const top=interp([[37,-5.2],[30,-6.0],[10,-6.0],[-20,-6.0],[-37.5,-4.5]]);
  s.poly([...xs(37,-37.5).map(x=>[x,top(x)]),[-38.5,-12],[38,-12]],CY);
  s.curve(xs(36,-34,3).map(x=>[x,top(x)+.35]),{stroke:NAVY,width:.16});
  s.clip(finShape(),c=>c.rect(-40,-2,-15,13,'#f1f3f5'));
  s.rect(-35,10.1,-27.5,11.2,NAVY,'opacity=".0"');
  const [fx,fy]=FIN.pt(10.7,.5);
  s.imageFacing('us-flag.png',fx,fy,3.6,2.4);
  s.text('UNITED STATES OF AMERICA',9,-4.3,{cap:1.1,font:'Georgia',fill:'#1f3560',width:33,weight:'normal'});
 }},
 AF1_2026:{real:false,draw(s){
  const NAVY='#0b1f44',RED='#bf0a30';
  fillBase(s,'#f5f6f7');
  const top=interp([[37,-5.0],[30,-6.1],[10,-6.1],[-20,-6.0],[-37.5,-4.5]]);
  s.poly([...xs(37,-37.5).map(x=>[x,top(x)]),[-38.5,-12],[38,-12]],NAVY);
  s.curve(xs(36,-34,3).map(x=>[x,top(x)+.35]),{stroke:RED,width:.2});
  s.clip(finShape(),c=>{
   c.rect(-40,-2,-15,13,'#f5f6f7');
   for(let i=0;i<7;i++){c.poly([...finEdge(.92-i*.13,.98-i*.13-.02+(i%2?0:0),.0,2),...finEdge(.92-i*.13-.065,.98-i*.13-.085,.0,2).reverse()],i%2?'#f5f6f7':RED);}
   c.poly([...finEdge(.97,1.0,0,2),...finEdge(.62,.7,0,2).reverse()].slice(0,0),NAVY);
   c.poly([[-24,12.5],[-30.5,12.5],[-27.5,8.8],[-22.5,6.5]],NAVY);
  });
  s.text('UNITED STATES OF AMERICA',9,-4.3,{cap:1.1,font:'Georgia',fill:'#1f3560',width:33,weight:'normal'});
 }},
 // --------------------------------------------------------- Freight adaptations
 fedex:{real:false,draw(s){
  const PURPLE='#4d148c',ORANGE='#ff6600';
  fillBase(s,'#f7f6f4');
  s.clip(finShape(),c=>c.rect(-40,-2,-15,13,PURPLE));
  const [cx,cy]=FIN.pt(3.6,.5);
  s.text('Fed',cx-1.45,cy,{cap:2.2,font:'Arial',fill:'#ffffff',width:3.4,anchor:'middle',rotate:0});
  s.text('Ex',cx+1.85,cy,{cap:2.2,font:'Arial',fill:ORANGE,width:2.7,anchor:'middle'});
  s.text('Express',cx,cy-1.1,{cap:.8,font:'Arial',fill:'#ffffff',width:4.8,weight:'normal'});
  s.text('Fed',20.4,-4.2,{cap:2.0,font:'Arial',fill:PURPLE,width:3.4});
  s.text('Ex',23.4,-4.2,{cap:2.0,font:'Arial',fill:ORANGE,width:2.6});
  s.text('Express',22,-5.3,{cap:.6,font:'Arial',fill:PURPLE,width:4.6,weight:'normal'});
 }},
 sf:{real:false,draw(s){
  const BLACK='#1c1d1f',RED='#c8102e',GREY='#73777a';
  fillBase(s,'#f6f6f5');
  const base=x=>-7.2+Math.max(0,x-24)*.45+(x<-6?(-6-x)*.22:0);
  s.curve(xs(36,-34,3).map(x=>[x,base(x)]),{stroke:BLACK,width:.4});
  s.curve(xs(36,-34,3).map(x=>[x,base(x)+.45]),{stroke:GREY,width:.22});
  s.curve(xs(26,-34,3).map(x=>[x,base(x)+1.2+(-x>0?Math.max(0,-x-6)*.16:0)]),{stroke:RED,width:.3});
  s.poly(xs(37,-37.5).map(x=>[x,keel(x)+.5]).concat([[-38.5,-12],[38,-12]]),BLACK);
  s.clip(finShape(),c=>c.rect(-40,-2,-15,13,BLACK));
  const [cx,cy]=FIN.pt(4.7,.5);
  s.image('sf-express.png',cx,cy,6.4,6.4);
  s.image('sf-express.png',24,-4.4,3.0,3.0);
  s.text('AIRLINES',29.5,-3.9,{cap:.55,font:'Arial',fill:'#33363a',width:4.2});
  s.text('顺丰航空',29.5,-4.8,{cap:.7,font:'Microsoft YaHei',fill:'#33363a',width:3.8});
 }},
};
