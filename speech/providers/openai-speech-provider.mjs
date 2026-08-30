import { SpeechProvider, fetchWithTimeout } from './speech-provider.mjs';

const PERFORMANCE = {
  'live-interviewer': 'Speak as an original measured British radio interviewer: dry, precise, conversational, with restrained incredulity. Do not imitate any real person.',
  'live-guest': 'Speak as an original British conversational character: warmer, quicker, self-assured and lightly pompous, with natural comic timing. Do not imitate any real person.',
  'live-host': 'Speak as an original British programme host: composed, authoritative, brisk and lightly amused. Do not imitate any real person.',
};

export class OpenAISpeechProvider extends SpeechProvider {
  constructor({
    apiKey,
    model = 'gpt-4o-mini-tts',
    baseUrl = 'https://api.openai.com/v1',
    voices = ['live-interviewer', 'live-guest', 'live-host'],
    voiceMap = { 'live-interviewer': 'cedar', 'live-guest': 'marin', 'live-host': 'coral' },
  } = {}) {
    super({
      id: 'openai-gpt-4o-mini-tts',
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
      status: this.apiKey ? 'configured' : 'unconfigured',
      available: Boolean(this.apiKey),
      model: this.model,
      capabilities: this.capabilities,
    };
  }

  async synthesizeStream(request) {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not configured');
    const hints = Array.isArray(request.deliveryHints) ? request.deliveryHints.filter(Boolean).join(', ') : '';
    const instructions = [PERFORMANCE[request.voice], hints && `Line delivery: ${hints}.`].filter(Boolean).join(' ');
    return fetchWithTimeout(`${this.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        voice: this.resolveVoice(request.voice),
        input: request.text,
        instructions,
        response_format: 'pcm',
      }),
    }, Number(process.env.OPENAI_TTS_TIMEOUT_MS || 45000));
  }

  async synthesize(request) {
    return this.synthesizeStream(request);
  }
}
