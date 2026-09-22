import http from 'node:http';
import { HttpSpeechProvider } from './providers/http-speech-provider.mjs';
import { SharedSpeechProvider } from './providers/shared-speech-provider.mjs';

const host = process.env.SPEECH_ROUTER_HOST || '127.0.0.1';
const port = Number(process.env.SPEECH_ROUTER_PORT || 18772);
const allowedOrigin = process.env.SPEECH_ALLOWED_ORIGIN || 'http://127.0.0.1:18770';
const naturalVoices = ['natural-interviewer', 'natural-guest', 'natural-referee'];
const fallbackVoices = ['awb', 'kal', 'kal16', 'rms', 'slt'];
const shared = process.env.SPEECH_SERVICES_TOKEN ? new SharedSpeechProvider({ baseUrl: process.env.SPEECH_SERVICES_URL || 'http://127.0.0.1:19400', token: process.env.SPEECH_SERVICES_TOKEN }) : null;

const natural = new HttpSpeechProvider({
  id: 'qwen3-tts-voicedesign',
  voices: naturalVoices,
  baseUrl: process.env.NATURAL_TTS_URL || 'http://127.0.0.1:18773',
});
const existing = new HttpSpeechProvider({
  id: 'ffmpeg-flite',
  voices: fallbackVoices,
  baseUrl: process.env.FLITE_TTS_URL || 'http://127.0.0.1:18774',
  fallbackVoices: {
    'natural-interviewer': 'awb',
    'natural-guest': 'slt',
    'natural-referee': 'rms',
  },
});

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
    return { available: true, ...(await provider.health()) };
  } catch (error) {
    return { available: false, error: error.message };
  }
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
      const [sharedHealth, naturalHealth, fallbackHealth] = await Promise.all([shared ? providerHealth(shared) : Promise.resolve({ available: false, reason: 'not_configured' }), providerHealth(natural), providerHealth(existing)]);
      return send(response, 200, {
        schema: 'llm-fight-club.speech-status/v1',
        observedAt: new Date().toISOString(),
        status: sharedHealth.available || naturalHealth.available || fallbackHealth.available ? 'ok' : 'error',
        engine: 'provider-neutral-speech-router',
        selected: sharedHealth.available ? shared.id : naturalHealth.available ? natural.id : existing.id,
        providers: { [shared?.id || 'shared-speech-services']: sharedHealth, [natural.id]: naturalHealth, [existing.id]: fallbackHealth },
      });
    }
    if (request.method === 'GET' && url.pathname === '/voices') {
      return send(response, 200, { voices: [...naturalVoices, ...fallbackVoices] });
    }
    if (request.method === 'POST' && url.pathname === '/synthesize') {
      const payload = await body(request);
      const text = String(payload.text || '').trim();
      const voice = String(payload.voice || '');
      if (!text || text.length > 4000) throw new Error('Text must be 1-4000 characters');
      if (![...naturalVoices, ...fallbackVoices].includes(voice)) throw new Error('Unknown voice');
      let upstream;
      let fallback = false;
      if (shared?.supports(voice)) {
        try {
          upstream = await shared.synthesize(payload);
        } catch (error) {
          console.error(`Shared speech failed, using existing provider chain: ${error.message}`);
        }
      }
      if (!upstream && natural.supports(voice)) {
        try {
          upstream = await natural.synthesize(payload);
        } catch (error) {
          console.error(`Natural TTS failed, using Flite fallback: ${error.message}`);
          upstream = await existing.synthesize(payload);
          fallback = true;
        }
      } else if (!upstream) {
        upstream = await existing.synthesize(payload);
      }
      const audio = Buffer.from(await upstream.arrayBuffer());
      const forwarded = {
        ...headers(upstream.headers.get('content-type') || 'audio/wav'),
        'content-length': audio.length,
        'x-tts-provider': upstream.headers.get('x-tts-provider') || (fallback ? existing.id : natural.id),
        'x-tts-voice': voice,
        'x-tts-latency-ms': upstream.headers.get('x-tts-latency-ms') || '0',
        'x-tts-fallback': String(fallback),
      };
      for (const name of ['x-tts-model', 'x-tts-audio-duration-ms', 'x-tts-rtf', 'x-tts-vram-mib']) {
        const value = upstream.headers.get(name);
        if (value) forwarded[name] = value;
      }
      response.writeHead(200, forwarded);
      return response.end(audio);
    }
    send(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    send(response, 400, { error: error.message });
  }
});

server.listen(port, host, () => console.log(`Speech router listening on http://${host}:${port}`));
