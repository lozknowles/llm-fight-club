import assert from 'node:assert/strict';

const baseUrl = (process.env.QUALIFICATION_BASE_URL || 'http://127.0.0.1:18770').replace(/\/$/, '');

async function api(path, method = 'GET', payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

const profile = (name, worldview) => ({
  name,
  worldview,
  confidence: .9,
  assertiveness: .9,
  argumentativeness: .9,
  patience: .25,
  humourStyle: 'dry challenge',
  rhetoricalStyle: 'specific counterargument',
  speakingRhythm: 'emphatic',
  temperament: 'combative',
});

const conversation = await api('/api/conversations', 'POST', {
  format: 'DEBATE',
  premise: 'A compulsory six-hour meeting is better than a normal short meeting.',
  style: 'SATIRICAL',
  conversationHeat: 'FURIOUS',
  interruptionAudio: 'NATURAL_DUCK',
  turnLimit: 2,
  participants: [
    { id: 'for', name: 'Octavia Brief', role: 'for', model: 'qwen3-8b', voice: 'live-interviewer', personality: profile('Octavia Brief', 'Compulsory six-hour meetings expose hidden nuance and force decisions.') },
    { id: 'against', name: 'Rufus Flint', role: 'against', model: 'qwen3-8b', voice: 'live-guest', personality: profile('Rufus Flint', 'Long meetings are where decisions go to avoid being made.') },
  ],
});

assert.equal(conversation.conversationHeat, 'FURIOUS');
assert.equal(conversation.interruptionLevel, 'CHAOS');

const first = await api(`/api/conversations/${conversation.id}/next`, 'POST', {});
assert.equal(first.turn.conversation_heat, 'FURIOUS');
assert.ok(first.turn.delivery_hints.includes('furious'));
await api(`/api/conversations/${conversation.id}/complete-playback`, 'POST', { durationMs: 1, skipped: true });
const second = await api(`/api/conversations/${conversation.id}/next`, 'POST', {});
assert.equal(second.turn.conversation_heat, 'FURIOUS');
assert.ok(second.turn.delivery_hints.includes('selectively louder on key rebuttal words'));
assert.match(first.turn.text, /six.hour|long|nuance|decision/i);
assert.match(second.turn.text, /wrong|waste|short|decision|meeting|clarity|six hours|efficient/i);

const speechBegan = performance.now();
const speech = await fetch(`${baseUrl}/tts/stream`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    text: second.turn.text,
    voice: second.turn.voice,
    delivery: 'PASSIONATE',
    deliveryHints: second.turn.delivery_hints,
    format: 'DEBATE',
    role: second.turn.role,
    speechRate: 1,
    profile: 'LIVE_FAST',
    conversationId: conversation.id,
    turnId: second.turn.turn_id,
  }),
});
assert.equal(speech.ok, true);
const speechBytes = new Uint8Array(await speech.arrayBuffer());
assert.ok(speechBytes.length > 1000);
assert.equal(speech.headers.get('x-tts-provider'), 'openai-gpt-4o-mini-tts');

const changed = await api(`/api/conversations/${conversation.id}/heat`, 'POST', { heat: 'CALM' });
assert.equal(changed.conversationHeat, 'CALM');
assert.equal(changed.interruptionLevel, 'POLITE');
assert.equal(changed.heatHistory.at(-1).from, 'FURIOUS');
assert.equal(changed.heatHistory.at(-1).to, 'CALM');

console.log(JSON.stringify({
  status: 'PASS',
  conversationId: conversation.id,
  furiousOpening: first.turn.text,
  furiousCounterargument: second.turn.text,
  deliveryHints: second.turn.delivery_hints,
  speech: {
    provider: speech.headers.get('x-tts-provider'),
    model: speech.headers.get('x-tts-model'),
    bytes: speechBytes.length,
    elapsedMs: Math.round(performance.now() - speechBegan),
    firstByteMs: Number(speech.headers.get('x-tts-first-byte-ms')) || null,
  },
  liveHeatChange: changed.heatHistory.at(-1),
}, null, 2));
