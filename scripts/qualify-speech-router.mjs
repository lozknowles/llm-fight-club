import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = 'http://100.125.120.114:18772';
const output = path.resolve('.run-v2/speech-router-qualification');
await mkdir(output, { recursive: true });

const voiceResponse = await fetch(`${base}/voices`);
const catalog = await voiceResponse.json();
for (const required of ['natural-interviewer', 'natural-guest', 'natural-referee', 'awb', 'slt']) {
  if (!catalog.voices.includes(required)) throw new Error(`Missing voice ${required}`);
}

const requests = [
  {
    name: 'natural', voice: 'natural-interviewer',
    text: "So you're saying the entire economic strategy depends upon nobody actually asking that question?",
    deliveryHints: ['measured', 'dry', 'controlled incredulity'],
    expectedProvider: 'qwen3-tts-voicedesign',
  },
  {
    name: 'fallback', voice: 'awb', text: 'This is the preserved existing speech provider.',
    deliveryHints: [], expectedProvider: 'ffmpeg-flite',
  },
];

const evidence = [];
for (const item of requests) {
  const response = await fetch(`${base}/synthesize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!response.ok) throw new Error(`${item.name}: ${response.status} ${await response.text()}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF') throw new Error(`${item.name}: not WAV`);
  const provider = response.headers.get('x-tts-provider');
  if (provider !== item.expectedProvider) throw new Error(`${item.name}: expected ${item.expectedProvider}, got ${provider}`);
  const file = path.join(output, `${item.name}.wav`);
  await writeFile(file, bytes);
  evidence.push({
    name: item.name,
    voice: item.voice,
    provider,
    latencyMs: Number(response.headers.get('x-tts-latency-ms')),
    audioDurationMs: Number(response.headers.get('x-tts-audio-duration-ms')) || null,
    rtf: Number(response.headers.get('x-tts-rtf')) || null,
    fallback: response.headers.get('x-tts-fallback') === 'true',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    file,
  });
}

const result = { status: 'PASS', catalog: catalog.voices, evidence };
await writeFile(path.join(output, 'qualification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
