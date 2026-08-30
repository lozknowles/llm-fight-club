export class SpeechProvider {
  constructor({ id, voices, capabilities = [], voiceMap = {} }) {
    if (new.target === SpeechProvider) throw new Error('SpeechProvider is abstract');
    this.id = id;
    this.voices = voices;
    this.capabilities = capabilities;
    this.voiceMap = voiceMap;
  }

  supports(voice) {
    return this.voices.includes(voice);
  }

  resolveVoice(voice) {
    return this.voiceMap[voice] || voice;
  }

  async health() {
    throw new Error('health() must be implemented');
  }

  async synthesize(_request) {
    throw new Error('synthesize() must be implemented');
  }

  async synthesizeStream(request) {
    return this.synthesize(request);
  }
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  return fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(timeoutMs) });
}

export async function readStreamChunkWithTimeout(reader, timeoutMs, label = 'Audio stream') {
  let timer;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
