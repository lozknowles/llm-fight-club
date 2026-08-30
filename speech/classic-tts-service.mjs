import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CLASSIC_VOICES, CLASSIC_VOICE_BY_ID, CLASSIC_VOICE_IDS } from './classic-voices.mjs';

const host = process.env.CLASSIC_TTS_HOST || '127.0.0.1';
const port = Number(process.env.CLASSIC_TTS_PORT || 18875);
const allowedOrigin = process.env.CLASSIC_TTS_ALLOWED_ORIGIN || 'https://lozknowles.com';
const root = process.env.CLASSIC_TTS_ROOT || '/fast/work/spoken-ai-tts-tools-20260830/root';
const bin = (name) => path.join(root, 'usr', 'bin', name);
const libraryPath = path.join(root, 'usr', 'lib', 'x86_64-linux-gnu');
const festivalData = path.join(root, 'usr', 'share', 'festival');

const headers = (type = 'application/json') => ({
  'content-type': type,
  'access-control-allow-origin': allowedOrigin,
  'cache-control': 'no-store',
  vary: 'Origin',
});
const send = (response, status, value, type = 'application/json') => {
  response.writeHead(status, headers(type));
  response.end(type === 'application/json' ? JSON.stringify(value) : value);
};
async function body(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 10000) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}
function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...env } });
    let error = '';
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed ${code}: ${error.slice(-600)}`)));
  });
}
async function generateRaw(text, voice, output) {
  if (voice.engine === 'espeak-ng') {
    return run(bin('espeak-ng'), [
      `--path=${libraryPath}`,
      '-v', voice.engineVoice,
      '-w', output,
      text,
    ], { LD_LIBRARY_PATH: libraryPath });
  }
  const quote = (value) => JSON.stringify(String(value));
  return run(bin('festival'), [
    '-q', '--batch',
    `(set! datadir ${quote(festivalData)})`,
    `(set! libdir ${quote(festivalData)})`,
    `(set! sysconfdir ${quote(path.join(root, 'etc'))})`,
    `(load ${quote(path.join(festivalData, 'init.scm'))})`,
    `(voice_${voice.engineVoice})`,
    `(set! spoken-ai-utterance (Utterance Text ${quote(text)}))`,
    '(utt.synth spoken-ai-utterance)',
    `(utt.save.wave spoken-ai-utterance ${quote(output)})`,
  ], { LD_LIBRARY_PATH: libraryPath });
}
async function synthesize(text, voice, speechRate = 1) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spoken-ai-classic-'));
  const rawFile = path.join(directory, 'raw.wav');
  const outputFile = path.join(directory, 'speech.wav');
  const rate = Math.max(0.7, Math.min(1.4, Number(speechRate) || 1));
  const started = performance.now();
  try {
    await generateRaw(text, voice, rawFile);
    await run('/usr/bin/ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-i', rawFile,
      '-filter:a', `atempo=${rate}`,
      '-ar', '24000', '-ac', '1', '-y', outputFile,
    ]);
    return { audio: await fs.readFile(outputFile), latencyMs: Math.round(performance.now() - started) };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      await Promise.all([fs.access(bin('espeak-ng')), fs.access(bin('festival'))]);
      return send(response, 200, { status: 'ok', engine: 'classic-local-tts', voices: CLASSIC_VOICE_IDS });
    }
    if (request.method === 'GET' && url.pathname === '/voices') return send(response, 200, { voices: CLASSIC_VOICES });
    if (request.method === 'POST' && url.pathname === '/synthesize') {
      const data = await body(request);
      const text = String(data.text || '').trim();
      const voice = CLASSIC_VOICE_BY_ID.get(String(data.voice || ''));
      if (!text || text.length > 4000) throw new Error('Text must be 1-4000 characters');
      if (!voice) throw new Error('Unknown classic test voice');
      const result = await synthesize(text, voice, data.speechRate);
      response.writeHead(200, {
        ...headers('audio/wav'),
        'content-length': result.audio.length,
        'x-tts-provider': 'classic-local-tts',
        'x-tts-model': voice.model,
        'x-tts-voice': voice.id,
        'x-tts-latency-ms': result.latencyMs,
      });
      return response.end(result.audio);
    }
    return send(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return send(response, 400, { error: error.message });
  }
});

server.listen(port, host, () => console.log(`Classic local TTS listening on http://${host}:${port}`));
