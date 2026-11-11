// FlightGear 777 candidate atlas adapter. FedEx follows the real 777F scheme; SF has no real 777F and is a
// fictional adaptation of its 747 styling. Atlases are baked by tests/b777_livery_build.py.
// Upstream model/UV attribution and GPL-2.0: assets/accurate-b777/CREDITS.txt.
import {Texture} from 'three';
import {LIVERIES} from './aircraft.js';
import {CARGO_LIVERIES} from './cargo-liveries.js';

const cargoIds = new Set(CARGO_LIVERIES.map(x => x.id));
export const B777_LIVERY_IDS = Object.freeze(LIVERIES.map(x => x.id));
export const B777_CARGO_LIVERY_INFO = Object.freeze({
 fedex:Object.freeze({model:'777-200F',fictional:false,disclosure:'FedEx 777F 实机涂装：白色机身、紫色后下机身与垂尾；原创矢量绘制，注册号与细节不保证与特定实机一致。'}),
 sf:Object.freeze({model:'777-200F',fictional:true,disclosure:'真机无此涂装：顺丰航空没有 777 货机（机队为 737/757/767），此为按顺丰 747 货机风格的假想适配。'}),
});
const CARGO_ATLAS_ROOT = '/assets/b777-liveries/cargo/';
export function b777CargoManifest({id,variant}) {
 if (variant !== 'cargo' || !Object.hasOwn(B777_CARGO_LIVERY_INFO,id))
  throw Error(`No B777 ${variant} atlas available for ${id}`);
 return {id,variant,maps:[
  {sourceTexture:'Liveries-F/AFR1blanc.png',url:`${CARGO_ATLAS_ROOT}${id}-body.webp`},
  {sourceTexture:'Liveries-F/AFR5blanc.png',url:`${CARGO_ATLAS_ROOT}${id}-fin.webp`},
  {sourceTexture:'Liveries-F/AFR4blanc.png',url:`${CARGO_ATLAS_ROOT}${id}-doors.webp`},
  {sourceTexture:'Liveries-F/AFR3.png',url:`${CARGO_ATLAS_ROOT}${id}-belly.webp`},
  {sourceTexture:'Liveries-F/AFR8LAT.png',url:`${CARGO_ATLAS_ROOT}${id}-eng.webp`},
 ],tints:[]};
}
const cancelledError = () => Object.assign(Error('B777 texture load cancelled'), {name:'AbortError'});

// A fresh texture/image lease per load. Fetch is abortable; ImageBitmap decode
// may finish late, in which case the bitmap is immediately closed. The Image
// fallback owns and revokes its object URL and detaches all event handlers.
export async function loadB777CargoTexture({url,signal}) {
 let image, objectURL, texture;
 try {
  const response = await fetch(url,{signal});
  if (!response.ok) throw Error(`B777 texture HTTP ${response.status}: ${url}`);
  const blob = await response.blob();
  if (signal?.aborted) throw cancelledError();
  if (typeof globalThis.createImageBitmap === 'function') {
   image = await globalThis.createImageBitmap(blob,{imageOrientation:'none',premultiplyAlpha:'none',colorSpaceConversion:'none'});
  } else {
   if (typeof globalThis.Image !== 'function' || typeof URL.createObjectURL !== 'function') throw Error('B777 image decoder unavailable');
   objectURL = URL.createObjectURL(blob);
   image = await new Promise((resolve,reject) => {
    const img = new Image();
    const cleanup = () => { img.onload=null;img.onerror=null;signal?.removeEventListener('abort',abort); };
    const abort = () => { cleanup();img.src='';reject(cancelledError()); };
    img.onload=()=>{cleanup();resolve(img);};
    img.onerror=()=>{cleanup();reject(Error(`B777 texture decode failed: ${url}`));};
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) abort(); else img.src=objectURL;
   });
  }
  if (signal?.aborted) throw cancelledError();
  texture = new Texture(image); texture.needsUpdate = true;
  if (objectURL) {URL.revokeObjectURL(objectURL);objectURL=null;}
  let released=false;
  return {texture,dispose(){if(released)return;released=true;texture.dispose();image?.close?.();}};
 } catch (error) {
  texture?.dispose();image?.close?.();if(objectURL)URL.revokeObjectURL(objectURL);
  throw error;
 }
}
export function b777LiveryVariant(livery) {
 const id = typeof livery === 'string' ? livery : livery?.id;
 if (!B777_LIVERY_IDS.includes(id)) throw Error(`Unknown B777 livery: ${id}`);
 return cargoIds.has(id) ? 'cargo' : 'passenger';
}

