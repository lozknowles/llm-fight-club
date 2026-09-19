import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

/** JSON-lines process adapter. Worker-specific configuration stays outside consumers. */
export class JsonSpeechWorker {
  constructor({ command, args = [], env = process.env, declaration }) {
    this.declaration = declaration; this.pending = new Map(); this.ready = false;
    this.process = spawn(command, args, { env, stdio: ['pipe','pipe','inherit'] });
    const lines = createInterface({ input: this.process.stdout });
    lines.on('line', line => {
      let data; try { data = JSON.parse(line); } catch { return; }
      if (data.ready) { this.ready = true; this.declaration = data.capabilities; }
      const job = this.pending.get(data.id);
      if (job) { this.pending.delete(data.id); data.error ? job.reject(Error(data.error)) : job.resolve(data); }
    });
    const failed = () => { this.ready = false; for (const p of this.pending.values()) p.reject(Error('speech_worker_exited')); this.pending.clear(); };
    this.process.on('error', failed); this.process.on('exit', failed);
  }
  capabilities() { return this.declaration; }
  health() { return { state: this.ready ? 'ready' : 'unavailable', backend: this.declaration.backend, pending: this.pending.size }; }
  async synthesise({ text, voice, signal }) {
    if (!this.ready) throw Error('speech_worker_not_ready');
    signal.throwIfAborted();
    const id = randomUUID();
    const abort = () => { this.process.stdin.write(JSON.stringify({ cancel: id }) + '\n'); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      const data = await new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.process.stdin.write(JSON.stringify({ id, text, voice }) + '\n');
      });
      signal.throwIfAborted();
      return { bytes: Buffer.from(data.audio, 'base64'), durationSeconds: data.durationSeconds, watermark: data.watermark, exportAllowed: false, metrics: data.metrics };
    } finally { signal.removeEventListener('abort', abort); }
  }
  close() { this.process.kill('SIGTERM'); }
}
