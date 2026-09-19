import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SpeechCapabilityStore } from './capability-store.mjs';
import { JsonSpeechWorker } from './backends/json-worker.mjs';

export function createSpeechServer({ store, token }) {
  if (!token || token.length < 32) throw Error('speech_token_required');
  const reply = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  return http.createServer(async (req, res) => {
    const supplied = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(res, 401, { error: 'unauthorised' });
    if (req.method !== 'POST' || !String(req.headers['content-type']).startsWith('application/json')) return reply(res, 405, { error: 'json_post_required' });
    try {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 12000) throw Error('request_too_large'); }
      const data = JSON.parse(raw || '{}');
      let result;
      switch (req.url) {
        case '/speech.capabilities': result = store.capabilities(); break;
        case '/speech.health': result = await store.health(); break;
        case '/speech.cancel': result = store.cancel(data.requestId); break;
        case '/speech.cache': result = { key: data.key, hit: Boolean(await store.read(data.key)) }; break;
        case '/speech.evidence': result = (await store.read(data.key))?.evidence || null; break;
        case '/speech.synthesise': {
          res.on('close', () => { if (!res.writableEnded) store.cancel(data.requestId); });
          result = await store.synthesise(data); break;
        }
        default: return reply(res, 404, { error: 'unknown_capability' });
      }
      reply(res, 200, result);
    } catch (e) { reply(res, 503, { error: e.name === 'AbortError' ? 'speech_cancelled' : e.message }); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const backend = new JsonSpeechWorker({ command: process.env.SPEECH_WORKER_COMMAND, args: JSON.parse(process.env.SPEECH_WORKER_ARGS || '[]'),
    declaration: { backend: 'starting', voices: [], settings: {}, checkpoint: 'unavailable', codecVersion: 'unavailable' } });
  const store = new SpeechCapabilityStore({ backend, directory: process.env.SPEECH_CACHE_DIR });
  const server = createSpeechServer({ store, token: process.env.AGENT_CONTROL_SPEECH_TOKEN });
  server.listen(Number(process.env.SPEECH_PORT || 19396), '127.0.0.1', () => console.log('Private speech capability service listening'));
  const close = () => { backend.close(); server.close(); setTimeout(() => process.exit(), 2000).unref(); };
  process.on('SIGTERM', close); process.on('SIGINT', close);
}
