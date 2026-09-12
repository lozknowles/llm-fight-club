// Remove script presentation, not ordinary spoken parenthetical qualifications.
export function spokenText(input, speaker = '', limit = 180) {
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let value = String(input || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\*\*/g, '').trim();
  const direction = /\b(?:staring|shrugging|looking|pausing|sighs?|sighing|laughs?|laughing|smiles?|smiling|nods?|nodding|shakes? (?:his|her|their) head|leans?|leaning|raises? (?:his|her|their)|whispers?|whispering|shouts?|shouting|angrily|calmly|sarcastically|posture|gestures?|gesturing)\b/i;
  value = value.replace(/\([^()\n]{0,180}\)|\[[^\]\n]{0,180}\]|\*[^*\n]{1,180}\*/g, text => direction.test(text) ? ' ' : text);
  const labels = [speaker, 'interviewer', 'guest', 'host', 'panelist', 'panellist', 'debater', 'announcer', 'commentator'].filter(Boolean).map(escape).join('|');
  value = value.replace(new RegExp(`^(?:${labels})\\s*(?:\\([^()\\n]{0,180}\\)\\s*)?:\\s*`, 'i'), '');
  value = value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  const words = value.split(/\s+/), max = Math.max(1, Math.min(180, Number(limit) || 60));
  if (words.length > max) {
    const truncated = words.slice(0, max).join(' ');
    const end = [...truncated.matchAll(/[.!?](?:["”’])?(?=\s|$)/g)].at(-1);
    value = end && end.index > truncated.length / 3 ? truncated.slice(0, end.index + end[0].length) : truncated.replace(/[,:;—-]+$/, '') + '.';
  }
  if (!value || /^[\s\W]*$/.test(value)) throw Error('The model returned no spoken dialogue');
  return value;
}
