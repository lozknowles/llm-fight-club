import { consentReady, canRecord, canAcceptVoice, nextSentence } from './voice-lab-state.js';
import { captureConstraints, captureDescription } from './voice-lab-capture.js';
const $ = id => document.getElementById(id), base = new URL('.', location.href);
let key = '', config, profile, profiles = [], busy = false, recording = false, stream, context, recorder, analyser, chunks = [], take, quality;
let started = 0, frame, audioUrl, sampleIndex = 0, boutCancelled = false, boutEvidence = null, activeConversation;
let pendingNext = null;
let takeError = '', saveReceipt = '';
const guide = () => profile?.recording_prompts || config.prompts;
function selectGuide() {
  const prompts = guide(); pendingNext = null; saveReceipt = ''; takeError = '';
  sampleIndex = profile ? nextSentence(profile) ?? 0 : 0;
  $('sampleIndex').replaceChildren(...Array.from({ length: prompts.length * 2 }, (_, i) => new Option(`${i + 1}. ${prompts[i % prompts.length].category}${i >= prompts.length ? ' — optional retake' : ''}`, i)));
  $('sampleIndex').value = String(sampleIndex);
}
const status = text => { $('status').textContent = text; };
async function api(route, method = 'GET', value, lab = true) {
  const response = await fetch(new URL(lab ? `api/voice-lab${route}` : route, base), {
    method, headers: { ...(lab ? { 'x-voice-lab-key': key } : {}), ...(value ? { 'content-type': 'application/json' } : {}) },
    body: value ? JSON.stringify(value) : undefined, cache: 'no-store',
  });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw Error(error.error || `Request failed (${response.status})`); }
  return response.headers.get('content-type')?.startsWith('audio/') ? response.blob() : response.json();
}
async function action(work) {
  if (busy) return;
  busy = true; render();
  try { await work(); } catch (error) { status(error.message); }
  finally { busy = false; render(); }
}
const post = (suffix, input = {}) => api(`/profiles/${profile.profile_id}/${suffix}`, 'POST', input);
const toBase64 = async blob => { const bytes = new Uint8Array(await blob.arrayBuffer()); let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(value); };
function clearConsent() { for (const id of ['permission', 'synthetic', 'purpose']) $(id).checked = false; $('relationship').value = ''; $('displayName').value = ''; }
function render() {
  $('continue').disabled = busy || !consentReady({ permission: $('permission').checked, synthetic: $('synthetic').checked, purpose: $('purpose').checked, relationship: $('relationship').value, name: $('displayName').value });
  $('consent').hidden = Boolean(profile); $('profilePanel').hidden = !profile;
  $('profiles').disabled = busy || recording || Boolean(take); $('newProfile').disabled = busy || recording || Boolean(take);
  if (!profile) { $('bout').hidden = true; return; }
  const state = profile.qualification_status;
  $('profileTitle').textContent = `${profile.display_name} — Voice profile`;
  $('profileState').textContent = `${state} · ${profile.profile_id} · ${profile.user_acceptance ? 'Explicitly accepted by the operator' : 'NOT accepted for use'}`;
  $('recordPanel').hidden = state !== 'RECORDING';
  $('comparison').hidden = !['UNQUALIFIED', 'TESTED'].includes(state);
  $('assignment').hidden = state !== 'ACCEPTED';
  $('bout').hidden = state !== 'ACCEPTED' || !['ANNOUNCER', 'COMMENTATOR'].every(r => profile.approved_roles.includes(r));
  const prompts = guide(), current = prompts[sampleIndex % prompts.length];
  $('guideTitle').textContent = `Sentence ${sampleIndex % prompts.length + 1} of ${prompts.length} — ${current.category}`;
  $('prompt').textContent = current.text;
  $('deliveryHint').textContent = current.delivery || 'Read naturally, in your own voice.';
  $('guideSteps').replaceChildren(...prompts.map(p => {
    const li = document.createElement('li'), saved = profile.samples.some(s => s.index === p.index);
    li.textContent = `${saved ? '✓ Saved' : 'To record'} — ${p.category}`; return li;
  }));
  const savedCount = prompts.filter(p => profile.samples.some(s => s.index === p.index)).length;
  $('progress').textContent = `SAVED ON SERVER: ${savedCount} of ${prompts.length} required sentences · ${profile.samples.length} recordings saved`;
  $('takeStatus').textContent = takeError || (take ? 'UNSAVED recording — play it back, confirm the text, then click Accept and save recording. Moving on is blocked until you save or explicitly discard it.' : saveReceipt || 'No unsaved recording.');
  $('nextSentence').hidden = pendingNext === null;
  $('nextSentence').disabled = busy || recording;
  $('nextSentence').textContent = `Ready for sentence ${(pendingNext ?? 0) + 1}`;
  $('guideNote').textContent = prompts.length === 4 ? 'Four contrasting sentences, recorded one at a time. Read only the large text; delivery hints are not spoken.' : 'This profile keeps its original six-sentence guide to preserve existing recordings. A new enrolment uses four sentences.';
  $('record').disabled = Boolean(take) || pendingNext !== null || !canRecord({ state, microphone: Boolean(stream), recording, busy });
  $('stopRecord').disabled = !recording;
  $('enableMic').disabled = busy || recording || pendingNext !== null;
  $('sampleIndex').disabled = busy || recording || Boolean(take);
  $('microphones').disabled = busy || recording;
  $('captureMode').disabled = busy || recording;
  $('disableMic').disabled = busy || recording || !stream;
  $('playTake').disabled = busy || recording || !take;
  $('rerecord').disabled = busy || recording || !take;
  $('acceptSample').disabled = busy || recording || !quality?.good || !$('confirmedText').checked;
  $('confirmedText').disabled = busy || recording || !take;
  $('build').disabled = busy || recording || Boolean(take) || !prompts.every(p => profile.samples.some(s => s.index === p.index));
  const t = profile.tests.at(-1);
  $('testText').textContent = t?.text || 'Create a synthetic test to begin comparison.';
  for (const id of ['playOriginal', 'playSynthetic']) $(id).disabled = busy || !t;
  $('acceptVoice').disabled = busy || !canAcceptVoice(profile);
  for (const id of ['generateTest', 'reject', 'saveRoles', 'addSample', 'requalify', 'reenrol', 'deleteVoice', 'runBout']) $(id).disabled = busy || recording || Boolean(take);
  $('addSample').hidden = state === 'RECORDING';
  $('addSample').disabled ||= state === 'RECORDING';
  $('requalify').disabled ||= !profile.voice_representation_hash;
}
function resetTake() { take = null; quality = null; chunks = []; takeError = ''; $('confirmedText').checked = false; $('quality').textContent = ''; render(); }
async function refreshProfiles() {
  profiles = await api('/profiles'); $('profiles').replaceChildren(new Option('Create a new profile', ''));
  for (const p of profiles) $('profiles').add(new Option(`${p.display_name} · ${p.qualification_status}`, p.profile_id));
  $('profiles').value = profile?.profile_id || '';
}
async function micOff() {
  recording = false; cancelAnimationFrame(frame); recorder?.port.postMessage('stop');
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  await context?.close().catch(() => {}); context = null; recorder = null;
  $('meter').value = 0; $('recordState').textContent = 'READY — microphone off'; $('recordState').className = '';
  $('inputDb').textContent = 'Microphone off. Bar colour is not a recording-quality verdict.';
}
function stopPlayer() { $('player').pause(); $('player').onended = null; if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = null; $('player').removeAttribute('src'); }
async function play(blob, ended) {
  stopPlayer(); audioUrl = URL.createObjectURL(blob); const player = $('player'); player.src = audioUrl; player.hidden = false;
  player.onended = ended || null; await player.play();
}
async function enableMic() {
  if (!profile || profile.qualification_status !== 'RECORDING') throw Error('Complete consent first');
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioWorkletNode) throw Error('Microphone unavailable: use a supported browser on HTTPS or localhost');
  await micOff();
  try {
    const device = $('microphones').value;
    stopPlayer();
    stream = await navigator.mediaDevices.getUserMedia(captureConstraints(device, $('captureMode').value));
    $('captureSettings').textContent = captureDescription(stream.getAudioTracks()[0]);
    context = new AudioContext(); await context.resume();
    await context.audioWorklet.addModule(new URL('voice-recorder-worklet.js', base));
    const source = context.createMediaStreamSource(stream); analyser = context.createAnalyser(); analyser.fftSize = 512;
    recorder = new AudioWorkletNode(context, 'voice-recorder'); const mute = context.createGain(); mute.gain.value = 0;
    source.connect(analyser); source.connect(recorder); recorder.connect(mute).connect(context.destination);
    recorder.port.onmessage = ({ data }) => { if (!recording) return; if (data === 'limit') finishRecording(); else chunks.push(data); };
    const devices = await navigator.mediaDevices.enumerateDevices(); $('microphones').replaceChildren(new Option('System default', ''));
    for (const d of devices.filter(d => d.kind === 'audioinput')) $('microphones').add(new Option(d.label || 'Microphone', d.deviceId));
    $('microphones').value = device;
    const meter = () => {
      if (!stream) return;
      const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((a, v) => a + v * v, 0) / samples.length);
      $('meter').value = Math.min(1, rms * 5);
      $('inputDb').textContent = `${(20 * Math.log10(Math.max(rms, 1e-6))).toFixed(0)} dBFS RMS · bar magnified 5× for visibility, not microphone gain. Green does not mean noise-free.`;
      $('recordState').textContent = recording ? `● RECORDING · ${((performance.now() - started) / 1000).toFixed(1)} / 15 seconds` : 'READY — input monitoring only; press Record to capture';
      frame = requestAnimationFrame(meter);
    }; meter();
    for (const track of stream.getTracks()) track.onended = () => { if (recording) finishRecording(); else micOff().then(render); };
    status('Microphone enabled. Nothing is recorded until you press Record.');
  } catch (error) { await micOff(); throw Error(`Microphone unavailable: ${error.message}`); }
}
function startRecording() {
  if (take || pendingNext !== null) return;
  if (!canRecord({ state: profile?.qualification_status, microphone: Boolean(stream), recording, busy })) return;
  stopPlayer(); saveReceipt = ''; resetTake(); recording = true; started = performance.now(); recorder.port.postMessage('record'); $('recordState').className = 'active'; render();
}
async function finishRecording() {
  if (!recording) return;
  recording = false; recorder.port.postMessage('stop'); const rate = context.sampleRate;
  const input = chunks; chunks = []; await micOff();
  await action(async () => {
    const frames = input.reduce((n, c) => n + c.length, 0); if (!frames) throw Error('No audio captured — record again');
    const offline = new OfflineAudioContext(1, Math.ceil(frames * 24000 / rate), 24000);
    const buffer = offline.createBuffer(1, frames, rate), channel = buffer.getChannelData(0); let offset = 0;
    for (const c of input) { channel.set(c, offset); offset += c.length; }
    const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start();
    const rendered = (await offline.startRendering()).getChannelData(0), wav = new ArrayBuffer(44 + rendered.length * 2), view = new DataView(wav);
    const str = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    str(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 24000, true); view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, rendered.length * 2, true);
    rendered.forEach((v, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true));
    take = new Blob([wav], { type: 'audio/wav' }); quality = await post('quality', { audio: await toBase64(take) });
    $('quality').textContent = `${quality.good ? 'LEVEL CHECKS PASSED — listen for background noise before accepting' : quality.issues.join(' · ')} · ${quality.duration.toFixed(1)} seconds · RMS ${quality.rmsDb.toFixed(1)} dBFS · ${(quality.silenceFraction * 100).toFixed(0)}% low-energy frames. ${quality.limitations}`;
    status('Recording stopped and microphone released. Listen to your take before accepting it.');
  });
}
$('connect').onclick = () => action(async () => {
  key = $('accessKey').value; config = await api('/config'); $('accessKey').value = ''; $('unlock').hidden = true; $('lab').hidden = false; $('startVideo').disabled = false;
  selectGuide();
  const app = await api('api/config', 'GET', null, false);
  for (const id of ['modelA', 'modelB']) $(id).replaceChildren(...app.models.map(m => new Option(m, m)));
  $('modelB').selectedIndex = Math.min(1, app.models.length - 1);
  await refreshProfiles(); clearConsent(); status('Unlocked. Start a new enrolment or select a saved profile.');
  api('/health').then(h => $('providerStatus').textContent = `Worker ready · ${h.version}`).catch(e => $('providerStatus').textContent = e.message);
});
$('lock').onclick = async () => { document.dispatchEvent(new Event('voice-lab-lock')); boutCancelled = true; stopPlayer(); await micOff(); key = ''; profile = null; profiles = []; take = null; $('lab').hidden = true; $('unlock').hidden = false; $('profilePanel').hidden = true; $('startVideo').disabled = true; status('Locked; microphone released.'); };
for (const id of ['permission', 'synthetic', 'purpose', 'relationship', 'displayName', 'confirmedText']) $(id).oninput = render;
$('continue').onclick = () => action(async () => {
  profile = await api('/profiles', 'POST', { consent_version: config.consent_version, display_name: $('displayName').value,
    relationship: $('relationship').value, permission: $('permission').checked, synthetic: $('synthetic').checked, purpose: $('purpose').checked });
  selectGuide(); await refreshProfiles(); status('Sentence 1 is ready below. Read the delivery hint, enable your microphone, then press Record when ready.');
});
$('newProfile').onclick = async () => { if (take || recording || busy) return; await micOff(); stopPlayer(); profile = null; clearConsent(); resetTake(); $('bout').hidden = true; render(); };
$('profiles').onchange = () => action(async () => { await micOff(); stopPlayer(); profile = $('profiles').value ? await api(`/profiles/${$('profiles').value}`) : null; selectGuide(); clearConsent(); resetTake(); if (profile) { $('announcer').checked = profile.approved_roles.includes('ANNOUNCER'); $('commentator').checked = profile.approved_roles.includes('COMMENTATOR'); $('publicationDisclosure').checked = profile.publication_disclosure; } });
$('sampleIndex').onchange = () => action(async () => { if (take) { $('sampleIndex').value = String(sampleIndex); return; } await micOff(); stopPlayer(); pendingNext = null; saveReceipt = ''; sampleIndex = Number($('sampleIndex').value); resetTake(); status('Sentence selected. Enable your microphone, then press Record when ready.'); });
$('enableMic').onclick = () => action(enableMic);
$('disableMic').onclick = () => action(async () => { await micOff(); status('Microphone off. Existing take retained.'); });
$('captureMode').onchange = () => action(async () => { await micOff(); status('Capture mode changed. Press Enable microphone to apply it; existing take is unchanged.'); });
$('microphones').onchange = () => action(enableMic);
$('record').onclick = startRecording; $('stopRecord').onclick = finishRecording;
$('playTake').onclick = () => action(() => play(take));
$('rerecord').onclick = () => { if (busy || recording || !take || !confirm('Discard this unsaved recording? It will not be saved.')) return; stopPlayer(); saveReceipt = ''; resetTake(); status('Unsaved take discarded. Saved recordings are unchanged. Enable the microphone and press Record for a new take.'); };
$('acceptSample').onclick = () => action(async () => {
  if (!take || !quality?.good || !$('confirmedText').checked) return;
  try {
    profile = await post('samples', { index: sampleIndex, prompt_text: guide()[sampleIndex % guide().length].text, audio: await toBase64(take), confirmed_text: $('confirmedText').checked });
  } catch (error) { takeError = `NOT SAVED: ${error.message}. Your take is still in this tab; it has not been discarded.`; throw error; }
  saveReceipt = `Saved successfully on server — ${profile.samples.length} recordings now saved in this profile.`;
  pendingNext = nextSentence(profile);
  resetTake();
  status(pendingNext === null ? `All ${guide().length} sentences saved. You can now create your reusable voice prompt.` : `Sentence saved privately. Take a breath, then choose “Ready for sentence ${pendingNext + 1}” when you want to continue.`);
  if (pendingNext !== null) $('nextSentence').focus();
});
$('nextSentence').onclick = () => {
  if (busy || recording || pendingNext === null) return;
  stopPlayer(); sampleIndex = pendingNext; pendingNext = null;
  $('sampleIndex').value = String(sampleIndex); resetTake();
  $('guideTitle').focus();
  status(`Sentence ${sampleIndex + 1} of ${guide().length} is ready. Enable your microphone and press Record when you are ready; nothing starts automatically.`);
};
$('build').onclick = () => action(async () => { await micOff(); status('Creating a reusable reference prompt. Model weights are not being trained.'); profile = await post('build'); await refreshProfiles(); status('Prompt created, but voice is NOT accepted. Generate and listen to a comparison.'); });
$('generateTest').onclick = () => action(async () => { status('Generating new speech from the saved reference prompt…'); profile = await post('test'); status('Test generated. Listen to the original AND synthetic clip, then decide for yourself.'); });
for (const [button, kind] of [['playOriginal', 'original'], ['playSynthetic', 'synthetic']]) $(button).onclick = () => action(async () => {
  const p = profile, t = p.tests.at(-1), asset = kind === 'original' ? `sample-${p.selected_sample}.wav` : `test-${t.id}.wav`;
  const blob = await api(`/profiles/${p.profile_id}/${asset}`);
  await play(blob, () => action(async () => {
    if (profile?.profile_id !== p.profile_id) return;
    profile = await post('heard', { test_id: t.id, kind }); status(`${kind === 'original' ? 'Original' : 'Synthetic'} playback completed. Final likeness judgement belongs to you.`);
  }));
});
$('acceptVoice').onclick = () => action(async () => { profile = await post('accept', { accept: true, test_id: profile.tests.at(-1).id }); await refreshProfiles(); status('You accepted this voice. Choose its presentation roles below.'); });
$('saveRoles').onclick = () => action(async () => { profile = await post('roles', { roles: [...($('announcer').checked ? ['ANNOUNCER'] : []), ...($('commentator').checked ? ['COMMENTATOR'] : [])], publication_disclosure: $('publicationDisclosure').checked }); status('Role assignment saved. No authority identity has changed.'); });
for (const [button, route] of [['addSample', 'add-sample'], ['requalify', 'requalify'], ['reject', 'reject']]) $(button).onclick = () => action(async () => {
  if (take || (route === 'add-sample' && profile.qualification_status === 'RECORDING')) return;
  if (!confirm('This removes acceptance and role assignment, and deletes existing qualification/generated role audio. Continue?')) return;
  stopPlayer(); await micOff(); profile = await post(route); selectGuide(); saveReceipt = ''; resetTake(); await refreshProfiles(); status('Profile invalidated. Fresh qualification and explicit acceptance are required.');
});
async function deleteProfile(reenrol) {
  if (!confirm('Delete this profile, all raw takes, conditioning data, comparisons and generated role audio? This cannot be undone by the application.')) return;
  stopPlayer(); await micOff(); await api(`/profiles/${profile.profile_id}`, 'DELETE'); profile = null; clearConsent(); resetTake(); await refreshProfiles(); $('bout').hidden = true;
  status(reenrol ? 'Previous profile deleted. Re-enrol through fresh consent.' : 'Voice and associated private audio deleted.');
}
$('deleteVoice').onclick = () => action(() => deleteProfile(false)); $('reenrol').onclick = () => action(() => deleteProfile(true));
window.addEventListener('pagehide', () => { stream?.getTracks().forEach(t => t.stop()); key = ''; stopPlayer(); });
window.addEventListener('beforeunload', event => { if (take || recording) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden && recording) finishRecording(); });

