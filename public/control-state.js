const ENDED_STATES = new Set(['STOPPED', 'COMPLETED', 'ERROR']);

export function controlAvailability(conversation) {
  if (!conversation) {
    return { pause: false, resume: false, skip: false, stop: false, intervention: false };
  }

  const state = String(conversation.state || '').toUpperCase();
  const ended = ENDED_STATES.has(state);

  return {
    pause: state === 'ACTIVE',
    resume: state === 'PAUSED',
    skip: state === 'ACTIVE' && Boolean(conversation.awaitingPlayback),
    stop: !ended && ['READY', 'ACTIVE', 'PAUSED'].includes(state),
    intervention: !ended,
  };
}
