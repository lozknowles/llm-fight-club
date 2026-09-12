import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { PROMPTS } from '../lib/voice-lab.mjs';
import { consentReady, canRecord, canAcceptVoice, nextSentence } from '../public/voice-lab-state.js';

test('four distinct delivery prompts and resumable required-sentence progression', () => {
  assert.equal(PROMPTS.length, 4); assert.equal(new Set(PROMPTS.map(p => p.text)).size, 4);
  assert.ok(PROMPTS.every(p => p.delivery && p.text.length > 80));
  const profile = { recording_prompts: PROMPTS, samples: [] };
  for (let i = 0; i < 4; i++) { assert.equal(nextSentence(profile), i); profile.samples.push({ index: i }); }
  assert.equal(nextSentence(profile), null);
  profile.samples = [{ index: 4 }]; assert.equal(nextSentence(profile), 0);
});

test('actual UI save handler waits for Ready, keeps consent manual, and never starts recording', async () => {
  const elements = new Map();
  const element = () => ({ value: '', checked: false, hidden: false, disabled: false, textContent: '',
    replaceChildren() {}, focus() {}, pause() {}, removeAttribute() {}, add() {} });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const sandbox = vm.createContext({ URL, Blob, Option: function(text, value) { this.text = text; this.value = value; },
    location: { href: 'http://localhost/voice-lab.html' },
    document: { getElementById: get, createElement: element, addEventListener() {} }, window: { addEventListener() {} },
    consentReady, canRecord, canAcceptVoice, nextSentence, captureConstraints() {}, captureDescription() {},
    btoa: value => Buffer.from(value, 'binary').toString('base64'), PROMPTS,
  });
  const script = (await fs.readFile(new URL('../public/voice-lab.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  vm.runInContext(script, sandbox);
  vm.runInContext(`config = {prompts: PROMPTS}; profile = {recording_prompts: PROMPTS, samples: [], tests: [], qualification_status: 'RECORDING'};
    selectGuide(); api = async () => ({...profile, samples: [...profile.samples, {index: sampleIndex}]});`, sandbox);
  for (let i = 0; i < 4; i++) {
    vm.runInContext(`take = new Blob(['fixture only']); quality = {good: true}; $('confirmedText').checked = true;`, sandbox);
    await vm.runInContext(`$('acceptSample').onclick()`, sandbox);
    assert.equal(vm.runInContext('sampleIndex', sandbox), i);
    assert.equal(vm.runInContext('recording', sandbox), false);
    assert.equal(get('confirmedText').checked, false);
    assert.equal(get('record').disabled, true);
    if (i < 3) {
      assert.equal(get('nextSentence').hidden, false);
      assert.equal(get('nextSentence').textContent, `Ready for sentence ${i + 2}`);
      vm.runInContext(`$('nextSentence').onclick()`, sandbox);
      assert.equal(vm.runInContext('sampleIndex', sandbox), i + 1);
      assert.equal(get('prompt').textContent, PROMPTS[i + 1].text);
      assert.equal(vm.runInContext('stream', sandbox), undefined);
    }
  }
  assert.equal(get('nextSentence').hidden, true); assert.equal(get('build').disabled, false);
  assert.match(get('status').textContent, /All 4 sentences saved/);
});
