class VoiceRecorder extends AudioWorkletProcessor {
  constructor() {
    super(); this.active = false; this.frames = 0;
    this.port.onmessage = ({ data }) => { this.active = data === 'record'; this.frames = 0; };
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input && this.active) {
      const count = Math.min(input.length, sampleRate * 15 - this.frames);
      const copy = input.slice(0, count); this.port.postMessage(copy, [copy.buffer]);
      this.frames += count;
      if (this.frames >= sampleRate * 15) { this.active = false; this.port.postMessage('limit'); }
    }
    return true;
  }
}
registerProcessor('voice-recorder', VoiceRecorder);
