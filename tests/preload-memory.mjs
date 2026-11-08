// CPU regression for byte-bounded LRU storage of idle-prefetched aircraft bodies.
// Run: node tests/preload-memory.mjs.
import assert from 'node:assert/strict';
import {BoundedStore} from '../src/bounded-store.js';

const store=new BoundedStore(10);
const entry=bytes=>({body:new Uint8Array(bytes),type:'application/octet-stream'});
assert.equal(store.set('a',entry(6)),true);assert.equal(store.set('b',entry(4)),true);assert.equal(store.bytes,10);
assert.equal(store.get('a').body.byteLength,6,'get refreshes the LRU position');
assert.equal(store.set('c',entry(4)),true);
assert.equal(store.bytes,10);assert.equal(store.get('b'),undefined,'least-recent body is evicted first');
assert.equal(store.get('a').body.byteLength,6);assert.equal(store.get('c').body.byteLength,4);
assert.equal(store.set('oversize',entry(11)),false,'a single body larger than the cap is not retained');
assert.equal(store.bytes,10);assert.equal(store.delete('c'),true);assert.equal(store.bytes,6);
store.clear();assert.equal(store.bytes,0);assert.equal(store.entries.size,0);
console.log('Prefetch body store passed: byte limit, LRU eviction, oversized item and byte accounting.');
