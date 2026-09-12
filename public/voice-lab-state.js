export const consentReady = ({ permission, synthetic, purpose, relationship, name }) =>
  permission === true && synthetic === true && purpose === true && ['SELF', 'AUTHORISED_OTHER'].includes(relationship) && Boolean(name?.trim());
export const canRecord = ({ state, microphone, recording, busy }) => state === 'RECORDING' && microphone && !recording && !busy;
export const canAcceptVoice = profile => profile?.qualification_status === 'TESTED' && profile.technical_generation_success &&
  Boolean(profile.tests?.at(-1)?.heard_original && profile.tests?.at(-1)?.heard_synthetic);
export const nextSentence = profile => profile.recording_prompts.find(p => !profile.samples.some(s => s.index === p.index))?.index ?? null;
