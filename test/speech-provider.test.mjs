import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechProvider, readStreamChunkWithTimeout } from '../speech/providers/speech-provider.mjs';
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
      delivery: 'PASSIONATE', format: 'DEBATE', role: 'against', speechRate: 1.2,
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
    assert.match(request.body.instructions, /1\.20x natural conversational speed/);
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

test('ElevenLabs v3 keeps participant identity separate and adds performance direction', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x64]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  };
  try {
    const provider = new ElevenLabsSpeechProvider({
      apiKey: 'test-only',
      voiceMap: { 'eleven-interviewer': 'voice-daniel' },
    });
    const response = await provider.synthesizeStream({
      text: 'So that is your entire strategy?',
      voice: 'eleven-interviewer',
      delivery: 'PASSIONATE',
      deliveryHints: ['dry'],
    });
    assert.equal(response.ok, true);
    assert.match(request.url, /voice-daniel\/stream/);
    assert.equal(request.body.model_id, 'eleven_v3');
    assert.equal(request.body.text, '[excited] So that is your entire strategy?');
    assert.equal(request.body.voice_settings.stability, 0.45);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ElevenLabs v3 prioritises live conversation heat over the global delivery preset', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  };
  try {
    const provider = new ElevenLabsSpeechProvider({ apiKey: 'test', voiceMap: { speaker: 'voice-id' } });
    await provider.synthesizeStream({
      text: 'I think you are completely wrong, because that conclusion ignores the evidence.',
      voice: 'speaker',
      delivery: 'PASSIONATE',
      deliveryHints: ['furious', 'selectively louder on key rebuttal words'],
    });
    assert.match(request.body.text, /^\[angry\]/);
    assert.doesNotMatch(request.body.text, /^\[excited\]/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ElevenLabs v3 can sigh before a contextual furious reaction without changing transcript text', async () => {
  const originalFetch = globalThis.fetch;
  let directedText;
  globalThis.fetch = async (url, options) => {
    directedText = JSON.parse(options.body).text;
    return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  };
  try {
    const provider = new ElevenLabsSpeechProvider({ apiKey: 'test', voiceMap: { speaker: 'voice-id' } });
    await provider.synthesizeStream({ text: 'For goodness’ sake, that ignores the central point.', voice: 'speaker', deliveryHints: ['furious'] });
    assert.match(directedText, /^\[sighs\] \[angry\]/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fallback voice mapping remains separate from voice identity', () => {
  const provider = new HttpSpeechProvider({
    id: 'existing', voices: ['awb'], baseUrl: 'http://127.0.0.1:1',
    fallbackVoices: { 'natural-interviewer': 'awb' },
  });
  assert.equal(provider.fallbackVoices['natural-interviewer'], 'awb');
  assert.equal(provider.id, 'existing');
});

test('speech stream reads fail closed when a provider stops producing bytes', async () => {
  const reader = { read: () => new Promise(() => {}) };
  await assert.rejects(
    readStreamChunkWithTimeout(reader, 5, 'Test provider'),
    /Test provider timed out after 5 ms/,
  );
});
