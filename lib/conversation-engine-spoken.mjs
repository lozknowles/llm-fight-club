import {
  completePlayback as completeCorePlayback,
} from './conversation-engine.mjs';

export * from './conversation-engine.mjs';

export function completePlayback(conversation, payload = {}) {
  const result = completeCorePlayback(conversation, payload);
  const row = result.transcript.at(-1);
  if (payload.ttsProvider) row.tts_provider = String(payload.ttsProvider);
  if (Number.isFinite(Number(payload.ttsLatencyMs))) row.tts_generation_latency_ms = Number(payload.ttsLatencyMs);
  const telemetry = result.telemetry.find((item) => item.turn_id === row.turn_id);
  if (telemetry) {
    telemetry.tts_provider = row.tts_provider;
    telemetry.tts_latency_ms = row.tts_generation_latency_ms;
    telemetry.audio_duration_ms = row.audio_duration_ms;
    telemetry.playback_skipped = row.playback_skipped;
  }
  return result;
}
