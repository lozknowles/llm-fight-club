import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { HttpSpeechProvider } from './providers/http-speech-provider.mjs';
import { OpenAISpeechProvider } from './providers/openai-speech-provider.mjs';
import { ElevenLabsSpeechProvider } from './providers/elevenlabs-speech-provider.mjs';
import { readStreamChunkWithTimeout } from './providers/speech-provider.mjs';
import { CLASSIC_VOICES, CLASSIC_VOICE_IDS } from './classic-voices.mjs';

const host = process.env.SPEECH_ROUTER_HOST || '127.0.0.1';
const port = Number(process.env.SPEECH_ROUTER_PORT || 18772);
const allowedOrigin = process.env.SPEECH_ALLOWED_ORIGIN || 'http://127.0.0.1:18770';
const identities = ['live-interviewer', 'live-guest', 'live-host'];
const elevenVoices = ['eleven-interviewer', 'eleven-guest', 'eleven-host'];
const naturalVoices = ['natural-interviewer', 'natural-guest', 'natural-referee'];
const fallbackVoices = ['awb', 'kal', 'kal16', 'rms', 'slt'];
const allVoices = [...identities, ...elevenVoices, ...naturalVoices, ...CLASSIC_VOICE_IDS, ...fallbackVoices];
const voiceLabels = {
  'live-interviewer': 'LIVE_FAST: OpenAI GPT-4o Mini TTS — Cedar interviewer',
  'live-guest': 'LIVE_FAST: OpenAI GPT-4o Mini TTS — Marin guest',
  'live-host': 'LIVE_FAST: OpenAI GPT-4o Mini TTS — Coral host/referee',
  'eleven-interviewer': 'PREMIUM: ElevenLabs v3 — Daniel, British broadcaster',
  'eleven-guest': 'PREMIUM: ElevenLabs v3 — Lily, British character voice',
  'eleven-host': 'PREMIUM: ElevenLabs v3 — George, British host/referee',
  'natural-interviewer': 'STUDIO: Qwen3-TTS 1.7B local — interviewer',
  'natural-guest': 'STUDIO: Qwen3-TTS 1.7B local — guest',
  'natural-referee': 'STUDIO: Qwen3-TTS 1.7B local — referee',
  awb: 'FALLBACK: Flite — AWB', kal: 'FALLBACK: Flite — Kal', kal16: 'FALLBACK: Flite — Kal 16 kHz',
  rms: 'FALLBACK: Flite — RMS', slt: 'FALLBACK: Flite — SLT',
  ...Object.fromEntries(CLASSIC_VOICES.map((voice) => [voice.id, voice.label])),
};
const voiceOptions = allVoices.map((id) => ({ id, label: voiceLabels[id] || id }));

function optionalJson(name) {
  try { return JSON.parse(process.env[name] || '{}'); } catch { throw new Error(`${name} must be valid JSON`); }
}

const openai = new OpenAISpeechProvider({ apiKey: process.env.OPENAI_API_KEY });
const elevenlabs = new ElevenLabsSpeechProvider({
  apiKey: process.env.ELEVENLABS_API_KEY,
  model: process.env.ELEVENLABS_TTS_MODEL || 'eleven_v3',
  voiceMap: optionalJson('ELEVENLABS_VOICE_MAP'),
});
const natural = new HttpSpeechProvider({
  id: 'qwen3-tts-voicedesign',
  voices: [...naturalVoices, ...identities],
  baseUrl: process.env.NATURAL_TTS_URL || 'http://127.0.0.1:18773',
  capabilities: ['speech.studio', 'speech.local', 'speech.postprocess'],
  fallbackVoices: {
    'live-interviewer': 'natural-interviewer',
    'live-guest': 'natural-guest',
    'live-host': 'natural-referee',
    'eleven-interviewer': 'natural-interviewer',
    'eleven-guest': 'natural-guest',
    'eleven-host': 'natural-referee',
  },
});
const existing = new HttpSpeechProvider({
  id: 'ffmpeg-flite',
  voices: allVoices,
  baseUrl: process.env.FLITE_TTS_URL || 'http://127.0.0.1:18774',
  capabilities: ['speech.live', 'speech.local'],
  fallbackVoices: {
    'live-interviewer': 'awb',
    'live-guest': 'slt',
    'live-host': 'rms',
    'eleven-interviewer': 'awb',
    'eleven-guest': 'slt',
    'eleven-host': 'rms',
    'natural-interviewer': 'awb',
    'natural-guest': 'slt',
    'natural-referee': 'rms',
  },
});
const classic = new HttpSpeechProvider({
  id: 'classic-local-tts',
  voices: CLASSIC_VOICE_IDS,
  baseUrl: process.env.CLASSIC_TTS_URL || 'http://127.0.0.1:18875',
  capabilities: ['speech.local', 'speech.test'],
});

