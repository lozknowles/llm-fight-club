import { timingSafeEqual } from 'node:crypto';
import { VoiceLab, CONSENT_VERSION, PROMPTS, TEST_PHRASES, ROLES, assessWav } from './voice-lab.mjs';
import { OmniVoiceEnrolmentProvider } from '../speech/providers/voice-lab-provider.mjs';

export function voiceLabRoutes({ directory, key, enabled, provider, judge, lab: sharedLab }) {
  const lab = sharedLab || new VoiceLab({ directory, provider: provider || new OmniVoiceEnrolmentProvider({
    baseUrl: process.env.VOICE_LAB_WORKER_URL, token: process.env.VOICE_LAB_WORKER_TOKEN,
  }) });
  const reply = (res, status, value, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
    res.end(type === 'application/json' ? JSON.stringify(value) : value);
  };
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/voice-lab')) return false;
    if (!enabled || !key || key.length < 32) { reply(res, 503, { error: 'Voice Lab is disabled; existing conversations remain available' }); return true; }
    // Dedicated access key, never in URL/localStorage/logs. Header auth is not
    // ambient cookie auth, so cross-origin forms cannot exercise these routes.
    const incoming = Buffer.from(String(req.headers['x-voice-lab-key'] || '')), expected = Buffer.from(key);
    if (incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) {
      reply(res, 401, incoming.length === 0
        ? { code: 'ACCESS_KEY_MISSING', error: 'No access key reached Voice Lab. Enter your separate Voice Lab access key and try Unlock again.' }
        : { code: 'ACCESS_KEY_INVALID', error: 'Voice Lab received an access key, but it does not match. Use the contents of the Voice Lab access-key.txt file, not an SSH or provider API key.' });
      return true;
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') { reply(res, 403, { error: 'Cross-site access denied' }); return true; }
    try {
      const route = url.pathname.slice('/api/voice-lab'.length);
      let input = {};
      if (req.method === 'POST') {
        if (!String(req.headers['content-type']).startsWith('application/json')) throw Error('JSON required');
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 2100000) throw Error('Request too large'); chunks.push(c); }
        input = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      }
      let result;
      if (route === '/config' && req.method === 'GET') result = { consent_version: CONSENT_VERSION, prompts: PROMPTS, test_phrases: TEST_PHRASES, roles: ROLES };
      else if (route === '/health' && req.method === 'GET') result = await lab.provider.health();
      else if (route === '/profiles' && req.method === 'GET') result = await lab.list();
      else if (route === '/profiles' && req.method === 'POST') result = await lab.create(input);
      else if (route === '/judge' && req.method === 'POST' && judge) result = await judge(input);
      else {
        const match = route.match(/^\/profiles\/([a-f0-9-]{36})(?:\/([\w.-]+))?$/);
        if (!match) { reply(res, 404, { error: 'Unknown Voice Lab route' }); return true; }
        const [, id, action] = match;
        if (req.method === 'GET' && action?.endsWith('.wav')) {
          reply(res, 200, await lab.audio(id, action), 'audio/wav'); return true;
        }
        if (req.method === 'GET' && !action) result = await lab.get(id);
        else if (req.method === 'DELETE' && !action) result = await lab.remove(id);
        else if (req.method !== 'POST') throw Error('Unsupported method');
        else if (action === 'quality') { const p = await lab.get(id); if (p.qualification_status !== 'RECORDING') throw Error('Recording state required'); result = assessWav(Buffer.from(input.audio || '', 'base64')); }
        else if (action === 'samples') {
          const p = await lab.get(id), prompts = p.recording_prompts;
          if (!Number.isInteger(input.index) || input.prompt_text !== prompts[input.index % prompts.length]?.text) throw Error('Recording guide changed. Refresh Voice Lab and record the displayed sentence again.');
          result = await lab.sample(id, input.index, Buffer.from(input.audio || '', 'base64'), input.confirmed_text);
        }
        else if (action === 'build') result = await lab.build(id);
        else if (action === 'test') result = await lab.test(id, input.text);
        else if (action === 'heard') result = await lab.heard(id, input.test_id, input.kind);
        else if (action === 'accept') result = await lab.accept(id, input);
        else if (action === 'roles') result = await lab.roles(id, input.roles, input.publication_disclosure);
        else if (action === 'fight-club') result = await lab.fightClubAvailability(id, input.enabled);
        else if (action === 'speak') result = await lab.roleSpeech(id, input);
        else result = await lab.reset(id, action);
      }
      reply(res, 200, result);
    } catch (error) {
      // Provider response bodies and credentials are deliberately not logged.
      reply(res, error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? 'Profile or audio not found' : error.message });
    }
    return true;
  };
}
