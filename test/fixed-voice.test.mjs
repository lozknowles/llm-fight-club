import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FixedOmniVoiceProvider, FIXED_OMNI_IDS } from '../speech/providers/fixed-omnivoice-provider.mjs';
import { pcmS16leToWav } from '../public/audio-format.js';

test('fixed synthetic identities reuse their own anchor for different texts and fail closed on tampering', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fixed-voice-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const voices = {}, calls = [];
  for (const id of FIXED_OMNI_IDS) {
    const representation = Buffer.from(`fixture-${id}`), file = `${id}.bin`;
    await fs.writeFile(path.join(directory, file), representation);
    voices[id] = { file, version: 'test-v1', sha256: createHash('sha256').update(representation).digest('hex') };
  }
  const manifest = path.join(directory, 'manifest.json');
  await fs.writeFile(manifest, JSON.stringify({ provenance: 'original-synthetic-only', voices }));
  const provider = { synthesize: async p => { calls.push(p); return { version: 'test-v1', audio: Buffer.from(pcmS16leToWav(Buffer.alloc(24000 * 2))) }; } };
  const fixed = new FixedOmniVoiceProvider({ manifest, provider });
  for (const voice of FIXED_OMNI_IDS) {
    await fixed.synthesize({ voice, text: 'The first sentence.' });
    await fixed.synthesize({ voice, text: 'A very different second sentence.' });
    assert.deepEqual(calls.at(-1).representation, calls.at(-2).representation);
  }
  assert.equal(new Set(calls.map(p => p.representation.toString())).size, 3);
  const response = await fixed.response({ voice: FIXED_OMNI_IDS[0], text: 'Stable voice.' });
  assert.equal(response.headers.get('x-tts-provider'), 'omnivoice-fixed');
  assert.equal(response.headers.get('x-tts-profile'), 'OMNIVOICE_FIXED');
  await fs.writeFile(path.join(directory, voices[FIXED_OMNI_IDS[0]].file), 'tampered');
  await assert.rejects(fixed.synthesize({ voice: FIXED_OMNI_IDS[0], text: 'Must fail.' }), /integrity/);
  await assert.rejects(fixed.synthesize({ voice: 'unknown', text: 'Must fail.' }), /unavailable/);
});
