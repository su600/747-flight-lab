// Build-time helpers for the A380 livery atlases (not shipped to the browser).
// Requires @resvg/resvg-js and sharp (global or local npm) and the Windows/Noto
// fonts listed in FONT_FILES. Artwork is original vector drawing; the only
// raster inputs are the repository's existing assets/livery-logos/*.png.
import {createRequire} from 'node:module';
import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
export const REPO=path.resolve(here,'../..');
function load(name){
 try{return createRequire(import.meta.url)(name);}catch{}
 const global=execSync('npm root -g').toString().trim();
 return createRequire(path.join(global,'x.js'))(name);
}
const {Resvg}=load('@resvg/resvg-js');
export const sharp=load('sharp');

// Atlas frame in aircraft-root metres (x forward, y up). Must match src/a380-paint.js.
export const ATLAS={x0:-37.5,x1:37.0,y0:-9.8,y1:12.6,width:3072};
ATLAS.scale=ATLAS.width/(ATLAS.x1-ATLAS.x0);
ATLAS.height=Math.round((ATLAS.y1-ATLAS.y0)*ATLAS.scale);

// Landmarks measured on the converted A380X model.
export const FUSE={top:-1.06,keel:-9.45,nose:36.5,tail:-36.6,
 mainRow:-5.45,upperRow:-2.73,
 mainDoors:[30.2,20.0,3.8,-8.3,-17.2],upperDoors:[15.5,-3.9,-12.7]};
// Fin trapezoid (side view). LE/TE x as a function of height y.
export const FIN={top:12.33,root:-1.1,
 le:y=>-19.35-0.9553*y,te:y=>-30.73-0.4715*y,
 pt(y,t){return [this.le(y)+(this.te(y)-this.le(y))*t,y];}};

const W='C:/Windows/Fonts/';
const FONT_FILES=[
 ...['arial.ttf','arialbd.ttf','ariali.ttf','arialbi.ttf','ARIALNB.TTF','PALAB.TTF','pala.ttf','georgiab.ttf','georgia.ttf','DUBAI-BOLD.TTF','DUBAI-MEDIUM.TTF','msyhbd.ttc','msyh.ttc','simhei.ttf','segoeuib.ttf','framd.ttf','trebucbd.ttf','GILB____.TTF','calibrib.ttf','impact.ttf','FRAHV.TTF'].map(f=>W+f),
 '/usr/share/fonts/dejavu/DejaVuSans.ttf','/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
].filter(f=>fs.existsSync(f));
const FONT_FAMILY=FONT_FILES.some(f=>/arial\.ttf$/i.test(f))?'Arial':'DejaVu Sans';
const FONT_OPTS={fontFiles:FONT_FILES,loadSystemFonts:false,defaultFontFamily:FONT_FAMILY};

