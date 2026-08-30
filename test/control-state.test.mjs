import assert from 'node:assert/strict';
import test from 'node:test';

import { controlAvailability } from '../public/control-state.js';

test('playing enables pause and skip but disables resume', () => {
  assert.deepEqual(controlAvailability({ state: 'ACTIVE', awaitingPlayback: true }), {
    pause: true,
    resume: false,
    skip: true,
    stop: true,
    intervention: true,
  });
});

test('paused enables resume but disables pause', () => {
  assert.deepEqual(controlAvailability({ state: 'PAUSED', awaitingPlayback: true }), {
    pause: false,
    resume: true,
    skip: false,
    stop: true,
    intervention: true,
  });
});

test('active preparation disables skip until speech is available', () => {
  assert.deepEqual(controlAvailability({ state: 'ACTIVE', awaitingPlayback: false }), {
    pause: true,
    resume: false,
    skip: false,
    stop: true,
    intervention: true,
  });
});

for (const state of ['STOPPED', 'COMPLETED', 'ERROR']) {
  test(`${state.toLowerCase()} disables all transport and intervention controls`, () => {
    assert.deepEqual(controlAvailability({ state, awaitingPlayback: false }), {
      pause: false,
      resume: false,
      skip: false,
      stop: false,
      intervention: false,
    });
  });
}
