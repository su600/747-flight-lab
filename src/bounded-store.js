// LRU cache for prefetched response bodies. Keep prefetching from pinning an
// entire set of multi-megabyte aircraft models in memory when none is selected.
export class BoundedStore {
 constructor(maxBytes){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0)throw RangeError('maxBytes must be a non-negative safe integer');
  this.maxBytes=maxBytes;this.bytes=0;this.entries=new Map();
 }
 get(key){
  const value=this.entries.get(key);if(value===undefined)return undefined;
  this.entries.delete(key);this.entries.set(key,value);return value;
 }
 set(key,value){
  const size=value?.body?.byteLength;
  if(!Number.isSafeInteger(size)||size<0)throw TypeError('cache entry must contain a byte body');
  this.delete(key);if(size>this.maxBytes)return false;
  this.entries.set(key,value);this.bytes+=size;
  while(this.bytes>this.maxBytes)this.delete(this.entries.keys().next().value);
  return true;
 }
 delete(key){
  const value=this.entries.get(key);if(value===undefined)return false;
  this.entries.delete(key);this.bytes-=value.body.byteLength;return true;
 }
 clear(){this.entries.clear();this.bytes=0;}
}