const providers = new Map([openai, elevenlabs, natural, classic, existing].map((provider) => [provider.id, provider]));
const unavailableUntil = new Map();
const firstByteTimeoutMs = Number(process.env.SPEECH_FIRST_BYTE_TIMEOUT_MS || 30000);
const streamIdleTimeoutMs = Number(process.env.SPEECH_STREAM_IDLE_TIMEOUT_MS || 30000);
export const ROUTING_PROFILES = {
  LIVE_FAST: ['openai-gpt-4o-mini-tts', 'elevenlabs-v3', 'classic-local-tts', 'ffmpeg-flite'],
  LIVE_QUALITY: ['elevenlabs-v3', 'openai-gpt-4o-mini-tts', 'qwen3-tts-voicedesign', 'classic-local-tts', 'ffmpeg-flite'],
  STUDIO: ['qwen3-tts-voicedesign', 'elevenlabs-v3', 'openai-gpt-4o-mini-tts', 'classic-local-tts', 'ffmpeg-flite'],
  OFFLINE: ['qwen3-tts-voicedesign', 'classic-local-tts', 'ffmpeg-flite'],
};

const headers = (type = 'application/json') => ({
  'content-type': type,
  'access-control-allow-origin': allowedOrigin,
  'cache-control': 'no-store',
  vary: 'Origin',
});
const send = (response, status, value, type = 'application/json') => {
  response.writeHead(status, headers(type));
  response.end(type === 'application/json' ? JSON.stringify(value) : value);
};
async function body(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 20000) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}
async function providerHealth(provider) {
  try {
    const result = await provider.health();
    return { available: result.available !== false && result.status !== 'unconfigured', ...result };
  } catch (error) {
    return { available: false, error: error.message };
  }
}
async function eligibleProviders(profile, voice) {
  const ids = ROUTING_PROFILES[profile];
  if (!ids) throw new Error(`Unknown speech profile ${profile}`);
  const selected = [];
  for (const id of ids) {
    const provider = providers.get(id);
    if (!provider?.supports(voice)) continue;
    const health = await providerHealth(provider);
    if (health.available) selected.push(provider);
  }
  return selected;
}
async function openFirstAudio(payload) {
  const profile = String(payload.profile || process.env.SPEECH_DEFAULT_PROFILE || 'LIVE_FAST').toUpperCase();
  const candidates = await eligibleProviders(profile, payload.voice);
  if (!candidates.length) throw new Error(`No qualified provider for ${profile}/${payload.voice}`);
  const attempts = [];
  const requestStarted = performance.now();
  for (const provider of candidates) {
    const retryAt = unavailableUntil.get(provider.id) || 0;
    if (retryAt > Date.now()) {
      attempts.push({ provider: provider.id, outcome: 'circuit-open', retryInMs: retryAt - Date.now() });
      continue;
    }
    const providerStarted = performance.now();
    let reader;
    try {
      const upstream = await provider.synthesizeStream(payload);
      if (!upstream.ok) throw new Error(`HTTP ${upstream.status}: ${(await upstream.text()).slice(0, 240)}`);
      if (!upstream.body) throw new Error('Provider returned no audio body');
      reader = upstream.body.getReader();
      const first = await readStreamChunkWithTimeout(reader, firstByteTimeoutMs, `${provider.id} first audio byte`);
      if (first.done || !first.value?.byteLength) throw new Error('Provider returned an empty audio stream');
      const firstByteMs = Math.round(performance.now() - requestStarted);
      attempts.push({ provider: provider.id, outcome: 'selected', latencyMs: Math.round(performance.now() - providerStarted) });
      return { profile, provider, upstream, reader, first: first.value, firstByteMs, attempts };
    } catch (error) {
      if (reader) await reader.cancel(error.message).catch(() => {});
      attempts.push({ provider: provider.id, outcome: 'failed', latencyMs: Math.round(performance.now() - providerStarted), error: error.message.slice(0, 160) });
      unavailableUntil.set(provider.id, Date.now() + Number(process.env.SPEECH_FAILURE_COOLDOWN_MS || 60000));
    }
  }
  throw new Error(`All speech providers failed: ${attempts.map((item) => `${item.provider}=${item.error}`).join('; ')}`);
}
function audioHeaders(result) {
  return {
    ...headers(result.upstream.headers.get('content-type') || 'application/octet-stream'),
    'x-tts-provider': result.provider.id,
    'x-tts-model': result.upstream.headers.get('x-tts-model') || result.provider.model || result.provider.id,
    'x-tts-voice': result.provider.resolveVoice(result.payloadVoice || ''),
    'x-tts-profile': result.profile,
    'x-tts-first-byte-ms': String(result.firstByteMs),
    'x-tts-fallback': String(result.attempts.some((item) => item.outcome !== 'selected')),
    'x-tts-attempts': encodeURIComponent(JSON.stringify(result.attempts)),
    'x-audio-format': result.provider.id === 'openai-gpt-4o-mini-tts' ? 'pcm_s16le_24000_mono' : 'container',
  };
}
async function streamAudio(response, result) {
  response.writeHead(200, audioHeaders(result));
  response.write(result.first);
  while (true) {
    const chunk = await readStreamChunkWithTimeout(result.reader, streamIdleTimeoutMs, `${result.provider.id} audio stream`);
    if (chunk.done) break;
    response.write(chunk.value);
  }
  response.end();
}
async function completeAudio(response, result) {
  const chunks = [Buffer.from(result.first)];
  while (true) {
    const chunk = await readStreamChunkWithTimeout(result.reader, streamIdleTimeoutMs, `${result.provider.id} audio stream`);
    if (chunk.done) break;
    chunks.push(Buffer.from(chunk.value));
  }
  const audio = Buffer.concat(chunks);
  response.writeHead(200, { ...audioHeaders(result), 'content-length': String(audio.length) });
  response.end(audio);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        ...headers(),
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      return response.end();
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      const entries = await Promise.all([...providers.values()].map(async (provider) => [provider.id, await providerHealth(provider)]));
      return send(response, 200, {
        status: entries.some(([, state]) => state.available) ? 'ok' : 'error',
        engine: 'provider-neutral-speech-router',
        profiles: ROUTING_PROFILES,
        providers: Object.fromEntries(entries),
      });
    }
    if (request.method === 'GET' && url.pathname === '/voices') {
      return send(response, 200, { voices: allVoices, voiceOptions, identities, profiles: Object.keys(ROUTING_PROFILES) });
    }
    if (request.method === 'POST' && ['/synthesize', '/stream'].includes(url.pathname)) {
      const payload = await body(request);
      payload.text = String(payload.text || '').trim();
      payload.voice = String(payload.voice || '');
      if (!payload.text || payload.text.length > 4000) throw new Error('Text must be 1-4000 characters');
      if (!allVoices.includes(payload.voice)) throw new Error('Unknown voice');
      const result = await openFirstAudio(payload);
      result.payloadVoice = payload.voice;
      return url.pathname === '/stream' ? streamAudio(response, result) : completeAudio(response, result);
    }
    send(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) send(response, 503, { error: error.message });
    else response.destroy(error);
  }
});

server.listen(port, host, () => console.log(`Speech router listening on http://${host}:${port}`));
