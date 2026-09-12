// Run explicitly on the private host. Reuse existing adapter/worker, never load a model.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { VOICE_PROFILE_BY_ID } from '../speech/voice-profiles.mjs';
import { OmniVoiceEnrolmentProvider } from '../speech/providers/voice-lab-provider.mjs';
import { changeTempo } from '../speech/providers/enrolled-speech-provider.mjs';
import { assessWav } from '../lib/voice-lab.mjs';

const directory = process.argv[2];
if (!directory || !path.isAbsolute(directory)) throw Error('Provide a new absolute private output directory');
await fs.mkdir(directory, { mode: 0o700 }); // Refuse to overwrite an existing set.
const provider = new OmniVoiceEnrolmentProvider({ baseUrl: process.env.VOICE_LAB_WORKER_URL, token: process.env.VOICE_LAB_WORKER_TOKEN });
const text = 'Welcome to our programme. Let us consider the evidence carefully before we decide.';
const manifest = { provenance: 'original-synthetic-only', createdAt: new Date().toISOString(), text, voices: {} };
for (const [id, voiceProfile] of Object.entries(VOICE_PROFILE_BY_ID)) {
  const response = await fetch('http://127.0.0.1:18876/synthesize', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: id, voiceProfile, speechRate: 1 }), signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw Error(`Existing synthetic adapter failed (${response.status})`);
  const audio = await changeTempo(Buffer.from(await response.arrayBuffer()), 1);
  const quality = assessWav(audio);
  if (!quality.good) throw Error(`Synthetic reference needs review: ${quality.issues.join(', ')}`);
  const result = await provider.create({ audio, text });
  const file = `${id}.bin`;
  await fs.writeFile(path.join(directory, file), result.representation, { mode: 0o600, flag: 'wx' });
  await fs.writeFile(path.join(directory, `${id}.wav`), audio, { mode: 0o600, flag: 'wx' });
  manifest.voices[id] = { file, sha256: createHash('sha256').update(result.representation).digest('hex'),
    version: result.version, referenceHash: createHash('sha256').update(audio).digest('hex'), duration: quality.duration };
  console.log(JSON.stringify({ id, seconds: quality.duration, anchored: true }));
}
await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