const measureCache=new Map();
function measure(text,font,weight,italic){
 const key=[text,font,weight,italic].join('|');
 if(!measureCache.has(key)){
  const esc=text.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="400"><text x="50" y="250" font-family="${font}" font-weight="${weight}" font-style="${italic?'italic':'normal'}" font-size="200">${esc}</text></svg>`;
  const b=new Resvg(svg,{font:FONT_OPTS}).getBBox();
  measureCache.set(key,b?{w:b.width/200,x:(b.x-50)/200}:{w:text.length*.6,x:0});
 }
 return measureCache.get(key);
}

const logoCache=new Map();
/** Derived single-colour / cut-out versions of the repository logos (computed once per run). */
export async function prepareDerivedLogos(){
 const read=n=>sharp(path.join(REPO,'assets/livery-logos',n)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const put=async(key,data,info)=>logoCache.set(key,'data:image/png;base64,'+(await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer()).toString('base64'));
 for(const [key,src,hex] of [['klm-white.png','klm.png','#ffffff'],['hainan-gold.png','hainan.png','#ffd100'],['lufthansa-white.png','lufthansa.png','#ffffff']]){
  const {data,info}=await read(src),c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  for(let i=0;i<data.length;i+=4){data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];}
  await put(key,data,info);
 }
 {// Isolate and recolor Lufthansa's crane mark without the surrounding roundel.
  // Tight-crop to the crane's own pixels (the source region has a wide margin),
  // then stretch to the measured 47 m x 6.1 m proportions (~7.7:1).
  const src=path.join(REPO,'assets/livery-logos/lufthansa.png');
  const probe=await sharp(src).extract({left:48,top:190,width:418,height:176}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let x0=probe.info.width,x1=-1,y0=probe.info.height,y1=-1;
  for(let y=0;y<probe.info.height;y++)for(let x=0;x<probe.info.width;x++)if(probe.data[(y*probe.info.width+x)*4+3]>40){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  const {data,info}=await sharp(src).extract({left:48+x0,top:190+y0,width:x1-x0+1,height:y1-y0+1}).resize(1000,130,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4){data[i]=255;data[i+1]=255;data[i+2]=255;}
  await put('lufthansa-crane-white.png',data,info);
 }
 {// Kapok flower only: drop the blue tail-shaped background of the logo.
  const {data,info}=await read('china-southern.png');
  for(let i=0;i<data.length;i+=4){const r=data[i],b=data[i+2];if(b>r+30)data[i+3]=0;}
  await put('csn-flower.png',data,info);
 }
}
export function logoData(name){
 if(!logoCache.has(name))logoCache.set(name,'data:image/png;base64,'+fs.readFileSync(path.join(REPO,'assets/livery-logos',name)).toString('base64'));
 return logoCache.get(name);
}

/** One side of the livery atlas. Shapes are given in aircraft metres; the
 * starboard view is the natural (nose-left) view of the same aircraft-frame art,
 * so shapes mirror while text and raster logos stay readable. */
export class Side{
 constructor(side){this.side=side;this.parts=[];this.defs=[];this.n=0;}
 mx(x){return this.side==='port'?(x-ATLAS.x0)*ATLAS.scale:(ATLAS.x1-x)*ATLAS.scale;}
 my(y){return (ATLAS.y1-y)*ATLAS.scale;}
 p([x,y]){return `${this.mx(x).toFixed(1)},${this.my(y).toFixed(1)}`;}
 add(s){this.parts.push(s);return this;}
 rect(x0,y0,x1,y1,fill,extra=''){
  const xa=this.mx(x0),xb=this.mx(x1),ya=this.my(y1),yb=this.my(y0);
  return this.add(`<rect x="${Math.min(xa,xb).toFixed(1)}" y="${Math.min(ya,yb).toFixed(1)}" width="${Math.abs(xb-xa).toFixed(1)}" height="${Math.abs(yb-ya).toFixed(1)}" fill="${fill}" ${extra}/>`);
 }
 poly(points,fill,extra=''){return this.add(`<polygon points="${points.map(p=>this.p(p)).join(' ')}" fill="${fill}" ${extra}/>`);}
 /** Smooth closed or open curve through points (Catmull-Rom -> cubic Bezier). */
 curve(points,{fill='none',stroke,width=0,closed=false,tension=.5,extra=''}={}){
  const P=points.map(p=>[this.mx(p[0]),this.my(p[1])]);
  const n=P.length;let d=`M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  const at=i=>closed?P[(i+n)%n]:P[Math.max(0,Math.min(n-1,i))];
  const segs=closed?n:n-1;
  for(let i=0;i<segs;i++){
   const p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2),k=tension/3*2;
   d+=` C${(p1[0]+(p2[0]-p0[0])*k/2).toFixed(1)},${(p1[1]+(p2[1]-p0[1])*k/2).toFixed(1)} ${(p2[0]-(p3[0]-p1[0])*k/2).toFixed(1)},${(p2[1]-(p3[1]-p1[1])*k/2).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  if(closed)d+=' Z';
  return this.add(`<path d="${d}" fill="${fill}" ${stroke?`stroke="${stroke}" stroke-width="${(width*ATLAS.scale).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"`:''} ${extra}/>`);
 }
 line(a,b,color,width,extra=''){
  return this.add(`<line x1="${this.mx(a[0]).toFixed(1)}" y1="${this.my(a[1]).toFixed(1)}" x2="${this.mx(b[0]).toFixed(1)}" y2="${this.my(b[1]).toFixed(1)}" stroke="${color}" stroke-width="${(width*ATLAS.scale).toFixed(1)}" ${extra}/>`);
 }
 circle(x,y,r,fill,extra=''){return this.add(`<circle cx="${this.mx(x).toFixed(1)}" cy="${this.my(y).toFixed(1)}" r="${(r*ATLAS.scale).toFixed(1)}" fill="${fill}" ${extra}/>`);}
 ellipse(x,y,rx,ry,fill,extra=''){return this.add(`<ellipse cx="${this.mx(x).toFixed(1)}" cy="${this.my(y).toFixed(1)}" rx="${(rx*ATLAS.scale).toFixed(1)}" ry="${(ry*ATLAS.scale).toFixed(1)}" fill="${fill}" ${extra}/>`);}
 /** Run `fn` with everything it draws clipped to the polygon (aircraft metres). */
 clip(points,fn){
  const id='c'+(this.n++);
  this.defs.push(`<clipPath id="${id}"><polygon points="${points.map(p=>this.p(p)).join(' ')}"/></clipPath>`);
  this.parts.push(`<g clip-path="url(#${id})">`);fn(this);this.parts.push('</g>');return this;
 }
 /** Upright text anchored at aircraft position (x,y=baseline). `cap` is the
  * cap height in metres; `width` (metres) optionally stretches the glyphs. */
 text(str,x,y,{cap=1,font='Arial',weight='bold',fill='#000',anchor='middle',italic=false,width,spacing=0,rotate=0,opacity=1,stroke}={}){
  const m=measure(str,font,weight,italic),capRatio=.72,size=cap/capRatio*ATLAS.scale;
  const natural=m.w*size/ATLAS.scale;
  let sx=width?width/natural:1;
  const tx=this.mx(x),ty=this.my(y);
  const esc=str.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const a={middle:'middle',start:'start',end:'end'}[anchor];
  return this.add(`<text transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) rotate(${(this.side==='port'?-rotate:rotate)}) scale(${sx.toFixed(4)},1)" text-anchor="${a}" font-family="${font}" font-weight="${weight}" font-style="${italic?'italic':'normal'}" font-size="${size.toFixed(1)}" letter-spacing="${(spacing*ATLAS.scale).toFixed(1)}" fill="${fill}" opacity="${opacity}" ${stroke?`stroke="${stroke}"`:''}>${esc}</text>`);
 }
 /** Raster logo centred at (x,y), w x h metres, never mirrored. */
 image(name,x,y,w,h,{rotate=0,opacity=1}={}){
  const cx=this.mx(x),cy=this.my(y),pw=w*ATLAS.scale,ph=h*ATLAS.scale;
  return this.add(`<image href="${logoData(name)}" x="${(-pw/2).toFixed(1)}" y="${(-ph/2).toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" opacity="${opacity}" transform="translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${this.side==='port'?-rotate:rotate})" preserveAspectRatio="xMidYMid meet"/>`);
 }
 /** Same as image() but mirrored with the aircraft frame (art that must face the nose on both sides). */
 imageFacing(name,x,y,w,h,{rotate=0,flip=false}={}){
  const cx=this.mx(x),cy=this.my(y),pw=w*ATLAS.scale,ph=h*ATLAS.scale;
  const mirror=(this.side==='starboard')!==flip?-1:1;
  return this.add(`<image href="${logoData(name)}" x="${(-pw/2).toFixed(1)}" y="${(-ph/2).toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" transform="translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${this.side==='port'?-rotate:rotate}) scale(${mirror},1)" preserveAspectRatio="xMidYMid meet"/>`);
 }
 svg(){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ATLAS.width}" height="${ATLAS.height}" viewBox="0 0 ${ATLAS.width} ${ATLAS.height}"><defs>${this.defs.join('')}</defs>${this.parts.join('')}</svg>`;
 }
 async webp(file){
  const png=new Resvg(this.svg(),{font:FONT_OPTS,fitTo:{mode:'original'}}).render().asPng();
  await sharp(png).webp({lossless:true,effort:5}).toFile(file);
  return png;
 }
}

/** Common fuselage helpers shared by every livery. */
export function fillBase(s,color){s.rect(ATLAS.x0-1,ATLAS.y0-1,ATLAS.x1+1,ATLAS.y1+1,color);}
/** Keel line y(x) of the fuselage, used to follow the belly/tail up-sweep. */
export function keel(x){
 if(x>=23)return -9.45+(x-23)*(9.45-8.2)/(36.5-23)*0.8;
 if(x>=-12)return -9.47;
 if(x>=-24)return -9.47+(-12-x)*(9.47-6.4)/12;
 return -6.4+(-24-x)*(6.4-3.6)/12.6;
}
export function belly(s,color,cutAt){
 // Region below the polyline cutAt([[x,y]...]), down to the atlas bottom.
 const pts=cutAt.map(([x,y])=>[x,y]);
 s.poly([...pts,[pts.at(-1)[0],ATLAS.y0-2],[pts[0][0],ATLAS.y0-2]],color);
}
