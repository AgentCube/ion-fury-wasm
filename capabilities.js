(() => {
  'use strict';
  const features = {
    secureContext: window.isSecureContext === true,
    crossOriginIsolated: window.crossOriginIsolated === true,
    wasm: typeof WebAssembly === 'object', worker: typeof Worker === 'function',
    offscreenCanvas: typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function',
    audioWorklet: typeof AudioContext === 'function' && typeof AudioWorkletNode === 'function',
    sharedArrayBuffer: typeof SharedArrayBuffer === 'function', pointerEvents: typeof PointerEvent === 'function',
    gamepad: typeof navigator.getGamepads === 'function', fullscreen: !!document.fullscreenEnabled,
    orientationLock: typeof screen.orientation?.lock === 'function', storageEstimate: typeof navigator.storage?.estimate === 'function'
  };
  try { const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 }); memory.grow(1); features.memoryGrowth = memory.buffer.byteLength === 131072; }
  catch { features.memoryGrowth = false; }
  const required = ['secureContext', 'crossOriginIsolated', 'wasm', 'worker', 'offscreenCanvas', 'audioWorklet', 'sharedArrayBuffer', 'memoryGrowth'];
  window.furyCapabilities = { features, missing: required.filter(name => !features[name]) };
})();
