import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.TTS_BASE || 'http://100.125.120.114:18772';
const outputDir = path.resolve('.run-v2/audio-qualification');
await mkdir(outputDir, { recursive: true });

const samples = [
  { voice: 'awb', text: 'Good evening. I intend to ask short questions and remember the answers.' },
  { voice: 'slt', text: 'Splendid. I have never found remembering answers particularly helpful.' },
];

const results = [];
for (const sample of samples) {
  const response = await fetch(`${base}/synthesize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sample),
  });
  if (!response.ok) throw new Error(`${sample.voice}: ${response.status} ${await response.text()}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw new Error(`${sample.voice}: output is not a WAV file`);
  }
  const file = path.join(outputDir, `${sample.voice}.wav`);
  await writeFile(file, bytes);
  results.push({
    voice: sample.voice,
    file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    latencyMs: Number(response.headers.get('x-tts-latency-ms')),
  });
}

if (new Set(results.map((item) => item.sha256)).size !== results.length) {
  throw new Error('Voice outputs were byte-identical');
}

console.log(JSON.stringify({ status: 'PASS', engine: 'ffmpeg-flite', results }, null, 2));
