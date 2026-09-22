import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const markup = fs.readFileSync(path.join(root, 'public/show.html'), 'utf8').replace('<script src="show.js"></script>', '');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM || '/snap/bin/chromium' });
const results = [];

async function qualify(initialMode) {
  const page = await browser.newPage();
  const errors = [];
  let healthMode = initialMode;
  let sharedAudio = 0;
  let browserAudio = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__browserAudio = 0;
    Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: () => `fixture-${Math.random().toString(16).slice(2)}` });
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = milliseconds => nativeTimeout(Math.min(milliseconds, 200));
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ name: 'Voice A', lang: 'en-GB' }, { name: 'Voice B', lang: 'en-GB' }],
      cancel() {}, pause() {}, resume() {},
      speak(value) { window.__browserAudio += 1; queueMicrotask(() => { value.onstart?.(); value.onend?.(); }); }
    }});
    class AudioFixture { async play() { window.__sharedAudio = (window.__sharedAudio || 0) + 1; queueMicrotask(() => { this.onplay?.(); this.onended?.(); }); } pause() {} }
    window.Audio = AudioFixture;
    URL.createObjectURL = () => 'blob:fixture';
    URL.revokeObjectURL = () => {};
  });
  await page.route('http://fight.test/', route => route.fulfill({ contentType: 'text/html', body: markup }));
  await page.route('**/api/config', route => route.fulfill({ json: { models: ['model-a', 'model-b'], personalities: [
    { id: 'mara-vale', name: 'Mara Vale' }, { id: 'cedric-pump', name: 'Cedric Pump' }, { id: 'nina-quark', name: 'Nina Quark' }
  ]}}));
  await page.route('**/tts/health', async route => {
    if (healthMode === 'slow') await new Promise(resolve => setTimeout(resolve, 6000));
    if (healthMode === 'unreachable' || healthMode === 'slow') return route.fulfill({ status: 503, json: { error: 'unavailable' } });
    const ready = ['ready', 'provider-error', 'slow-request'].includes(healthMode);
    return route.fulfill({
      json: {
        providers: {
          'shared-speech-services': {
            available: ready,
            capabilities: {
              recognition: { status: 'ready' },
              synthesis: { status: ready ? 'ready' : 'unavailable' }
            }
          }
        }
      }
    });
  });
  let conversation;
  await page.route('**/api/conversations', async route => {
    const body = route.request().postDataJSON();
    conversation = { id: 'conversation-fixture', format: body.format, state: 'RUNNING', transcript: [], awaitingPlayback: false, turnLimit: 1, participants: body.participants };
    return route.fulfill({ status: 201, json: conversation });
  });
  await page.route('**/api/conversations/*/next', route => {
    const speaker = conversation.participants[0];
    const turn = { speaker_id: speaker.id, speaker: speaker.name, role: speaker.role, model: speaker.model, voice: speaker.voice, text: 'A real generated exchange remains visible during speech failover.', generation_latency_ms: 12, audio_duration_ms: null };
    conversation = { ...conversation, awaitingPlayback: true, transcript: [turn] };
    return route.fulfill({ json: { conversation, turn } });
  });
  await page.route('**/api/conversations/*/complete-playback', route => {
    conversation = { ...conversation, state: 'COMPLETED', awaitingPlayback: false, transcript: conversation.transcript.map(turn => ({ ...turn, audio_duration_ms: 20 })) };
    return route.fulfill({ json: conversation });
  });
  await page.route('**/tts/synthesize', async route => {
    if (healthMode === 'slow-request') await new Promise(resolve => setTimeout(resolve, 600));
    if (healthMode === 'provider-error') return route.fulfill({ status: 503, json: { error: 'provider unavailable' } });
    return route.fulfill({ contentType: 'audio/wav', body: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(44)]) });
  });
  await page.goto('http://fight.test/');
  await page.addScriptTag({ path: path.join(root, 'public/show.js'), type: 'module' });
  await page.locator('#start').waitFor();
  if (['ready', 'provider-error', 'slow-request'].includes(healthMode)) {
    try {
      await page.locator('#speechStatus').filter({ hasText: 'shared speech service' }).waitFor({ timeout: 8000 });
    } catch (error) {
      throw new Error(`shared readiness missing; status=${await page.locator('#speechStatus').innerText()}; pageErrors=${JSON.stringify(errors)}; ${error.message}`);
    }
  }
  const started = Date.now();
  await page.locator('#setup').evaluate(form => form.requestSubmit());
  try {
    await page.locator('#status').filter({ hasText: 'COMPLETED' }).waitFor({ timeout: 8000 });
  } catch (error) {
    throw new Error(`conversation did not complete; status=${await page.locator('#status').innerText()}; setupError=${await page.locator('#setupError').innerText()}; pageErrors=${JSON.stringify(errors)}; ${error.message}`);
  }
  const elapsedMs = Date.now() - started;
  sharedAudio = await page.evaluate(() => window.__sharedAudio || 0);
  browserAudio = await page.evaluate(() => window.__browserAudio || 0);
  assert.match(await page.locator('#transcript').innerText(), /generated exchange remains visible/);
  assert.deepEqual(errors, []);
  await page.close();
  return { mode: initialMode, elapsedMs, sharedAudio, browserAudio };
}

results.push(await qualify('ready'));
results.push(await qualify('tts-unavailable'));
results.push(await qualify('unreachable'));
results.push(await qualify('slow'));
results.push(await qualify('provider-error'));
results.push(await qualify('slow-request'));
assert.deepEqual(results.map(value => [value.sharedAudio, value.browserAudio]), [[1, 0], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1]]);
console.log(JSON.stringify({ classification: 'SIMULATED_BROWSER_FAILOVER_NOT_PHYSICAL_AUDIO', checks: ['shared TTS playback event', 'TTS-only readiness failure uses browser voice', 'unreachable service uses browser voice', 'slow health response does not block browser voice', 'provider synthesis error uses browser voice', 'bounded synthesis timeout uses browser voice', 'generated exchange remains visible', 'each turn is settled once'], results }, null, 2));
await browser.close();
