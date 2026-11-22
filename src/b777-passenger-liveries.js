// Approximate 777-200LR interpretations, not airline-authorised liveries.
// FlightGear source/UV and GPL-2.0 attribution: assets/accurate-b777/CREDITS.txt.
const ROOT='/assets/b777-liveries/passenger/';
const ids=['BOE','ANA','CCA','CEA','CSN','CHH','UAE','BAW','KLM','DLH','DLH100','AF1_CLASSIC','AF1_2026'];
export const B777_PASSENGER_LIVERY_IDS=Object.freeze(ids);
// Only these two schemes have a real 200LR counterpart; neither atlas is an
// exact aircraft/registration. The remaining menu IDs are adaptations.
const real200LR=new Set(['BOE','UAE']);
export const B777_PASSENGER_LIVERY_INFO=Object.freeze(Object.fromEntries(ids.map(id=>[id,Object.freeze({
 model:'777-200LR',approximate:true,fictional:!real200LR.has(id),
 disclosure:real200LR.has(id)
  ? '参考真实 777-200LR 涂装的近似绘制，非官方或特定实机复刻。'
  : '其他机型涂装的 777-200LR 假想适配，非官方或实机复刻。',
})])));
const known=new Set(ids);
/** Provider for createB777LiveryController({variant:'passenger',manifestFor,...}). */
export function manifestFor({id,variant}={}) {
 if(variant!=='passenger'||!known.has(id)) throw Error(`No B777 ${variant} atlas available for ${id}`);
 return {id,variant,maps:[
  {sourceTexture:'Liveries-200LR/AFR1blanc.png',url:`${ROOT}${id}-body.webp`},
  {sourceTexture:'Liveries-200LR/AFR5blanc.png',url:`${ROOT}${id}-fin.webp`},
  // door skins, belly fairing/gear doors and engine cowls carry the same paint as the fuselage
  {sourceTexture:'Liveries-200LR/AFR4blanc.png',url:`${ROOT}${id}-doors.webp`},
  {sourceTexture:'Liveries-200LR/AFR3.png',url:`${ROOT}${id}-belly.webp`},
  {sourceTexture:'Liveries-200LR/AFR8LAT.png',url:`${ROOT}${id}-eng.webp`},
 ]};
}
export const b777PassengerManifest=manifestFor;
// The generic exclusive image lease used by the cargo provider also accepts
// these URLs; it copies the source map's sampler/UV settings in the controller.
export {loadB777CargoTexture as loadB777PassengerTexture} from './b777-livery.js';
