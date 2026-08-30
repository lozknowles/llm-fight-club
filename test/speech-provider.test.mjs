import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechProvider } from '../speech/providers/speech-provider.mjs';
import { HttpSpeechProvider } from '../speech/providers/http-speech-provider.mjs';

test('SpeechProvider is provider-neutral and enforces implementation', () => {
  assert.throws(() => new SpeechProvider({ id: 'bad', voices: [] }), /abstract/);
  const provider = new HttpSpeechProvider({
    id: 'natural', voices: ['natural-interviewer'], baseUrl: 'http://127.0.0.1:1',
  });
  assert.equal(provider.supports('natural-interviewer'), true);
  assert.equal(provider.supports('awb'), false);
});

test('fallback voice mapping remains separate from voice identity', () => {
  const provider = new HttpSpeechProvider({
    id: 'existing', voices: ['awb'], baseUrl: 'http://127.0.0.1:1',
    fallbackVoices: { 'natural-interviewer': 'awb' },
  });
  assert.equal(provider.fallbackVoices['natural-interviewer'], 'awb');
  assert.equal(provider.id, 'existing');
});
