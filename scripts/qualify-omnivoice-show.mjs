import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const appBase = process.env.APP_BASE || 'http://127.0.0.1:18778';
const outputDir = path.resolve(process.env.QUALIFICATION_OUTPUT || '.run-v2/omnivoice-show');
await mkdir(outputDir, { recursive: true });
const requestJson = async (url, init = {}) => { const response = await fetch(url, init); const value = await response.json(); if (!response.ok) throw Error(`${response.status}: ${value.error}`); return value; };
const post = (url, value) => requestJson(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
const durationMs = (bytes) => { const marker = bytes.indexOf(Buffer.from('data')); return Math.round(bytes.readUInt32LE(marker + 4) / bytes.readUInt32LE(28) * 1000); };

const config = await requestJson(`${appBase}/api/config`);
const profiles = ['mara-vale', 'cedric-pump', 'nina-quark'].map((id) => config.personalities.find((item) => item.id === id));
const voices = [
  { id: 'omnivoice-moderator', name: 'OmniVoice — Rowan', provider: 'omnivoice' },
  { id: 'omnivoice-challenger', name: 'OmniVoice — Elara', provider: 'omnivoice' },
  { id: 'omnivoice-analyst', name: 'OmniVoice — Bram', provider: 'omnivoice' },
];
let conversation = await post(`${appBase}/api/conversations`, {
  format: 'PANEL', premise: 'Should artificial intelligence make important decisions without human oversight?', style: 'SERIOUS', turnLimit: 6, turnLength: 38,
  speechMode: 'server', outputMode: 'TEXT_AND_VOICE', conversationHeat: 'BALANCED',
  participants: ['host', 'panelist', 'panelist'].map((role, index) => ({ id: `omni-${index}`, name: profiles[index].name, role, model: config.models[index % config.models.length], voice: voices[index].id, voiceProfile: voices[index], speechRate: [0.94, 1.08, 0.9][index], personality: profiles[index] })),
});
const results = [];
while (conversation.state !== 'COMPLETED') {
  const next = await post(`${appBase}/api/conversations/${conversation.id}/next`, {});
  conversation = next.conversation;
  const began = performance.now();
  const response = await fetch(`${appBase}/tts/synthesize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: next.turn.text, voice: next.turn.voice, speechRate: next.turn.speech_rate, profile: 'OMNIVOICE', conversationId: conversation.id, turnId: next.turn.turn_id }) });
  if (!response.ok) throw Error(`Speech ${response.status}: ${await response.text()}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const audioMs = durationMs(bytes);
  const file = path.join(outputDir, `${String(next.turn.turn_index + 1).padStart(2, '0')}-${next.turn.voice}.wav`);
  await writeFile(file, bytes);
  const metrics = { provider: response.headers.get('x-tts-provider'), model: response.headers.get('x-tts-model'), firstByteMs: Number(response.headers.get('x-tts-first-byte-ms')), synthesisMs: Number(response.headers.get('x-tts-generation-ms')), audioMs, rtf: Number(response.headers.get('x-tts-rtf')), peakVramMb: Number(response.headers.get('x-tts-peak-vram-mb')), wallMs: Math.round(performance.now() - began) };
  conversation = await post(`${appBase}/api/conversations/${conversation.id}/complete-playback`, { durationMs: audioMs, skipped: false, ttsProvider: metrics.provider, ttsLatencyMs: metrics.wallMs, ttsMetrics: metrics });
  results.push({ turn: next.turn.turn_index + 1, speaker: next.turn.speaker, model: next.turn.model, voice: next.turn.voice, text: next.turn.text, llmMs: next.turn.generation_latency_ms, file, ...metrics });
}
const evidence = { status: new Set(results.map((item) => item.voice)).size === 3 && results.every((item) => item.provider === 'omnivoice') ? 'PASS' : 'FAIL', conversationId: conversation.id, premise: conversation.premise, results, transcript: conversation.transcript, archive: `${appBase}/api/conversations/${conversation.id}/conversation.mp3` };
await writeFile(path.join(outputDir, 'qualification.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== 'PASS') process.exitCode = 1;
