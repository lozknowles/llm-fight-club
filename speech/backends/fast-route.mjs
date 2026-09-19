/** Existing faster route, exposed through the same capability service/cache boundary. */
export class FastRouteBackend {
  constructor({ url, revision = 'existing-router-v1', request = fetch }) { this.url = url; this.revision = revision; this.request = request; }
  capabilities() {
    return { backend: 'existing-fast-route', checkpoint: this.revision, codecVersion: 'router-wav-v1', streaming: false,
      settings: { profile: 'LIVE_FAST', speechRate: 1, delivery: 'BALANCED' },
      voices: [{ id: 'fighter-a', revision: `${this.revision}:live-interviewer` }, { id: 'fighter-b', revision: `${this.revision}:live-guest` }, { id: 'mallow', revision: `${this.revision}:live-host` }] };
  }
  health() { return { state: 'configured', backend: 'existing-fast-route', note: 'Upstream admission tested on synthesis' }; }
  async synthesise({ text, voice, signal }) {
    const voices = { 'fighter-a': 'live-interviewer', 'fighter-b': 'live-guest', mallow: 'live-host' };
    const res = await this.request(new URL('synthesize', `${this.url.replace(/\/$/, '')}/`), { method: 'POST', redirect: 'error', signal,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: voices[voice], profile: 'LIVE_FAST', speechRate: 1, delivery: 'BALANCED' }) });
    if (!res.ok || res.headers.get('x-tts-fallback') === 'true') throw Error('fast_route_unavailable_or_voice_substituted');
    const chunks = []; let size = 0;
    for await (const part of res.body) { size += part.length; if (size > 16000000) throw Error('speech_response_too_large'); chunks.push(part); }
    const bytes = Buffer.concat(chunks);
    let rate = 0, length = 0;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const id = bytes.toString('ascii', offset, offset + 4), n = bytes.readUInt32LE(offset + 4);
      if (id === 'fmt ' && n >= 16) rate = bytes.readUInt32LE(offset + 16);
      if (id === 'data') { length = Math.min(n, bytes.length - offset - 8); break; }
      offset += 8 + n + (n % 2);
    }
    if (!rate || !length) throw Error('fast_route_requires_complete_wav');
    return { bytes, durationSeconds: length / rate, watermark: 'UNKNOWN', exportAllowed: false,
      metrics: { upstreamProvider: res.headers.get('x-tts-provider'), upstreamModel: res.headers.get('x-tts-model'), upstreamVoice: res.headers.get('x-tts-voice') } };
  }
}
