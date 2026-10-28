(() => {
  const engine = window.Module;
  const canvas = engine.canvas;
  let audio;
  let node;
  let audioGeneration = 0;
  let ring;
  let files = [];
  let producer = {};
  let audioBaseline = {};
  let producerBaseline = {};
  let minimumMetricEpoch = 0;
  let pointerRequested = false;
  let allowAbsoluteMouse = true;
  const input = { sentMoves: 0, relativeX: 0, relativeY: 0, lockRequests: 0, lockFailures: 0, lastLockError: null };
  let workerInput = {};
  let workerController;
  let controllerSequence = 0;
  const startup = { lastMessageAt: performance.now(), mainEntered: false, responsive: false };
  let lastStartupProbe = 0;
  let saveStatus = { state: 'initializing' };
  let metricRequest = 0;
  const metricWaiters = new Map();
  let asyncifyMetrics;
  let asyncifyBaseline = {};
  let lockPending = false;
  let lockTimer;
  let lockFailureRecorded = false;
  let lockSequence = 0;
  const heldKeys = new Map();
  const heldButtons = new Set();
  const finishLock = () => { lockPending = false; clearTimeout(lockTimer); };
  const failedLock = (error, sequence = lockSequence) => {
    if (sequence !== lockSequence || !lockPending || lockFailureRecorded) return;
    lockFailureRecorded = true;
    finishLock();
    input.lockFailures++;
    input.lastLockError = error?.message || 'Pointer lock request failed';
    console.warn('[fury-pointer]', input.lastLockError);
  };
  engine.pointerGesture = () => {
    if (engine.touchControls || (window.navigator?.maxTouchPoints > 0 && window.matchMedia?.('(pointer: coarse)').matches)
        || typeof canvas.requestPointerLock !== 'function' || window.navigator?.userActivation?.isActive === false) return;
    if (lockPending || document.pointerLockElement === canvas || document.hidden) return;
    lockPending = true;
    lockFailureRecorded = false;
    const sequence = ++lockSequence;
    input.lockRequests++;
    lockTimer = setTimeout(() => failedLock(new Error('Pointer lock request timed out'), sequence), 3000);
    try {
      canvas.requestPointerLock()?.then(() => {
        if (sequence === lockSequence && document.pointerLockElement === canvas) finishLock();
      }, error => failedLock(error, sequence));
    } catch (error) { failedLock(error, sequence); }
  };
  let lastHeartbeat = performance.now();
  let maxHeartbeatGapMs = 0;
  let heartbeatGapsOver250ms = 0;
  if (window.furyCapabilities?.missing.length) {
    furyDebug.fail('Browser requirements: ' + window.furyCapabilities.missing.join(', ') + '. Use a modern browser with trusted HTTPS (ordinary LAN HTTP is not secure).');
    return;
  }
  if (!crossOriginIsolated || !canvas.transferControlToOffscreen || !window.AudioWorkletNode) {
    furyDebug.fail('This game requires browser isolation, OffscreenCanvas and AudioWorklet support.');
    return;
  }
  const worker = new Worker('engine-worker.js');
  engine.furyMetricsSource = 'native-sdl-surface-update';
  window.furyPerformance?.setSource?.(engine.furyMetricsSource);
  engine.controllerState = state => worker.postMessage({ type: 'controller', sequence: ++controllerSequence,
    epoch: performance.timeOrigin + performance.now(), state });
  engine.retrySaveSync = () => worker.postMessage({ type: 'save-retry' });
  engine.flushTelemetry = () => new Promise((resolve, reject) => {
    const id = ++metricRequest;
    const timer = setTimeout(() => { metricWaiters.delete(id); reject(new Error('Telemetry flush timed out')); }, 5000);
    metricWaiters.set(id, () => { clearTimeout(timer); resolve(); });
    worker.postMessage({ type: 'metrics-flush', id });
  });
  engine.controllerText = text => {
    for (const character of text.slice(0, 32)) worker.postMessage({ type: 'input', target: 'window', event: {
      type: 'keypress', key: character, charCode: character.codePointAt(0), keyCode: character.codePointAt(0), which: character.codePointAt(0) } });
  };
  engine.controllerKey = (key, code, keyCode, down) => worker.postMessage({ type: 'input', target: 'window', event: {
    type: down ? 'keydown' : 'keyup', key, code, keyCode, which: keyCode } });
  engine.FS = {
    chdir(path) { if (path !== '/') throw new Error('Unsupported Worker directory'); },
    writeFile(path, bytes) {
      if (typeof bytes === 'string') worker.postMessage({ type: 'mount', path, bytes });
      else worker.postMessage({ type: 'mount', path, bytes }, [bytes.buffer]);
    },
    readdir: () => [...files]
  };
  engine.callMain = args => worker.postMessage({ type: 'start', args });
  const snapshot = furyDebug.snapshot;
  furyDebug.snapshot = () => {
    const audioStats = ring?.snapshot();
    const asyncify = asyncifyMetrics && Object.fromEntries(Object.entries(asyncifyMetrics).map(([name, entry]) => [name, {
      count: entry.count - (asyncifyBaseline[name]?.count || 0),
      totalMs: entry.totalMs - (asyncifyBaseline[name]?.totalMs || 0), maxMsLifetime: entry.maxMs
    }]));
    if (audioStats) {
      for (const key of ['underrunFrames', 'requestedFrames', 'nonSilentFrames', 'quanta', 'producedFrames']) audioStats[key] -= audioBaseline[key] || 0;
    }
    return { ...snapshot(), execution: 'dedicated-worker', saves: { ...saveStatus }, startup: { ...startup, messageAgeMs: performance.now() - startup.lastMessageAt }, asyncify, controller: workerController, input: { ...input, locked: document.pointerLockElement === canvas, worker: workerInput }, ui: { maxHeartbeatGapMs, heartbeatGapsOver250ms },
      audioWorklet: audioStats ? { ...audioStats, sampleRate: audio.sampleRate, state: audio.state,
        producer: { pumps: producer.pumps - (producerBaseline.pumps || 0), totalMs: producer.totalMs - (producerBaseline.totalMs || 0),
          maxMsLifetime: producer.maxMs, maxGapMsLifetime: producer.maxGapMs } } : null };
  };
  const reset = furyDebug.resetMeasurements;
  furyDebug.resetMeasurements = () => {
    reset();
    minimumMetricEpoch = performance.timeOrigin + performance.now();
    audioBaseline = ring?.snapshot() || {};
    producerBaseline = { ...producer };
    asyncifyBaseline = JSON.parse(JSON.stringify(asyncifyMetrics || {}));
    maxHeartbeatGapMs = heartbeatGapsOver250ms = 0;
    lastHeartbeat = performance.now();
  };
  setInterval(() => {
    const now = performance.now();
    const gap = now - lastHeartbeat;
    maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, gap);
    if (gap > 250) heartbeatGapsOver250ms++;
    lastHeartbeat = now;
    if (engine.furyStarting && now - lastStartupProbe > 1000) {
      lastStartupProbe = now;
      worker.postMessage({ type: 'startup-probe' });
    }
  }, 100);
  worker.onmessage = async event => {
    const message = event.data;
    startup.lastMessageAt = performance.now();
    try {
      if (message.type === 'ready') engine.onRuntimeInitialized();
      else if (message.type === 'save-status') { saveStatus = message.status; engine.onFurySaveStatus?.(saveStatus); }
      else if (message.type === 'metrics-flushed') {
        engine.furyTelemetryThrough = message.through - performance.timeOrigin;
        metricWaiters.get(message.id)?.(); metricWaiters.delete(message.id);
      }
      else if (message.type === 'startup') {
        if (message.stage === 'main-entered') startup.mainEntered = true;
        if (message.stage === 'worker-responsive') startup.responsive = true;
        if (message.bytes) startup.wasmBytes = message.bytes;
      }
      else if (message.type === 'callbacks') {
        if (Number.isFinite(message.through)) engine.furyTelemetryThrough = message.through - performance.timeOrigin;
        files = message.files;
        producer = message.producer;
        workerInput = message.input;
        workerController = message.controller;
        asyncifyMetrics = message.asyncifyMetrics;
        for (const entry of message.entries) {
          if (['onFuryTiming', 'onFuryLoop', 'onFuryFrame', 'onFuryClamp'].includes(entry.callback) && entry.epoch < minimumMetricEpoch) continue;
          engine.furyClock = entry.epoch - performance.timeOrigin;
          if (entry.callback === 'onFuryPhase' && entry.args[0] === 'map-start') allowAbsoluteMouse = false;
          if (entry.callback === 'onFuryFrame') allowAbsoluteMouse = entry.args[2]?.menu ?? !entry.args[0];
          engine[entry.callback]?.(...entry.args);
        }
        delete engine.furyClock;
      } else if (message.type === 'audio-config') {
        const generation = message.generation;
        if (generation === audioGeneration) return;
        audioGeneration = generation;
        node?.disconnect();
        node = null;
        if (audio) await audio.close();
        if (generation !== audioGeneration) return;
        const context = new AudioContext({ sampleRate: message.rate });
        audio = context;
        if (context.sampleRate !== message.rate) throw new Error('Audio sample-rate mismatch');
        ring = FuryAudioRing.create(8192, message.channels);
        await context.audioWorklet.addModule('audio-worklet.js');
        if (generation !== audioGeneration) { await context.close(); return; }
        node = new AudioWorkletNode(context, 'fury-pcm', { numberOfInputs: 0, numberOfOutputs: 1,
          outputChannelCount: [message.channels], processorOptions: { controlBuffer: ring.controlBuffer,
            sampleBuffer: ring.sampleBuffer, capacity: ring.capacity, channels: ring.channels } });
        worker.postMessage({ type: 'audio-ring', controlBuffer: ring.controlBuffer, sampleBuffer: ring.sampleBuffer,
          capacity: ring.capacity, channels: ring.channels, generation });
        context.addEventListener('statechange', () => worker.postMessage({ type: 'audio-state', running: context.state === 'running', generation }));
        worker.postMessage({ type: 'audio-state', running: context.state === 'running', generation });
        node.connect(context.destination);
        node.onprocessorerror = () => furyDebug.fail('AudioWorklet processor failed');
        if (window.navigator?.userActivation?.isActive) engine.resumeAudio?.();
      } else if (message.type === 'failure') furyDebug.fail(message.message);
      else if (message.type === 'pointer-request') pointerRequested = true;
      else if (message.type === 'pointer-exit') { pointerRequested = false; allowAbsoluteMouse = true; }
    } catch (error) {
      if (message.type !== 'audio-config' || message.generation === audioGeneration) furyDebug.fail(error.stack || String(error));
    } finally {
      delete engine.furyClock;
    }
  };
  worker.onerror = error => furyDebug.fail('Engine Worker failed: ' + error.message);
  const keyboard = event => {
    if (document.activeElement !== canvas && event.type !== 'keyup') return;
    worker.postMessage({ type: 'input', target: 'window', event: { type: event.type, key: event.key, code: event.code,
      keyCode: event.keyCode, charCode: event.charCode, which: event.which, location: event.location, repeat: event.repeat,
      ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, timeStamp: event.timeStamp } });
    if (event.type === 'keydown') heldKeys.set(event.code || event.key, { key: event.key, code: event.code, keyCode: event.keyCode, which: event.which, location: event.location });
    else heldKeys.delete(event.code || event.key);
    if (event.type === 'keydown' && event.key === 'Escape') engine.releasePointer?.();
    if (event.type === 'keydown' && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      worker.postMessage({ type: 'input', target: 'window', event: { type: 'keypress', key: event.key,
        code: event.code, charCode: event.key.codePointAt(0), keyCode: event.key.codePointAt(0), which: event.key.codePointAt(0), timeStamp: event.timeStamp } });
    }
    event.preventDefault();
  };
  for (const type of ['keydown', 'keyup']) window.addEventListener(type, keyboard);
  const mouse = event => {
    if (engine.touchControls || event.sourceCapabilities?.firesTouchEvents) return;
    if (['mousemove', 'mouseenter', 'mouseleave'].includes(event.type) && (pointerRequested || !allowAbsoluteMouse) && document.pointerLockElement !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (event.type === 'mousedown') heldButtons.add(event.button);
    else if (event.type === 'mouseup') heldButtons.delete(event.button);
    if (event.type === 'mousemove') {
      input.sentMoves++;
      input.relativeX += event.movementX || 0;
      input.relativeY += event.movementY || 0;
    }
    worker.postMessage({ type: 'input', target: event.type === 'mouseup' ? 'document' : 'canvas', locked: document.pointerLockElement === canvas, event: {
      type: event.type, button: event.button, buttons: event.buttons, clientX: (event.clientX - rect.left) * canvas.width / rect.width,
      clientY: (event.clientY - rect.top) * canvas.height / rect.height, movementX: event.movementX || 0,
      movementY: event.movementY || 0, screenX: event.screenX, screenY: event.screenY,
      deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ, deltaMode: event.deltaMode,
      ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, timeStamp: event.timeStamp } });
    event.preventDefault();
  };
  for (const type of ['mousemove', 'mousedown', 'mouseenter', 'mouseleave', 'wheel']) canvas.addEventListener(type, mouse);
  document.addEventListener('mouseup', mouse);
  const releaseInput = (preserveEscape = false) => {
    for (const event of heldKeys.values()) {
      if (!preserveEscape || event.key !== 'Escape') worker.postMessage({ type: 'input', target: 'window', event: { ...event, type: 'keyup' } });
    }
    for (const button of heldButtons) worker.postMessage({ type: 'input', target: 'document', locked: false, event: { type: 'mouseup', button } });
    for (const [code, event] of heldKeys) if (!preserveEscape || event.key !== 'Escape') heldKeys.delete(code);
    heldButtons.clear();
  };
  document.addEventListener('pointerlockchange', () => {
    finishLock();
    if (document.pointerLockElement !== canvas) releaseInput(true);
    worker.postMessage({ type: 'input', target: 'document', event: { type: 'pointerlockchange' }, locked: document.pointerLockElement === canvas });
  });
  document.addEventListener('pointerlockerror', failedLock);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { finishLock(); releaseInput(); engine.releasePointer?.(); }
    worker.postMessage({ type: 'input', target: 'document', event: { type: 'visibilitychange' }, hidden: document.hidden });
  });
  for (const type of ['focus', 'blur']) window.addEventListener(type, () => {
    if (type === 'blur') { finishLock(); releaseInput(); engine.releasePointer?.(); }
    worker.postMessage({ type: 'input', target: 'window', event: { type } });
  });
  const offscreen = canvas.transferControlToOffscreen();
  worker.postMessage({ type: 'initialize', canvas: offscreen,
    inputDebug: window.furyDevelopment && new URLSearchParams(location.search).get('inputDebug') === '1',
    timingDetails: window.furyDevelopment && new URLSearchParams(location.search).get('timingDetails') === '1',
    audioCheckpoints: new URLSearchParams(location.search).get('audioCheckpoints') !== '0',
    vmAudioCheckpoints: new URLSearchParams(location.search).get('vmAudioCheckpoints') !== '0' }, [offscreen]);
})();