// Source-name/structure guards against accidentally painting a 300ER/300F;
// neither proves provenance, dimensions, window sealing or select state.
function inspect(scene, variant) {
 if (!scene?.isObject3D) throw Error('B777 scene required');
 const names = new Set(), seals = [], materials = [];
 scene.traverse(o => {
  const name = o.userData?.fgName;
  if (name) names.add(name);
  if (name === 'hublot' && o.userData?.role === 'cargo-window-seal') seals.push(o);
  if (o.isMesh) {
   const source = o.material, list = Array.isArray(source) ? source : [source];
   let parent=o;while (parent && !parent.userData?.fgName) parent=parent.parent;
   materials.push({mesh:o, fgName:parent?.userData?.fgName, source, current:source, list});
  }
 });
 if (!names.has('Fuselage')) throw Error('B777 candidate Fuselage not found');
 const prefix = variant === 'cargo' ? 'Liveries-F/' : variant === 'passenger' ? 'Liveries-200LR/' : null;
 if (!prefix) throw Error('Unknown B777 variant');
 if (!materials.some(r => r.list.some(m => m?.userData?.sourceTexture?.startsWith(prefix))))
  throw Error(`B777 ${variant} source texture directory not found`);
 if (variant === 'cargo') {
  if (!names.has('entry11l') || names.has('glassehublot') || seals.length !== 1)
   throw Error('B777 200F cargo door/window-seal candidate not found');
 } else if (variant === 'passenger') {
  if (!names.has('glassehublot') || seals.length) throw Error('B777 200LR passenger windows not found');
 } else throw Error('Unknown B777 variant');
 return materials;
}

