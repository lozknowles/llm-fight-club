import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pcmS16leToWav } from '../public/audio-format.js';
import { PERSONALITIES } from '../lib/conversation-engine.mjs';
import { sha256 } from '../speech/capability-client.mjs';

async function waitFor(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); }
  throw Error('Fixture timed out');
}
async function fixture(t, capability = false, publicMode = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spoken-prefetch-test-'));
  const state = { calls: [], gate: null, fallback: false };
  const wav = Buffer.from(pcmS16leToWav(Buffer.alloc(24000 * 2 * 4)));
  const caps={backend:'fixture-csm',checkpoint:'checkpoint',codecVersion:'wav-v1',settings:{seed:1},voices:['fighter-a','fighter-b','mallow'].map((id,i)=>({id,revision:String(i+1).repeat(64),provenance:'original-generated-synthetic'}))};
  const fake = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const p = JSON.parse(raw || '{}');
    if(req.url==='/speech.capabilities'){res.setHeader('content-type','application/json');res.end(JSON.stringify(caps));}
    else if(req.url==='/speech.synthesise'){
      state.calls.push(p);res.setHeader('content-type','application/json');res.end(JSON.stringify({audio:wav.toString('base64'),evidence:{backend:caps.backend,checkpoint:caps.checkpoint,codecVersion:caps.codecVersion,settings:caps.settings,voiceIdentity:caps.voices.find(v=>v.id===p.voice),audioHash:sha256(wav),transcriptHash:sha256(p.text),generationLatencyMs:10,audioDurationSeconds:4,realTimeFactor:.0025,watermark:'NOT_APPLIED'}}));
    } else if (req.url.endsWith('/chat/completions')) {
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
    FIGHT_CLUB_PREPARED_ENABLED:capability&&!publicMode?'1':'0',AGENT_CONTROL_SPEECH_URL:upstream,AGENT_CONTROL_SPEECH_TOKEN:'fixture-only-'.repeat(4),
    FIGHT_CLUB_PUBLIC:publicMode?'1':'0',FIGHT_CLUB_CSM_MENU_ENABLED:capability&&publicMode?'1':'0',
    FIGHT_CLUB_PUBLIC_ORIGINS:'https://example.test',FIGHT_CLUB_PUBLIC_INSECURE_LOCAL:'1',FIGHT_CLUB_PUBLIC_PATH:'/',
    FIGHT_CLUB_MODEL_ROUTES: publicMode?JSON.stringify({fixture:upstream}):'{}', VOICE_LAB_ENABLED: '0', VOICE_LAB_SYNTHETIC_VOICES: '', VOICE_LAB_WORKER_URL: '',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; app.stdout.on('data', c => { output += c; }); app.stderr.resume();
  t.after(async () => { app.kill(); await new Promise(r => app.exitCode !== null ? r() : app.once('exit', r)); fake.closeAllConnections(); await new Promise(r => fake.close(r)); await fs.rm(dir, { recursive: true, force: true }); });
  await waitFor(() => /listening on http:\/\/127.0.0.1:\d+/.test(output));
  const base = output.match(/http:\/\/127.0.0.1:\d+/)[0];
  const cookie=publicMode?(await fetch(base+'/api/config')).headers.get('set-cookie').split(';')[0]:'';
  const get = route => fetch(base+route,{headers:{cookie}});
  const post = (route, input = {}) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json',cookie,origin:'https://example.test' }, body: JSON.stringify(input) });
  const c = await (await post('/api/conversations', { format: 'INTERVIEW', premise: 'Should we change our conclusion?', turnLimit: 4, turnLength: 30, speechMode: 'server', conversationHeat: 'CALM',
    participants: [{ name: 'Alfie Rook', role: 'interviewer', model: 'fixture', voice: capability?'csm-fighter-a':'v0', personality: PERSONALITIES[0] }, { name: 'Cedric Pump', role: 'guest', model: 'fixture', voice: capability?'csm-fighter-b':'v1', personality: PERSONALITIES[1] }] })).json();
  const route = `/api/conversations/${c.id}`;
  const next = async () => (await post(route + '/next')).json();
  const speech = turn => post('/tts/stream', { conversationId: c.id, turnId: turn.turn_id, text: turn.text, voice: turn.voice });
  return { state, post, get, c, route, next, speech, base, dir };
}

test('public CSM chats use pinned synthetic voices while private tools, bindings and exports stay protected',async t=>{
  const f=await fixture(t,true,true);
  assert.equal(f.c.speechProfile,'CSM'); assert.equal(f.c.publicOwner,undefined);
  assert(f.c.participants.every(p=>p.voice.startsWith('csm-') && !p.voiceProfile));
  assert.deepEqual((await(await f.get('/tts/voices')).json()).voices,['csm-fighter-a','csm-fighter-b','csm-mallow']);
  const turn=(await f.next()).turn, audio=await f.speech(turn);
  assert.equal(audio.status,200);const original=Buffer.from(await audio.arrayBuffer());
  await new Promise(r=>setTimeout(r,30));
  const c=await(await f.get(f.route)).json();
  assert.equal(c.transcript[0].audio_export_allowed,false); assert.equal(c.transcript[0].speech_evidence,undefined);
  assert.deepEqual(Buffer.from(await(await f.get(`${f.route}/playback/${turn.turn_id}.wav`)).arrayBuffer()),original);
  assert.equal((await f.get(`${f.route}/audio/${turn.turn_id}.wav`)).status,403);
  assert.equal((await fetch(f.base+f.route)).status,404);
  assert.equal((await f.get('/prepared-battle.html')).status,404);
  assert.equal((await f.get('/voice-lab.html')).status,404);
});

test('main HTTP voice catalogue and conversation use generic CSM capability with persisted evidence and export gate',async t=>{
 const f=await fixture(t,true);
 const menu=await(await fetch(f.base+'/tts/voices')).json();
 assert.ok(menu.voices.includes('csm-mallow'));assert.ok(menu.voices.includes('v0'));
 const first=(await f.next()).turn;const response=await f.speech(first);
 assert.equal(response.status,200);assert.equal(response.headers.get('x-tts-provider'),'fixture-csm');await response.arrayBuffer();
 await new Promise(r=>setTimeout(r,30));
 const c=await(await fetch(f.base+f.route)).json();
 assert.equal(c.transcript[0].speech_evidence.transcriptHash,sha256(first.text));assert.equal(c.transcript[0].audio_export_allowed,false);
 assert.equal((await fetch(`${f.base}${f.route}/audio/${first.turn_id}.wav`)).status,403);
 assert.equal((await fetch(`${f.base}${f.route}/conversation.mp3`)).status,403);
 assert.equal(f.state.calls[0].voice,'fighter-a');
 const before=JSON.stringify(c);const count=f.state.calls.length;
 const replay=await fetch(`${f.base}${f.route}/playback/${first.turn_id}.wav`);
 assert.equal(replay.status,200);assert.equal(replay.headers.get('content-disposition'),null);
 assert.equal(sha256(Buffer.from(await replay.arrayBuffer())),c.transcript[0].speech_evidence.audioHash);
 const range=await fetch(`${f.base}${f.route}/playback/${first.turn_id}.wav`,{headers:{range:'bytes=0-99'}});
 assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
 assert.equal((await fetch(`${f.base}${f.route}/playback/${first.turn_id}.wav`,{headers:{range:'bytes=9999999-'}})).status,416);
 assert.equal((await fetch(`${f.base}${f.route}/playback/missing.wav`)).status,404);
 assert.equal((await fetch(`${f.base}${f.route}/playback/${first.turn_id}.wav`,{headers:{'sec-fetch-site':'cross-site'}})).status,403);
 const saved=await(await fetch(f.base+'/api/conversations')).json();assert.equal(saved[0].id,c.id);assert.equal(saved[0].savedAudioCount,1);
 assert.equal(f.state.calls.length,count);assert.equal(JSON.stringify(await(await fetch(f.base+f.route)).json()),before);
 await fs.appendFile(path.join(f.dir,'audio',c.id,`${first.turn_id}.wav`),'corrupt');
 assert.equal((await fetch(`${f.base}${f.route}/playback/${first.turn_id}.wav`)).status,409);
});

test('existing faster voices replay saved bytes while retaining their WAV download',async t=>{
 const f=await fixture(t),turn=(await f.next()).turn;
 const generated=Buffer.from(await(await f.speech(turn)).arrayBuffer());await new Promise(r=>setTimeout(r,30));
 const before=JSON.stringify(await(await fetch(f.base+f.route)).json());
 const replay=await fetch(`${f.base}${f.route}/playback/${turn.turn_id}.wav`);
 assert.equal(replay.status,200);assert.deepEqual(Buffer.from(await replay.arrayBuffer()),generated);
 const download=await fetch(`${f.base}${f.route}/audio/${turn.turn_id}.wav`);assert.equal(download.status,200);
 assert.match(download.headers.get('content-disposition'),/attachment/);
 assert.equal(f.state.calls.length,1);assert.equal(JSON.stringify(await(await fetch(f.base+f.route)).json()),before);
 await fs.unlink(path.join(f.dir,'audio',f.c.id,`${turn.turn_id}.wav`));
 assert.equal((await fetch(`${f.base}${f.route}/playback/${turn.turn_id}.wav`)).status,404);
});

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
