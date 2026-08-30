import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const base = process.env.SPEECH_BENCHMARK_URL || 'http://127.0.0.1:18872';
const output = path.resolve(process.env.SPEECH_BENCHMARK_OUTPUT || '.run-v2/tts-bakeoff');
await mkdir(output, { recursive: true });

export const DIALOGUE = [
  {
    role: 'interviewer',
    text: "So you're saying the entire economic strategy depends upon nobody actually asking that question? I hesitate to call that a plan.",
    hints: ['measured', 'dry', 'controlled incredulity', 'natural pause before the final sentence'],
  },
  {
    role: 'guest',
    text: "No, no. That's a complete misunderstanding. It depends upon nobody asking several questions—three before lunch, perhaps four after. Frankly, the numbers are the reassuring part.",
    hints: ['conversational', 'pompously self-assured', 'slightly rapid', 'brief hesitation before the numbers'],
  },
];

const cases = [
  { provider: 'openai', expectedProvider: 'openai-gpt-4o-mini-tts', profile: 'LIVE_FAST', voices: ['live-interviewer', 'live-guest'], format: 'pcm' },
  { provider: 'local-hq', expectedProvider: 'qwen3-tts-voicedesign', profile: 'STUDIO', voices: ['natural-interviewer', 'natural-guest'], format: 'wav' },
  { provider: 'local-fast', expectedProvider: 'ffmpeg-flite', profile: 'LIVE_FAST', voices: ['awb', 'slt'], format: 'wav' },
];

function pcmWav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function durationMs(file) {
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error(`ffprobe failed for ${file}: ${probe.stderr}`);
  return Math.round(Number(probe.stdout.trim()) * 1000);
}

async function runOne(item, turn, voice) {
  const started = performance.now();
  const response = await fetch(`${base}/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: turn.text,
      voice,
      deliveryHints: turn.hints,
      profile: item.profile,
    }),
  });
  const headersAt = performance.now();
  if (!response.ok) throw new Error(`${item.provider}/${turn.role}: ${response.status} ${await response.text()}`);
  const reader = response.body.getReader();
  const chunks = [];
  let firstByteAt;
  let firstDecodableAt;
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (!firstByteAt) firstByteAt = performance.now();
    chunks.push(Buffer.from(chunk.value));
    bytes += chunk.value.byteLength;
    if (!firstDecodableAt && (item.format === 'pcm' ? bytes >= 2 : bytes >= 44)) firstDecodableAt = performance.now();
  }
  const completedAt = performance.now();
  const raw = Buffer.concat(chunks);
  const selectedProvider = response.headers.get('x-tts-provider');
  const qualified = selectedProvider === item.expectedProvider;
  const actualFormat = selectedProvider === 'openai-gpt-4o-mini-tts' ? 'pcm' : 'wav';
  const wav = actualFormat === 'pcm' ? pcmWav(raw) : raw;
  const label = qualified ? item.provider : `${item.provider}-fallback`;
  const file = path.join(output, `${label}-${turn.role}.wav`);
  await writeFile(file, wav);
  const audioDurationMs = durationMs(file);
  return {
    provider: item.provider,
    selectedProvider,
    expectedProvider: item.expectedProvider,
    qualified,
    model: response.headers.get('x-tts-model'),
    profile: item.profile,
    role: turn.role,
    voice,
    actualVoice: response.headers.get('x-tts-voice'),
    responseHeadersMs: Math.round(headersAt - started),
    firstByteMs: Math.round(firstByteAt - started),
    firstDecodableMs: Math.round(firstDecodableAt - started),
    firstPlayableEstimateMs: Math.round(firstDecodableAt - started),
    completeMs: Math.round(completedAt - started),
    audioDurationMs,
    rtf: Number(((completedAt - started) / audioDurationMs).toFixed(3)),
    bytes: wav.length,
    fallback: response.headers.get('x-tts-fallback') === 'true',
    attempts: JSON.parse(decodeURIComponent(response.headers.get('x-tts-attempts') || '%5B%5D')),
    sha256: createHash('sha256').update(wav).digest('hex'),
    file,
  };
}

const measurements = [];
for (const item of cases) {
  const files = [];
  for (let index = 0; index < DIALOGUE.length; index += 1) {
    const result = await runOne(item, DIALOGUE[index], item.voices[index]);
    measurements.push(result);
    files.push(result.file);
    console.log(JSON.stringify({ event: 'measurement', ...result }));
  }
  const label = measurements.slice(-DIALOGUE.length).every((result) => result.qualified) ? item.provider : `${item.provider}-fallback`;
  const combined = path.join(output, `${label}-comparison.wav`);
  const ffmpeg = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', files[0], '-i', files[1],
    '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[out]',
    '-map', '[out]', '-ar', '24000', '-ac', '1', combined,
  ], { encoding: 'utf8' });
  if (ffmpeg.status !== 0) throw new Error(`ffmpeg concat failed: ${ffmpeg.stderr}`);
}

const result = {
  generatedAt: new Date().toISOString(),
  benchmarkUrl: base,
  dialogue: DIALOGUE,
  notes: {
    firstPlayableEstimate: 'First complete PCM sample or WAV header at the benchmark client; browser AudioContext qualification is recorded separately.',
    disclosure: 'All voices are AI-generated synthetic voices.',
  },
  measurements,
};
await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: 'PASS', output, measurements: measurements.length }, null, 2));
