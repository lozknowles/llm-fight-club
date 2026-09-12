import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { VoiceLab, CONSENT_VERSION, PROMPTS, LEGACY_PROMPTS, TEST_PHRASES, assessWav, DISCLOSURE } from '../lib/voice-lab.mjs';
import { voiceLabRoutes } from '../lib/voice-lab-http.mjs';
import { OmniVoiceEnrolmentProvider } from '../speech/providers/voice-lab-provider.mjs';
import { consentReady, canRecord, canAcceptVoice } from '../public/voice-lab-state.js';
import { validateBoutScore } from '../lib/voice-lab-judge.mjs';

// Synthetic signal for regression ONLY. Not a recording or voice qualification.
function wav(seconds = 4, amplitude = .2) {
  const bytes = Buffer.alloc(44 + Math.round(seconds * 24000) * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let i = 0; i < (bytes.length - 44) / 2; i++) bytes.writeInt16LE(Math.round(Math.sin(i * .12) * amplitude * 32767), 44 + i * 2);
  return bytes;
}
const consent = { consent_version: CONSENT_VERSION, display_name: 'Synthetic fixture', relationship: 'SELF', permission: true, synthetic: true, purpose: true };
const provider = () => ({ id: 'test-double', health: async () => ({ available: true }),
  create: async () => ({ representation: Buffer.from('regression-prompt'), version: 'fixture-v1', method: 'MOCK ONLY' }),
  synthesize: async () => ({ audio: wav(), version: 'fixture-v1', metrics: { mocked: true } }) });
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fight-club-voice-lab-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const fake = provider(); return { lab: new VoiceLab({ directory: dir, provider: fake }), fake, dir };
}
async function built(lab) {
  const p = await lab.create(consent);
  for (let i = 0; i < PROMPTS.length; i++) await lab.sample(p.profile_id, i, wav(i === 2 ? 8 : 4), true);
  return lab.build(p.profile_id);
}
async function accepted(lab) {
  const p = await built(lab), tested = await lab.test(p.profile_id), id = tested.tests[0].id;
  await lab.heard(p.profile_id, id, 'original'); await lab.heard(p.profile_id, id, 'synthetic');
  return lab.accept(p.profile_id, { accept: true, test_id: id });
}
test('consent is affirmative, current, explicit and requires a relationship', async t => {
  const { lab } = await fixture(t);
  for (const field of ['permission', 'synthetic', 'purpose']) await assert.rejects(lab.create({ ...consent, [field]: false }), /consent/);
  await assert.rejects(lab.create({ ...consent, permission: 'true' }), /consent/);
  await assert.rejects(lab.create({ ...consent, consent_version: 'old' }), /consent/);
  await assert.rejects(lab.create({ ...consent, relationship: '' }), /relationship/);
  const p = await lab.create(consent); assert.ok(p.consent_time); assert.equal(p.consent_relationship, 'SELF'); assert.equal(p.user_acceptance, false);
});
test('checkboxes start unticked and microphone has no automatic start path', async () => {
  const html = await fs.readFile(new URL('../public/voice-lab.html', import.meta.url), 'utf8');
  for (const id of ['permission', 'synthetic', 'purpose']) assert.doesNotMatch(html.match(new RegExp(`<input[^>]+id="${id}"[^>]*>`))[0], /checked/);
  assert.equal(consentReady({}), false);
  assert.equal(canRecord({ state: 'RECORDING', microphone: false, recording: false, busy: false }), false);
  assert.equal(canRecord({ state: 'ACCEPTED', microphone: true, recording: false, busy: false }), false);
  assert.equal(canRecord({ state: 'RECORDING', microphone: true, recording: false, busy: false }), true);
  assert.equal(canRecord({ state: 'RECORDING', microphone: true, recording: true, busy: false }), false);
});
test('quality rejects malformed, short, quiet, silent and clipping recordings', () => {
  assert.equal(assessWav(wav()).good, true);
  assert.equal(assessWav(wav(1)).good, false); assert.equal(assessWav(wav(4, 0)).good, false);
  assert.ok(assessWav(wav(4, .001)).issues.includes('TOO QUIET'));
  assert.ok(assessWav(wav(4, 1)).issues.includes('TOO LOUD / CLIPPING'));
  assert.throws(() => assessWav(Buffer.alloc(100)), /Expected/);
  const truncated = wav().subarray(0, 100); assert.throws(() => assessWav(truncated));
});
test('create persists consent, deterministically selects reference, and does not accept a clone', async t => {
  const { lab, fake, dir } = await fixture(t), p = await built(lab);
  assert.equal(p.selected_sample, 2); assert.equal(p.qualification_status, 'UNQUALIFIED'); assert.equal(p.user_acceptance, false);
  assert.equal(p.reference_audio_hashes.length, 4); assert.equal(p.voice_representation_hash.length, 64);
  assert.deepEqual(await new VoiceLab({ directory: dir, provider: fake }).get(p.profile_id), p);
  if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(dir, p.profile_id, 'representation.bin'))).mode & 0o777, 0o600);
});
test('sample upload requires recording state, valid quality, guided-text confirmation and four initial samples', async t => {
  const { lab } = await fixture(t), p = await lab.create(consent);
  await assert.rejects(lab.sample(p.profile_id, 0, wav(), false), /Confirm/);
  await assert.rejects(lab.sample(p.profile_id, 12, wav(), true), /Confirm/);
  await assert.rejects(lab.sample(p.profile_id, 0, wav(1), true), /Record again/);
  await assert.rejects(lab.build(p.profile_id), /all 4/);
  await lab.sample(p.profile_id, 4, wav(), true); assert.equal((await lab.get(p.profile_id)).samples[0].text, PROMPTS[0].text);
});
test('technical synthesis is not acceptance; current A/B reports plus explicit acceptance required', async t => {
  const { lab } = await fixture(t), p = await built(lab);
  await assert.rejects(lab.accept(p.profile_id, { accept: true }), /Listen/);
  let q = await lab.test(p.profile_id); const testId = q.tests[0].id;
  assert.equal(q.user_acceptance, false); assert.equal(q.technical_generation_success, true); assert.equal(canAcceptVoice(q), false);
  await assert.rejects(lab.roles(p.profile_id, ['ANNOUNCER']), /accepted/);
  await lab.heard(p.profile_id, testId, 'original'); q = await lab.heard(p.profile_id, testId, 'synthetic');
  assert.equal(canAcceptVoice(q), true);
  await assert.rejects(lab.accept(p.profile_id, { accept: false, test_id: testId }), /explicitly/);
  q = await lab.accept(p.profile_id, { accept: true, test_id: testId }); assert.equal(q.user_acceptance, true); assert.ok(q.qualification_timestamp);
  for (const text of TEST_PHRASES) assert.ok(!PROMPTS.some(p => p.text === text));
});
test('role speech is presentation-only with synthetic disclosure and protected stored audio', async t => {
  const { lab } = await fixture(t), p = await accepted(lab);
  await assert.rejects(lab.roles(p.profile_id, ['AGENT_CONTROL_OPERATOR']), /Only ANNOUNCER/);
  await assert.rejects(lab.roleSpeech(p.profile_id, { role: 'ANNOUNCER', text: 'Hello' }), /not accepted/);
  await lab.roles(p.profile_id, ['ANNOUNCER', 'COMMENTATOR']);
  const event = await lab.roleSpeech(p.profile_id, { role: 'ANNOUNCER', text: 'Round one begins now.' });
  assert.equal(event.disclosure, DISCLOSURE); assert.equal(event.synthetic, true);
  assert.ok((await lab.audio(p.profile_id, `role-${event.id}.wav`)).length > 44);
  await assert.rejects(lab.audio(p.profile_id, 'representation.bin'), /not available/);
  await assert.rejects(lab.audio(p.profile_id, '../../secret'), /not available/);
});
test('reject and requalification revoke assignments and require new acceptance', async t => {
  const { lab } = await fixture(t), p = await accepted(lab);
  await lab.roles(p.profile_id, ['ANNOUNCER']); let q = await lab.reset(p.profile_id, 'requalify');
  assert.equal(q.user_acceptance, false); assert.deepEqual(q.approved_roles, []); assert.equal(q.tests.length, 0);
  await assert.rejects(lab.accept(p.profile_id, { accept: true, test_id: p.accepted_test_id }));
  q = await lab.reset(p.profile_id, 'reject'); assert.equal(q.qualification_status, 'REJECTED'); assert.equal(q.voice_representation_hash, undefined);
  await assert.rejects(lab.test(p.profile_id), /Create/);
  q = await lab.reset(p.profile_id, 'add-sample'); assert.equal(q.qualification_status, 'RECORDING');
  await lab.sample(p.profile_id, 4, wav(8), true); assert.equal((await lab.get(p.profile_id)).samples.length, 5);
});
test('deletion removes reference audio, prompt, comparisons and generated role files', async t => {
  const { lab, dir } = await fixture(t), p = await accepted(lab);
  await lab.roles(p.profile_id, ['COMMENTATOR']); await lab.roleSpeech(p.profile_id, { role: 'COMMENTATOR', text: 'An original result.' });
  await lab.remove(p.profile_id); assert.deepEqual(await fs.readdir(dir), []);
  await assert.rejects(lab.get(p.profile_id)); assert.throws(() => lab.folder('../'), /Invalid/);
});
test('provider failure, changed version and corrupt representation fail closed', async t => {
  const { lab, fake, dir } = await fixture(t), p = await built(lab);
  fake.synthesize = async () => { throw Error('worker unavailable'); };
  await assert.rejects(lab.test(p.profile_id), /unavailable/); assert.equal((await lab.get(p.profile_id)).user_acceptance, false);
  fake.synthesize = async () => ({ audio: wav(), version: 'changed' }); await assert.rejects(lab.test(p.profile_id), /Provider changed/);
  fake.synthesize = async () => ({ audio: Buffer.alloc(100), version: 'fixture-v1' }); await assert.rejects(lab.test(p.profile_id), /Expected/);
  await fs.writeFile(path.join(dir, p.profile_id, 'representation.bin'), 'tampered'); await assert.rejects(lab.test(p.profile_id), /integrity/);
});
test('concurrent operations cannot accept or delete a profile during synthesis', async t => {
  const { lab, fake } = await fixture(t), p = await built(lab); let release;
  fake.synthesize = () => new Promise(resolve => { release = () => resolve({ audio: wav(), version: 'fixture-v1' }); });
  const pending = lab.test(p.profile_id);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(lab.remove(p.profile_id), /busy/); await assert.rejects(lab.reset(p.profile_id, 'reject'), /busy/);
  release(); await pending;
});
test('HTTP endpoints enforce auth for list, writes, audio and unknown paths; disabled by default', async t => {
  const { dir, fake } = await fixture(t), key = 'x'.repeat(40);
  const handler = voiceLabRoutes({ directory: dir, provider: fake, enabled: true, key });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/voice-lab`;
  for (const route of ['/profiles', '/profiles/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/sample-0.wav', '/config']) assert.equal((await fetch(url + route)).status, 401);
  assert.equal((await (await fetch(url + '/config')).json()).code, 'ACCESS_KEY_MISSING');
  const invalid = await fetch(url + '/config', { headers: { 'x-voice-lab-key': 'wrong-key' } });
  assert.equal(invalid.status, 401);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.code, 'ACCESS_KEY_INVALID');
  assert.ok(!JSON.stringify(invalidBody).includes(key));
  assert.ok(!JSON.stringify(invalidBody).includes('wrong-key'));
  assert.equal((await fetch(url + '/profiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(consent) })).status, 401);
  assert.equal((await fetch(url + '/config', { headers: { 'x-voice-lab-key': key, 'sec-fetch-site': 'cross-site' } })).status, 403);
  const response = await fetch(url + '/profiles', { headers: { 'x-voice-lab-key': key } }); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const headers = { 'x-voice-lab-key': key, 'content-type': 'application/json' };
  const created = await (await fetch(url + '/profiles', { method: 'POST', headers, body: JSON.stringify(consent) })).json();
  const sampleUrl = url + `/profiles/${created.profile_id}/samples`;
  const take = { index: 0, audio: wav().toString('base64'), confirmed_text: true };
  assert.equal((await fetch(sampleUrl, { method: 'POST', headers, body: JSON.stringify(take) })).status, 400);
  assert.equal((await fetch(sampleUrl, { method: 'POST', headers, body: JSON.stringify({ ...take, prompt_text: LEGACY_PROMPTS[0].text }) })).status, 400);
  assert.equal((await fetch(sampleUrl, { method: 'POST', headers, body: JSON.stringify({ ...take, prompt_text: PROMPTS[0].text }) })).status, 200);
  let status;
  await voiceLabRoutes({ directory: dir, provider: fake, enabled: false, key })({ headers: {} }, { writeHead: s => status = s, end() {} }, new URL(url + '/config'));
  assert.equal(status, 503);
});
test('provider is fail closed and rejects remote/unsecured worker targets', async () => {
  await assert.rejects(new OmniVoiceEnrolmentProvider({}).health(), /not configured/);
  assert.throws(() => new OmniVoiceEnrolmentProvider({ baseUrl: 'http://example.com' }), /loopback/);
  assert.throws(() => new OmniVoiceEnrolmentProvider({ baseUrl: 'http://user:pass@127.0.0.1' }), /loopback/);
});
test('conditioning failure leaves the profile unaccepted with its recordings intact', async t => {
  const { lab, fake } = await fixture(t), p = await lab.create(consent);
  for (let i = 0; i < PROMPTS.length; i++) await lab.sample(p.profile_id, i, wav(), true);
  fake.create = async () => { throw Error('OmniVoice unavailable'); };
  await assert.rejects(lab.build(p.profile_id), /unavailable/);
  const restored = await lab.get(p.profile_id);
  assert.equal(restored.qualification_status, 'RECORDING'); assert.equal(restored.user_acceptance, false); assert.equal(restored.samples.length, 4);
});
test('old recorded profiles retain six original texts while empty profiles adopt the four-sentence guide', async t => {
  const { lab } = await fixture(t), p = await lab.create(consent);
  delete p.recording_prompts; await lab.write(p);
  assert.equal((await lab.get(p.profile_id)).recording_prompts.length, 4);
  p.samples = [{ index: 0, text: LEGACY_PROMPTS[0].text }]; await lab.write(p);
  const legacy = await lab.get(p.profile_id);
  assert.deepEqual(legacy.recording_prompts, LEGACY_PROMPTS);
  assert.equal(legacy.samples[0].text, LEGACY_PROMPTS[0].text);
  await assert.rejects(lab.build(p.profile_id), /all 6/);
  for (let i = 0; i < 6; i++) await lab.sample(p.profile_id, i, wav(), true);
  assert.equal((await lab.build(p.profile_id)).qualification_status, 'UNQUALIFIED');
});
test('bout judge validates scores and allows a tie without inventing a winner', () => {
  assert.equal(validateBoutScore({ score_a: 8, score_b: 8, reason: 'Balanced evidence' }).winner, 'TIE');
  assert.equal(validateBoutScore({ score_a: 8, score_b: 7, reason: 'Stronger evidence' }).winner, 'A');
  assert.throws(() => validateBoutScore({ score_a: 99, score_b: 7, reason: 'Invalid' }), /invalid/);
});
