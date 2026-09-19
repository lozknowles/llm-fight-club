import fs from 'node:fs/promises';
import path from 'node:path';
import { canonical, sha256 } from './capability-client.mjs';

/** Reusable speech service logic. Backend details are supplied by an adapter. */
export class SpeechCapabilityStore {
  constructor({ directory, backend }) { this.directory = directory; this.backend = backend; this.pending = new Map(); this.tail = Promise.resolve(); }
  capabilities() { return { schema: 'agent-control.speech/v1', capabilities: ['speech.synthesise','speech.capabilities','speech.cancel','speech.health','speech.cache','speech.evidence'], ...this.backend.capabilities() }; }
  health() { return this.backend.health(); }
  async read(key) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error('invalid_cache_key');
    try {
      const data = JSON.parse(await fs.readFile(path.join(this.directory, `${key}.json`), 'utf8'));
      if (sha256(Buffer.from(data.audio, 'base64')) !== data.evidence.audioHash || data.evidence.cacheKey !== key) throw Error('cache_integrity_failed');
      return data;
    } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  cancel(id) { const controller = this.pending.get(id); controller?.abort(); return { requestId: id, state: controller ? 'cancellation_requested' : 'not_pending' }; }
  async synthesise(input) {
    if (!/^[\w-]{1,80}$/.test(input.requestId || '') || this.pending.has(input.requestId)) throw Error('invalid_or_duplicate_request_id');
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1500) throw Error('speech_text_limit');
    if (this.pending.size >= 16) throw Error('speech_queue_full');
    const caps = this.backend.capabilities();
    const voice = caps.voices.find(v => v.id === input.voice);
    if (!voice) throw Error('unknown_voice');
    // The caller cannot tune fighters differently: settings are pinned by this backend.
    if (input.settings && canonical(input.settings) !== canonical(caps.settings)) throw Error('generation_settings_not_supported');
    const binding = { transcriptHash: sha256(input.text), voiceIdentity: voice, backend: caps.backend, checkpoint: caps.checkpoint, settings: caps.settings, codecVersion: caps.codecVersion };
    const key = sha256(canonical(binding));
    const controller = new AbortController(); this.pending.set(input.requestId, controller);
    const queuedAt = performance.now();
    const execute = async () => {
      controller.signal.throwIfAborted();
      const cached = await this.read(key);
      if (cached) return { ...cached, evidence: { ...cached.evidence, cacheHit: true, requestLatencyMs: performance.now() - queuedAt } };
      const start = performance.now();
      const result = await this.backend.synthesise({ text: input.text, voice: voice.id, signal: controller.signal });
      controller.signal.throwIfAborted();
      if (!Buffer.isBuffer(result.bytes) || result.bytes.length < 44 || result.bytes.length > 16000000 || result.bytes.toString('ascii', 0, 4) !== 'RIFF' || result.bytes.toString('ascii', 8, 12) !== 'WAVE') throw Error('invalid_backend_audio');
      if (!Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0) throw Error('invalid_audio_duration');
      const generationLatencyMs = performance.now() - start;
      const evidence = { ...binding, cacheKey: key, audioHash: sha256(result.bytes), generationLatencyMs, requestLatencyMs: performance.now() - queuedAt,
        audioDurationSeconds: result.durationSeconds, realTimeFactor: generationLatencyMs / (1000 * result.durationSeconds),
        watermark: result.watermark || 'UNKNOWN', exportAllowed: result.exportAllowed === true, cacheHit: false, metrics: result.metrics || {}, createdAt: new Date().toISOString() };
      const data = { mime: 'audio/wav', audio: result.bytes.toString('base64'), evidence };
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temp = path.join(this.directory, `${key}.${input.requestId}.tmp`);
      await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600 });
      if (controller.signal.aborted) { await fs.unlink(temp); controller.signal.throwIfAborted(); }
      await fs.rename(temp, path.join(this.directory, `${key}.json`));
      return data;
    };
    const promise = this.tail.then(execute);
    this.tail = promise.catch(() => {});
    try { return await promise; } finally { this.pending.delete(input.requestId); }
  }
}
