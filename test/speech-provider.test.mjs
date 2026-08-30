import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechProvider } from '../speech/providers/speech-provider.mjs';
import { HttpSpeechProvider } from '../speech/providers/http-speech-provider.mjs';
import { OpenAISpeechProvider } from '../speech/providers/openai-speech-provider.mjs';
import { ElevenLabsSpeechProvider } from '../speech/providers/elevenlabs-speech-provider.mjs';

test('SpeechProvider is provider-neutral and enforces implementation', () => {
  assert.throws(() => new SpeechProvider({ id: 'bad', voices: [] }), /abstract/);
  const provider = new HttpSpeechProvider({
    id: 'natural', voices: ['natural-interviewer'], baseUrl: 'http://127.0.0.1:1',
  });
  assert.equal(provider.supports('natural-interviewer'), true);
  assert.equal(provider.supports('awb'), false);
});

test('OpenAI provider keeps identity separate from built-in voice and requests streaming PCM', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(new Uint8Array([0, 0, 1, 0]), { status: 200, headers: { 'content-type': 'audio/pcm' } });
  };
  try {
    const provider = new OpenAISpeechProvider({ apiKey: 'test-only' });
    const response = await provider.synthesizeStream({
      text: 'A measured question?', voice: 'live-interviewer', deliveryHints: ['dry'],
      delivery: 'PASSIONATE', format: 'DEBATE', role: 'against',
    });
    assert.equal(response.ok, true);
    assert.equal(request.url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(request.body.model, 'gpt-4o-mini-tts');
    assert.equal(request.body.voice, 'cedar');
    assert.equal(request.body.response_format, 'pcm');
    assert.match(request.body.instructions, /British radio interviewer/);
    assert.match(request.body.instructions, /strong emotional commitment/);
    assert.match(request.body.instructions, /live adversarial debate/);
    assert.match(request.body.instructions, /rebuttals bite/);
    assert.equal(request.options.headers.authorization, 'Bearer test-only');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ElevenLabs provider is fail-closed until key and voice ids are configured', async () => {
  const provider = new ElevenLabsSpeechProvider();
  const health = await provider.health();
  assert.equal(health.available, false);
  await assert.rejects(
    provider.synthesizeStream({ text: 'hello', voice: 'live-interviewer' }),
    /not configured/,
  );
});

test('fallback voice mapping remains separate from voice identity', () => {
  const provider = new HttpSpeechProvider({
    id: 'existing', voices: ['awb'], baseUrl: 'http://127.0.0.1:1',
    fallbackVoices: { 'natural-interviewer': 'awb' },
  });
  assert.equal(provider.fallbackVoices['natural-interviewer'], 'awb');
  assert.equal(provider.id, 'existing');
});
