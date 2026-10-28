(() => {
  function attach(controlBuffer, sampleBuffer, capacity, channels) {
    if (!Number.isInteger(capacity) || capacity < 128 || ![1, 2].includes(channels) ||
        controlBuffer.byteLength !== 32 || sampleBuffer.byteLength !== capacity * channels * 4) {
      throw new Error('Invalid audio ring');
    }
    const control = new Int32Array(controlBuffer);
    const samples = new Float32Array(sampleBuffer);
    const queued = () => (Atomics.load(control, 1) - Atomics.load(control, 0) + capacity * 2) % (capacity * 2);
    return {
      controlBuffer, sampleBuffer, capacity, channels, queued,
      write(input, offset, frames) {
        const position = Atomics.load(control, 1);
        const count = Math.min(frames, capacity - queued());
        for (let frame = 0; frame < count; frame++) {
          const destination = ((position + frame) % capacity) * channels;
          for (let channel = 0; channel < channels; channel++) {
            samples[destination + channel] = input[offset + frame * channels + channel] / 32768;
          }
        }
        Atomics.store(control, 1, (position + count) % (capacity * 2));
        Atomics.add(control, 7, count);
        Atomics.store(control, 5, Math.max(Atomics.load(control, 5), queued()));
        return count;
      },
      read(output) {
        const requested = output[0].length;
        const position = Atomics.load(control, 0);
        const count = Math.min(requested, queued());
        let nonSilent = 0;
        for (let frame = 0; frame < requested; frame++) {
          let audible = false;
          for (let channel = 0; channel < output.length; channel++) {
            const value = frame < count ? samples[((position + frame) % capacity) * channels + Math.min(channel, channels - 1)] : 0;
            output[channel][frame] = value;
            audible ||= Math.abs(value) > 0.00001;
          }
          if (audible) nonSilent++;
        }
        Atomics.store(control, 0, (position + count) % (capacity * 2));
        Atomics.add(control, 2, requested - count);
        Atomics.add(control, 3, requested);
        Atomics.add(control, 4, nonSilent);
        Atomics.add(control, 6, 1);
      },
      snapshot() {
        return { capacity, channels, queued: queued(), underrunFrames: Atomics.load(control, 2),
          requestedFrames: Atomics.load(control, 3), nonSilentFrames: Atomics.load(control, 4),
          highWaterFrames: Atomics.load(control, 5), quanta: Atomics.load(control, 6), producedFrames: Atomics.load(control, 7) };
      }
    };
  }
  function create(capacity = 8192, channels = 2) {
    return attach(new SharedArrayBuffer(32), new SharedArrayBuffer(capacity * channels * 4), capacity, channels);
  }
  globalThis.FuryAudioRing = { attach, create };
  if (typeof module !== 'undefined') module.exports = globalThis.FuryAudioRing;
})();
