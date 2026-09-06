const text = (value, fallback = '') => String(value ?? fallback).trim();

export const OMNIVOICE_PROFILES = Object.freeze([
  {
    id: 'omnivoice-moderator',
    name: 'OmniVoice — Rowan (measured British moderator)',
    provider: 'omnivoice',
    description: 'Original synthetic middle-aged British male voice; measured, low-pitched and authoritative.',
    provenance: { kind: 'synthetic-designed', model: 'k2-fsa/OmniVoice', realPersonReference: false },
    providerVoiceData: { mode: 'design', instruct: 'A middle-aged British male voice with a low pitch and a measured, authoritative delivery.' },
    generationSettings: { seed: 14201, numStep: 32 },
  },
  {
    id: 'omnivoice-challenger',
    name: 'OmniVoice — Elara (energetic British challenger)',
    provider: 'omnivoice',
    description: 'Original synthetic young-adult British female voice; bright, quick and assertive.',
    provenance: { kind: 'synthetic-designed', model: 'k2-fsa/OmniVoice', realPersonReference: false },
    providerVoiceData: { mode: 'design', instruct: 'A young adult British female voice with a high pitch and an energetic, assertive delivery.' },
    generationSettings: { seed: 28703, numStep: 32 },
  },
  {
    id: 'omnivoice-analyst',
    name: 'OmniVoice — Bram (dry British analyst)',
    provider: 'omnivoice',
    description: 'Original synthetic elderly British male voice; deliberate, dry and conversational.',
    provenance: { kind: 'synthetic-designed', model: 'k2-fsa/OmniVoice', realPersonReference: false },
    providerVoiceData: { mode: 'design', instruct: 'An elderly British male voice with a moderate pitch and a deliberate, dry conversational delivery.' },
    generationSettings: { seed: 39119, numStep: 32 },
  },
]);

export function normalizeVoiceProfile(input = {}) {
  const profile = {
    id: text(input.id), name: text(input.name), provider: text(input.provider),
    description: text(input.description),
    provenance: { kind: text(input.provenance?.kind), model: text(input.provenance?.model), realPersonReference: Boolean(input.provenance?.realPersonReference) },
    providerVoiceData: { mode: text(input.providerVoiceData?.mode), instruct: text(input.providerVoiceData?.instruct) },
    generationSettings: { seed: Number(input.generationSettings?.seed), numStep: Number(input.generationSettings?.numStep || 32) },
  };
  if (!profile.id || !profile.name || !profile.provider) throw new Error('VoiceProfile requires id, name and provider');
  if (profile.provenance.realPersonReference) throw new Error('Real-person voice references are not permitted');
  if (profile.provider === 'omnivoice' && (profile.providerVoiceData.mode !== 'design' || !profile.providerVoiceData.instruct)) throw new Error('OmniVoice profiles must be original designed voices');
  if (!Number.isInteger(profile.generationSettings.seed) || profile.generationSettings.seed < 0) throw new Error('VoiceProfile seed must be a non-negative integer');
  profile.generationSettings.numStep = Math.max(8, Math.min(64, Math.round(profile.generationSettings.numStep)));
  return profile;
}

export const VOICE_PROFILE_BY_ID = Object.freeze(Object.fromEntries(OMNIVOICE_PROFILES.map((profile) => [profile.id, normalizeVoiceProfile(profile)])));

export function publicVoiceProfile(profile) {
  const normalized = normalizeVoiceProfile(profile);
  return { id: normalized.id, name: normalized.name, provider: normalized.provider, description: normalized.description, provenance: normalized.provenance };
}
