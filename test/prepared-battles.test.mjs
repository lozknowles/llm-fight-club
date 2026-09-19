import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PreparedBattles } from '../lib/prepared-battles.mjs';
import { SpeechCapabilityStore } from '../speech/capability-store.mjs';
import { SpeechCapabilityClient, sha256, canonical } from '../speech/capability-client.mjs';
import { createSpeechServer } from '../speech/capability-service.mjs';
import { ModelRouter } from '../lib/model-router.mjs';

function wav() { const b = Buffer.alloc(48044); b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(24000,24); b.writeUInt32LE(48000,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(48000,40); return b; }
const caps = { backend: 'fixture', checkpoint: 'checkpoint-1', codecVersion: 'wav-v1', settings: { temperature: .9, seed: 1 }, voices: ['fighter-a','fighter-b','mallow'].map(id => ({ id, revision: `${id}-v1` })) };
async function setup(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prepared-fight-')); t.after(() => fs.rm(directory, { recursive:true, force:true }));
  let calls = 0;
  const backend = { capabilities: () => structuredClone(caps), health: () => ({ state: 'ready' }), synthesise: async () => { calls++; return { bytes: wav(), durationSeconds: 1, watermark: 'NOT_APPLIED' }; }, ...overrides };
  const store = new SpeechCapabilityStore({ directory: path.join(directory, 'cache'), backend });
  return { directory, store, backend, calls: () => calls };
}
test('cache binds exact text, voice, checkpoint, settings and codec; repeat is a verified hit', async t => {
  const f = await setup(t), input = { requestId: 'first', text: 'Hello\nworld', voice: 'fighter-a' };
  const first = await f.store.synthesise(input), again = await f.store.synthesise({ ...input, requestId: 'second' });
  assert.equal(again.evidence.cacheHit, true); assert.equal(f.calls(), 1); assert.equal(first.evidence.audioHash, sha256(wav()));
  assert.equal(first.evidence.transcriptHash, sha256(input.text));
  for (const variant of [{ text:'Hello world' }, { voice:'fighter-b' }]) assert.equal((await f.store.synthesise({ ...input, ...variant, requestId: crypto.randomUUID() })).evidence.cacheHit, false);
  const oldKey = first.evidence.cacheKey;
  f.backend.capabilities = () => ({ ...caps, checkpoint: 'changed-checkpoint' });
  assert.notEqual((await f.store.synthesise({ ...input, requestId:'third' })).evidence.cacheKey, oldKey);
  await assert.rejects(f.store.synthesise({ ...input, requestId:'fourth', settings:{ seed:9 } }), /settings/);
});
test('concurrent identical speech deduplicates after queue admission', async t => {
  const f = await setup(t); const results = await Promise.all(['one','two'].map(requestId => f.store.synthesise({ requestId, text:'Same exact text', voice:'mallow' })));
  assert.equal(f.calls(), 1); assert.equal(results[1].evidence.cacheHit, true);
});
test('cache corruption is not served', async t => {
  const f = await setup(t), data = await f.store.synthesise({requestId:'a', text:'Text', voice:'fighter-a'});
  const file = path.join(f.directory,'cache',`${data.evidence.cacheKey}.json`); data.audio = 'YmFk'; await fs.writeFile(file, JSON.stringify(data));
  await assert.rejects(f.store.read(data.evidence.cacheKey), /integrity/);
});
test('cancel running synthesis discards late result and does not populate cache', async t => {
  let release, started; const ready = new Promise(r => started = r);
  const f = await setup(t, { synthesise: async () => { started(); await new Promise(r => release = r); return { bytes:wav(), durationSeconds:1 }; } });
  const pending = f.store.synthesise({ requestId:'cancel-me', text:'Text', voice:'fighter-a' }); await ready;
  assert.equal(f.store.cancel('cancel-me').state, 'cancellation_requested'); release(); await assert.rejects(pending);
  assert.equal(f.store.pending.size, 0); assert.deepEqual(await fs.readdir(f.directory), []);
});
test('real capability HTTP contract: health, auth, cache, evidence and client hashes', async t => {
  const f = await setup(t), server = createSpeechServer({ store:f.store, token:'t'.repeat(40) });
  await new Promise(r => server.listen(0,'127.0.0.1',r)); t.after(() => new Promise(r => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const client = new SpeechCapabilityClient({ url, token:'t'.repeat(40) });
  assert.equal((await client.health()).state,'ready'); assert.ok((await client.capabilities()).capabilities.includes('speech.evidence'));
  const result = await client.synthesise({ text:'Hello',voice:'fighter-b' });
  assert.equal((await client.cache(result.evidence.cacheKey)).hit,true); assert.equal((await client.evidence(result.evidence.cacheKey)).audioHash,sha256(wav()));
  await assert.rejects(new SpeechCapabilityClient({ url,token:'wrong' }).health(),/unauthorised/);
});

async function battleFixture(t, options = {}) {
  const f = await setup(t); const order = [], requested = [];
  const models = { generate: async input => { requested.push(input); order.push('model'); return { text: `  Exact ${requested.length}\nanswer.  `,model:input.model,latencyMs:17,usage:{ total_tokens:12 },provider:'fixture' }; } };
  const speech = { synthesise: async input => { order.push('speech'); if (options.fail) throw Error('backend_failed'); const value = await f.store.synthesise(input); return { bytes:Buffer.from(value.audio,'base64'), evidence:value.evidence }; } };
  const engine = new PreparedBattles({ directory:path.join(f.directory,'battles'),modelIds:['local-a','local-b','api-a','api-b'],models,speech,
    judge:async (_models,b) => { order.push('judge'); assert.equal(b.presentation.length,0); return { score_a:8,score_b:6,winner:'A',reason:'Reasoning.',judge_model:'judge-secret' }; } });
  await engine.restore(); return { ...f, engine, order, requested };
}
for (const pairing of [['local-a','local-b'],['api-a','api-b'],['local-a','api-b']]) test(`provider-neutral prepared battle fixture ${pairing.join('/')}`, async t => {
  const f = await battleFixture(t); const b = await f.engine.create({ premise:'Libraries',models:pairing,rounds:1,blind:true,speechMode:'CSM' });
  await f.engine.jobs.get(b.id); await f.engine.speechJobs.get(b.id)?.promise;
  const raw = f.engine.get(b.id), pub = f.engine.public(b.id);
  assert.equal(raw.executionState,'COMPLETED'); assert.equal(raw.presentation.filter(r=>r.state==='READY').length,6);
  assert.deepEqual(f.order.slice(0,3), ['model','model','judge']); assert.ok(f.requested.every(r=>r.exact));
  assert.equal(raw.responses[0].text,'  Exact 1\nanswer.  '); assert.equal(raw.responses[0].modelLatencyMs,17);
  assert.equal(raw.responses[0].transcriptHash,sha256(raw.responses[0].text)); assert.equal(raw.judgement.winner,'A');
  assert.equal(JSON.stringify(pub).includes('judge-secret'),false); assert.equal(JSON.stringify(pub).includes(pairing[0]),false);
  assert.equal(new Set(raw.presentation.map(r=>r.voiceIdentity)).size,3);
  const fighters = raw.presentation.filter(r=>r.lane!=='HOST'); assert.equal(canonical(fighters[0].evidence.settings),canonical(fighters[1].evidence.settings));
  await assert.rejects(f.engine.audio(b.id,raw.presentation[0].id,true), /not_permitted/);
  assert.ok((await f.engine.audio(b.id,raw.presentation[0].id)).length);
});
test('speech enabled, disabled and failed backend preserve identical scores, text, timing and token usage', async t => {
  const snapshots = [];
  for (const mode of ['CSM','TEXT','FAIL']) {
    const f = await battleFixture(t, { fail:mode==='FAIL' }), b = await f.engine.create({premise:'Libraries',models:['local-a','api-a'],speechMode:mode==='TEXT'?'TEXT':'CSM'});
    await f.engine.jobs.get(b.id); await f.engine.speechJobs.get(b.id)?.promise; const raw = f.engine.get(b.id);
    snapshots.push({ responses:raw.responses.map(({text,modelLatencyMs,tokenUsage})=>({text,modelLatencyMs,tokenUsage})),judgement:raw.judgement });
    if (mode !== 'CSM') assert.ok(raw.presentation.every(r=>r.state==='TEXT_ONLY'));
    const seal = raw.benchmarkHash; await f.engine.playback(b.id,raw.presentation[0].id,{type:'skip',positionSeconds:0}); assert.equal(raw.benchmarkHash,seal);
  }
  assert.deepEqual(snapshots[0],snapshots[1]); assert.deepEqual(snapshots[0],snapshots[2]);
});
test('blind self-identification is withheld publicly, exact original preserved privately', async t => {
  const f = await battleFixture(t); f.engine.models.generate = async ({model}) => ({ text:'I am Qwen, produced by my model developer.', model, latencyMs:1 });
  const b = await f.engine.create({premise:'Libraries',models:['local-a','local-b'],blind:true,speechMode:'CSM'});
  await f.engine.jobs.get(b.id); await f.engine.speechJobs.get(b.id)?.promise;
  assert.match(f.engine.get(b.id).responses[0].text,/Qwen/); assert.doesNotMatch(JSON.stringify(f.engine.public(b.id)),/Qwen/);
  assert.ok(f.engine.get(b.id).presentation.filter(r=>r.lane!=='HOST').every(r=>r.state==='TEXT_ONLY'));
});
test('ModelRouter exact opt-in retains whitespace; legacy output cleaning is unchanged', async t => {
  const original = globalThis.fetch; t.after(() => globalThis.fetch = original);
  globalThis.fetch = async () => new Response(JSON.stringify({choices:[{message:{content:'  raw\nanswer\t '}}],usage:{total_tokens:4}}));
  const router = new ModelRouter({defaultBaseUrl:'http://localhost'});
  assert.equal((await router.generate({model:'test',system:'',user:'',exact:true})).text,'  raw\nanswer\t ');
  assert.equal((await router.generate({model:'test',system:'',user:''})).text,'raw answer');
});
