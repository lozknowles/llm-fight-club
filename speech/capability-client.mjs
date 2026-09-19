import { createHash, randomUUID } from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function boundedJson(response, limit = 24000000) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw Error('speech_response_too_large');
    chunks.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString());
  if (!response.ok) throw Error(data.error || 'speech_unavailable');
  return data;
}

/** Provider-neutral Agent Control speech capability transport. No model imports. */
export class SpeechCapabilityClient {
  constructor({ url, token, timeoutMs = 300000, request = fetch } = {}) {
    this.url = url; this.token = token; this.timeoutMs = timeoutMs; this.request = request;
    if (url) {
      const u = new URL(url);
      if (u.username || u.password || u.search || u.hash || !['http:', 'https:'].includes(u.protocol)) throw Error('invalid_speech_url');
      if (u.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw Error('speech_http_requires_loopback');
    }
  }
  async call(capability, payload = {}, signal) {
    if (!this.url || !this.token) throw Error('speech_not_configured');
    return boundedJson(await this.request(new URL(capability, `${this.url.replace(/\/$/, '')}/`), {
      method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify(payload), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(capability === 'speech.synthesise' ? this.timeoutMs : 5000),
    }));
  }
  capabilities() { return this.call('speech.capabilities'); }
  health() { return this.call('speech.health'); }
  cancel(requestId) { return this.call('speech.cancel', { requestId }); }
  cache(key) { return this.call('speech.cache', { key }); }
  evidence(key) { return this.call('speech.evidence', { key }); }
  async synthesise(input, signal) {
    const requestId = input.requestId || randomUUID();
    const cancel = () => { this.cancel(requestId).catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const result = await this.call('speech.synthesise', { ...input, requestId }, signal);
      const bytes = Buffer.from(result.audio || '', 'base64');
      if (!bytes.length || sha256(bytes) !== result.evidence?.audioHash || result.evidence?.transcriptHash !== sha256(input.text)) throw Error('speech_integrity_failed');
      return { bytes, mime: result.mime, evidence: result.evidence };
    } catch (error) { cancel(); throw error; }
    finally { signal?.removeEventListener('abort', cancel); }
  }
}
