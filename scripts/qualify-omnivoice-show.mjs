import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const appBase = process.env.APP_BASE || 'http://127.0.0.1:18778';
const outputDir = path.resolve(process.env.QUALIFICATION_OUTPUT || '.run-v2/omnivoice-show');
await mkdir(outputDir, { recursive: true });
const requestJson = async (url, init = {}) => { const response = await fetch(url, init); const value = await response.json(); if (!response.ok) throw Error(`${response.status}: ${value.error}`); return value; };
const post = (url, value) => requestJson(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
const durationMs = (bytes) => {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw Error('Invalid WAV');
  let offset = 12;
  let byteRate = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ' && size >= 16) byteRate = bytes.readUInt32LE(offset + 16);
    if (id === 'data' && byteRate) return Math.round((size === 0xffffffff ? bytes.length - offset - 8 : size) / byteRate * 1000);
    offset += 8 + size + (size % 2);
  }
  throw Error('WAV data chunk missing');
};

const config = await requestJson(`${appBase}/api/config`);
const profiles = ['mara-vale', 'cedric-pump', 'nina-quark'].map((id) => config.personalities.find((item) => item.id === id));
const voices = [
  { id: 'omnivoice-moderator', name: 'OmniVoice — Rowan', provider: 'omnivoice' },
  { id: 'omnivoice-challenger', name: 'OmniVoice — Elara', provider: 'omnivoice' },
  { id: 'omnivoice-analyst', name: 'OmniVoice — Bram', provider: 'omnivoice' },
];
const previews = [];
for (const voice of voices) {
  const response = await fetch(`${appBase}/tts/synthesize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: "Hello. This is how I'll sound during the conversation.", voice: voice.id, speechRate: 1, profile: 'OMNIVOICE' }) });
  if (!response.ok) throw Error(`Preview ${response.status}: ${await response.text()}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const file = path.join(outputDir, `preview-${voice.id}.wav`);
  await writeFile(file, bytes);
  previews.push({ voice: voice.id, file, audioMs: durationMs(bytes), provider: response.headers.get('x-tts-provider') });
}
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
  const metrics = { provider: response.headers.get('x-tts-provider'), model: response.headers.get('x-tts-model'), modelLoadMs: Number(response.headers.get('x-tts-load-ms')), firstByteMs: Number(response.headers.get('x-tts-first-byte-ms')), synthesisMs: Number(response.headers.get('x-tts-generation-ms')), audioMs, rtf: Number(response.headers.get('x-tts-rtf')), peakVramMb: Number(response.headers.get('x-tts-peak-vram-mb')), ramMb: Number(response.headers.get('x-tts-ram-mb')), wallMs: Math.round(performance.now() - began) };
  conversation = await post(`${appBase}/api/conversations/${conversation.id}/complete-playback`, { durationMs: audioMs, skipped: false, ttsProvider: metrics.provider, ttsLatencyMs: metrics.wallMs, ttsMetrics: metrics });
  results.push({ turn: next.turn.turn_index + 1, speaker: next.turn.speaker, model: next.turn.model, voice: next.turn.voice, text: next.turn.text, llmMs: next.turn.generation_latency_ms, file, ...metrics });
}
let textConversation = await post(`${appBase}/api/conversations`, { format: 'INTERVIEW', premise: 'Can a show continue when speech is unavailable?', style: 'SERIOUS', turnLimit: 2, outputMode: 'TEXT', participants: [
  { id: 'text-a', name: profiles[0].name, role: 'interviewer', model: config.models[0], voice: voices[0].id, voiceProfile: voices[0], personality: profiles[0] },
  { id: 'text-b', name: profiles[1].name, role: 'guest', model: config.models[0], voice: voices[1].id, voiceProfile: voices[1], personality: profiles[1] },
] });
while (textConversation.state !== 'COMPLETED') { const next = await post(`${appBase}/api/conversations/${textConversation.id}/next`, {}); textConversation = await post(`${appBase}/api/conversations/${textConversation.id}/complete-playback`, { durationMs: 0, skipped: true, ttsProvider: 'text-only' }); }
const textFallback = { state: textConversation.state, turns: textConversation.transcript.length, audioFiles: textConversation.transcript.filter((turn) => turn.audio_file).length };
const passed = new Set(results.map((item) => item.voice)).size === 3 && results.every((item) => item.provider === 'omnivoice') && previews.every((item) => item.provider === 'omnivoice') && textFallback.state === 'COMPLETED' && textFallback.audioFiles === 0;
const evidence = { status: passed ? 'PASS' : 'FAIL', conversationId: conversation.id, premise: conversation.premise, previews, results, transcript: conversation.transcript, textFallback, archive: `${appBase}/api/conversations/${conversation.id}/conversation.mp3` };
await writeFile(path.join(outputDir, 'qualification.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== 'PASS') process.exitCode = 1;
