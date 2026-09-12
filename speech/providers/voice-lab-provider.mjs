// Provider-neutral Voice Lab contract: create(reference) -> opaque representation;
// synthesize(representation, text) -> WAV. ConversationEngine never imports OmniVoice.
export class OmniVoiceEnrolmentProvider {
  id = 'omnivoice';
  constructor({ baseUrl, token }) {
    this.baseUrl = baseUrl; this.token = token;
    if (baseUrl) {
      const url = new URL(baseUrl);
      if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) throw Error('Voice Lab worker must be loopback only');
    }
  }
  async call(route, payload, signal) {
    if (!this.baseUrl || !this.token || this.token.length < 32) throw Error('Voice Lab worker is not configured; ordinary voices are unaffected');
    let response;
    try { response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/voice-lab/${route}`, {
      method: payload ? 'POST' : 'GET', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
    }); } catch { throw Error('Voice Lab worker unavailable or timed out; no voice has been accepted'); }
    if (!response.ok) throw Error(`Voice Lab worker unavailable or rejected the request (${response.status}); the existing worker may need its optional enrolment extension`);
    const data = await response.json();
    return data;
  }
  async health() { return this.call('health'); }
  async create({ audio, text }) {
    const data = await this.call('create', { audio: audio.toString('base64'), text });
    return { representation: Buffer.from(data.representation, 'base64'), version: data.version, method: data.method };
  }
  async synthesize({ representation, version, text, signal }) {
    const data = await this.call('synthesize', { representation: representation.toString('base64'), version, text }, signal);
    return { audio: Buffer.from(data.audio, 'base64'), version: data.version, metrics: data.metrics };
  }
}