function checkManifest(manifest, id, variant) {
 if (!manifest || manifest.id !== id || manifest.variant !== variant || !Array.isArray(manifest.maps) || !manifest.maps.length)
  throw Error(`No B777 ${variant} atlas available for ${id}`);
 const seen = new Set();
 const prefix = variant === 'cargo' ? 'Liveries-F/' : 'Liveries-200LR/';
 const maps=manifest.maps.map(item => {
  if (!item || typeof item.sourceTexture !== 'string' || !item.sourceTexture.startsWith(prefix) ||
      typeof item.url !== 'string' || !item.url || seen.has(item.sourceTexture))
   throw Error('Invalid or duplicate B777 atlas mapping');
  seen.add(item.sourceTexture);
  return {sourceTexture:item.sourceTexture, url:item.url};
 });
 if (manifest.tints != null && !Array.isArray(manifest.tints)) throw Error('Invalid B777 material tints');
 const tints=new Map();
 for (const t of manifest.tints ?? []) {
  if (!t || typeof t.fgName!=='string' || !t.fgName || typeof t.sourceTexture!=='string' || !t.sourceTexture.startsWith(prefix) ||
      typeof t.color!=='string' || !/^#[0-9a-f]{6}$/i.test(t.color)) throw Error('Invalid B777 material tint');
  const key=t.fgName+'\0'+t.sourceTexture;
  if (tints.has(key)) throw Error('Duplicate B777 material tint');
  tints.set(key,t.color);
 }
 return {maps,tints};
}

// Copy the sampling and UV transform from the actual GLTF material, not from
// TextureLoader defaults. Each distinct source map gets its own texture clone.
function adaptTexture(texture, source) {
 const t = texture.clone();
 try {
  for (const key of ['mapping','channel','wrapS','wrapT','magFilter','minFilter','anisotropy',
   'flipY','colorSpace','generateMipmaps','premultiplyAlpha','unpackAlignment','matrixAutoUpdate']) t[key] = source[key];
  t.offset.copy(source.offset); t.repeat.copy(source.repeat); t.center.copy(source.center);
  t.rotation = source.rotation; t.matrix.copy(source.matrix); t.needsUpdate = true;
  return t;
 } catch (error) { t.dispose(); throw error; }
}
function release(resource) {
 // Resource cleanup must not prevent restoring the old scene or releasing the
 // remaining owned resources. Diagnostics are exposed on the controller.
 for (const item of [...resource.materials, ...resource.textures, ...resource.leases]) {
  try { item.dispose(); } catch (error) { resource.errors.push(error); }
 }
}
const resource = errors => ({materials:[], textures:[], leases:[], errors});

/**
 * Owns only the material/texture clones installed by this controller. Geometry,
 * original maps/materials, visibility, window lighting and doors are untouched.
 *
 * manifestFor({id,variant,signal}) returns {id,variant,maps:[{sourceTexture,url}]}.
 * loadTexture({url,signal}) returns a FRESH exclusive {texture,dispose()} lease;
 * its dispose must also close any owned ImageBitmap. A loader that rejects must
 * clean its own partial work; if it ignores abort, it must eventually settle so
 * a late lease can be released. Never return the scene's existing/shared maps.
 * The default provider loads the two locally generated cargo atlas pairs.
 * The application supplies the companion passenger manifest for passenger paint.
 */
export function createB777LiveryController(scene, {variant, manifestFor=b777CargoManifest, loadTexture=loadB777CargoTexture, timeoutMs=30000} = {}) {
 if (typeof manifestFor !== 'function' || typeof loadTexture !== 'function') throw Error('B777 atlas and texture providers required');
 if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('Invalid B777 livery timeout');
 const records = inspect(scene, variant), errors = [];
 let current = null, pending = null, disposed = false;
 function cancel(reason) { if (pending) pending.cancel(reason); }
 function restore() {
  for (const r of records) {
   if (r.current !== r.source && r.mesh.material === r.current) r.mesh.material = r.source;
   r.current = r.source;
  }
 }
 return {
  get releaseErrors() { return errors.slice(); },
  get livery() { return current?.id ?? null; },
  async setLivery(livery, {signal} = {}) {
   if (disposed) throw Error('B777 livery controller disposed');
   cancel('superseded');
   const id = typeof livery === 'string' ? livery : livery?.id;
   if (b777LiveryVariant(id) !== variant) throw Error(`B777 ${id} requires a different aircraft variant`);
   if (signal != null && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw Error('Invalid B777 abort signal');
   if (signal?.aborted) return false;
   const controller = new AbortController();
   let reason = null, resolveCancel;
   const cancelled = new Promise(resolve => { resolveCancel = resolve; });
   const op = {cancel(why) {
    if (reason) return;
    reason = why; controller.abort(); resolveCancel(false);
   }};
   pending = op;
   const onAbort = () => op.cancel('aborted');
   signal?.addEventListener('abort', onAbort, {once:true});
   const timer = setTimeout(() => op.cancel('timeout'), timeoutMs);
   const work = (async () => {
    const staged = resource(errors); let committed = false;
    try {
     const manifest = await manifestFor({id, variant, signal:controller.signal});
     if (reason) return false;
     const {maps:mappings,tints} = checkManifest(manifest, id, variant), byName = new Map(), wanted = new Set(mappings.map(m => m.sourceTexture));
     // Exact sourceTexture identity includes its variant folder. Apply to all
     // slots that share the atlas, including unlabelled FlightGear textureSlots.
     for (const r of records) for (const m of r.list) {
      const key = m?.userData?.sourceTexture;
      if (wanted.has(key)) {
       if (!m.map?.isTexture) throw Error(`B777 source map missing: ${key}`);
       if (!byName.has(key)) byName.set(key, []);
       byName.get(key).push(m);
      }
     }
     for (const {sourceTexture} of mappings) if (!byName.has(sourceTexture)) throw Error(`B777 atlas target not found: ${sourceTexture}`);
     for (const key of tints.keys()) {
      const [fgName,sourceTexture]=key.split('\0');
      const found=records.some(r=>r.fgName===fgName && r.list.some(m=>m?.userData?.sourceTexture===sourceTexture && m.color?.isColor));
      if (!found) throw Error(`B777 tint target not found: ${fgName}`);
     }
     const loaded = new Map();
     // Fetch every atlas concurrently; leases that finish are staged even when a sibling fails so release() frees them.
     const settled = await Promise.allSettled(mappings.map(item => loadTexture({...item, id, variant, signal:controller.signal})));
     // Never take ownership of a known source map or of a texture already staged by an earlier lease.
     for (const r of settled) {
      const lease = r.status === 'fulfilled' ? r.value : null;
      if (typeof lease?.dispose !== 'function') continue;
      if (lease.texture && (staged.leases.some(x => x.texture === lease.texture) || records.some(rec => rec.list.some(m => m?.map === lease.texture)))) continue;
      staged.leases.push(lease);
     }
     const failure = settled.find(r => r.status === 'rejected');
     if (failure) throw failure.reason;
     if (reason) return false;
     mappings.forEach((item, i) => {
      const lease = settled[i].value;
      // Never dispose a known source map (or a duplicate lease) even if a broken provider claims ownership of it.
      const shared = lease?.texture && (settled.some((x, j) => j !== i && x.value?.texture === lease.texture) ||
       records.some(r => r.list.some(m => m?.map === lease.texture)));
      if (shared) throw Error('B777 texture provider returned a shared map');
      if (!lease?.texture?.isTexture || typeof lease.dispose !== 'function') throw Error('B777 texture lease required');
      loaded.set(item.sourceTexture, lease.texture);
     });
     const materialCopies = new Map(), textureCopies = new Map(), replacements = new Map();
     for (const r of records) {
      let changed = false;
      const list = r.list.map(m => {
       const sourceTexture=m?.userData?.sourceTexture;
       const image = loaded.get(sourceTexture), tint=tints.get(r.fgName+'\0'+sourceTexture);
       if (!image && !tint) return m;
       changed = true;
       let variants=materialCopies.get(m);
       if (!variants) {variants=new Map();materialCopies.set(m,variants);}
       let clone = variants.get(tint ?? '');
       if (!clone) {
        let map=m.map;
        if (image) {
         let perImage = textureCopies.get(image);
         if (!perImage) { perImage = new Map(); textureCopies.set(image, perImage); }
         map = perImage.get(m.map);
         if (!map) { map = adaptTexture(image, m.map); staged.textures.push(map); perImage.set(m.map, map); }
        }
        clone = m.clone(); staged.materials.push(clone); clone.map = map;
        if (tint) clone.color.set(tint);
        clone.needsUpdate = true; variants.set(tint ?? '',clone);
       }
       return clone;
      });
      if (changed) replacements.set(r, Array.isArray(r.source) ? list : list[0]);
     }
     // Also check old targets which the new atlas no longer replaces.
     for (const r of records) if ((r.current !== r.source || replacements.has(r)) && r.mesh.material !== r.current)
      throw Error('B777 paint material ownership conflict');
     if (reason) return false;
     const old = current;
     for (const r of records) {
      if (r.current !== r.source || replacements.has(r)) {
       r.current = replacements.get(r) ?? r.source;
       r.mesh.material = r.current;
      }
     }
     current = {id, staged}; committed = true;
     if (old) release(old.staged);
     return true;
    } finally { if (!committed) release(staged); }
   })();
   try {
    const result = await Promise.race([work, cancelled]);
    if (reason === 'timeout') throw Object.assign(Error('B777 livery texture load timed out'), {name:'TimeoutError'});
    return result;
   } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
    if (pending === op) pending = null;
   }
  },
  dispose() {
   if (disposed) return;
   disposed = true; cancel('disposed'); pending = null;
   restore(); if (current) release(current.staged); current = null;
  },
 };
}

// Adapter for AccurateB777Research's detached-bundle liveryLoader contract.
// A fresh controller is owned by each lease. Rejecting providers must clean up.
export function createB777LiveryLoader(options={}) {
 return async ({bundle, livery, variant, signal}) => {
  const paint = createB777LiveryController(bundle?.scene, {...options, variant});
  try {
   if (!await paint.setLivery(livery, {signal})) throw Object.assign(Error('B777 livery cancelled'), {name:'AbortError'});
   return paint;
  } catch (error) { paint.dispose(); throw error; }
 };
}
