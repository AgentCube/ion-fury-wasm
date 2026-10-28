importScripts('audio-ring.js');
importScripts('controller-state.js');
importScripts('controller-worker.js');
importScripts('save-store.js');

let eventTargets;
let audioRing;
let audioRunning = false;
let audioTimer;
let audioGeneration = 0;
let pending = [];
let fileList = [];
let lastFiles = 0;
let pumping = false;
let asyncifyMetrics;
let controller;
let startupPending = true;
let saveStore;
let lastFlush = 0;
let firstSurface = true;
let lastLoopActive;
const producer = { pumps: 0, totalMs: 0, maxMs: 0, maxGapMs: 0, previous: null };
const input = { moves: 0, relativeX: 0, relativeY: 0, sdl: {}, reads: {} };

function send(callback, ...args) {
  pending.push({ callback, args, epoch: performance.timeOrigin + performance.now() });
  if (pending.length >= 4096 || callback === 'onFuryPhase' || callback === 'onFuryMenu' || callback === 'onAbort' || callback === 'onExit'
      || (startupPending && (callback === 'print' || callback === 'printErr')) || performance.now() - lastFlush >= 250) flush();
  if (callback === 'onFuryPresented' || callback === 'onFuryMenu') startupPending = false;
}

self.onunhandledrejection = event => {
  if (event.reason === 'unwind') return;
  postMessage({ type: 'failure', message: 'Worker promise rejected: ' + String(event.reason?.stack || event.reason) });
};

function flush() {
  if (!pending.length) return;
  lastFlush = performance.now();
  if (Module.FS && performance.now() - lastFiles > 1000) {
    fileList = Module.FS.readdir('/');
    lastFiles = performance.now();
  }
  postMessage({ type: 'callbacks', through: performance.timeOrigin + performance.now(), entries: pending, files: fileList, producer: { ...producer }, input, controller: controller?.snapshot(), asyncifyMetrics });
  pending = [];
}

function target() {
  const handlers = new Map();
  return {
    addEventListener(type, callback) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(callback);
    },
    removeEventListener(type, callback) { handlers.get(type)?.delete(callback); },
    dispatchEvent(event) {
      event.preventDefault = () => {};
      event.target = eventTargets.canvas;
      for (const callback of handlers.get(event.type) || []) callback(event);
    }
  };
}

function installDOM(canvas) {
  const windowTarget = target();
  const documentTarget = target();
  Object.assign(canvas, target());
  canvas.style = {};
  canvas.id = 'canvas';
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: canvas.width, bottom: canvas.height, width: canvas.width, height: canvas.height });
  Object.defineProperties(canvas, { clientWidth: { get: () => canvas.width }, clientHeight: { get: () => canvas.height } });
  canvas.focus = () => {};
  canvas.requestPointerLock = () => { postMessage({ type: 'pointer-request' }); return Promise.resolve(); };
  const document = Object.assign(documentTarget, {
    currentScript: null, hidden: false, visibilityState: 'visible', pointerLockElement: null, fullscreenElement: null,
    body: { style: {}, requestPointerLock: canvas.requestPointerLock }, documentElement: { style: {}, clientWidth: 640, clientHeight: 480 }, activeElement: canvas,
    querySelector: selector => ['#canvas', 'canvas'].includes(selector) ? canvas : null,
    getElementById: identifier => identifier === 'canvas' ? canvas : null,
    createElement: name => {
      if (name === 'canvas') return new OffscreenCanvas(1, 1);
      throw new Error('Unsupported Worker DOM element: ' + name);
    },
    exitPointerLock: () => postMessage({ type: 'pointer-exit' })
  });
  eventTargets = { canvas, document, window: windowTarget };
  globalThis.document = document;
  globalThis.screen = { width: 640, height: 480, availWidth: 640, availHeight: 480 };
  globalThis.innerWidth = 640;
  globalThis.innerHeight = 480;
  globalThis.devicePixelRatio = 1;
  globalThis.addEventListener = windowTarget.addEventListener;
  globalThis.removeEventListener = windowTarget.removeEventListener;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Worker 2D OffscreenCanvas is unavailable');
  const present = context.putImageData;
  context.putImageData = function (...args) {
    const result = present.apply(this, args);
    return result;
  };
}

function pumpAudio() {
  if (!audioRing || !audioRunning || !Module.furyAudio.playing || pumping) return;
  pumping = true;
  const start = performance.now();
  if (producer.previous !== null) producer.maxGapMs = Math.max(producer.maxGapMs, start - producer.previous);
  producer.previous = start;
  while (audioRing.queued() < 3072 && performance.now() - start < 8) {
    if (!Module._Fury_AudioPump()) break;
    producer.pumps++;
  }
  const duration = performance.now() - start;
  producer.totalMs += duration;
  producer.maxMs = Math.max(producer.maxMs, duration);
  pumping = false;
}

