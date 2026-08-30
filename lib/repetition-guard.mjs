const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'been', 'but', 'by', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i', 'if', 'in', 'is', 'it',
  'its', 'just', 'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'she', 'so', 'that',
  'the', 'their', 'them', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
]);

export function normaliseSpokenText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(value) {
  const tokens = normaliseSpokenText(value).split(' ').filter(Boolean);
  const stem = (token) => token.length > 5 ? token.replace(/(ingly|edly|ing|ive|ed|ly|es|s)$/, '') : token;
  const meaningful = tokens.filter((token) => token.length > 2 && !STOP_WORDS.has(token)).map(stem);
  return meaningful.length >= 3 ? meaningful : tokens;
}

function frequency(tokens) {
  const result = new Map();
  for (const token of tokens) result.set(token, (result.get(token) || 0) + 1);
  return result;
}

function cosine(left, right) {
  const a = frequency(left), b = frequency(right);
  let dot = 0, aLength = 0, bLength = 0;
  for (const value of a.values()) aLength += value * value;
  for (const value of b.values()) bLength += value * value;
  for (const [token, value] of a) dot += value * (b.get(token) || 0);
  return aLength && bLength ? dot / Math.sqrt(aLength * bLength) : 0;
}

function ngrams(tokens, size = 2) {
  if (tokens.length < size) return new Set(tokens);
  return new Set(tokens.slice(0, 1 - size).map((_, index) => tokens.slice(index, index + size).join(' ')));
}

function dice(left, right) {
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const item of left) if (right.has(item)) common += 1;
  return (2 * common) / (left.size + right.size);
}

export function repetitionScore(left, right) {
  const aText = normaliseSpokenText(left), bText = normaliseSpokenText(right);
  if (!aText || !bText) return 0;
  if (aText === bText) return 1;
  const a = meaningfulTokens(aText), b = meaningfulTokens(bText);
  const vocabulary = cosine(a, b);
  const sequence = dice(ngrams(a), ngrams(b));
  return Number((vocabulary * 0.6 + sequence * 0.4).toFixed(4));
}

export function assessRepetition(candidate, previousTexts, threshold = 0.78) {
  const comparisons = previousTexts.map((text) => ({ text, score: repetitionScore(candidate, text) }));
  const closest = comparisons.sort((a, b) => b.score - a.score)[0] || { text: '', score: 0 };
  return { repeated: closest.score >= threshold, score: closest.score, closest: closest.text };
}

export function compactDistinctClaims(claims, limit = 3) {
  const distinct = [];
  for (const claim of claims || []) {
    const compact = String(claim || '').trim().split(/\s+/).slice(0, 24).join(' ');
    if (!compact) continue;
    const match = assessRepetition(compact, distinct, 0.72);
    if (match.repeated) distinct[distinct.indexOf(match.closest)] = compact;
    else distinct.push(compact);
  }
  return distinct.slice(-limit);
}

export function previousSpeakerLines(conversation, participantId, limit = 6) {
  return conversation.transcript
    .filter((turn) => turn.speaker_id === participantId)
    .slice(-limit)
    .map((turn) => turn.text);
}
