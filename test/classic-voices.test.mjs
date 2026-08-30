import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSIC_VOICES, CLASSIC_VOICE_IDS } from '../speech/classic-voices.mjs';

test('classic test voices have unique explicit engine labels', () => {
  assert.equal(CLASSIC_VOICES.length, 4);
  assert.equal(new Set(CLASSIC_VOICE_IDS).size, 4);
  for (const voice of CLASSIC_VOICES) {
    assert.match(voice.id, /^test-(espeak-ng|festival)-/);
    assert.match(voice.label, /^TEST: (eSpeak NG|Festival)/);
    assert.ok(voice.model);
  }
});
