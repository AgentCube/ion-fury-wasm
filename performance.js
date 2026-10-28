(() => {
  'use strict';
  const display = document.getElementById('performance');
  const windowMs = 2500;
  let origin = performance.now();
  let frames = [];
  let updates = [];
  let totalFrames = 0;
  let totalUpdates = 0;
  let lastFrame = null;
  let lastInterval = null;
  let state = 'loading';
  let previousMap;
  let mapPending = false;
  const query = new URLSearchParams(location.search);
  window.furyDevelopment = query.get('debug') === '1';
  let visible = window.furyDevelopment && query.get('stats') !== '0';
  let source = 'completed-canvas-presentation';
  let seenFrame = false;
  let seenUpdate = false;
  const listeners = new Set();
  const clock = () => window.Module?.furyClock ?? performance.now();
  const publish = (type, stamp = clock(), detail) => {
    for (const listener of listeners) listener({ type, stamp, state, detail });
  };
  function changeState(value) { if (state !== value) { state = value; publish('state'); } }
  function prune(entries, now) {
    while (entries.length && entries[0] <= now - windowMs) entries.shift();
    if (entries.length > 4096) entries.splice(0, entries.length - 4096);
  }
  function snapshot() {
    const now = performance.now();
    const through = window.Module?.furyTelemetryThrough;
    const age = Number.isFinite(through) ? Math.max(0, now - through) : null;
    const end = age !== null && age <= 500 ? Math.min(now, through) : now;
    prune(frames, end);
    prune(updates, end);
    const duration = Math.max(1, Math.min(windowMs, end - origin));
    const intervals = frames.slice(1).map((stamp, index) => stamp - frames[index]).sort((first, second) => first - second);
    return { state, visible, windowMs: duration, source, telemetryAgeMs: age, physicalCompositorVerified: false,
      presentedFrames: totalFrames, completedUpdates: totalUpdates,
      fps: !seenFrame ? null : document.hidden ? 0 : frames.length * 1000 / duration,
      ups: !seenUpdate ? null : document.hidden ? 0 : updates.length * 1000 / duration,
      frameMs: lastFrame === null ? null : Math.max(lastInterval || 0, end - lastFrame),
      p95Ms: intervals.length ? intervals[Math.ceil(intervals.length * 0.95) - 1] : null,
      presentationAgeMs: lastFrame === null ? null : now - lastFrame, rafFPS: null };
  }
  function render() {
    display.hidden = !visible;
    if (!visible) return;
    const data = snapshot();
    display.textContent = `FPS: ${data.fps === null ? '—' : data.fps.toFixed(1)} | UPS: ${data.ups === null ? '—' : data.ups.toFixed(1)} | ${data.frameMs === null ? '—' : data.frameMs.toFixed(1)} ms`;
  }
  function suspend() { frames = []; updates = []; lastFrame = lastInterval = null; origin = clock(); publish('visibility'); }
  window.furyPerformance = {
    snapshot,
    setSource(value) { source = value; },
    nativeGameplay() { mapPending = false; if (state !== 'dead') changeState('gameplay'); },
    beginGameplay() { if (!mapPending && (state === 'loading' || state === 'restarting')) changeState('gameplay'); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    clamp(entry) { publish('clamp', clock(), entry); },
    present(stamp) {
      if (stamp < origin) return;
      seenFrame = true;
      totalFrames++;
      publish('present', stamp);
      if (document.hidden) return;
      if (lastFrame !== null) lastInterval = stamp - lastFrame;
      lastFrame = stamp;
      frames.push(stamp);
      prune(frames, stamp);
    },
    tic(stamp) { if (stamp < origin) return; seenUpdate = true; totalUpdates++; publish('tic', stamp); if (!document.hidden) { updates.push(stamp); prune(updates, stamp); } },
    phase(phase, map) {
      if (phase === 'map-start') { mapPending = true; changeState(previousMap === map ? 'restarting' : 'loading'); previousMap = map; suspend(); }
      else if (phase === 'map-ready') mapPending = false;
      publish('phase', clock(), { phase, map });
    },
    frame(active, player) {
      if (mapPending || state === 'failed' || state === 'exited') return;
      if (player?.paused) changeState('paused');
      else if (player?.menu) changeState('menu');
      else if (player?.health <= 0) changeState('dead');
      else if (active) changeState('gameplay');
    },
    setState: changeState,
    toggle() { visible = window.furyDevelopment && !visible; render(); }
  };
  window.addEventListener('keydown', event => {
    if (event.code !== 'F3' && event.key !== 'F3') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) window.furyPerformance.toggle();
  }, true);
  window.addEventListener('keyup', event => {
    if (event.code === 'F3' || event.key === 'F3') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('visibilitychange', suspend);
  setInterval(render, 1000);
  render();
})();
