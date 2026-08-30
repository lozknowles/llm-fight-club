import { SpeechProvider, fetchWithTimeout } from './speech-provider.mjs';

export class ElevenLabsSpeechProvider extends SpeechProvider {
  constructor({
    apiKey,
    model = 'eleven_flash_v2_5',
    baseUrl = 'https://api.elevenlabs.io/v1',
    voiceMap = {},
  } = {}) {
    const voices = Object.keys(voiceMap);
    super({
      id: 'elevenlabs-flash-v2.5',
      voices,
      voiceMap,
      capabilities: ['speech.live', 'speech.streaming'],
    });
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async health() {
    return {
      status: this.apiKey && this.voices.length ? 'configured' : 'unconfigured',
      available: Boolean(this.apiKey && this.voices.length),
      model: this.model,
      capabilities: this.capabilities,
    };
  }

  async synthesizeStream(request) {
    if (!this.apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');
    const voiceId = this.resolveVoice(request.voice);
    if (!voiceId || voiceId === request.voice) throw new Error(`No ElevenLabs voice id configured for ${request.voice}`);
    return fetchWithTimeout(
      `${this.baseUrl}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_22050_32`,
      {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          text: request.text,
          model_id: this.model,
          voice_settings: { stability: 0.42, similarity_boost: 0.72, style: 0.18, use_speaker_boost: true },
        }),
      },
      Number(process.env.ELEVENLABS_TTS_TIMEOUT_MS || 45000),
    );
  }

  async synthesize(request) {
    return this.synthesizeStream(request);
  }
}
