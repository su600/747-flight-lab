// GLTFLoader probes WebP with an HTML Image even when tests stub createImageBitmap.
// This is only for CPU tests; browser tests exercise the real decoder.
globalThis.Image??=class {constructor(){this.width=1;this.height=1;}set src(_){queueMicrotask(()=>this.onload?.());}};
