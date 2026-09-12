export function captureConstraints(device, mode = 'speech') {
  return { audio: {
    ...(device ? { deviceId: { exact: device } } : {}), channelCount: 1,
    noiseSuppression: mode !== 'raw', echoCancellation: mode !== 'raw',
    // Do not amplify a noisy room automatically along with a quiet speaker.
    autoGainControl: false,
  } };
}

export function captureDescription(track) {
  const settings = track.getSettings();
  const state = value => value === true ? 'on' : value === false ? 'off' : 'not reported';
  return `Input: ${track.label || 'Unlabelled microphone'} · noise suppression ${state(settings.noiseSuppression)} · echo cancellation ${state(settings.echoCancellation)} · automatic gain ${state(settings.autoGainControl)}`;
}
