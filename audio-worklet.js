import './audio-ring.js';

class FuryPCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions;
    this.ring = FuryAudioRing.attach(config.controlBuffer, config.sampleBuffer, config.capacity, config.channels);
  }

  process(inputs, outputs) {
    this.ring.read(outputs[0]);
    return true;
  }
}

registerProcessor('fury-pcm', FuryPCMProcessor);
