import path from 'node:path';
import { PreparedBattles } from './prepared-battles.mjs';
import { SpeechCapabilityClient } from '../speech/capability-client.mjs';
import { SpeechCapabilityStore } from '../speech/capability-store.mjs';
import { FastRouteBackend } from '../speech/backends/fast-route.mjs';

export async function preparedBattleRoutes({ directory, models, modelIds, enabled, speechUrl, speechToken, fastUrl }) {
  const speech = new SpeechCapabilityClient({ url: speechUrl, token: speechToken });
  const fastStore = new SpeechCapabilityStore({ directory: path.join(directory, 'fast-cache'), backend: new FastRouteBackend({ url: fastUrl }) });
  const fastSpeech = { synthesise: async (input, signal) => {
    signal.throwIfAborted(); const cancel = () => fastStore.cancel(input.requestId);
    signal.addEventListener('abort', cancel, { once: true });
    try { const result = await fastStore.synthesise(input); signal.throwIfAborted(); return { bytes: Buffer.from(result.audio, 'base64'), evidence: result.evidence }; }
    finally { signal.removeEventListener('abort', cancel); }
  } };
  const battles = new PreparedBattles({ directory, models, modelIds, speech, fastSpeech });
  if (enabled) await battles.restore();
  const reply = (res, code, data, mime = 'application/json') => {
    res.writeHead(code, { 'content-type': mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
    res.end(mime === 'application/json' ? JSON.stringify(data) : data);
  };
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/prepared-battles')) return false;
    if (!enabled) { reply(res, 503, { error: 'Prepared battles are not enabled on this deployment' }); return true; }
    if (req.headers['sec-fetch-site'] === 'cross-site') { reply(res, 403, { error: 'cross_site_denied' }); return true; }
    try {
      let body = {};
      if (req.method === 'POST') {
        if (!String(req.headers['content-type']).startsWith('application/json')) throw Error('json_required');
        let text = ''; for await (const part of req) { text += part; if (text.length > 12000) throw Error('body_too_large'); }
        body = JSON.parse(text || '{}');
      }
      if (url.pathname === '/api/prepared-battles/config' && req.method === 'GET') {
        let health; try { health = await speech.health(); } catch { health = { state: 'unavailable' }; }
        reply(res, 200, { models: modelIds, speechHealth: health, captions: 'approximate word progress, not forced alignment' });
      } else if (url.pathname === '/api/prepared-battles' && req.method === 'POST') reply(res, 202, await battles.create(body));
      else {
        const match = url.pathname.match(/^\/api\/prepared-battles\/([a-f0-9-]{36})(?:\/(prepare|cancel|evidence|playback|audio\/([a-f0-9-]{36})\.wav))?$/);
        if (!match) { reply(res, 404, { error: 'not_found' }); return true; }
        const [, id, action, rowId] = match;
        if (req.method === 'GET' && rowId) {
          const bytes = await battles.audio(id, rowId, url.searchParams.get('download') === '1');
          if (url.searchParams.get('download') === '1') res.setHeader('content-disposition', 'attachment; filename=response.wav');
          reply(res, 200, bytes, 'audio/wav');
        } else if (req.method === 'GET' && (!action || action === 'evidence')) reply(res, 200, battles.public(id));
        else if (req.method === 'POST' && action === 'cancel') reply(res, 200, await battles.cancel(id));
        else if (req.method === 'POST' && action === 'prepare') { battles.prepare(id); reply(res, 202, battles.public(id)); }
        else if (req.method === 'POST' && action === 'playback') { await battles.playback(id, body.rowId, body); reply(res, 200, { ok: true }); }
        else reply(res, 405, { error: 'method_not_allowed' });
      }
    } catch (e) { reply(res, 400, { error: e.message }); }
    return true;
  };
}
