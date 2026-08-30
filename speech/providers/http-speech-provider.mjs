import { SpeechProvider, fetchWithTimeout } from './speech-provider.mjs';

export class HttpSpeechProvider extends SpeechProvider {
  constructor({ id, voices, baseUrl, fallbackVoices = {}, capabilities = [] }) {
    super({ id, voices, capabilities, voiceMap: fallbackVoices });
    this.baseUrl = baseUrl;
    this.fallbackVoices = fallbackVoices;
  }

  async health() {
    const response = await fetchWithTimeout(`${this.baseUrl}/health`, {}, 5000);
    if (!response.ok) throw new Error(`${this.id} health returned ${response.status}`);
    return response.json();
  }

  async synthesize(request) {
    const voice = this.resolveVoice(request.voice);
    const response = await fetchWithTimeout(`${this.baseUrl}/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, voice }),
    });
    if (!response.ok) throw new Error(`${this.id} returned ${response.status}: ${await response.text()}`);
    return response;
  }
}
