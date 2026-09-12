import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export const CONSENT_VERSION = 'voice-lab-2026-09-12-v1';
export const DISCLOSURE = 'Synthetic voice — authorised profile';
export const ROLES = ['ANNOUNCER', 'COMMENTATOR'];
export const LEGACY_PROMPTS = [
  ['Conversation', 'I was going to make a cup of tea, but then the conversation took a rather unexpected turn.'],
  ['Numbers', 'There are twelve players, three rounds, and twenty seven points. The next round starts at half past seven.'],
  ['Technical terms', 'Welcome to LLM Fight Club. Astra, Sol, Luna, Gemma and Qwen compare reasoning, tokens and model results.'],
  ['Question', 'What would change your mind, and how could we tell whether that answer is actually correct?'],
  ['Emphasis', 'Wait a moment! That is an interesting claim, but we need to hear the evidence first.'],
  ['Flowing sentence', 'As the challengers consider the question, we will give them a little time to think before hearing each answer and comparing their explanations.'],
].map(([category, text], index) => ({ index, category, text }));
export const PROMPTS = [
  ['Warm conversation', 'Read warmly and naturally, at your usual pace.', 'I thought we had plenty of time for a cup of tea, until the station clock struck twelve.'],
  ['Curious question', 'Sound genuinely curious; let the question rise naturally, without forcing a higher pitch.', 'Are you really saying that one tiny change could make the whole experiment work, after everything else we tried?'],
  ['Firm disagreement', 'Be firm and a little incredulous, emphasising “cannot”; do not shout.', 'No, that cannot be right, because we checked the figures three times and the results were completely different.'],
  ['Reflective reassurance', 'Slow down slightly, with a calm, reassuring finish; stay within your comfortable vocal range.', 'When the room finally fell quiet, I took a slow breath and said that we could always begin again tomorrow.'],
].map(([category, delivery, text], index) => ({ index, category, delivery, text }));
export const promptsForProfile = p => p.recording_prompts || (p.samples.length ? LEGACY_PROMPTS : PROMPTS);
export const TEST_PHRASES = [
  'Our next discussion asks whether a quiet library can change an entire town. Let us hear two very different answers.',
  'The competitors have finished their opening arguments. One favours the plan; the other has raised a surprising objection.',
  'That brings this round to a close. The result will depend on the quality of the evidence, not the loudness of the applause.',
];
const stamp = () => new Date().toISOString();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function requireThat(value, message) { if (!value) throw new Error(message); }
const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);

// Deliberately accept only the canonical PCM WAV produced by our recorder.
// No codecs, URL fetching, playlists, or arbitrary decoder/file arguments.
export function assessWav(bytes, { generated = false } = {}) {
  requireThat(Buffer.isBuffer(bytes) && bytes.length >= 44 && bytes.length <= (generated ? 4320044 : 720044), 'Invalid recording size');
  requireThat(bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE' &&
    bytes.toString('ascii', 12, 16) === 'fmt ' && bytes.readUInt32LE(16) === 16 &&
    bytes.readUInt16LE(20) === 1 && bytes.readUInt16LE(22) === 1 && bytes.readUInt32LE(24) === 24000 &&
    bytes.readUInt32LE(28) === 48000 && bytes.readUInt16LE(32) === 2 && bytes.readUInt16LE(34) === 16 &&
    bytes.toString('ascii', 36, 40) === 'data' && bytes.readUInt32LE(40) === bytes.length - 44 &&
    bytes.readUInt32LE(4) === bytes.length - 8 && (bytes.length - 44) % 2 === 0, 'Expected mono 24 kHz PCM16 WAV');
  const frames = (bytes.length - 44) / 2, duration = frames / 24000;
  let sum = 0, peak = 0, clipped = 0, silent = 0, windows = 0;
  for (let base = 0; base < frames; base += 480) {
    let energy = 0, count = 0;
    for (let i = base; i < Math.min(base + 480, frames); i++) {
      const v = bytes.readInt16LE(44 + i * 2) / 32768;
      sum += v * v; energy += v * v; count++; peak = Math.max(peak, Math.abs(v));
      if (Math.abs(v) >= .995) clipped++;
    }
    if (Math.sqrt(energy / count) < .008) silent++;
    windows++;
  }
  const rms = Math.sqrt(sum / Math.max(1, frames)), silenceFraction = silent / Math.max(1, windows);
  const issues = [];
  if (duration < 3) issues.push('TOO SHORT');
  if (duration > 15) issues.push('TOO LONG');
  if (rms < .015) issues.push('TOO QUIET');
  if (clipped / frames > .001) issues.push('TOO LOUD / CLIPPING');
  if (silenceFraction > .6) issues.push('EXCESSIVE SILENCE');
  return { duration, peak, rmsDb: 20 * Math.log10(Math.max(rms, 1e-9)), clippedFraction: clipped / Math.max(1, frames), silenceFraction,
    energyPresent: rms >= .015, issues, good: !issues.length,
    limitations: 'Energy thresholds only: not speech recognition, identity verification, or a calibrated signal-to-noise measurement.' };
}

