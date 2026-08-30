import assert from 'node:assert/strict';

const base = process.env.QUALIFICATION_BASE_URL || 'http://100.125.120.114:18871';

async function api(path, method = 'GET', payload) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`${path}: ${value.error}`);
  return value;
}

async function synthesize(conversation, turn) {
  const began = performance.now();
  const response = await fetch(`${base}/tts/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: turn.text,
      voice: turn.voice,
      deliveryHints: turn.delivery_hints || [],
      delivery: 'PASSIONATE',
      format: conversation.format,
      style: conversation.style,
      role: turn.role,
      speechRate: turn.speech_rate || 1,
      profile: 'LIVE_FAST',
      conversationId: conversation.id,
      turnId: turn.turn_id,
    }),
  });
  if (!response.ok) throw new Error(`TTS ${response.status}: ${await response.text()}`);
  const bytes = (await response.arrayBuffer()).byteLength;
  return {
    provider: response.headers.get('x-tts-provider'),
    model: response.headers.get('x-tts-model'),
    bytes,
    latencyMs: Math.round(performance.now() - began),
    durationMs: Number(response.headers.get('x-tts-audio-duration-ms')) || null,
  };
}

const character = (id, name, role, voice, traits = {}) => ({
  id,
  name,
  role,
  model: 'qwen3-8b',
  voice,
  speechRate: 1,
  personality: {
    id,
    name,
    description: `${name}, an original synthetic programme participant`,
    background: 'Original fictional technology commentator',
    worldview: role === 'for' ? 'Local control is the foundation of security.' : role === 'against' ? 'Security depends on operations, not location slogans.' : 'Absolute claims need evidence and a defined threat model.',
    confidence: .8,
    humourStyle: 'dry',
    rhetoricalStyle: 'direct conversational challenge',
    speakingRhythm: 'measured',
    temperament: 'engaged',
    ...traits,
  },
});

async function create(includeReferee, level = 'ARGUMENTATIVE') {
  const participants = [
    character('edge', 'Eleanor Edge', 'for', 'eleven-interviewer', includeReferee ? { patience: 1, interruptionFrequency: 0, assertiveness: .1, argumentativeness: .1 } : { patience: .15, interruptionFrequency: .9, assertiveness: .9, argumentativeness: .9 }),
    character('cloud', 'Callum Cloud', 'against', 'eleven-guest', includeReferee ? { patience: 1, interruptionFrequency: 0, assertiveness: .1, argumentativeness: .1 } : { patience: .15, interruptionFrequency: .9, assertiveness: .9, argumentativeness: .9 }),
  ];
  if (includeReferee) participants.push(character('referee', 'Rhea Fact', 'referee', 'eleven-host', { patience: .05, interruptionFrequency: 1, assertiveness: 1, argumentativeness: .7, comicTiming: .8, politeness: .5 }));
  return api('/api/conversations', 'POST', {
    format: 'DEBATE',
    premise: 'Local AI is inherently more secure than cloud AI.',
    style: 'INVESTIGATIVE',
    turnLimit: 12,
    turnLength: 32,
    interruptionLevel: level,
    interruptionAudio: 'HARD_CUT',
    speechMode: 'server',
    participants,
  });
}

async function complete(conversation, turn, audio) {
  return api(`/api/conversations/${conversation.id}/complete-playback`, 'POST', {
    durationMs: audio.durationMs || audio.latencyMs,
    ttsProvider: audio.provider,
    ttsLatencyMs: audio.latencyMs,
    ttsMetrics: audio,
  });
}

async function qualifyAutonomous(desiredRole, includeReferee) {
  let conversation = await create(includeReferee, includeReferee ? 'CHAOS' : 'ARGUMENTATIVE');
  const evidence = { desiredRole, conversationId: conversation.id, normalTurn: null, decisions: [], event: null, generatedAudio: [] };
  for (let iteration = 0; iteration < 8 && !evidence.event; iteration += 1) {
    const next = await api(`/api/conversations/${conversation.id}/next`, 'POST', {});
    conversation = next.conversation;
    const turn = next.turn;
    const audio = await synthesize(conversation, turn);
    evidence.generatedAudio.push({ turnId: turn.turn_id, speaker: turn.speaker, role: turn.role, ...audio });
    if (!evidence.normalTurn) {
      evidence.normalTurn = turn.turn_id;
      conversation = await complete(conversation, turn, audio);
      continue;
    }
    if (turn.autonomous_interruption || turn.interruption_reaction) {
      conversation = await complete(conversation, turn, audio);
      continue;
    }
    const totalWords = turn.text.trim().split(/\s+/).length;
    for (const [index, fraction] of [.32, .56, .79].entries()) {
      const heardWordCount = Math.max(2, Math.floor(totalWords * fraction));
      const checked = await api(`/api/conversations/${conversation.id}/barge-in/evaluate`, 'POST', {
        turnId: turn.turn_id,
        heardWordCount,
        playbackMs: Math.round((audio.durationMs || 5000) * fraction),
        checkpoint: `Q${iteration}-${index + 1}`,
      });
      conversation = checked.conversation;
      evidence.decisions.push(checked.decision);
      if (checked.decision.action !== 'INTERRUPT') continue;
      const listener = conversation.participants.find((item) => item.id === checked.decision.participantId);
      if (listener?.role !== desiredRole) continue;
      const committed = await api(`/api/conversations/${conversation.id}/barge-in/commit`, 'POST', {
        turnId: turn.turn_id,
        playbackMs: checked.decision.playbackMs,
        overlapMs: 0,
        commitLatencyMs: 15,
      });
      conversation = committed.conversation;
      evidence.event = committed.event;
      assert.equal(turn.text.split(/\s+/).slice(0, checked.decision.heardWordCount).join(' '), committed.event.heardText);
      assert.equal(JSON.stringify(conversation).includes('unspoken_text_internal'), false);
      break;
    }
    if (!evidence.event) conversation = await complete(conversation, turn, audio);
  }
  assert.ok(evidence.event, `No ${desiredRole} autonomous interruption was committed`);
  for (let forced = 0; forced < 2; forced += 1) {
    const next = await api(`/api/conversations/${conversation.id}/next`, 'POST', {});
    conversation = next.conversation;
    const audio = await synthesize(conversation, next.turn);
    evidence.generatedAudio.push({ turnId: next.turn.turn_id, speaker: next.turn.speaker, role: next.turn.role, ...audio });
    conversation = await complete(conversation, next.turn, audio);
  }
  const latest = await api(`/api/conversations/${conversation.id}`);
  assert.ok(latest.transcript.some((turn) => turn.autonomous_interruption));
  assert.ok(latest.transcript.some((turn) => turn.interruption_reaction));
  return evidence;
}

async function qualifyHumanGrenade() {
  let conversation = await create(false, 'OFF');
  const next = await api(`/api/conversations/${conversation.id}/next`, 'POST', {});
  conversation = next.conversation;
  const audio = await synthesize(conversation, next.turn);
  const totalWords = next.turn.text.trim().split(/\s+/).length;
  conversation = await api(`/api/conversations/${conversation.id}/intervention`, 'POST', {
    text: 'That is an absolute claim without a threat model. Who exactly are you protecting against?',
    durationMs: Math.round((audio.durationMs || 5000) * .55),
    heardWordCount: Math.floor(totalWords * .55),
  });
  const responses = [];
  while ((conversation.audienceInterventions.at(-1)?.pendingParticipantIds || []).length) {
    const response = await api(`/api/conversations/${conversation.id}/next`, 'POST', {});
    conversation = response.conversation;
    const responseAudio = await synthesize(conversation, response.turn);
    responses.push({ speaker: response.turn.speaker, text: response.turn.text, audio: responseAudio });
    conversation = await complete(conversation, response.turn, responseAudio);
  }
  assert.equal(conversation.audienceInterventions.at(-1).pendingParticipantIds.length, 0);
  return { conversationId: conversation.id, responses };
}

const report = {
  qualifiedAt: new Date().toISOString(),
  base,
  participant: await qualifyAutonomous('against', false),
  referee: await qualifyAutonomous('referee', true),
  humanGrenade: await qualifyHumanGrenade(),
};
console.log(JSON.stringify(report, null, 2));
