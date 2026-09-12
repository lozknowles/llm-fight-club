import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EnrolledSpeechProvider, changeTempo } from './enrolled-speech-provider.mjs';
import { assessWav } from '../../lib/voice-lab.mjs';

export const FIXED_OMNI_IDS = ['omnivoice-moderator', 'omnivoice-challenger', 'omnivoice-analyst'];
// Private manifest contains only original synthetic anchors, never user profiles.
export class FixedOmniVoiceProvider extends EnrolledSpeechProvider {
  constructor({ manifest, provider }) {
    super({ enabled: Boolean(manifest) });
    this.manifest = manifest; this.provider = provider;
    this.id = 'omnivoice-fixed'; this.profile = 'OMNIVOICE_FIXED';
  }
  supports(voice) { return Boolean(this.manifest) && FIXED_OMNI_IDS.includes(voice); }
  async synthesize({ voice, text, speechRate = 1, signal }) {
    if (!this.supports(voice)) throw Error('Fixed synthetic voice is unavailable');
    const rate = Number(speechRate);
    if (!Number.isFinite(rate) || rate < .7 || rate > 1.4) throw Error('Invalid voice speed');
    const manifest = JSON.parse(await fs.readFile(this.manifest, 'utf8'));
    const anchor = manifest.voices?.[voice];
    if (manifest.provenance !== 'original-synthetic-only' || !anchor || !/^[a-z0-9-]+\.bin$/.test(anchor.file)) throw Error('Synthetic voice anchor missing');
    const representation = await fs.readFile(path.join(path.dirname(this.manifest), anchor.file));
    if (createHash('sha256').update(representation).digest('hex') !== anchor.sha256) throw Error('Synthetic voice anchor integrity check failed');
    const start = performance.now();
    const result = await this.provider.synthesize({ representation, version: anchor.version, text, signal });
    if (result.version !== anchor.version) throw Error('Synthetic voice model changed; requalify its anchor');
    assessWav(result.audio, { generated: true });
    const audio = rate === 1 ? result.audio : await changeTempo(result.audio, rate);
    return { ...result, audio, latencyMs: Math.round(performance.now() - start), durationMs: (audio.length - 44) / 48 };
  }
}
