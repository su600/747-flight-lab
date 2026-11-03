// node assets/a380-liveries/generate.mjs [ID,ID,...]   (default: all)
// Writes <ID>-port.webp / <ID>-starboard.webp next to this file, and (with
// PREVIEW=dir) full-size PNG previews for visual review.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Side,prepareDerivedLogos} from './lib.mjs';
import {ART} from './liveries.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
await prepareDerivedLogos();
const ids=(process.argv[2]||Object.keys(ART).join(',')).split(',');
for(const id of ids){
 const art=ART[id];if(!art)throw Error('unknown livery '+id);
 for(const side of ['port','starboard']){
  const s=new Side(side);art.draw(s);
  const png=await s.webp(path.join(here,`${id}-${side}.webp`));
  if(process.env.PREVIEW){fs.mkdirSync(process.env.PREVIEW,{recursive:true});fs.writeFileSync(path.join(process.env.PREVIEW,`${id}-${side}.png`),png);}
 }
 console.log('wrote',id);
}
