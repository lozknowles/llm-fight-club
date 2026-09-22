import { SpeechProvider } from './speech-provider.mjs';

const voiceMap = {
  'natural-interviewer': 'fight-club-fighter-a',
  'natural-guest': 'fight-club-fighter-b',
  'natural-referee': 'fight-club-referee',
};

export class SharedSpeechProvider extends SpeechProvider {
  #session;
  constructor({ baseUrl, token, request = fetch }) {
    super({ id: 'shared-speech-services', voices: Object.keys(voiceMap) });
    const endpoint = new URL(baseUrl);
    if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || token.length < 32) throw new Error('shared_speech_configuration_invalid');
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.token = token; this.request = request;
  }
  async #call(route, options = {}, timeout = 120000) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{const response=await this.request(`${this.baseUrl}${route}`,{...options,headers:{authorization:`Bearer ${this.token}`,...(options.headers||{})},signal:controller.signal});if(!response.ok)throw new Error(`shared speech returned ${response.status}`);return response;}finally{clearTimeout(timer);}
  }
  async #open() {
    if (!this.#session) this.#session = this.#call('/v1/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'prepared' }) }, 5000).then(response => response.json()).catch(error => { this.#session = undefined; throw error; });
    return this.#session;
  }
  async health() { return (await this.#call('/v1/health', {}, 5000)).json(); }
  async synthesize(request) {
    const session = await this.#open();
    const response = await this.#call(`/v1/sessions/${session.id}/speech`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: request.text, voice: voiceMap[request.voice], language: 'en-GB', settings: request.settings || {} }) });
    const audio = await response.arrayBuffer();
    return new Response(audio, { status: 200, headers: { 'content-type': response.headers.get('content-type') || 'audio/wav', 'x-tts-provider': response.headers.get('x-speech-provider') || this.id, 'x-tts-model': response.headers.get('x-speech-model') || 'unavailable', 'x-tts-voice': request.voice, 'x-tts-latency-ms': response.headers.get('x-speech-elapsed-ms') || 'unavailable', 'x-tts-audio-duration-ms': response.headers.get('x-speech-audio-seconds') ? String(Number(response.headers.get('x-speech-audio-seconds')) * 1000) : 'unavailable', 'x-tts-rtf': response.headers.get('x-speech-rtf') || 'unavailable', 'x-tts-shared-cache': response.headers.get('x-speech-cache') || 'unavailable' } });
  }
}
