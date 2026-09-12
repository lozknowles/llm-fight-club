export function playbackDuration({ skipped, started, mediaDuration, mediaPosition, pcmDuration }) {
  if (!started) return 0;
  const value = skipped ? mediaPosition : mediaDuration ?? pcmDuration;
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}
