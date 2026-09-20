import { createHash, randomBytes } from 'node:crypto';

export const PUBLIC_VOICES = [
  { id: 'awb', label: 'AWB · Scottish voice' },
  { id: 'slt', label: 'SLT · American voice' },
  { id: 'rms', label: 'RMS · American voice' },
];
const assets = new Set(['/', '/audio.html', '/audio.js', '/audio-format.js', '/control-state.js',
  '/playback-duration.js', '/archive-replay.js', '/speaker-stage.js', '/speaker-stage.css',
  '/polyfills.js', '/public-debate.css', '/public-debate.js']);
const conversationRoute = /^\/api\/conversations\/([a-zA-Z0-9-]+)(?:\/(?:next|prefetch|complete-playback|intervention|heat|pause|resume|stop|export\.(?:json|md)|conversation\.mp3|(?:playback|audio)\/[a-zA-Z0-9-]+\.wav|barge-in\/(?:evaluate|commit|audible)))?$/;
export const PUBLIC_RETENTION_MS = 24 * 60 * 60 * 1000;
const hash = text => createHash('sha256').update(text).digest('hex');
function fail(status, message) { throw Object.assign(new Error(message), { publicStatus: status }); }

/** Anonymous visitor access for the separately deployed public instance only. */
export class PublicAccess {
  constructor({ enabled = false, origins = [], cookiePath = '/llm-debate/', secure = true,
    clock = Date.now, models = [], voices = PUBLIC_VOICES } = {}) {
    Object.assign(this, { enabled, origins, cookiePath, secure, clock, models, voices });
    this.buckets = new Map(); this.busy = false; this.speechBusy = 0;
    if (enabled && (!origins.length || !models.length || !/^\/[\w/-]*\/$|^\/$/.test(cookiePath))) {
      throw Error('Public mode needs explicit origins, models and a cookie path');
    }
  }
  limit(key, maximum, windowMs) {
    const now = this.clock();
    for (const [name, entry] of this.buckets) if (entry.until <= now) this.buckets.delete(name);
    let entry = this.buckets.get(key);
    if (!entry) {
      if (this.buckets.size >= 10000) fail(503, 'The demo is busy. Please try again later.');
      entry = { count: 0, until: now + windowMs }; this.buckets.set(key, entry);
    }
    if (entry.count >= maximum) fail(429, 'Demo limit reached. Please try again later.');
    entry.count++;
  }
  expired(c) { return this.clock() - Date.parse(c.createdAt) >= PUBLIC_RETENTION_MS; }
  owns(c, visitor) { return Boolean(c && c.publicOwner === visitor.owner && !this.expired(c)); }
  begin(req, res, url, conversations) {
    if (!this.enabled) return null;
    const ip = hash(String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim());
    this.limit('request:' + ip, 240, 60000);
    if (!['GET', 'POST', 'HEAD'].includes(req.method)) fail(405, 'Method not allowed');
    if (req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.method === 'POST' && !this.origins.includes(req.headers.origin))) fail(403, 'Use the debate page to make this request.');
    const cookies = String(req.headers.cookie || '').split(';').map(s => s.trim());
    let token = cookies.find(s => s.startsWith('llm_debate_visitor='))?.slice('llm_debate_visitor='.length);
    if (!/^[a-f0-9]{64}$/.test(token || '')) {
      token = randomBytes(32).toString('hex');
      res.setHeader('Set-Cookie', `llm_debate_visitor=${token}; Path=${this.cookiePath}; HttpOnly; SameSite=Strict; Max-Age=86400${this.secure ? '; Secure' : ''}`);
    }
    const visitor = { owner: hash(token), ip };
    const match = url.pathname.match(conversationRoute);
    const common = ['/api/config', '/api/health', '/api/conversations', '/tts/voices', '/tts/stream', '/tts/synthesize'];
    if (!assets.has(url.pathname) && !common.includes(url.pathname) && !match) fail(404, 'Not found');
    if (match && !this.owns(conversations.get(match[1]), visitor)) fail(404, 'Conversation not found');
    if (req.method === 'POST') this.limit('mutation:' + ip, 90, 60000);
    return visitor;
  }
  creation(input, visitor) {
    this.limit('create:' + visitor.ip, 4, 3600000);
    this.limit('create:global', 24, 3600000);
    if (!Array.isArray(input.participants) || input.participants.length < 2 || input.participants.length > 3) fail(400, 'Choose two or three participants.');
    for (const p of input.participants) {
      if (!this.models.includes(p.model) || !this.voices.some(v => v.id === p.voice)) fail(400, 'Choose a model and voice offered on this page.');
      p.voiceProfile = null;
      if (String(p.personality?.customPrompt || '').length > 500) fail(400, 'Keep each personality prompt under 500 characters.');
    }
    return { ...input, turnLimit: Math.min(6, Math.max(2, Number(input.turnLimit) || 4)), turnLength: 30,
      interruptionLevel: 'OFF', speechProfile: this.voices[0]?.id.startsWith('csm-') ? 'CSM' : 'LOCAL', speechMode: 'server' };
  }
  generation(visitor) {
    if (this.busy) fail(503, 'Another debate is preparing a reply. Please use Retry response in a moment.');
    this.limit('turn:' + visitor.ip, 24, 3600000);
    this.limit('turn:global', 120, 3600000);
    this.busy = true;
    return () => { this.busy = false; };
  }
  speech(payload, visitor, conversations) {
    if (!payload || !this.voices.some(v => v.id === payload.voice) || String(payload.text || '').length > 4000) fail(400, 'Invalid speech request');
    if (payload.conversationId && !this.owns(conversations.get(payload.conversationId), visitor)) fail(404, 'Conversation not found');
    if (!payload.conversationId && String(payload.text || '').length > 500) fail(400, 'Voice previews must be short.');
    if (this.speechBusy >= 2) fail(503, 'Speech is busy. Please try again shortly.');
    this.limit('speech:' + visitor.ip, 24, 3600000);
    this.limit('speech:global', 180, 3600000);
    this.speechBusy++;
    return () => { this.speechBusy--; };
  }
}

export function publicView(value) {
  const copy = structuredClone(value);
  function scrub(item) {
    if (!item || typeof item !== 'object') return;
    for (const key of Object.keys(item)) {
      if (['publicOwner', 'baseUrl', 'speech_evidence', 'voiceProfile'].includes(key)) delete item[key];
      else if (key === 'audio_file' && item[key]) item[key] = 'saved';
      else scrub(item[key]);
    }
  }
  scrub(copy); return copy;
}
