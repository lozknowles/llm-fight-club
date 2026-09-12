import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { captureConstraints, captureDescription } from '../public/voice-lab-capture.js';

test('speech cleanup is default, raw is optional, gain does not amplify noise automatically', () => {
  assert.deepEqual(captureConstraints('fixture-mic'), { audio: { deviceId: { exact: 'fixture-mic' }, channelCount: 1, noiseSuppression: true, echoCancellation: true, autoGainControl: false } });
  assert.deepEqual(captureConstraints('', 'raw'), { audio: { channelCount: 1, noiseSuppression: false, echoCancellation: false, autoGainControl: false } });
  assert.match(captureDescription({ label: 'Fixture mic', getSettings: () => ({ noiseSuppression: false, echoCancellation: true }) }), /noise suppression off · echo cancellation on · automatic gain not reported/);
});

test('worklet preserves captured samples without noise or gain and captures only on explicit record', async () => {
  const code = await fs.readFile(new URL('../public/voice-recorder-worklet.js', import.meta.url), 'utf8');
  let Processor;
  const messages = [];
  vm.runInNewContext(code, { sampleRate: 48000,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: value => messages.push(value) }; } },
    registerProcessor: (_, type) => { Processor = type; },
  });
  const recorder = new Processor(), signal = new Float32Array([0, .1, -.2, .5, -.8, 0]);
  recorder.process([[signal]]); assert.equal(messages.length, 0);
  recorder.port.onmessage({ data: 'record' }); recorder.process([[signal]]);
  assert.deepEqual(Array.from(messages[0]), Array.from(signal));
  recorder.port.onmessage({ data: 'stop' }); recorder.process([[signal]]); assert.equal(messages.length, 1);
});
