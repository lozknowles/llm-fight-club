import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginTurn,
  commitModelInterruption,
  completePlayback,
  createConversation,
  recordTurn,
  submitAudienceIntervention,
} from '../lib/conversation-engine.mjs';

const personality = (name, overrides = {}) => ({
  name,
  worldview: `${name} worldview`,
  confidence: .7,
  ...overrides,
});

function debate() {
  return createConversation({
    format: 'DEBATE',
    premise: 'Local AI is inherently more secure than cloud AI.',
    turnLimit: 4,
    interruptionLevel: 'ARGUMENTATIVE',
    interruptionAudio: 'NATURAL_DUCK',
    participants: [
      { id: 'local', name: 'Local', role: 'for', model: 'one', voice: 'voice-one', personality: personality('Local', { assertiveness: .9 }) },
      { id: 'cloud', name: 'Cloud', role: 'against', model: 'two', voice: 'voice-two', personality: personality('Cloud', { argumentativeness: .9 }) },
      { id: 'referee', name: 'Referee', role: 'referee', model: 'three', voice: 'voice-three', personality: personality('Referee', { politeness: .9 }) },
    ],
  });
}

test('model barge-in preserves only heard words in public transcript and forces interrupt/reaction turns', () => {
  const conversation = debate();
  beginTurn(conversation);
  const opening = recordTurn(conversation, { text: 'Local systems never transmit private prompts to a remote operator at all.' });
  const event = commitModelInterruption(conversation, {
    turnId: opening.turn_id,
    interrupterId: 'cloud',
    heardWordCount: 5,
    reason: 'The absolute claim needs a threat model.',
    suggestedOpening: 'Never is doing a lot of work there.',
    playbackMs: 1800,
  });
  assert.equal(opening.text, 'Local systems never transmit private');
  assert.equal(opening.heard_text, opening.text);
  assert.equal(opening.interrupted, true);
  assert.match(opening.unspoken_text_internal, /^prompts/);
  assert.equal(event.state, 'pending_interrupter');

  assert.equal(beginTurn(conversation).id, 'cloud');
  const interruption = recordTurn(conversation, { text: 'Never is doing a lot of work there. What is your threat model?' });
  assert.equal(interruption.autonomous_interruption, true);
  completePlayback(conversation, { durationMs: 2300 });

  assert.equal(beginTurn(conversation).id, 'local');
  const reaction = recordTurn(conversation, { text: 'Fair challenge. I mean under a no-egress deployment.' });
  assert.equal(reaction.interruption_reaction, true);
  assert.equal(event.state, 'completed');
});

test('human grenade cancels a pending autonomous interruption and takes priority', () => {
  const conversation = debate();
  beginTurn(conversation);
  const opening = recordTurn(conversation, { text: 'Local systems are secure because the data stays here for every request.' });
  const event = commitModelInterruption(conversation, { turnId: opening.turn_id, interrupterId: 'cloud', heardWordCount: 6 });
  const grenade = submitAudienceIntervention(conversation, 'That ignores compromised local administrators.');
  assert.equal(event.state, 'cancelled');
  assert.equal(event.cancelledBy, 'audience');
  assert.equal(conversation.forcedParticipantQueue[0], 'cloud');
  assert.deepEqual(new Set(grenade.pendingParticipantIds), new Set(['local', 'cloud', 'referee']));
});

test('personality interruption traits are normalized and bounded', () => {
  const conversation = createConversation({
    format: 'INTERVIEW',
    premise: 'Test',
    interruptionLevel: 'POLITE',
    participants: [
      { id: 'a', name: 'A', role: 'interviewer', model: 'one', voice: 'a', personality: personality('A', { patience: 3, politeness: -1 }) },
      { id: 'b', name: 'B', role: 'guest', model: 'two', voice: 'b', personality: personality('B') },
    ],
  });
  assert.equal(conversation.participants[0].personality.patience, 1);
  assert.equal(conversation.participants[0].personality.politeness, 0);
  assert.equal(conversation.interruptionLevel, 'POLITE');
});
