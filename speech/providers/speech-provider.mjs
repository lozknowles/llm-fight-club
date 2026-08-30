export class SpeechProvider {
  constructor({ id, voices }) {
    if (new.target === SpeechProvider) throw new Error('SpeechProvider is abstract');
    this.id = id;
    this.voices = voices;
  }

  supports(voice) {
    return this.voices.includes(voice);
  }

  async health() {
    throw new Error('health() must be implemented');
  }

  async synthesize(_request) {
    throw new Error('synthesize() must be implemented');
  }
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
