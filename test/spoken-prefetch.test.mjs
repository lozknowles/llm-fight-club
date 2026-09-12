import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pcmS16leToWav } from '../public/audio-format.js';
import { PERSONALITIES } from '../lib/conversation-engine.mjs';

async function waitFor(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); }
  throw Error('Fixture timed out');
}
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spoken-prefetch-test-'));
  const state = { calls: [], gate: null, fallback: false };
  const wav = Buffer.from(pcmS16leToWav(Buffer.alloc(24000 * 2 * 4)));
  const fake = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const p = JSON.parse(raw || '{}');
    if (req.url.endsWith('/chat/completions')) {
      const system = p.messages[0].content;
      const content = system.includes('private conversation director') ? 'Clarify the claim.'
        : system.includes('evaluator') ? 'YES'
        : system.includes('Your name is Cedric Pump') ? 'Cedric Pump (staring at the ceiling, shrugging): There is a specific alternative that we should consider.'
        : 'Alfie Rook: What evidence would change your conclusion?';
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    } else if (req.url === '/voices') {
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ voices: ['v0','v1'] }));
    } else {
      state.calls.push(p);
      if (state.gate) await state.gate;
      if (res.destroyed) return;
      res.writeHead(200, { 'content-type': 'audio/wav', 'x-audio-format': 'wav', 'x-tts-provider': 'fixture-voice', 'x-tts-fallback': String(state.fallback), 'x-tts-audio-duration-ms': '4000' });
      res.end(wav);
    }
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  const upstream = `http://127.0.0.1:${fake.address().port}`;
  const app = spawn(process.execPath, ['server-spoken.mjs'], { cwd: new URL('..', import.meta.url), env: {
    ...process.env, HOST: '127.0.0.1', PORT: '0', FIGHT_CLUB_DATA_DIR: dir,
    FIGHT_CLUB_SPEECH_URL: upstream, FIGHT_CLUB_MODEL_URL: upstream,
    FIGHT_CLUB_MODEL_ROUTES: '{}', VOICE_LAB_ENABLED: '0', VOICE_LAB_SYNTHETIC_VOICES: '', VOICE_LAB_WORKER_URL: '',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; app.stdout.on('data', c => { output += c; }); app.stderr.resume();
  t.after(async () => { app.kill(); await new Promise(r => app.exitCode !== null ? r() : app.once('exit', r)); fake.closeAllConnections(); await new Promise(r => fake.close(r)); await fs.rm(dir, { recursive: true, force: true }); });
  await waitFor(() => /listening on http:\/\/127.0.0.1:\d+/.test(output));
  const base = output.match(/http:\/\/127.0.0.1:\d+/)[0];
  const post = (route, input = {}) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const c = await (await post('/api/conversations', { format: 'INTERVIEW', premise: 'Should we change our conclusion?', turnLimit: 4, turnLength: 30, speechMode: 'server', conversationHeat: 'CALM',
    participants: [{ name: 'Alfie Rook', role: 'interviewer', model: 'fixture', voice: 'v0', personality: PERSONALITIES[0] }, { name: 'Cedric Pump', role: 'guest', model: 'fixture', voice: 'v1', personality: PERSONALITIES[1] }] })).json();
  const route = `/api/conversations/${c.id}`;
  const next = async () => (await post(route + '/next')).json();
  const speech = turn => post('/tts/stream', { conversationId: c.id, turnId: turn.turn_id, text: turn.text, voice: turn.voice });
  return { state, post, c, route, next, speech, base };
}

test('real HTTP pipeline prepares next speech before completion, strips posture and reuses the audio', async t => {
  const f = await fixture(t), first = (await f.next()).turn;
  const started = await f.speech(first); await started.arrayBuffer();
  await f.post(f.route + '/prefetch', { turnId: first.turn_id });
  await waitFor(() => f.state.calls.length === 2);
  const before = await (await fetch(f.base + f.route)).json();
  assert.equal(before.transcript.length, 1); assert.equal(before.awaitingPlayback, true);
  assert.equal(f.state.calls[1].text, 'There is a specific alternative that we should consider.');
  await f.post(f.route + '/complete-playback', { turnId: first.turn_id, durationMs: 667365 });
  const second = (await f.next()).turn;
  const response = await f.speech(second); await response.arrayBuffer();
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-tts-prefetched'), 'true');
  assert.equal(f.state.calls.length, 2);
  const stale = await f.post(f.route + '/complete-playback', { turnId: first.turn_id, durationMs: 1 });
  assert.equal(stale.status, 400);
  const latest = await (await fetch(f.base + f.route)).json();
  assert.equal(latest.transcript[0].audio_duration_ms, 4000);
});

for (const action of ['heat', 'pause', 'stop', 'intervention']) test(`${action} invalidates in-flight future speech without committing it`, async t => {
  const f = await fixture(t), first = (await f.next()).turn;
  let release; f.state.gate = new Promise(r => { release = r; });
  t.after(() => release());
  await f.post(f.route + '/prefetch', { turnId: first.turn_id });
  await waitFor(() => f.state.calls.length === 1);
  const response = await f.post(f.route + '/' + action, action === 'heat' ? { heat: 'HEATED' } : action === 'intervention' ? { text: 'That is wrong.', heardWordCount: 2, durationMs: 500 } : {});
  assert.equal(response.status, 200);
  release(); f.state.gate = null;
  const c = await (await fetch(f.base + f.route)).json();
  assert.equal(c.transcript.length, 1);
  if (action === 'pause') await f.post(f.route + '/resume');
  if (action === 'heat' || action === 'pause') {
    await f.post(f.route + '/complete-playback', { turnId: first.turn_id, durationMs: 1000 });
    const next = (await f.next()).turn;
    const audio = await f.speech(next); await audio.arrayBuffer();
    assert.equal(audio.headers.get('x-tts-prefetched'), null);
    assert.equal(f.state.calls.length, 2);
  }
});

test('a fallback to another voice is rejected before any audio reaches the browser', async t => {
  const f = await fixture(t); f.state.fallback = true;
  const response = await f.speech((await f.next()).turn);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /substitution is disabled/);
});
