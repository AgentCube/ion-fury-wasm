(() => {
  'use strict';

  const element = id => document.getElementById(id);
  const canvas = element('canvas');
  const storageKey = 'fury-poc-last-session';
  const clock = () => window.Module?.furyClock ?? performance.now();
  const records = [];
  const events = [];
  const memoryGrowth = [];
  const launched = new Date().toISOString();
  let loading = false;
  let started = false;
  let failed = false;
  let startTime = 0;
  let previousFrame = 0;
  let lastCheckpoint = 0;
  let wasmBytes = 0;
  let audioContext = null;
  let mapLoading = true;
  let mapStart = 0;
  let frameTimes = [];
  let frameCount = 0;
  let totalFrameMs = 0;
  let maximumFrameMs = 0;
  let over50ms = 0;
  let over100ms = 0;
  let state = 'runtime-loading';
  let gameFlags = null;
  let errorCandidates = 0;
  let timing = {};
  let longStalls = [];
  let clamps = [];
  let clampCount = 0;
  let simulationTics = 0;
  let simulationMs = 0;
  let expectedTicRate = null;
  let previousLoop = null;
  let measurementActive = false;
  let engineClocks = null;
  let playerState = null;
  let menuState = null;
  let lastEngineLine = '';
  let firstPresentation = false;

  function measure(phase, milliseconds, auxiliary = 0, active = measurementActive) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    const nativeMetrics = window.Module?.furyMetricsSource === 'native-sdl-surface-update';
    if (nativeMetrics && phase === 'surface-update') window.furyPerformance?.present(clock());
    if (nativeMetrics && phase === 'tic' && active && !failed && !document.hidden) {
      window.furyPerformance?.nativeGameplay();
      window.furyPerformance?.tic(clock());
    }
    const entry = timing[phase] ||= { count: 0, totalMs: 0, maxMs: 0, gameplayCount: 0, gameplayMs: 0, gameplayMaxMs: 0 };
    entry.count++;
    entry.totalMs += milliseconds;
    entry.maxMs = Math.max(entry.maxMs, milliseconds);
    const gameplay = active && !failed && !mapLoading && !document.hidden;
    if (gameplay) {
      entry.gameplayCount++;
      entry.gameplayMs += milliseconds;
      entry.gameplayMaxMs = Math.max(entry.gameplayMaxMs, milliseconds);
      if (phase === 'tic') {
        simulationTics++;
        if (!nativeMetrics) window.furyPerformance?.tic(clock());
        measure('tic-excluding-draw', Math.max(0, milliseconds - auxiliary), 0, active);
      }
    }
    if (milliseconds >= 100) {
      longStalls.push({ phase, ms: Math.round(clock() - startTime), durationMs: milliseconds, gameplay, wasmBytes });
      if (longStalls.length > 100) longStalls.shift();
    }
  }

  function suspendMeasurements() {
    previousFrame = 0;
    previousLoop = null;
    measurementActive = false;
  }

  try {
    const previous = localStorage.getItem(storageKey);
    if (previous) console.log('[fury-poc] Previous checkpoint (not proof of a crash):', JSON.parse(previous));
  } catch {}

  function log(message, fromEngine = false) {
    const line = String(message);
    if (fromEngine) lastEngineLine = line;
    if (/error|fail|abort|out of memory|not included|unsupported/i.test(line)) errorCandidates++;
    records.push({ ms: Math.round(clock() - (startTime || 0)), text: line });
    if (records.length > 600) records.shift();
    console.log('[fury-poc]', line);
  }

  function event(type, detail = {}) {
    const entry = { type, origin: started ? 'engine-start' : 'page', ms: Math.round(clock() - (startTime || 0)), ...detail };
    events.push(entry);
    if (events.length > 100) events.shift();
    log(JSON.stringify(entry));
  }

  function memory(bytes) {
    if (bytes && bytes !== wasmBytes) {
      wasmBytes = bytes;
      const entry = { ms: Math.round(clock() - (startTime || 0)), bytes, state, gameplay: measurementActive && !mapLoading && !document.hidden };
      memoryGrowth.push(entry);
      event('wasm-capacity', entry);
    }
  }

  function snapshot() {
    const sorted = [...frameTimes].sort((first, second) => first - second);
    const percentile = fraction => sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
    return {
      launched, captured: new Date().toISOString(), userAgent: navigator.userAgent,
      state, gameFlags, resolution: [canvas.width, canvas.height], player: playerState, menu: menuState,
      frames: frameCount, fps: totalFrameMs ? frameCount * 1000 / totalFrameMs : null,
      rendering: { completedFrameIntervals: frameCount, fps: totalFrameMs ? frameCount * 1000 / totalFrameMs : null, intervalMs: totalFrameMs },
      maxFrameMs: maximumFrameMs, over50ms, over100ms,
      rollingSamples: sorted.length, medianFrameMs: percentile(0.5), p95FrameMs: percentile(0.95), p99FrameMs: percentile(0.99),
      simulation: { tics: simulationTics, activeMs: simulationMs, ticsPerSecond: simulationMs ? simulationTics * 1000 / simulationMs : null, expectedTicsPerSecond: expectedTicRate, clocks: engineClocks },
      timing, longStalls, clampCount, clamps, performance: window.furyPerformance?.snapshot(),
      wasmBytes, memoryGrowth, audioState: audioContext ? audioContext.state : 'not-observed',
      errorCandidates, events
    };
  }

  function checkpoint() {
    try { localStorage.setItem(storageKey, JSON.stringify({ ...snapshot(), log: records.slice(-60) })); } catch {}
  }

  function fail(reason) {
    failed = true;
    window.Module.furyStarting = false;
    state = 'failed';
    releasePointer();
    window.furyPerformance?.setState('failed');
    element('loading').hidden = false;
    element('status').textContent = 'Unable to start Ion Fury: ' + String(reason).slice(0, 280);
    element('loading-diagnostics').hidden = window.furyDevelopment === false;
    event('failure', { reason: String(reason) });
    checkpoint();
  }

  function validateMetadata(text, archiveSize) {
    const script = /\bscriptname\s+"([^"]+)"/i.exec(text);
    const definition = /\bdefname\s+"([^"]+)"/i.exec(text);
    const size = /\bsize\s+(\d+)/i.exec(text);
    const crc = /\bcrc\s+(0x[\da-f]+|\d+)/i.exec(text);
    const flags = /\bflags\s+(\d+)/i.exec(text);
    const dependency = /\bdependency\s+(\d+)/i.exec(text);
    if (!/\bgrpinfo\s*\{/i.test(text) || script?.[1] !== 'scripts/main.con' ||
        definition?.[1] !== 'ashock.def' || Number(size?.[1]) !== 160826590 ||
        Number(size?.[1]) !== archiveSize || Number(crc?.[1]) !== 0xe175fb41 ||
        Number(flags?.[1]) !== 1664 || Number(dependency?.[1]) !== 0) {
      throw new Error('The local Aftershock archive and metadata do not match the supported installation.');
    }
  }

  let resumingAudio = null;
  function audioPrompt() {
    const button = document.getElementById('audio-resume');
    if (button) button.hidden = !audioContext || !['suspended', 'interrupted'].includes(audioContext.state);
  }
  function unlockAudio() {
    if (navigator.userActivation?.isActive === false) { audioPrompt(); return; }
    if (audioContext && ['suspended', 'interrupted'].includes(audioContext.state) && !document.hidden && !resumingAudio) {
      try {
        resumingAudio = Promise.resolve(audioContext.resume())
          .catch(error => event('audio-resume-failed', { message: error.message }))
          .finally(() => { resumingAudio = null; audioPrompt(); });
      } catch (error) { event('audio-resume-failed', { message: error.message }); }
    }
    audioPrompt();
  }
  function releasePointer() {
    if (!document.pointerLockElement || typeof document.exitPointerLock !== 'function') return;
    try { document.exitPointerLock()?.catch(error => event('pointer-exit-failed', { message: error.message })); }
    catch (error) { event('pointer-exit-failed', { message: error.message }); }
  }

  const getContext = canvas.getContext.bind(canvas);
  canvas.getContext = function (...options) {
    const context = getContext(...options);
    if (options[0] === '2d' && context && !context.furyPresentationHook) {
      const putImageData = context.putImageData;
      context.putImageData = function (...pixels) {
        const result = putImageData.apply(this, pixels);
        onPresented();
        return result;
      };
      context.furyPresentationHook = true;
    }
    return context;
  };

  if (window.AudioContext) {
    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = class extends OriginalAudioContext {
      constructor(...options) {
        super(...options);
        audioContext = this;
        event('audio-context', { sampleRate: this.sampleRate, state: this.state });
        this.addEventListener('statechange', () => { event('audio-state', { state: this.state }); audioPrompt(); });
        audioPrompt();
      }
    };
  }

  window.Module = {
    canvas,
    activate() { canvas.focus(); unlockAudio(); },
    resumeAudio: unlockAudio,
    releasePointer,
    onFuryPresented: onPresented,
    noInitialRun: true,
    print: line => log(line, true),
    printErr: line => log(line, true),
    locateFile: filename => filename,
    onAbort: reason => fail('Engine abort: ' + reason),
    onExit: code => {
      window.Module.furyStarting = false;
      state = code === 0 ? 'exited' : 'failed';
      releasePointer();
      window.furyPerformance?.setState(state);
      failed = code !== 0;
      element('loading').hidden = false;
      element('status').textContent = code === 0 ? 'Ion Fury has closed.' : 'Ion Fury stopped unexpectedly. Details are available in the browser console.';
      event('engine-exit', { code });
      checkpoint();
    },
    onRuntimeInitialized() {
      if (!window.Module.retrySaveSync) window.Module.onFurySaveStatus?.({ state: 'unavailable', error: 'The browser save service is unavailable.' });
      event('runtime-ready');
      return startEngine();
    },
    onFuryPhase(phase, path, flags, bytes) {
      window.furyPerformance?.phase(phase, path);
      memory(bytes);
      if (phase === 'group') {
        gameFlags = flags;
        event('group-selected', { archive: path, flags });
      } else if (phase === 'map-start') {
        mapLoading = true;
        playerState = null;
        suspendMeasurements();
        mapStart = clock();
        state = 'map-loading';
        event(phase, { map: path });
      } else if (phase === 'map-ready') {
        mapLoading = false;
        state = 'map-initialized';
        event(phase, { map: path, loadMs: clock() - mapStart });
      }
      checkpoint();
    },
    onFuryLoop(active, wall, scheduled, world, ready, ticRate) {
      const now = clock();
      if (window.Module.furyMetricsSource === 'native-sdl-surface-update' && active && !failed && !document.hidden) window.furyPerformance?.nativeGameplay();
      const eligible = !!active && !failed && !mapLoading && !document.hidden;
      if (eligible) window.furyPerformance?.beginGameplay();
      if (previousLoop !== null && measurementActive && eligible) {
        const elapsed = now - previousLoop;
        simulationMs += elapsed;
        measure('loop-gap', elapsed);
      }
      previousLoop = eligible ? now : null;
      measurementActive = eligible;
      expectedTicRate = ticRate;
      engineClocks = { wall, scheduled, world, ready, owedClockTicks: wall - scheduled };
    },
    onFuryTiming: measure,
    onFuryMenu(id, selection, x, y, inGame) {
      if (menuState === null) event('menu-ready', { id });
      menuState = { id, selection, x, y, inGame, ms: clock() };
      window.furyPerformance?.setState('menu');
      if (started && !failed && state === 'engine-starting') {
        element('loading').hidden = true;
        window.Module.furyStarting = false;
        state = 'engine-displaying';
        event('engine-ui-revealed', { source: 'native-menu-ready', presentationVerified: false });
      }
    },
    onFuryClamp(owedClockTicks, clocksPerTic, clockRate) {
      clampCount++;
      const entry = { ms: Math.round(clock() - startTime), owedClockTicks, owedUpdates: Math.floor(owedClockTicks / clocksPerTic), owedMs: owedClockTicks * 1000 / clockRate, gameplay: measurementActive && !mapLoading && !document.hidden, wasmBytes };
      clamps.push(entry);
      window.furyPerformance?.clamp(entry);
      if (clamps.length > 100) clamps.shift();
      event('simulation-clamp', entry);
    },
    onFuryFrame(active, bytes, player) {
      window.furyPerformance?.frame(active, player);
      memory(bytes);
      if (player) playerState = player;
      const now = clock();
      if (failed || !active || mapLoading || document.hidden) {
        suspendMeasurements();
        return;
      }
      if (previousFrame) {
        const elapsed = now - previousFrame;
        frameCount++;
        totalFrameMs += elapsed;
        maximumFrameMs = Math.max(maximumFrameMs, elapsed);
        if (elapsed > 50) over50ms++;
        if (elapsed > 100) over100ms++;
        frameTimes.push(elapsed);
        if (frameTimes.length > 5000) frameTimes.shift();
      }
      previousFrame = now;
      if (state !== 'gameplay-frames' && !failed) {
        state = 'gameplay-frames';
        event('first-gameplay-frame', { sinceStartMs: now - startTime });
      }
    }
  };

  async function startEngine() {
    if (loading || started || failed) return;
    loading = true;
    try {
      state = 'loading-local-assets';
      element('status').textContent = 'Loading game data…';
      const readStart = clock();
      const { metadata: text, archive: bytes } = await FuryContent.load(detail => {
        const amount = (detail.loaded / 1048576).toFixed(1);
        const total = (detail.total / 1048576).toFixed(1);
        element('status').textContent = detail.stage + (detail.total ? ' ' + amount + ' / ' + total + ' MiB…' : '…');
      });
      validateMetadata(text, bytes.byteLength);
      element('status').textContent = 'Mounting game files…';
      if (bytes.subarray(0, 4).join(',') !== '80,75,3,4') throw new Error('The local archive has an invalid ZIP signature.');
      const engine = window.Module;
      const archiveBytes = bytes.byteLength;
      engine.FS.chdir('/');
      engine.FS.writeFile('/fury.grp', bytes, { canOwn: true });
      engine.FS.writeFile('/fury.grpinfo', text);
      engine.FS.writeFile('/fury.cfg', '[Screen Setup]\nScreenWidth = 640\nScreenHeight = 480\nScreenBPP = 8\nScreenMode = 0\n[Controls]\nUseMouse = 1\n');
      event('files-ready', { readAndMountMs: clock() - readStart });
      started = true;
      failed = false;
      startTime = clock();
      state = 'engine-starting';
      engine.furyStarting = true;
      event('engine-start', { archiveBytes });
      checkpoint();
      element('status').textContent = 'Starting Ion Fury…';
      canvas.focus();
      engine.callMain(['-nosetup', '-usecwd', '-noautoload', '-nologo', '-gamegrp', 'fury.grp']);
    } catch (error) {
      if (started && error === 'unwind') return;
      fail(error.message || String(error));
    } finally {
      loading = false;
    }
  }

  function onPresented() {
    if (window.Module?.furyMetricsSource !== 'native-sdl-surface-update') window.furyPerformance?.present(clock());
    if (started && !failed) {
      element('loading').hidden = true;
      window.Module.furyStarting = false;
      if (!firstPresentation) {
        firstPresentation = true;
        if (state === 'engine-starting') state = 'engine-displaying';
        event('first-engine-presentation');
      }
    }
  }

  canvas.addEventListener('click', () => {
    canvas.focus();
    unlockAudio();
    if (window.Module.pointerGesture) { window.Module.pointerGesture(); return; }
    if (!window.Module.touchControls && typeof canvas.requestPointerLock === 'function' && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock()?.catch(error => event('pointer-lock-failed', { message: error.message })); }
      catch (error) { event('pointer-lock-failed', { message: error.message }); }
    }
  });
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('pointerup', unlockAudio);
  element('loading-continue').addEventListener('click', unlockAudio);
  document.getElementById('audio-resume')?.addEventListener('click', unlockAudio);
  element('loading-diagnostics').addEventListener('click', () => window.furyDebug.downloadDiagnostics());
  const saveIndicator = document.getElementById('save-status');
  const saveRetry = document.getElementById('save-retry');
  if (saveIndicator && saveRetry) {
    window.Module.onFurySaveStatus = status => {
      const labels = { initializing: 'Restoring local saves…', ready: 'Persistent storage ready', saving: 'Saving to device…',
        saved: 'Saved to device', temporary: 'Temporary saves — another tab owns storage or safe locking is unavailable',
        unavailable: 'Storage unavailable — saves are temporary', 'sync-failed': 'Save synchronization failed — latest changes are not stored' };
      saveIndicator.textContent = (labels[status.state] || status.state) + ' · ' + (status.files || 0) + ' save slots · ' + ((status.bytes || 0) / 1048576).toFixed(1) + ' MiB'
        + (status.pending ? ' · ' + status.pending + ' pending' : '')
        + (status.lastSync ? ' · Last commit: ' + new Date(status.lastSync).toLocaleTimeString() : '') + (status.error ? '. ' + status.error : '');
      saveRetry.hidden = status.state !== 'sync-failed';
      const warning = document.getElementById('save-warning');
      if (warning) warning.hidden = !['temporary', 'unavailable', 'sync-failed'].includes(status.state);
    };
    saveRetry.addEventListener('click', () => window.Module.retrySaveSync?.());
  }
  document.addEventListener('visibilitychange', () => { suspendMeasurements(); event('visibility', { hidden: document.hidden }); checkpoint(); audioPrompt(); });
  window.addEventListener('error', error => fail(error.message));
  window.addEventListener('unhandledrejection', error => fail(String(error.reason)));
  window.addEventListener('pagehide', () => { if (started && !failed && state !== 'exited') state = 'page-left'; checkpoint(); });

  element('fullscreen').addEventListener('click', async () => {
    try {
      if (navigator.keyboard?.lock) navigator.keyboard.lock().catch(error => event('keyboard-lock-failed', { message: error.message }));
      await element('game').requestFullscreen();
      canvas.focus();
      unlockAudio();
    } catch (error) { event('fullscreen-failed', { message: error.message }); }
  });
  function resetMeasurements() {
    frameTimes = [];
    previousFrame = 0;
    frameCount = totalFrameMs = maximumFrameMs = over50ms = over100ms = 0;
    timing = {};
    longStalls = [];
    clamps = [];
    clampCount = simulationTics = simulationMs = 0;
    previousLoop = null;
    event('measurement-reset');
  }
  function downloadDiagnostics() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...window.furyDebug.snapshot(), log: records }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ion-fury-poc-diagnostics.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.furyDebug = { snapshot: () => ({ ...snapshot(), log: [...records] }), resetMeasurements, downloadDiagnostics, fail };
  if (window.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) measure('browser-long-task', entry.duration, 0, false);
    });
    observer.observe({ type: 'longtask' });
  }
  setInterval(() => {
    if (state === 'engine-starting' && !document.hidden && clock() - startTime > 15000) {
      const data = window.furyDebug.snapshot();
      const worker = data.startup;
      element('loading-detail').hidden = window.furyDevelopment === false;
      element('loading-detail').textContent = 'Still starting (' + Math.floor((clock() - startTime) / 1000) + ' s). '
        + (worker ? (worker.messageAgeMs > 5000 ? 'Worker has not responded for ' + Math.floor(worker.messageAgeMs / 1000) + ' s. ' : 'Worker is responding. ') : '')
        + (lastEngineLine ? 'Last message: ' + lastEngineLine.slice(0, 180) : 'No engine messages received yet.');
      element('loading-diagnostics').hidden = window.furyDevelopment === false;
    }
    if (started && clock() - lastCheckpoint > 5000) {
      checkpoint();
      lastCheckpoint = clock();
    }
  }, 1000);
})();
