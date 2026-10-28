(() => {
  'use strict';
  const labels = ['opening', 'stationary', 'walking', 'combat', 'later-level'];
  const active = state => state === 'gameplay' || state === 'dead';
  function create(now, read, hidden = () => document.hidden) {
    let segments = [];
    let current = null;
    function account(stamp) {
      if (!current) return;
      const elapsed = Math.max(0, stamp - current.lastAccount);
      const state = current.hidden ? 'hidden' : current.state;
      current.stateMs[state] = (current.stateMs[state] || 0) + elapsed;
      if (active(state)) current.activeMs += elapsed;
      current.lastAccount = Math.max(stamp, current.lastAccount);
    }
    function sample() {
      if (!current) return;
      const data = read();
      current.peakWasmBytes = Math.max(current.peakWasmBytes, data.wasmBytes || 0);
      const audio = data.audioWorklet;
      if (audio) {
        for (const field of ['requestedFrames', 'underrunFrames', 'nonSilentFrames']) {
          const before = current.audioPrevious?.[field] ?? audio[field];
          if (audio[field] < before) current.counterResets++;
          current.audio[field] += Math.max(0, audio[field] - before);
        }
        current.audioPrevious = { ...audio };
        current.audio.state = audio.state;
        current.audio.sampleRate = audio.sampleRate;
      }
      const debt = data.simulation?.clocks?.owedClockTicks || 0;
      current.peakOwedClockTicks = Math.max(current.peakOwedClockTicks, debt);
    }
    function event(entry) {
      if (!current || entry.stamp < current.started) return;
      account(entry.stamp);
      if (entry.type === 'state' || entry.type === 'visibility') {
        current.state = entry.state;
        current.hidden = hidden();
        current.previousFrame = null;
      }
      const eligible = active(current.state) && !hidden();
      if (entry.type === 'present') current.frameSourceAvailable = true;
      if (entry.type === 'tic') current.updateSourceAvailable = true;
      if (entry.type === 'present' && eligible) {
        current.frames++;
        if (current.previousFrame !== null) {
          const interval = Math.max(0, entry.stamp - current.previousFrame);
          current.frameSamples[current.intervals % 8192] = interval;
          current.intervals++;
          current.sumFrameMs += interval;
          current.maxFrameMs = Math.max(current.maxFrameMs, interval);
          if (interval > 100) {
            current.stalls.push({ ms: entry.stamp - current.started, durationMs: interval });
            current.stalls.sort((first, second) => second.durationMs - first.durationMs);
            current.stalls.length = Math.min(current.stalls.length, 20);
          }
        }
        current.previousFrame = entry.stamp;
      }
      if (entry.type === 'tic' && eligible) current.updates++;
      if (entry.type === 'clamp') {
        current.clampCount++;
        current.peakOwedClockTicks = Math.max(current.peakOwedClockTicks, entry.detail.owedClockTicks || 0);
        if (current.clamps.length < 100) current.clamps.push({ ms: entry.stamp - current.started,
          owedUpdates: entry.detail.owedUpdates, owedMs: entry.detail.owedMs, gameplay: entry.detail.gameplay });
      }
    }
    function start(label) {
      if (!labels.includes(label)) throw new Error('Unknown test segment');
      if (current) stop();
      if (segments.length >= 30) throw new Error('Export this report before starting another test (30-segment limit).');
      const stamp = now();
      const data = read();
      current = { label, started: stamp, lastAccount: stamp, state: data.performance?.state || 'loading', hidden: hidden(), stateMs: {},
        frames: 0, updates: 0, activeMs: 0, previousFrame: null, frameSamples: [], intervals: 0, sumFrameMs: 0, maxFrameMs: 0,
        frameSourceAvailable: data.performance?.presentedFrames > 0, updateSourceAvailable: data.performance?.completedUpdates > 0,
        stalls: [], clamps: [], clampCount: 0, peakOwedClockTicks: 0, peakWasmBytes: data.wasmBytes || 0,
        audio: { requestedFrames: 0, underrunFrames: 0, nonSilentFrames: 0 }, audioPrevious: data.audioWorklet, counterResets: 0 };
      segments.push(current);
    }
    function stop() {
      if (!current) return;
      account(now()); sample();
      current.stopped = now();
      current.trailingPresentationSilenceMs = active(current.state) && current.previousFrame !== null ? now() - current.previousFrame : 0;
      current = null;
    }
    function report() {
      sample();
      if (current) account(now());
      return segments.map(segment => {
        const sorted = [...segment.frameSamples].sort((first, second) => first - second);
        const percentile = fraction => sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
        return { label: segment.label, elapsedMs: (segment.stopped || now()) - segment.started, activeGameplayMs: segment.activeMs,
          presentedFrames: segment.frames, completedUpdates: segment.updates,
          frameSourceAvailable: segment.frameSourceAvailable, updateSourceAvailable: segment.updateSourceAvailable,
          fps: segment.activeMs && segment.frameSourceAvailable ? segment.frames * 1000 / segment.activeMs : null,
          ups: segment.activeMs && segment.updateSourceAvailable ? segment.updates * 1000 / segment.activeMs : null,
          averageFrameMs: segment.intervals ? segment.sumFrameMs / segment.intervals : null,
          medianFrameMs: percentile(0.5), p95FrameMs: percentile(0.95), worstCompletedFrameMs: segment.maxFrameMs,
          trailingPresentationSilenceMs: segment.trailingPresentationSilenceMs ?? 0,
          intervalCount: segment.intervals, percentileSamples: sorted.length, percentileScope: 'last 8192 eligible completed-frame intervals',
          worstStalls: segment.stalls, clampCount: segment.clampCount, clamps: segment.clamps, peakOwedClockTicks: segment.peakOwedClockTicks,
          peakWasmCapacityBytes: segment.peakWasmBytes, audio: { ...segment.audio,
            underrunFraction: segment.audio.requestedFrames ? segment.audio.underrunFrames / segment.audio.requestedFrames : null },
          stateMs: { ...segment.stateMs }, counterResets: segment.counterResets };
      });
    }
    return { start, stop, event, sample, report, running: () => current !== null };
  }
  window.FuryPerformanceCapture = { create, labels };
  if (!window.furyPerformance || !window.furyDebug) return;
  const capture = create(() => performance.now(), () => furyDebug.snapshot());
  furyPerformance.subscribe(capture.event);
  setInterval(capture.sample, 1000);
  const storage = { estimateSupported: typeof navigator.storage?.estimate === 'function', persisted: null };
  navigator.storage?.estimate?.().then(estimate => { storage.quotaBytes = estimate.quota; storage.usageBytes = estimate.usage; }).catch(() => { storage.estimateFailed = true; });
  navigator.storage?.persisted?.().then(persisted => { storage.persisted = persisted; }).catch(() => {});
  const report = () => ({ schema: 'ion-fury-local-performance-v1', captured: new Date().toISOString(),
    browser: navigator.userAgent, display: { screen: [screen.width, screen.height], viewport: [innerWidth, innerHeight], pixelRatio: devicePixelRatio },
    internalResolution: furyDebug.snapshot().resolution, features: window.furyCapabilities?.features,
    telemetry: { source: furyPerformance.snapshot().source, ageMs: furyPerformance.snapshot().telemetryAgeMs, physicalCompositorVerified: false },
    saveStorage: (() => { const saves = furyDebug.snapshot().saves; return saves ? { state: saves.state, restored: saves.restored,
      files: saves.files, bytes: saves.bytes, pending: saves.pending, lastSync: saves.lastSync, durability: saves.durability } : null; })(),
    storage: { ...storage }, mainThreadJsHeap: performance.memory ? { usedBytes: performance.memory.usedJSHeapSize,
      capacityBytes: performance.memory.totalJSHeapSize, note: 'Optional Chromium estimate, not Worker/total browser memory or RSS.' } : null,
    segments: capture.report(), loading: (furyDebug.snapshot().events || []).filter(entry => ['runtime-ready', 'files-ready', 'engine-start', 'first-engine-presentation', 'menu-ready', 'map-start', 'map-ready', 'first-gameplay-frame'].includes(entry.type)).map(entry => ({
      type: entry.type, origin: entry.origin, ms: entry.ms, map: entry.map, loadMs: entry.loadMs, readAndMountMs: entry.readAndMountMs })),
    definitions: { fps: 'Completed native SDL surface-update calls (Worker) / active gameplay wall seconds, including stalls; not physical compositor confirmation, never browser rAF.',
      ups: 'Completed eligible world updates / the same active wall seconds.', memory: 'WASM capacity, not used bytes or total browser RSS.',
      audio: 'Received ring counters over the whole labeled segment, including non-gameplay periods.',
      scope: 'Labels are user-selected, not automatic combat detection. Counters reflect received Worker callbacks. Hidden/menu/loading time excluded from FPS/UPS.',
      storage: 'Native save bytes restore into MEMFS before engine start and commit to origin-local IndexedDB after completed saves. Check saveStorage state; storage estimates alone do not prove durability.' } });
  let transitions = Promise.resolve();
  let flushFailed = false;
  async function drain() {
    try { await window.Module?.flushTelemetry?.(); }
    catch { flushFailed = true; }
  }
  const serialize = operation => { transitions = transitions.then(operation, operation); return transitions; };
  window.furyCapture = { ...capture, report: () => ({ ...report(), telemetryFlushFailed: flushFailed }),
    start(label) { return serialize(async () => { if (capture.running()) { await drain(); capture.stop(); } capture.start(label); }); },
    stop() { return serialize(async () => { await drain(); capture.stop(); }); },
    async download() {
    await drain();
    const url = URL.createObjectURL(new Blob([JSON.stringify(window.furyCapture.report(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'ion-fury-performance-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  } };
})();
