import { spawn } from 'node:child_process';
import { SpeechProvider } from './speech-provider.mjs';
import { pcmS16leToWav } from '../../public/audio-format.js';

// Explicit private-application adapter. No enrolment material leaves VoiceLab.
export class EnrolledSpeechProvider extends SpeechProvider {
  constructor({ lab, enabled = false }) {
    super({ id: 'omnivoice-enrolled', voices: [], capabilities: ['speech.local', 'speech.enrolled'] });
    this.lab = lab; this.enabled = enabled;
  }
  supports(voice) { return typeof voice === 'string' && voice.startsWith('enrolled:'); }
  async voicesForMenu() { return this.enabled ? this.lab.fightClubVoices() : []; }
  async synthesize({ voice, text, speechRate = 1 }) {
    if (!this.enabled) throw Error('Recorded voices are disabled on this deployment');
    if (!/^enrolled:[a-f0-9-]{36}$/.test(voice)) throw Error('Invalid recorded voice ID');
    const rate = Number(speechRate);
    if (!Number.isFinite(rate) || rate < .7 || rate > 1.4) throw Error('Voice speed must be between 0.7 and 1.4');
    const start = performance.now();
    const result = await this.lab.fightClubSpeech(voice.slice(9), text);
    const audio = rate === 1 ? result.audio : await changeTempo(result.audio, rate);
    return { ...result, audio, latencyMs: Math.round(performance.now() - start), durationMs: (audio.length - 44) / 48 };
  }
  async response(payload) {
    const result = await this.synthesize(payload);
    return new Response(result.audio, { headers: {
      'content-type': 'audio/wav', 'x-audio-format': 'wav',
      'x-tts-provider': this.id, 'x-tts-model': 'OmniVoice', 'x-tts-voice': payload.voice,
      'x-tts-profile': 'ENROLLED', 'x-tts-latency-ms': String(result.latencyMs),
      'x-tts-generation-ms': String(result.latencyMs), 'x-tts-audio-duration-ms': String(result.durationMs),
      'x-tts-rtf': String(result.latencyMs / result.durationMs), 'x-tts-fallback': 'false',
    } });
  }
}

// Pitch-preserving speed adjustment, in memory; no private temporary audio files.
export function changeTempo(audio, rate) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-af', `atempo=${rate}`, '-ar', '24000', '-ac', '1', '-f', 's16le', 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let size = 0, failed = false;
    const fail = () => { failed = true; child.kill(); reject(Error('Recorded voice speed conversion failed')); };
    const timer = setTimeout(fail, 30000);
    child.on('error', fail); child.stdin.on('error', fail);
    child.stderr.resume();
    child.stdout.on('data', c => { size += c.length; if (size > 10000000) fail(); else chunks.push(c); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || !size || failed) return reject(Error('Recorded voice speed conversion failed'));
      resolve(Buffer.from(pcmS16leToWav(Buffer.concat(chunks))));
    });
    child.stdin.end(audio);
  });
}
