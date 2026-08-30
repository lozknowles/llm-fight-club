import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessRepetition,
  compactDistinctClaims,
  repetitionScore,
} from '../lib/repetition-guard.mjs';

const repeatedGuest = [
  'Lions eat pixels, Mara. Simple as that. Visionaries rename problems, not consume data. Pixels are digital squares; lions munch on them for breakfast. Wi-Fi is just background noise.',
  'Lions eat pixels, Mara. Simple as that. Visionaries solve problems by renaming them, not by consuming data. Pixels are digital squares; lions munch on them for breakfast. Wi-Fi is just background noise.',
];

test('detects near-verbatim semantic repetition', () => {
  const result = assessRepetition(repeatedGuest[1], [repeatedGuest[0]]);
  assert.equal(result.repeated, true);
  assert.ok(result.score >= 0.78);
});

test('a stricter character threshold catches heavily paraphrased looping', () => {
  const previous = 'Their digestive system is not evolved for screens, so lions cannot actually eat pixels.';
  const candidate = 'Lions cannot digest a screen because their digestive system never evolved to process pixels.';
  assert.equal(assessRepetition(candidate, [previous], 0.55).repeated, true);
});

test('allows a genuinely new angle on the same topic', () => {
  const previous = 'A pixel is a coloured square on a display, and lions plainly do not eat them.';
  const candidate = 'The useful question is why technical metaphors make weak policies sound inevitable.';
  assert.equal(assessRepetition(candidate, [previous]).repeated, false);
  assert.ok(repetitionScore(candidate, previous) < 0.78);
});

test('character-state claims are compacted and deduplicated', () => {
  const claims = compactDistinctClaims([...repeatedGuest, 'The council funds the scheme through parking charges.']);
  assert.equal(claims.length, 2);
  assert.match(claims[1], /parking charges/);
});
