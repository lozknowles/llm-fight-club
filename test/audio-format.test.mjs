import test from 'node:test';
import assert from 'node:assert/strict';
import { pcmS16leToWav } from '../public/audio-format.js';

test('wraps raw 24 kHz mono PCM in a browser-playable WAV container', () => {
  const pcm = new Uint8Array([0, 0, 255, 127, 0, 128]);
  const wav = pcmS16leToWav(pcm);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

  assert.equal(Buffer.from(wav.subarray(0, 4)).toString(), 'RIFF');
  assert.equal(Buffer.from(wav.subarray(8, 12)).toString(), 'WAVE');
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), pcm.byteLength);
  assert.deepEqual(wav.subarray(44), pcm);
});
