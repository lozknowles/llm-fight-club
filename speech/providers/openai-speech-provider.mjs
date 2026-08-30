import { SpeechProvider, fetchWithTimeout } from './speech-provider.mjs';

const PERFORMANCE = {
  'live-interviewer': 'Speak as an original British radio interviewer: incisive, emotionally engaged, precise and conversational, with dry incredulity. Do not imitate any real person.',
  'live-guest': 'Speak as an original British conversational character: warm, self-assured, spirited and lightly pompous, with sharp natural comic timing. Do not imitate any real person.',
  'live-host': 'Speak as an original British programme host: authoritative, energetic, brisk and alert to conflict, while remaining intelligible. Do not imitate any real person.',
};

const DELIVERY = {
  PASSIONATE: 'Perform with strong emotional commitment, as though the outcome genuinely matters. Vary pitch, pace, volume and emphasis. Drive key claims, land rebuttals sharply, and allow controlled indignation, delight or disbelief. Never lapse into neutral narration or shout continuously.',
  BALANCED: 'Perform with clear conviction and lively conversational variation. Emphasise important words and respond emotionally to the argument without becoming theatrical.',
  RESTRAINED: 'Perform with contained intensity and subtle emotional colour. Keep the energy under the surface, using pauses and precise emphasis rather than raised volume.',
};

const FORMAT = {
  DEBATE: 'This is a live adversarial debate. Address the opponent directly and make each challenge feel spontaneous rather than read aloud.',
  CROSS_EXAMINATION: 'This is a tense cross-examination. Make pressure, evasion and resistance audible while preserving clarity and control.',
  INTERVIEW: 'This is a live radio interview. Listen in the voice: react to implications, contradictions and comic turns rather than reading a prepared statement.',
  PANEL: 'This is a live panel discussion. Sound responsive to the room, with confident interventions and genuine reactions.',
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
    const delivery = DELIVERY[String(request.delivery || 'PASSIONATE').toUpperCase()] || DELIVERY.PASSIONATE;
    const format = FORMAT[String(request.format || '').toUpperCase()] || '';
    const role = String(request.role || '').toLowerCase();
    const position = role === 'for'
      ? 'Fight for the proposition with conviction and make disagreement audible.'
      : role === 'against'
        ? 'Oppose the proposition with conviction and make rebuttals bite.'
        : '';
    const instructions = [PERFORMANCE[request.voice], format, delivery, position, hints && `Line delivery: ${hints}.`].filter(Boolean).join(' ');
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
