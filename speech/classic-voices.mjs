export const CLASSIC_VOICES = [
  {
    id: 'test-espeak-ng-british-rp-male',
    label: 'TEST: eSpeak NG 1.51 — British RP male (free/local)',
    engine: 'espeak-ng',
    engineVoice: 'en-gb-x-rp+m3',
    model: 'espeak-ng-1.51',
  },
  {
    id: 'test-espeak-ng-scottish-female',
    label: 'TEST: eSpeak NG 1.51 — Scottish female (free/local)',
    engine: 'espeak-ng',
    engineVoice: 'en-gb-scotland+f3',
    model: 'espeak-ng-1.51',
  },
  {
    id: 'test-festival-kal-male-us',
    label: 'TEST: Festival 2.5 — Kal diphone male US (free/local)',
    engine: 'festival',
    engineVoice: 'kal_diphone',
    model: 'festival-2.5-kal-diphone',
  },
  {
    id: 'test-festival-slt-female-us',
    label: 'TEST: Festival 2.5 — SLT HTS female US (free/local)',
    engine: 'festival',
    engineVoice: 'cmu_us_slt_arctic_hts',
    model: 'festival-2.5-slt-hts',
  },
];

export const CLASSIC_VOICE_IDS = CLASSIC_VOICES.map((voice) => voice.id);
export const CLASSIC_VOICE_BY_ID = new Map(CLASSIC_VOICES.map((voice) => [voice.id, voice]));
