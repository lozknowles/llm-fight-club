// Scoring is explicitly an LLM opinion. Never infer a winner from turn order.
export function validateBoutScore(value) {
  if (!value || !Number.isInteger(value.score_a) || !Number.isInteger(value.score_b) ||
    value.score_a < 0 || value.score_a > 10 || value.score_b < 0 || value.score_b > 10 ||
    typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 1200) throw Error('Judge returned an invalid score; no winner announced');
  return { score_a: value.score_a, score_b: value.score_b, reason: value.reason,
    winner: value.score_a === value.score_b ? 'TIE' : value.score_a > value.score_b ? 'A' : 'B' };
}
