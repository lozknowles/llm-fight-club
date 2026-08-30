import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const appBase = process.env.APP_BASE || 'http://100.125.120.114:18770';
const ttsBase = process.env.TTS_BASE || 'http://100.125.120.114:18772';
const outputDir = path.resolve('.run-v2/spoken-loop');
await mkdir(outputDir, { recursive: true });

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${data.error || JSON.stringify(data)}`);
  return data;
}

function wavDurationMs(bytes) {
  const byteRate = bytes.readUInt32LE(28);
  const dataMarker = bytes.indexOf(Buffer.from('data'));
  if (dataMarker < 0 || byteRate < 1) throw new Error('Invalid PCM WAV');
  return Math.round((bytes.readUInt32LE(dataMarker + 4) / byteRate) * 1000);
}

const config = await json(`${appBase}/api/config`);
const mara = config.personalities.find((item) => item.id === 'mara-vale');
const cedric = config.personalities.find((item) => item.id === 'cedric-pump');
if (!mara || !cedric || config.models.length < 2) throw new Error('Qualification fixtures are unavailable');

let conversation = await json(`${appBase}/api/conversations`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    format: 'INTERVIEW',
    premise: 'Should every office meeting be required to justify its own existence?',
    style: 'SATIRICAL',
    turnLimit: 2,
    turnLength: 45,
    speechMode: 'server',
    participants: [
      { id: 'qualification-interviewer', name: mara.name, role: 'interviewer', model: config.models[0], voice: 'awb', personality: mara },
      { id: 'qualification-guest', name: cedric.name, role: 'guest', model: config.models[1], voice: 'slt', personality: cedric },
    ],
  }),
});

const evidence = [];
while (conversation.state !== 'COMPLETED') {
  const next = await json(`${appBase}/api/conversations/${conversation.id}/next`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  conversation = next.conversation;
  const began = performance.now();
  const speech = await fetch(`${ttsBase}/synthesize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: next.turn.text, voice: next.turn.voice }),
  });
  if (!speech.ok) throw new Error(`TTS ${speech.status}: ${await speech.text()}`);
  const bytes = Buffer.from(await speech.arrayBuffer());
  const ttsLatencyMs = Number(speech.headers.get('x-tts-latency-ms')) || Math.round(performance.now() - began);
  const durationMs = wavDurationMs(bytes);
  const file = path.join(outputDir, `${next.turn.turn_index}-${next.turn.speaker}.wav`.replaceAll(' ', '-'));
  await writeFile(file, bytes);
  conversation = await json(`${appBase}/api/conversations/${conversation.id}/complete-playback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ durationMs, skipped: false, ttsProvider: 'ffmpeg-flite', ttsLatencyMs }),
  });
  evidence.push({
    turn: next.turn.turn_index,
    speaker: next.turn.speaker,
    model: next.turn.model,
    voice: next.turn.voice,
    text: next.turn.text,
    llmLatencyMs: next.turn.generation_latency_ms,
    ttsLatencyMs,
    audioDurationMs: durationMs,
    file,
  });
}

const result = {
  status: conversation.state === 'COMPLETED' && evidence.length === 2 && new Set(evidence.map((item) => item.model)).size === 2 && new Set(evidence.map((item) => item.voice)).size === 2 ? 'PASS' : 'FAIL',
  conversationId: conversation.id,
  format: conversation.format,
  premise: conversation.premise,
  evidence,
  transcript: conversation.transcript,
};
await writeFile(path.join(outputDir, 'qualification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'PASS') process.exitCode = 1;
