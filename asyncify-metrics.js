(() => {
  function install(runtime, clock = () => performance.now()) {
    const stats = Object.fromEntries(['unwind', 'rewind', 'suspended', 'helper'].map(name => [name, { count: 0, totalMs: 0, maxMs: 0 }]));
    let unwindStart;
    let rewindStart;
    let suspendedStart;
    const record = (name, duration) => {
      const entry = stats[name];
      entry.count++;
      entry.totalMs += duration;
      entry.maxMs = Math.max(entry.maxMs, duration);
    };
    const sleep = runtime.handleSleep;
    const stop = runtime.maybeStopUnwind;
    const rewind = runtime.doRewind;
    runtime.handleSleep = function (...args) {
      const start = clock();
      if (this.state === this.State.Rewinding && rewindStart !== undefined) {
        record('rewind', start - rewindStart);
        rewindStart = undefined;
      }
      const value = sleep.apply(this, args);
      record('helper', clock() - start);
      if (this.state === this.State.Unwinding) unwindStart = start;
      return value;
    };
    runtime.maybeStopUnwind = function (...args) {
      const stopping = this.currData && this.state === this.State.Unwinding && !this.exportCallStack.length;
      const value = stop.apply(this, args);
      if (stopping && unwindStart !== undefined) {
        const now = clock();
        record('unwind', now - unwindStart);
        unwindStart = undefined;
        suspendedStart = now;
      }
      return value;
    };
    runtime.doRewind = function (...args) {
      const now = clock();
      if (suspendedStart !== undefined) record('suspended', now - suspendedStart);
      suspendedStart = undefined;
      rewindStart = now;
      return rewind.apply(this, args);
    };
    return stats;
  }
  globalThis.FuryAsyncifyMetrics = { install };
})();