// Real qualification uses the existing ConversationEngine/API. Presentation
// speech is separate, never a competitor/authority. Stop remains available.
const log = text => { $('boutLog').textContent += `${text}\n\n`; $('boutLog').scrollTop = $('boutLog').scrollHeight; };
function checkBout() { if (boutCancelled) throw Error('Bout stopped by operator'); }
async function waitForPlayback(blob) {
  checkBout();
  await new Promise((resolve, reject) => {
    const poll = setInterval(() => { if (boutCancelled) { clearInterval(poll); reject(Error('Bout stopped')); } }, 150);
    const done = () => { clearInterval(poll); resolve(); };
    play(blob, done).catch(e => { clearInterval(poll); reject(e); });
    $('player').onerror = () => { clearInterval(poll); reject(Error('Audio playback failed — bout halted')); };
  });
}
async function announce(role, text) {
  checkBout(); log(`${role} · Synthetic voice — authorised profile\n${text}`);
  const event = await post('speak', { role, text }); checkBout(); boutEvidence.presentation.push(event);
  await waitForPlayback(await api(`/profiles/${profile.profile_id}/role-${event.id}.wav`));
}
$('stopBout').onclick = () => { boutCancelled = true; stopPlayer(); if (activeConversation) api(`api/conversations/${activeConversation.id}/stop`, 'POST', {}, false).catch(() => {}); };
$('runBout').onclick = () => action(async () => {
  boutCancelled = false; activeConversation = null; $('boutLog').textContent = ''; $('stopBout').disabled = false; $('exportBout').disabled = true;
  const premise = $('boutPremise').value.trim(); if (!premise) throw Error('Enter a proposition');
  const modelA = $('modelA').value, modelB = $('modelB').value;
  boutEvidence = { started_at: new Date().toISOString(), profile_id: profile.profile_id, disclosure: profile.disclosure, presentation: [], status: 'STARTED' };
  try {
    await announce('ANNOUNCER', `Welcome to LLM Fight Club. Our proposition is: ${premise}`);
    await announce('ANNOUNCER', `Competitor A uses ${modelA}. Competitor B uses ${modelB}. This is a single-round debate. Let us hear their arguments.`);
    const app = await api('api/config', 'GET', null, false);
    activeConversation = await api('api/conversations', 'POST', { format: 'DEBATE', premise, turnLimit: 2, style: 'SERIOUS', conversationHeat: 'CALM', interruptionLevel: 'OFF', outputMode: 'TEXT',
      participants: [{ id: crypto.randomUUID(), name: 'Competitor A', role: 'for', model: modelA, voice: 'live-interviewer', personality: { ...app.personalities[0], name: 'Competitor A' } },
        { id: crypto.randomUUID(), name: 'Competitor B', role: 'against', model: modelB, voice: 'live-guest', personality: { ...app.personalities[1], name: 'Competitor B' } }] }, false);
    boutEvidence.conversation_id = activeConversation.id;
    await announce('ANNOUNCER', 'Round one begins now. Each competitor will give an opening argument.');
    for (let index = 0; index < 2; index++) {
      checkBout(); const result = await api(`api/conversations/${activeConversation.id}/next`, 'POST', {}, false); checkBout();
      log(`${result.turn.speaker} · ${result.turn.model}\n${result.turn.text}`);
      // The real model argument stays in its own voice, never cloned Loz.
      const response = await fetch(new URL('tts/synthesize', base), { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: result.turn.text, voice: result.turn.voice, profile: 'LIVE_FAST', conversationId: activeConversation.id, turnId: result.turn.turn_id }) });
      if (!response.ok) throw Error('Competitor TTS unavailable — bout halted without a result');
      await waitForPlayback(await response.blob()); checkBout();
      activeConversation = await api(`api/conversations/${activeConversation.id}/complete-playback`, 'POST', { turnId: result.turn.turn_id, durationMs: Math.round($('player').duration * 1000), ttsProvider: 'qualification-existing-router' }, false);
    }
    checkBout(); const result = await api('/judge', 'POST', { conversation_id: activeConversation.id }); checkBout();
    boutEvidence.result = result; boutEvidence.transcript = activeConversation.transcript;
    log(`LLM judge (${result.judge_model}) — A ${result.score_a}/10, B ${result.score_b}/10\n${result.reason}`);
    await announce('COMMENTATOR', `The judge awarded competitor A ${result.score_a} points out of ten, and competitor B ${result.score_b}. ${result.reason}`);
    await announce('ANNOUNCER', result.winner === 'TIE' ? 'The judge has declared a tie. Thank you to both competitors.' : `According to the LLM judge, the winner is competitor ${result.winner}. Thank you for joining this round of Fight Club.`);
    boutEvidence.status = 'COMPLETED'; status('Real bout completed. This is technical/playback evidence, not proof of human voice likeness.');
  } catch (error) {
    boutEvidence.status = boutCancelled ? 'STOPPED' : 'FAILED'; boutEvidence.error = error.message;
    if (activeConversation && activeConversation.state !== 'COMPLETED') await api(`api/conversations/${activeConversation.id}/stop`, 'POST', {}, false).catch(() => {});
    throw error;
  } finally { $('stopBout').disabled = true; $('exportBout').disabled = false; boutEvidence.finished_at = new Date().toISOString(); }
});
$('exportBout').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(boutEvidence, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'voice-lab-bout-evidence.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
};
clearConsent(); render();
