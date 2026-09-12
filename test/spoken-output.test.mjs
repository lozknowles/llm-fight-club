import test from 'node:test';
import assert from 'node:assert/strict';
import { spokenText } from '../lib/spoken-text.mjs';
import { playbackDuration } from '../public/playback-duration.js';

test('spoken output removes labels and posture without removing ordinary qualifications', () => {
  assert.equal(spokenText('Cedric Pump (staring at the ceiling, shrugging): Ah, that is wrong.', 'Cedric Pump'), 'Ah, that is wrong.');
  assert.equal(spokenText('**Cedric Pump:** [sighs] Are you kidding me? *shakes his head* No.', 'Cedric Pump'), 'Are you kidding me? No.');
  assert.equal(spokenText('It cost five pounds (including tax).', 'Cedric Pump'), 'It cost five pounds (including tax).');
  assert.equal(spokenText('<think>Private notes</think>Guest: Yes.', 'Cedric Pump'), 'Yes.');
  assert.throws(() => spokenText('[sighs]', 'Cedric Pump'), /no spoken/);
});
test('spoken turns enforce the word budget and prefer a complete sentence', () => {
  const result = spokenText('This is a complete sentence. Here is another sentence which goes on for far too many words.', 'Guest', 10);
  assert.equal(result, 'This is a complete sentence.');
});
test('playback duration never uses page uptime or a pause interval', () => {
  assert.equal(playbackDuration({ started: false, skipped: false, mediaDuration: 667365 }), 0);
  assert.equal(playbackDuration({ started: true, skipped: false, mediaDuration: 4670 }), 4670);
  assert.equal(playbackDuration({ started: true, skipped: true, mediaPosition: 1250, mediaDuration: 30000 }), 1250);
  assert.equal(playbackDuration({ started: true, skipped: false, pcmDuration: 8500 }), 8500);
});
