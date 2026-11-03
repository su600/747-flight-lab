// Render SVG livery artwork to PNG with @resvg/resvg-js (system fonts, so Arabic/CJK shaping works).
// usage: node tests/b777_render_svg.mjs <in.svg> <out.png> <pixel-width>
// Needs `npm i -g @resvg/resvg-js` (or a local install); RESVG_DIR may point at the package directory.
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
let resvg;
for(const dir of [process.env.RESVG_DIR,'@resvg/resvg-js',`${process.env.APPDATA||''}/npm/node_modules/@resvg/resvg-js`].filter(Boolean)){
 try{resvg=require(dir);break;}catch{}
}
if(!resvg)throw Error('@resvg/resvg-js not found');
const [,,input,output,width]=process.argv;
const svg=fs.readFileSync(input,'utf8');
const image=new resvg.Resvg(svg,{fitTo:{mode:'width',value:Number(width)},background:'rgba(0,0,0,0)',font:{loadSystemFonts:true,defaultFontFamily:'Arial'}}).render();
fs.writeFileSync(output,image.asPng());
