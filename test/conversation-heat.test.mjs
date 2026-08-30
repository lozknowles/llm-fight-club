import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CONVERSATION_HEAT,
  createConversation,
  setConversationHeat,
  stop,
} from '../lib/conversation-engine.mjs';

const participant = (role, index) => ({
  id: `p${index}`,
  name: `P${index}`,
  role,
  model: 'model',
  voice: `voice-${index}`,
  personality: { name: `P${index}`, worldview: `worldview-${index}` },
});

const conversation = (heat = 'BALANCED') => createConversation({
  format: 'DEBATE',
  premise: 'A test proposition',
  conversationHeat: heat,
  participants: [participant('for', 0), participant('against', 1)],
});

test('conversation heat owns the autonomous interruption level', () => {
  const value = conversation('FURIOUS');
  assert.equal(value.conversationHeat, 'FURIOUS');
  assert.equal(value.interruptionLevel, 'CHAOS');
  assert.equal(value.heatRevision, 0);
  assert.match(CONVERSATION_HEAT.FURIOUS.direction, /counterargument/i);
  assert.match(CONVERSATION_HEAT.FURIOUS.direction, /Are you kidding me/i);
});

test('live heat changes are durable telemetry events', () => {
  const value = conversation();
  setConversationHeat(value, 'HEATED');
  assert.equal(value.conversationHeat, 'HEATED');
  assert.equal(value.interruptionLevel, 'ARGUMENTATIVE');
  assert.equal(value.heatRevision, 1);
  assert.deepEqual(value.heatHistory.map(({ from, to }) => ({ from, to })), [{ from: 'BALANCED', to: 'HEATED' }]);
  assert.equal(value.telemetry.at(-1).type, 'conversation_heat_changed');
});

test('heat rejects unknown values and ended conversations', () => {
  const value = conversation();
  assert.throws(() => setConversationHeat(value, 'VOLCANIC'), /Unknown conversation heat/);
  stop(value);
  assert.throws(() => setConversationHeat(value, 'FURIOUS'), /ended/);
});

test('live page keeps heat above a fixed scrolling transcript window', async () => {
  const html = await readFile(new URL('../public/audio.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="heatPanel"') < html.indexOf('id="transcript"'));
  assert.match(html, /\.transcript-window\{[^}]*overflow-y:auto/);
  assert.match(html, /id="conversationHeat"[^>]*type="range"/);
});
