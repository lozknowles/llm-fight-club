export const CONVERSATION_HEAT_LEVELS = ['DOCILE', 'CALM', 'BALANCED', 'HEATED', 'FURIOUS'];

export const CONVERSATION_HEAT = {
  DOCILE: {
    interruptionLevel: 'OFF',
    label: 'Docile',
    description: 'Patient, conciliatory and willing to give ground.',
    direction: 'Be unusually patient and conciliatory. Look for common ground, concede good points and never cut across another speaker. Do not fake agreement with a false claim.',
    deliveryHints: ['gentle', 'patient', 'restrained'],
  },
  CALM: {
    interruptionLevel: 'POLITE',
    label: 'Calm',
    description: 'Polite disagreement with measured delivery.',
    direction: 'Remain measured and civil. Disagree only where it matters, explain why, and allow the other speaker room to finish.',
    deliveryHints: ['calm', 'measured'],
  },
  BALANCED: {
    interruptionLevel: 'NATURAL',
    label: 'Balanced',
    description: 'Natural challenge, humour and occasional interruption.',
    direction: 'Use natural conversational energy. Challenge weak claims directly but proportionately, and support every disagreement with a reason.',
    deliveryHints: ['conversational'],
  },
  HEATED: {
    interruptionLevel: 'ARGUMENTATIVE',
    label: 'Heated',
    description: 'Forceful counterarguments, impatience and sharper interruptions.',
    direction: 'Actively seek a defensible counter-position to the other speaker while preserving your assigned role and established commitments. State disagreement plainly, for example “I think you are completely wrong, because…”, and then give a specific counterargument. Sound impatient when justified: vary pace, use sharper emphasis and occasional natural exasperation, but do not become abusive or repeat a stock phrase.',
    deliveryHints: ['heated', 'irritated', 'forceful', 'selectively louder on key rebuttal words'],
  },
  FURIOUS: {
    interruptionLevel: 'CHAOS',
    label: 'Furious',
    description: 'Combative, emphatic and ready to cut in on a real point of conflict.',
    direction: 'Look urgently for a specific contradiction or counterargument to the other speaker and challenge it without hedging, while preserving your assigned role and established commitments. If contextually natural, open with a varied exasperated reaction such as “Are you kidding me?” or “For goodness’ sake”, then explain exactly why the opposing claim is wrong. Use clipped rhythm, emphatic punctuation and one or two strongly stressed words. Never reverse your assigned position merely to create conflict. Never add empty shouting, abuse, threats, slurs, or the same catchphrase repeatedly.',
    deliveryHints: ['furious', 'angry', 'exasperated', 'occasional audible sigh when contextually natural', 'selectively louder on key rebuttal words', 'rapid attack then deliberate counterargument'],
  },
};

const HEAT_BY_INTERRUPTION = {
  OFF: 'DOCILE',
  POLITE: 'CALM',
  NATURAL: 'BALANCED',
  ARGUMENTATIVE: 'HEATED',
  CHAOS: 'FURIOUS',
};

export function normalizeConversationHeat(value, interruptionLevel = 'NATURAL') {
  const normalized = String(value || '').trim().toUpperCase();
  if (CONVERSATION_HEAT_LEVELS.includes(normalized)) return normalized;
  return HEAT_BY_INTERRUPTION[String(interruptionLevel || '').toUpperCase()] || 'BALANCED';
}

export function ensureConversationHeat(conversation, preferred) {
  const heat = normalizeConversationHeat(preferred || conversation.conversationHeat, conversation.interruptionLevel);
  conversation.conversationHeat = heat;
  conversation.interruptionLevel = CONVERSATION_HEAT[heat].interruptionLevel;
  conversation.heatRevision = Math.max(0, Number(conversation.heatRevision) || 0);
  conversation.heatHistory ||= [];
  return conversation;
}

export function setConversationHeat(conversation, value) {
  if (['COMPLETED', 'STOPPED', 'ERROR'].includes(conversation.state)) throw new Error('Conversation has ended');
  const requested = String(value || '').trim().toUpperCase();
  if (!CONVERSATION_HEAT_LEVELS.includes(requested)) throw new Error('Unknown conversation heat');
  const from = normalizeConversationHeat(conversation.conversationHeat, conversation.interruptionLevel);
  const to = requested;
  if (from === to) return conversation;
  conversation.conversationHeat = to;
  conversation.interruptionLevel = CONVERSATION_HEAT[to].interruptionLevel;
  conversation.heatRevision = Math.max(0, Number(conversation.heatRevision) || 0) + 1;
  const event = { type: 'conversation_heat_changed', at: new Date().toISOString(), from, to, heatRevision: conversation.heatRevision };
  conversation.heatHistory ||= [];
  conversation.heatHistory.push(event);
  conversation.telemetry ||= [];
  conversation.telemetry.push(event);
  return conversation;
}

export function conversationHeatDirection(conversation) {
  return CONVERSATION_HEAT[normalizeConversationHeat(conversation.conversationHeat, conversation.interruptionLevel)];
}