export class VoiceLab {
  constructor({ directory, provider }) {
    this.directory = path.resolve(directory); this.provider = provider; this.locks = new Map();
  }
  folder(id) { requireThat(validId(id), 'Invalid profile ID'); return path.join(this.directory, id); }
  async exclusive(id, work) {
    requireThat(!this.locks.has(id), 'Profile busy; wait for the current operation');
    this.locks.set(id, true);
    try { return await work(); } finally { this.locks.delete(id); }
  }
  async write(profile) {
    const folder = this.folder(profile.profile_id);
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const tmp = path.join(folder, 'profile.tmp');
    await fs.writeFile(tmp, JSON.stringify(profile, null, 2), { mode: 0o600 });
    await fs.rename(tmp, path.join(folder, 'profile.json'));
    return profile;
  }
  async get(id) {
    const p = JSON.parse(await fs.readFile(path.join(this.folder(id), 'profile.json'), 'utf8'));
    // Preserve the original text and requirements for profiles with old takes.
    // Empty profiles can use the new four-sentence guide without deleting data.
    return { ...p, recording_prompts: promptsForProfile(p) };
  }
  async list() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const profiles = [];
    for (const entry of await fs.readdir(this.directory)) {
      if (validId(entry)) profiles.push(await this.get(entry));
    }
    return profiles;
  }
  async create(input) {
    requireThat(input.consent_version === CONSENT_VERSION && input.permission === true && input.synthetic === true && input.purpose === true, 'All current consent confirmations are required');
    requireThat(['SELF', 'AUTHORISED_OTHER'].includes(input.relationship), 'Declare your relationship to the speaker');
    const name = String(input.display_name || '').trim();
    requireThat(name.length > 0 && name.length <= 60 && !/[\x00-\x1f]/.test(name), 'Display name must be 1–60 characters');
    return this.exclusive('new-profile', async () => {
      requireThat((await this.list()).length < 20, 'Profile limit reached; delete an unused profile');
      return this.write({ profile_id: randomUUID(), display_name: name, voice_provider: this.provider.id,
        creation_time: stamp(), consent_version: CONSENT_VERSION, consent_time: stamp(), consent_relationship: input.relationship,
        consent_confirmations: { permission: true, synthetic: true, purpose: true }, recording_prompts: PROMPTS, samples: [], tests: [],
        qualification_status: 'RECORDING', technical_generation_success: false, user_acceptance: false,
        approved_roles: [], fight_club_enabled: false, revision: 0, disclosure: DISCLOSURE, publication_disclosure: true });
    });
  }
  async sample(id, index, bytes, confirmedText) {
    return this.exclusive(id, async () => {
      const p = await this.get(id);
      requireThat(p.qualification_status === 'RECORDING', 'Choose Add sample / Re-enrol before recording');
      const prompts = promptsForProfile(p);
      requireThat(Number.isInteger(index) && index >= 0 && index < prompts.length * 2 && confirmedText === true, 'Confirm that the recording matches its guided text');
      const quality = assessWav(bytes);
      requireThat(quality.good, `Record again: ${quality.issues.join(', ')}`);
      await fs.writeFile(path.join(this.folder(id), `sample-${index}.wav`), bytes, { mode: 0o600 });
      p.samples = p.samples.filter(s => s.index !== index);
      p.samples.push({ index, text: prompts[index % prompts.length].text, hash: hash(bytes), quality, accepted_at: stamp() });
      p.samples.sort((a, b) => a.index - b.index);
      return this.write(p);
    });
  }
  async build(id) {
    return this.exclusive(id, async () => {
      const p = await this.get(id);
      const prompts = promptsForProfile(p);
      requireThat(p.qualification_status === 'RECORDING' && prompts.every(prompt => p.samples.some(s => s.index === prompt.index)), `Accept all ${prompts.length} guided samples first`);
      // Prefer the clip nearest eight seconds, tie-break by prompt order. Do not
      // concatenate unrelated takes or pretend more samples train the model.
      const selected = [...p.samples].sort((a, b) => Math.abs(a.quality.duration - 8) - Math.abs(b.quality.duration - 8) || a.index - b.index)[0];
      const audio = await fs.readFile(path.join(this.folder(id), `sample-${selected.index}.wav`));
      requireThat(hash(audio) === selected.hash, 'Reference integrity check failed');
      const result = await this.provider.create({ audio, text: selected.text });
      requireThat(Buffer.isBuffer(result.representation) && result.representation.length > 0 && result.representation.length < 2000000 && result.version, 'Invalid provider representation');
      await fs.writeFile(path.join(this.folder(id), 'representation.bin'), result.representation, { mode: 0o600 });
      Object.assign(p, { voice_representation_hash: hash(result.representation), reference_audio_hashes: p.samples.map(s => s.hash),
        selected_sample: selected.index, provider_version: result.version, method: result.method,
        qualification_status: 'UNQUALIFIED', tests: [], technical_generation_success: false, user_acceptance: false, approved_roles: [], fight_club_enabled: false, revision: p.revision + 1 });
      return this.write(p);
    });
  }
  async representation(p) {
    const bytes = await fs.readFile(path.join(this.folder(p.profile_id), 'representation.bin'));
    requireThat(hash(bytes) === p.voice_representation_hash, 'Voice representation integrity check failed');
    return bytes;
  }
  async test(id, customText) {
    requireThat(customText === undefined || (typeof customText === 'string' && customText.length <= 500 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(customText)), 'Test sentence must be plain text, at most 500 characters');
    return this.exclusive(id, async () => {
      const p = await this.get(id);
      requireThat(['UNQUALIFIED', 'TESTED', 'ACCEPTED'].includes(p.qualification_status), 'Create or re-qualify the profile first');
      requireThat(p.tests.length < 12, 'Test limit reached; re-qualify to start a new comparison');
      const text = customText?.trim() || TEST_PHRASES[p.tests.length % TEST_PHRASES.length];
      const result = await this.provider.synthesize({ representation: await this.representation(p), version: p.provider_version, text });
      requireThat(Buffer.isBuffer(result.audio) && result.audio.length > 44 && result.audio.length < 10000000, 'Provider returned invalid test audio');
      requireThat(assessWav(result.audio, { generated: true }).duration >= .1, 'Provider returned empty audio');
      requireThat(result.version === p.provider_version, 'Provider changed; rebuild the profile');
      const test = { id: randomUUID(), text, created_at: stamp(), revision: p.revision, hash: hash(result.audio), metrics: result.metrics,
        provider_version: result.version, heard_original: false, heard_synthetic: false };
      await fs.writeFile(path.join(this.folder(id), `test-${test.id}.wav`), result.audio, { mode: 0o600 });
      p.tests.push(test); p.technical_generation_success = true;
      // Additional listening previews do not change a previously accepted voice
      // reference, its explicit acceptance evidence, or its approved roles.
      if (p.qualification_status !== 'ACCEPTED') p.qualification_status = 'TESTED';
      return this.write(p);
    });
  }
  async heard(id, testId, kind) {
    return this.exclusive(id, async () => {
      const p = await this.get(id), t = p.tests.find(t => t.id === testId && t.revision === p.revision);
      requireThat(['TESTED', 'ACCEPTED'].includes(p.qualification_status) && t && ['original', 'synthetic'].includes(kind), 'No current comparison');
      // This is an operator/browser report, not proof of human hearing.
      t[`heard_${kind}`] = true;
      return this.write(p);
    });
  }
  async accept(id, input) {
    return this.exclusive(id, async () => {
      const p = await this.get(id), t = p.tests.find(t => t.id === input.test_id && t.revision === p.revision);
      requireThat(input.accept === true && p.qualification_status === 'TESTED' && p.technical_generation_success && t === p.tests.at(-1) && t?.heard_original && t?.heard_synthetic, 'Listen to both clips and explicitly accept the current comparison');
      Object.assign(p, { qualification_status: 'ACCEPTED', user_acceptance: true, qualification_timestamp: stamp(), accepted_test_id: t.id });
      return this.write(p);
    });
  }
  async roles(id, roles, publicationDisclosure = true) {
    return this.exclusive(id, async () => {
      const p = await this.get(id);
      requireThat(p.qualification_status === 'ACCEPTED' && p.user_acceptance, 'Only a user-accepted voice can be assigned');
      requireThat(Array.isArray(roles) && roles.length <= 2 && roles.every(r => ROLES.includes(r)) && new Set(roles).size === roles.length, 'Only ANNOUNCER and COMMENTATOR presentation roles are permitted');
      p.approved_roles = roles; p.publication_disclosure = publicationDisclosure !== false;
      return this.write(p);
    });
  }
  async reset(id, action) {
    return this.exclusive(id, async () => {
      const p = await this.get(id);
      requireThat(['add-sample', 'requalify', 'reject'].includes(action), 'Unknown profile action');
      requireThat(action !== 'add-sample' || p.qualification_status !== 'RECORDING', 'Already recording. Accept and save the current recording, or explicitly discard it before recording again.');
      requireThat(action !== 'requalify' || p.voice_representation_hash, 'Create a voice representation first');
      p.user_acceptance = false; p.approved_roles = []; p.fight_club_enabled = false; p.technical_generation_success = false; p.revision++;
      delete p.qualification_timestamp; delete p.accepted_test_id;
      for (const t of p.tests) await fs.rm(path.join(this.folder(id), `test-${t.id}.wav`), { force: true });
      p.tests = [];
      // Generated role audio is sensitive too. Invalidate it on any reset.
      for (const name of await fs.readdir(this.folder(id))) if (/^role-[a-f0-9-]+\.(wav|json)$/.test(name)) await fs.rm(path.join(this.folder(id), name));
      if (action !== 'requalify') {
        await fs.rm(path.join(this.folder(id), 'representation.bin'), { force: true });
        delete p.voice_representation_hash;
      }
      p.qualification_status = action === 'reject' ? 'REJECTED' : action === 'requalify' ? 'UNQUALIFIED' : 'RECORDING';
      return this.write(p);
    });
  }
  async remove(id) {
    return this.exclusive(id, async () => {
      await this.get(id);
      // Exact validated UUID folder, never a workspace/root or user path.
      await fs.rm(this.folder(id), { recursive: true });
      return { deleted: true };
    });
  }
  async fightClubAvailability(id, enabled) {
    requireThat(typeof enabled === 'boolean', 'Availability must be true or false');
    return this.exclusive(id, async () => {
      const p = await this.get(id);
      requireThat(!enabled || (p.qualification_status === 'ACCEPTED' && p.user_acceptance === true), 'Accept this voice before enabling Fight Club');
      p.fight_club_enabled = enabled;
      p.fight_club_permission = { enabled, at: stamp(), revision: p.revision,
        scope: 'Synthetic speech for any participant in the private Fight Club application' };
      return this.write(p);
    });
  }
  async fightClubVoices() {
    return (await this.list()).filter(p => p.fight_club_enabled === true && p.qualification_status === 'ACCEPTED' && p.user_acceptance === true)
      .map(p => ({ id: `enrolled:${p.profile_id}`, label: `RECORDED: ${p.display_name} — OmniVoice (synthetic)` }));
  }
  async fightClubSpeech(id, text, signal) {
    return this.exclusive(id, async () => {
      const p = await this.get(id);
      requireThat(p.fight_club_enabled === true && p.qualification_status === 'ACCEPTED' && p.user_acceptance === true, 'Recorded voice is not enabled and accepted for Fight Club');
      requireThat(typeof text === 'string' && text.trim().length > 0 && text.length <= 1200 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text), 'Invalid speech text (1–1200 characters)');
      const result = await this.provider.synthesize({ representation: await this.representation(p), version: p.provider_version, text, signal });
      requireThat(result.version === p.provider_version && Buffer.isBuffer(result.audio), 'Provider output/version mismatch; re-qualify required');
      requireThat(assessWav(result.audio, { generated: true }).duration >= .1, 'Provider returned empty audio');
      return result;
    });
  }
  async roleSpeech(id, { role, text }) {
    return this.exclusive(id, async () => {
      const p = await this.get(id);
      requireThat(p.qualification_status === 'ACCEPTED' && p.user_acceptance && p.approved_roles.includes(role) && ROLES.includes(role), 'Voice is not accepted for this presentation role');
      requireThat(typeof text === 'string' && text.trim().length > 0 && text.length <= 1200, 'Invalid commentary text');
      const result = await this.provider.synthesize({ representation: await this.representation(p), version: p.provider_version, text });
      requireThat(result.version === p.provider_version && Buffer.isBuffer(result.audio) && result.audio.length > 44 && result.audio.length < 10000000, 'Provider output/version mismatch; re-qualify required');
      requireThat(assessWav(result.audio, { generated: true }).duration >= .1, 'Provider returned empty audio');
      const event = { id: randomUUID(), profile_id: id, role, text, disclosure: DISCLOSURE, publication_disclosure: p.publication_disclosure,
        synthetic: true, provider_version: result.version, created_at: stamp(), metrics: result.metrics };
      await fs.writeFile(path.join(this.folder(id), `role-${event.id}.wav`), result.audio, { mode: 0o600 });
      await fs.writeFile(path.join(this.folder(id), `role-${event.id}.json`), JSON.stringify(event), { mode: 0o600 });
      return event;
    });
  }
  async audio(id, asset) {
    const p = await this.get(id);
    const sample = /^sample-([0-9]|1[01])\.wav$/.exec(asset);
    const test = /^test-([a-f0-9-]{36})\.wav$/.exec(asset);
    const role = /^role-([a-f0-9-]{36})\.wav$/.exec(asset);
    requireThat((sample && p.samples.some(s => s.index === Number(sample[1]))) ||
      (test && p.tests.some(t => t.id === test[1])) || (role && p.qualification_status === 'ACCEPTED'), 'Audio not available');
    return fs.readFile(path.join(this.folder(id), asset));
  }
}