self.onmessage = event => {
  try {
    const message = event.data;
    if (message.type === 'initialize') {
      installDOM(message.canvas);
      globalThis.window = globalThis;
      controller = FuryWorkerController.install(globalThis.navigator, entry => eventTargets.window.dispatchEvent(entry), () => performance.timeOrigin + performance.now());
      self.Module = {
        canvas: message.canvas, noInitialRun: true,
        preRun: [() => { ENV.SDL_GAMECONTROLLERCONFIG = FuryWorkerController.mapping; }],
        locateFile: name => name.endsWith('.wasm') ? 'worker-engine.wasm' : name,
        print: line => { saveStore?.savedLine(line); send('print', line); },
        printErr: line => { saveStore?.savedLine(line); send('printErr', line); },
        onAbort: reason => send('onAbort', String(reason)), onExit: code => send('onExit', code),
        onRuntimeInitialized: async () => {
          saveStore = FurySaveStore.create(globalThis, status => postMessage({ type: 'save-status', status }));
          await saveStore.initialize(Module.FS);
          postMessage({ type: 'ready' });
        },
        onFuryPhase: (...args) => send('onFuryPhase', ...args),
        onFuryFrame: (...args) => send('onFuryFrame', ...args),
        onFuryMenu: (...args) => send('onFuryMenu', ...args),
        onFuryTiming: (...args) => {
          send('onFuryTiming', ...args);
          if (args[0] === 'surface-update' && firstSurface) { firstSurface = false; send('onFuryPresented'); }
          if (message.audioCheckpoints && ['tic', 'audio-update'].includes(args[0])) pumpAudio();
        },
        onFuryLoop: (...args) => {
          send('onFuryLoop', ...args);
          if (lastLoopActive !== args[0]) { lastLoopActive = args[0]; flush(); }
        },
        onFuryClamp: (...args) => send('onFuryClamp', ...args),
        onFuryInput: message.inputDebug ? (stage, deltaX, deltaY, enabled, grabbed, active, relative) => {
          const stats = stage ? input.reads : input.sdl;
          stats.count = (stats.count || 0) + 1;
          stats.deltaX = (stats.deltaX || 0) + deltaX;
          stats.deltaY = (stats.deltaY || 0) + deltaY;
          stats.positiveX = (stats.positiveX || 0) + Math.max(0, deltaX);
          stats.negativeX = (stats.negativeX || 0) + Math.min(0, deltaX);
          Object.assign(stats, { enabled, grabbed, active, relative });
        } : undefined,
        furyAudio: {
          enabled: true, playing: false,
          vmCheckpoints: !!message.vmAudioCheckpoints,
          service: pumpAudio,
          configure: (rate, channels) => {
            audioRunning = false;
            audioRing = null;
            clearInterval(audioTimer);
            postMessage({ type: 'audio-config', rate, channels, generation: ++audioGeneration });
          },
          write: (heap, offset, frames) => { if (audioRing) audioRing.write(heap, offset, frames); }
        }
      };
      importScripts('worker-engine.js');
      if (message.timingDetails) {
        importScripts('asyncify-metrics.js');
        asyncifyMetrics = FuryAsyncifyMetrics.install(Asyncify);
      }
      setInterval(flush, 250);
    } else if (message.type === 'controller') {
      controller?.update(message);
    } else if (message.type === 'mount') {
      if (!['/fury.grp', '/fury.grpinfo', '/fury.cfg'].includes(message.path)) throw new Error('Disallowed MEMFS mount');
      Module.FS.writeFile(message.path, message.bytes, { canOwn: true });
      fileList = Module.FS.readdir('/');
    } else if (message.type === 'start') {
      postMessage({ type: 'startup', stage: 'main-entered' });
      try { Module.callMain(message.args); }
      catch (error) { if (error !== 'unwind') throw error; }
    } else if (message.type === 'startup-probe') {
      postMessage({ type: 'startup', stage: 'worker-responsive', bytes: Module.HEAPU8?.length });
    } else if (message.type === 'save-retry') {
      saveStore?.retry();
    } else if (message.type === 'metrics-flush') {
      flush();
      postMessage({ type: 'metrics-flushed', id: message.id, through: performance.timeOrigin + performance.now() });
    } else if (message.type === 'input') {
      if (typeof message.locked === 'boolean') {
        const captured = document.pointerLockElement === Module.canvas;
        if (captured !== message.locked) Module._Fury_MouseCaptureChanged?.(message.locked ? 1 : 0);
      }
      if (message.event.type.startsWith('mouse') && typeof message.locked === 'boolean') {
        document.pointerLockElement = message.locked ? Module.canvas : null;
        eventTargets.document.dispatchEvent({ type: 'pointerlockchange' });
        if (message.event.type === 'mousemove') {
          input.moves++;
          input.relativeX += message.event.movementX;
          input.relativeY += message.event.movementY;
        }
      }
      if (message.event.type === 'pointerlockchange') document.pointerLockElement = message.locked ? Module.canvas : null;
      if (message.event.type === 'visibilitychange') {
        document.hidden = message.hidden;
        document.visibilityState = message.hidden ? 'hidden' : 'visible';
      }
      eventTargets[message.target]?.dispatchEvent(message.event);
    } else if (message.type === 'audio-ring') {
      if (message.generation !== audioGeneration) return;
      audioRing = FuryAudioRing.attach(message.controlBuffer, message.sampleBuffer, message.capacity, message.channels);
      clearInterval(audioTimer);
      audioTimer = setInterval(pumpAudio, 8);
    } else if (message.type === 'audio-state') {
      if (message.generation !== audioGeneration) return;
      audioRunning = message.running;
      producer.previous = null;
    }
  } catch (error) {
    postMessage({ type: 'failure', message: error.stack || String(error) });
  }
};
