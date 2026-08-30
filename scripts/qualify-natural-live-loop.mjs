import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const appBase = 'http://100.125.120.114:18770';
const speechBase = 'http://100.125.120.114:18772';
const output = path.resolve('.run-v2/natural-live-loop');
await mkdir(output, { recursive: true });

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${data.error || JSON.stringify(data)}`);
  return data;
}

function wavDurationMs(bytes) {
  const byteRate = bytes.readUInt32LE(28);
  const marker = bytes.indexOf(Buffer.from('data'));
  if (marker < 0 || byteRate < 1) throw new Error('Invalid PCM WAV');
  return Math.round(bytes.readUInt32LE(marker + 4) / byteRate * 1000);
}

const config = await json(`${appBase}/api/config`);
const mara = config.personalities.find((item) => item.id === 'mara-vale');
const cedric = config.personalities.find((item) => item.id === 'cedric-pump');
let conversation = await json(`${appBase}/api/conversations`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    format: 'INTERVIEW',
    premise: 'Why does your institute believe confident-looking diagrams can replace economic forecasts?',
    style: 'SATIRICAL', turnLimit: 2, turnLength: 45, speechMode: 'server',
    participants: [
      { id: 'natural-interviewer', name: mara.name, role: 'interviewer', model: config.models[0], voice: 'natural-interviewer', personality: mara },
      { id: 'natural-guest', name: cedric.name, role: 'guest', model: config.models[1], voice: 'natural-guest', personality: cedric },
    ],
  }),
});

const evidence = [];
while (conversation.state !== 'COMPLETED') {
  const next = await json(`${appBase}/api/conversations/${conversation.id}/next`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  conversation = next.conversation;
  const speech = await fetch(`${speechBase}/synthesize`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: next.turn.text, voice: next.turn.voice, deliveryHints: next.turn.delivery_hints }),
  });
  if (!speech.ok) throw new Error(`Speech ${speech.status}: ${await speech.text()}`);
  const bytes = Buffer.from(await speech.arrayBuffer());
  const durationMs = Number(speech.headers.get('x-tts-audio-duration-ms')) || wavDurationMs(bytes);
  const provider = speech.headers.get('x-tts-provider');
  const latencyMs = Number(speech.headers.get('x-tts-latency-ms'));
  const file = path.join(output, `${next.turn.turn_index}-${next.turn.speaker}.wav`.replaceAll(' ', '-'));
  await writeFile(file, bytes);
  conversation = await json(`${appBase}/api/conversations/${conversation.id}/complete-playback`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ durationMs, skipped: false, ttsProvider: provider, ttsLatencyMs: latencyMs }),
  });
  evidence.push({
    turn: next.turn.turn_index, speaker: next.turn.speaker, model: next.turn.model,
    voice: next.turn.voice, deliveryHints: next.turn.delivery_hints, text: next.turn.text,
    provider, latencyMs, durationMs, rtf: Number(speech.headers.get('x-tts-rtf')), file,
  });
}

const result = {
  status: conversation.state === 'COMPLETED'
    && new Set(evidence.map((item) => item.model)).size === 2
    && new Set(evidence.map((item) => item.voice)).size === 2
    && evidence.every((item) => item.provider === 'qwen3-tts-voicedesign') ? 'PASS' : 'FAIL',
  conversationId: conversation.id,
  evidence,
  transcript: conversation.transcript,
};
await writeFile(path.join(output, 'qualification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'PASS') process.exitCode = 1;
