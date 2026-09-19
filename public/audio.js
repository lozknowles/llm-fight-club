import { pcmS16leToWav } from './audio-format.js';
import { controlAvailability } from './control-state.js';
import { playbackDuration } from './playback-duration.js';
import { ArchiveReplay } from './archive-replay.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const appBase = new URL('.', window.location.href).pathname;
const endpoint = (pathname) => `${appBase}${pathname.replace(/^\//, '')}`;
const ttsBase = endpoint('/tts');
const speechProfile = new URLSearchParams(window.location.search).get('profile') || 'LIVE_FAST';
const disclosure = document.querySelector('body > p');
if (disclosure) disclosure.textContent = 'AI-generated synthetic voices · turn-based audio · unscripted personalities';

let config;
let conversation;
let archivedView = false;
let voices = [];
let voiceOptions = [];
let voiceProfiles = [];
let audioUrl = null;
let startedAt = 0;
let settled = false;
let completionWatch = null;
let streamAbort = null;
let playbackGeneration = 0;
let activeSources = [];
let scheduledEnd = 0;
let streamComplete = false;
let previousSpeechEndedAt = null;
let metrics = {};
let currentTurn = null;
let bargeMonitor = null;
let bargeBusy = false;
let bargeGeneration = 0;
let bargeCheckpointIndex = 0;
let pendingInterruptionTiming = null;
const player = $('#player');
const archivePlayer = $('#archivePlayer');
const replay = new ArchiveReplay(archivePlayer, {
  url: (id, turn) => endpoint(`/api/conversations/${id}/playback/${turn}.wav`),
  onState: ({state,index,count,turn}) => {
    $('#replayStatus').textContent = `${state}${turn ? ` · saved turn ${index+1}/${count} · ${turn.speaker}` : ''}`;
    $('#replayCaption').textContent = turn?.text || '';
    $('#replaySkip').disabled = index < 0 || index + 1 >= count;
    $('#replayStop').disabled = index < 0;
  },
});
const canReplay = () => archivedView || ['COMPLETED','STOPPED','ERROR','PAUSED'].includes(conversation?.state);
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioContext = AudioContextClass ? new AudioContextClass({ latencyHint: 'interactive', sampleRate: 24000 }) : null;
const speechGain = audioContext ? audioContext.createGain() : null;
if (speechGain) speechGain.connect(audioContext.destination);
const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
let grenadeRecognition = null;
const heatLevels = ['DOCILE', 'CALM', 'BALANCED', 'HEATED', 'FURIOUS'];
const heatDescriptions = {
  DOCILE: 'Patient, conciliatory and willing to give ground.',
  CALM: 'Polite disagreement with measured delivery.',
  BALANCED: 'Natural challenge, humour and occasional interruption.',
  HEATED: 'Forceful counterarguments, impatience and sharper interruptions.',
  FURIOUS: 'Combative, emphatic and ready to cut in on a real point of conflict.',
};

function selectedHeat() {
  return heatLevels[Math.max(0, Math.min(4, Number($('#conversationHeat').value) - 1))];
}

function renderHeat(heat = selectedHeat()) {
  const normalized = heatLevels.includes(heat) ? heat : 'BALANCED';
  $('#conversationHeat').value = String(heatLevels.indexOf(normalized) + 1);
  $('#heatValue').textContent = normalized;
  $('#heatDescription').textContent = config?.conversationHeat?.[normalized]?.description || heatDescriptions[normalized];
  const ended = conversation && ['STOPPED', 'COMPLETED', 'ERROR'].includes(conversation.state);
  $('#conversationHeat').disabled = Boolean(ended);
  $('#heatPanel').dataset.heat = normalized;
}

async function api(path, method = 'GET', payload) {
  const response = await fetch(endpoint(path), {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function responseMetrics(response, began) {
  let attempts = [];
  try { attempts = JSON.parse(decodeURIComponent(response.headers.get('x-tts-attempts') || '%5B%5D')); } catch {}
  return {
    profile: response.headers.get('x-tts-profile') || speechProfile,
    provider: response.headers.get('x-tts-provider') || 'unknown',
    model: response.headers.get('x-tts-model') || 'unknown',
    fallback: response.headers.get('x-tts-fallback') === 'true',
    audio_prefetched: response.headers.get('x-tts-prefetched') === 'true',
    attempts,
    response_headers_ms: Math.round(performance.now() - began),
    router_first_byte_ms: Number(response.headers.get('x-tts-first-byte-ms')) || null,
    first_byte_ms: null,
    first_decodable_ms: null,
    first_playable_ms: null,
    stream_complete_ms: null,
    audio_duration_ms: Number(response.headers.get('x-tts-audio-duration-ms')) || null,
    model_load_ms: Number(response.headers.get('x-tts-load-ms')) || null,
    synthesis_ms: Number(response.headers.get('x-tts-generation-ms')) || null,
    real_time_factor: Number(response.headers.get('x-tts-rtf')) || null,
    peak_vram_mb: Number(response.headers.get('x-tts-peak-vram-mb')) || null,
    ram_mb: Number(response.headers.get('x-tts-ram-mb')) || null,
    inter_speaker_silence_ms: null,
  };
}

function clearBargeMonitor() {
  if (bargeMonitor) clearInterval(bargeMonitor);
  bargeMonitor = null;
  bargeBusy = false;
  bargeGeneration += 1;
}

function heardWordCount(turn, fraction) {
  const count = String(turn.text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.min(count - 1, Math.floor(count * Math.max(0, Math.min(.98, fraction)))));
}

function playbackFraction(turn) {
  const estimatedDurationMs = Math.max(1800, String(turn.text || '').split(/\s+/).length / (2.45 * (turn.speech_rate || 1)) * 1000);
  const durationMs = Number.isFinite(player.duration) && player.duration > 0 ? player.duration * 1000 : estimatedDurationMs;
  const elapsedMs = Number.isFinite(player.currentTime) && player.currentTime > 0 ? player.currentTime * 1000 : Math.max(0, performance.now() - startedAt);
  return Math.max(0, Math.min(.98, elapsedMs / durationMs));
}

async function reportInterruptionAudible(turn) {
  if (!turn?.autonomous_interruption || !turn.interruption_id || !pendingInterruptionTiming) return;
  const now = performance.now();
  api(`/api/conversations/${conversation.id}/barge-in/audible`, 'POST', {
    interruptionId: turn.interruption_id,
    decisionToListenerAudioMs: Math.round(now - pendingInterruptionTiming.decidedAt),
    claimToListenerAudioMs: Math.round(now - pendingInterruptionTiming.claimBeganAt),
  }).catch(() => {});
  pendingInterruptionTiming = null;
}

async function duckAndStop() {
  if (conversation.interruptionAudio === 'HARD_CUT') {
    stopAudio();
    return 0;
  }
  const began = performance.now();
  if (!player.paused) {
    for (const volume of [.65, .35, .12]) {
      player.volume = volume;
      await new Promise((resolve) => setTimeout(resolve, 55));
    }
  }
  if (speechGain && audioContext) {
    speechGain.gain.cancelScheduledValues(audioContext.currentTime);
    speechGain.gain.setValueAtTime(speechGain.gain.value, audioContext.currentTime);
    speechGain.gain.linearRampToValueAtTime(.05, audioContext.currentTime + .16);
    await new Promise((resolve) => setTimeout(resolve, 165));
  }
  stopAudio();
  return Math.round(performance.now() - began);
}

async function evaluateCheckpoint(turn, fraction, checkpoint, generation) {
  if (bargeBusy || settled || generation !== bargeGeneration || conversation.interruptionLevel === 'OFF') return;
  bargeBusy = true;
  const playbackMs = startedAt ? Math.max(0, Math.round(performance.now() - startedAt)) : 0;
  try {
    const result = await api(`/api/conversations/${conversation.id}/barge-in/evaluate`, 'POST', {
      turnId: turn.turn_id,
      heardWordCount: heardWordCount(turn, fraction),
      playbackMs,
      checkpoint,
    });
    if (generation !== bargeGeneration || settled || !conversation.awaitingPlayback || conversation.transcript.at(-1)?.turn_id !== turn.turn_id) return;
    conversation = result.conversation;
    const decision = result.decision;
    $('#bargeInStatus').textContent = `${decision.action}: ${decision.participantName || 'listeners'} — ${decision.reason} (${decision.monitorLatencyMs || 0} ms)`;
    if (decision.action !== 'INTERRUPT') return;
    settled = true;
    clearBargeMonitor();
    if (completionWatch) clearInterval(completionWatch);
    completionWatch = null;
    const decidedAt = performance.now();
    const cancelLatencyMs = await duckAndStop();
    const actualHeardWordCount = heardWordCount(turn, playbackFraction(turn));
    const committed = await api(`/api/conversations/${conversation.id}/barge-in/commit`, 'POST', {
      turnId: turn.turn_id,
      playbackMs: Math.max(0, Math.round(performance.now() - startedAt)),
      heardWordCount: actualHeardWordCount,
      overlapMs: 0,
      cancelLatencyMs,
      commitLatencyMs: Math.round(performance.now() - decidedAt),
    });
    conversation = committed.conversation;
    pendingInterruptionTiming = { decidedAt, claimBeganAt: startedAt };
    $('#bargeInStatus').textContent = `${committed.event.interrupterId === decision.participantId ? decision.participantName : 'Listener'} interrupted: ${decision.reason}`;
    render();
    await next();
  } catch (error) {
    if (generation === bargeGeneration && error.name !== 'AbortError') $('#bargeInStatus').textContent = `Listener deferred: ${error.message}`;
  } finally {
    bargeBusy = false;
  }
}

function startBargeMonitor(turn) {
  clearBargeMonitor();
  if (!turn || conversation.interruptionLevel === 'OFF' || turn.autonomous_interruption || turn.interruption_reaction) return;
  const checkpoints = {
    CALM: [.58, .82],
    BALANCED: [.32, .56, .79],
    HEATED: [.24, .43, .63, .82],
    FURIOUS: [.18, .32, .47, .62, .78],
  }[conversation.conversationHeat] || [.32, .56, .79];
  const generation = bargeGeneration;
  bargeCheckpointIndex = 0;
  bargeMonitor = setInterval(() => {
    if (settled || generation !== bargeGeneration || bargeCheckpointIndex >= checkpoints.length) return;
    const fraction = playbackFraction(turn);
    const target = checkpoints[bargeCheckpointIndex];
    if (fraction < target) return;
    bargeCheckpointIndex += 1;
    evaluateCheckpoint(turn, fraction, `H${conversation.heatRevision || 0}-P${bargeCheckpointIndex}`, generation);
  }, 150);
}

function speechBegan(turn) {
  render();
  reportInterruptionAudible(turn);
  startBargeMonitor(turn);
  if (conversation?.id) api(`/api/conversations/${conversation.id}/prefetch`, 'POST', { turnId: turn.turn_id }).catch(() => {});
}

function pcmFloats(bytes, carry) {
  const merged = new Uint8Array(carry.length + bytes.length);
  merged.set(carry);
  merged.set(bytes, carry.length);
  const usable = merged.length - (merged.length % 2);
  const view = new DataView(merged.buffer, merged.byteOffset, usable);
  const samples = new Float32Array(usable / 2);
  for (let index = 0; index < samples.length; index += 1) samples[index] = view.getInt16(index * 2, true) / 32768;
  return { samples, carry: merged.slice(usable) };
}

async function previewAudioBlob(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (response.headers.get('x-audio-format') === 'pcm_s16le_24000_mono') {
    return new Blob([pcmS16leToWav(bytes)], { type: 'audio/wav' });
  }
  return new Blob([bytes], { type: response.headers.get('content-type') || 'audio/wav' });
}

async function streamPcm(response, began, generation) {
  if (!audioContext) throw new Error('Web Audio is unavailable in this browser');
  if (conversation?.state !== 'PAUSED') await audioContext.resume();
  const reader = response.body.getReader();
  let carry = new Uint8Array();
  let totalSamples = 0;
  let firstScheduled = false;
  scheduledEnd = audioContext.currentTime + 0.055;
  streamComplete = false;
  activeSources = [];
  while (true) {
    const chunk = await reader.read();
    if (generation !== playbackGeneration) { await reader.cancel(); return; }
    if (chunk.done) break;
    if (metrics.first_byte_ms == null) metrics.first_byte_ms = Math.round(performance.now() - began);
    const decoded = pcmFloats(chunk.value, carry);
    carry = decoded.carry;
    if (!decoded.samples.length) continue;
    if (metrics.first_decodable_ms == null) metrics.first_decodable_ms = Math.round(performance.now() - began);
    const buffer = audioContext.createBuffer(1, decoded.samples.length, 24000);
    buffer.copyToChannel(decoded.samples, 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(speechGain || audioContext.destination);
    const startAt = Math.max(scheduledEnd, audioContext.currentTime + 0.025);
    source.start(startAt);
    scheduledEnd = startAt + buffer.duration;
    activeSources.push(source);
    totalSamples += decoded.samples.length;
    if (!firstScheduled) {
      firstScheduled = true;
      metrics.pcm_started_at = startAt;
      const untilStartMs = Math.max(0, (startAt - audioContext.currentTime) * 1000);
      metrics.first_playable_ms = Math.round(performance.now() - began + untilStartMs);
      startedAt = performance.now() + untilStartMs;
      metrics.inter_speaker_silence_ms = previousSpeechEndedAt == null ? null : Math.max(0, Math.round(startedAt - previousSpeechEndedAt));
      speechBegan(currentTurn);
    }
  }
  streamComplete = true;
  metrics.stream_complete_ms = Math.round(performance.now() - began);
  metrics.audio_duration_ms = Math.round(totalSamples / 24);
  completionWatch = setInterval(() => {
    if (streamComplete && audioContext.currentTime >= scheduledEnd - 0.01) finish(false);
  }, 25);
}

async function playContainer(response, began, generation, turnId) {
  const chunks = [];
  const reader = response.body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (generation !== playbackGeneration) { await reader.cancel(); return; }
    if (chunk.done) break;
    if (metrics.first_byte_ms == null) metrics.first_byte_ms = Math.round(performance.now() - began);
    chunks.push(chunk.value);
  }
  metrics.first_decodable_ms = Math.round(performance.now() - began);
  metrics.stream_complete_ms = metrics.first_decodable_ms;
  audioUrl = URL.createObjectURL(new Blob(chunks, { type: response.headers.get('content-type') || 'audio/wav' }));
  player.src = audioUrl;
  player.volume = 1;
  player.onplay = () => {
    if (generation !== playbackGeneration || startedAt) return;
    startedAt = performance.now();
    metrics.first_playable_ms = Math.round(startedAt - began);
    metrics.inter_speaker_silence_ms = previousSpeechEndedAt == null ? null : Math.max(0, Math.round(startedAt - previousSpeechEndedAt));
    speechBegan(currentTurn);
  };
  player.onended = () => { if (generation === playbackGeneration) finish(false, turnId); };
  player.onerror = () => { $('#error').textContent = 'Audio playback failed'; };
  if (conversation?.state !== 'PAUSED') await player.play();
}

async function speech(turn, generation) {
  currentTurn = turn;
  if (speechGain) speechGain.gain.value = 1;
  const began = performance.now();
  streamAbort = new AbortController();
  const slowNotice = setTimeout(() => {
    if (conversation?.awaitingPlayback) {
      $('#status').textContent = `${conversation.format} · ACTIVE · ${conversation.transcript.length}/${conversation.turnLimit} · VOICE STILL PREPARING…`;
    }
  }, 3000);
  let response;
  try {
    response = await fetch(`${ttsBase}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: turn.text,
        voice: turn.voice,
        deliveryHints: turn.delivery_hints || [],
        delivery: $('#delivery').value,
        format: conversation.format,
        style: conversation.style,
        role: turn.role,
        speechRate: turn.speech_rate || 1,
        profile: speechProfile,
        conversationId: conversation.id,
        turnId: turn.turn_id,
      }),
      signal: streamAbort.signal,
    });
  } finally {
    clearTimeout(slowNotice);
  }
  if (!response.ok) throw new Error(`TTS ${response.status}: ${await response.text()}`);
  if (generation !== playbackGeneration) { await response.body?.cancel(); return; }
  metrics = responseMetrics(response, began);
  if (response.headers.get('x-audio-format') === 'pcm_s16le_24000_mono') await streamPcm(response, began, generation);
  else await playContainer(response, began, generation, turn.turn_id);
}

function roles() {
  const selected = {
    INTERVIEW: [['interviewer', 'INTERVIEWER'], ['guest', 'GUEST']],
    DEBATE: [['for', 'FOR'], ['against', 'AGAINST']],
    PANEL: [['host', 'INTRODUCER / HOST'], ['panelist', 'PANELIST 1'], ['panelist', 'PANELIST 2']],
    CROSS_EXAMINATION: [['examiner', 'EXAMINER'], ['witness', 'WITNESS']],
  }[$('#format').value];
  if ($('#format').value === 'DEBATE' && $('#refereeEnabled').value === 'true') selected.push(['referee', 'REFEREE']);
  return selected;
}

function configure() {
  const list = roles();
  $$('.participant').forEach((card, index) => {
    card.dataset.role = list[index]?.[0] || '';
    card.querySelector('h2').textContent = list[index]?.[1] || '';
    card.style.display = list[index] ? 'block' : 'none';
  });
  $('#third').style.display = list.length === 3 ? 'block' : 'none';
  $('#refereeOption').hidden = $('#format').value !== 'DEBATE';
  $('#setup .primary').textContent = `START ${$('#format').value.replace('_', ' ')}`;
}

function fill() {
  for (const select of $$('.model')) select.innerHTML = config.models.map((model) => `<option>${model}</option>`).join('');
  for (const select of $$('.personality')) select.innerHTML = config.personalities.map((profile) => `<option value="${profile.id}">${profile.name}</option>`).join('');
  for (const select of $$('.voice')) select.replaceChildren(...voiceOptions.map(voice => new Option(voice.label, voice.id)));
  $$('.personality')[0].value = 'mara-vale';
  $$('.personality')[1].value = 'cedric-pump';
  $$('.personality')[2].value = 'nina-quark';
  if (config.models[1]) $$('.model')[1].value = config.models[1];
  const premiumDefaults = ['eleven-interviewer', 'eleven-guest', 'eleven-host'];
  const liveDefaults = ['live-interviewer', 'live-guest', 'live-host'];
  const omniDefaults = ['omnivoice-moderator', 'omnivoice-challenger', 'omnivoice-analyst'];
  const csmDefaults = ['csm-fighter-a', 'csm-fighter-b', 'csm-mallow'];
  const defaults = speechProfile.toUpperCase() === 'CSM' && csmDefaults.every(id=>voices.includes(id)) ? csmDefaults : speechProfile.toUpperCase() === 'OMNIVOICE' && omniDefaults.every((id) => voices.includes(id))
    ? omniDefaults : liveDefaults.every((id) => voices.includes(id)) ? liveDefaults : premiumDefaults;
  $$('.voice').forEach((select, index) => { select.value = defaults[index] || voices[index]; });
  $$('.personality').forEach((select) => {
    const updateSummary = () => {
      const profile = config.personalities.find((item) => item.id === select.value);
      select.closest('.participant').querySelector('.personality-summary').textContent = profile?.description || '';
    };
    select.onchange = updateSummary;
    updateSummary();
  });
}

function participant(card) {
  const personality = config.personalities.find((profile) => profile.id === card.querySelector('.personality').value);
  const customPrompt = card.querySelector('.personality-prompt').value.trim();
  const voice = card.querySelector('.voice').value;
  return {
    id: crypto.randomUUID(),
    name: personality.name,
    role: card.dataset.role,
    model: card.querySelector('.model').value,
    voice,
    voiceProfile: voiceProfiles.find((profile) => profile.id === voice) || null,
    speechRate: Number(card.querySelector('.speech-rate').value),
    personality: { ...personality, customPrompt },
  };
}

function render() {
  if (!conversation) return;
  renderHeat(conversation.conversationHeat);
  const csmCount=conversation.participants.filter(p=>p.voice.startsWith('csm-')).length;
  const displayedProfile=csmCount ? (csmCount===conversation.participants.length?'CSM':'MIXED VOICES') : (conversation.speechProfile||speechProfile);
  $('#status').textContent = `${conversation.format} · ${conversation.state} · ${conversation.transcript.length}/${conversation.turnLimit} · ${conversation.conversationHeat} · ${displayedProfile}`;
  const controls = controlAvailability(conversation);
  if (archivedView) Object.keys(controls).forEach(key => controls[key] = false);
  const replayAllowed = canReplay();
  if (archivedView) $('#conversationHeat').disabled = true;
  $('#pause').disabled = !controls.pause;
  $('#resume').disabled = !controls.resume;
  $('#skip').disabled = !controls.skip;
  $('#stop').disabled = !controls.stop;
  $('#grenadeText').disabled = !controls.intervention;
  $('#grenadeThrow').disabled = !controls.intervention;
  $('#grenadeMic').disabled = !controls.intervention || !SpeechRecognitionClass;
  $('#transcript').innerHTML = conversation.transcript.map((turn, index) => {
    const participantIndex = conversation.participants.findIndex((item) => item.id === turn.speaker_id);
    const speaking = conversation.awaitingPlayback && index === conversation.transcript.length - 1 ? 'speaking' : '';
    const live = index === conversation.transcript.length - 1 && conversation.awaitingPlayback
      ? ` · first playable ${metrics.first_playable_ms ?? 'waiting'} ms · provider ${metrics.provider || 'routing'}`
      : '';
    const audio = turn.audio_file ? ` · <button type="button" data-replay-turn="${escapeHtml(turn.turn_id)}" ${replayAllowed?'':'disabled'}>Replay turn ${index+1}</button>${turn.audio_export_allowed !== false ? ` · <a href="${endpoint(`/api/conversations/${conversation.id}/audio/${turn.turn_id}.wav`)}" download="turn-${turn.turn_index + 1}.wav">Download WAV</a>` : ''}` : '';
    const interruption = turn.programme_introduction ? ' · programme introduction' : turn.interrupted ? ` · interrupted by ${escapeHtml(turn.interrupted_by_name || 'listener')}` : turn.autonomous_interruption ? ' · autonomous interruption' : turn.interruption_reaction ? ' · interruption response' : '';
    return `<article class="turn ${speaking}" style="--accent:${['#63d2ff', '#ff6b9a', '#ffd166'][participantIndex % 3]}">
      <b>${escapeHtml(turn.speaker)}</b> <span class="meta">${escapeHtml(turn.role)} · ${escapeHtml(turn.model)} · voice ${escapeHtml(turn.voice)} · voice speed ${turn.speech_rate || 1}×</span>
      <p>${conversation.outputMode === 'VOICE' ? '<i>Transcript retained in exports.</i>' : escapeHtml(turn.text)}</p>
      <span class="meta">LLM ${turn.generation_latency_ms} ms · playback ${turn.audio_duration_ms ?? 'in progress'} ms${interruption}${live}${audio}</span>
    </article>`;
  }).join('');
  const transcriptWindow = $('#transcript');
  transcriptWindow.hidden = false;
  requestAnimationFrame(() => { transcriptWindow.scrollTop = transcriptWindow.scrollHeight; });
  const latestDecision = (conversation.interruptionTelemetry || []).at(-1);
  if (latestDecision && !conversation.awaitingPlayback) $('#bargeInStatus').textContent = `${latestDecision.action}: ${latestDecision.participantName || 'listeners'} — ${latestDecision.reason}`;
  $('#grenadeHistory').innerHTML = (conversation.audienceInterventions || []).slice().reverse().map((item) => {
    const pending = item.pendingParticipantIds?.length || 0;
    return `<div class="intervention"><b>💣 Audience curve ball</b><p>${escapeHtml(item.text)}</p><span class="meta">${pending ? `${pending} participant${pending === 1 ? '' : 's'} still to address it` : 'Addressed by everyone'}</span></div>`;
  }).join('');
  const audioReady = conversation.audio?.status === 'ready';
  replay.setConversation(conversation);
  $('#jsonExport').href = endpoint(`/api/conversations/${conversation.id}/export.json`);
  $('#mdExport').href = endpoint(`/api/conversations/${conversation.id}/export.md`);
  $('#audioExport').href = endpoint(`/api/conversations/${conversation.id}/conversation.mp3`);
  $('#audioExport').hidden = !audioReady;
  $('#archivePlayback').hidden = false;
  $('#replayAll').disabled = !replayAllowed || !replay.turns.length;
  $('#archiveNotice').textContent = `${replay.turns.length}/${conversation.transcript.length} turns have saved audio. Replay uses those files, without generating speech again. ${!replayAllowed?'Pause or finish the conversation before replaying. ':''}${conversation.transcript.some(t=>t.audio_export_allowed===false)?'Private CSM replay is available; CSM downloads remain disabled pending watermark/export qualification.':audioReady?'Use Conversation MP3 to save the whole conversation, or Download WAV beside a turn.':'MP3 is available once permitted audio export has completed.'}`;
  $('#savedConversationLink').href = `${endpoint('/audio.html')}?conversation=${encodeURIComponent(conversation.id)}`;
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = String(value);
  return node.innerHTML;
}

function stopAudio() {
  playbackGeneration++;
  player.onended = null; player.onplay = null; player.onerror = null;
  clearBargeMonitor();
  player.pause();
  if (streamAbort) streamAbort.abort();
  streamAbort = null;
  for (const source of activeSources) {
    try { source.stop(); } catch {}
  }
  activeSources = [];
}

async function finish(skipped = false, expectedTurnId = currentTurn?.turn_id) {
  if (expectedTurnId !== currentTurn?.turn_id || (!skipped && !startedAt)) return;
  if (settled) return;
  settled = true;
  clearBargeMonitor();
  if (completionWatch) clearInterval(completionWatch);
  completionWatch = null;
  previousSpeechEndedAt = performance.now();
  const durationMs = playbackDuration({ skipped, started: Boolean(startedAt),
    mediaDuration: Number.isFinite(player.duration) ? player.duration * 1000 : metrics.audio_duration_ms,
    mediaPosition: Number.isFinite(metrics.pcm_started_at) ? Math.max(0, (audioContext.currentTime - metrics.pcm_started_at) * 1000) : Number.isFinite(player.currentTime) ? player.currentTime * 1000 : 0,
    pcmDuration: metrics.audio_duration_ms });
  player.onended = null;
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
  conversation = await api(`/api/conversations/${conversation.id}/complete-playback`, 'POST', {
    durationMs,
    turnId: expectedTurnId,
    skipped,
    ttsProvider: metrics.provider,
    ttsLatencyMs: metrics.first_playable_ms,
    ttsMetrics: metrics,
  });
  render();
  if (!['COMPLETED', 'STOPPED'].includes(conversation.state)) await next();
}

async function play(turn) {
  stopAudio();
  player.removeAttribute('src'); player.load();
  const generation = playbackGeneration;
  if (completionWatch) clearInterval(completionWatch);
  completionWatch = null;
  settled = false;
  startedAt = 0;
  try {
    await speech(turn, generation);
  } catch (error) {
    if (error.name === 'AbortError' || generation !== playbackGeneration) return;
    stopAudio();
    $('#error').textContent = `${error.message}. Use “Skip speech” to continue.`;
    $('#status').textContent = `${conversation.format} · VOICE ERROR · ${conversation.transcript.length}/${conversation.turnLimit}`;
    $('#retry').hidden = false;
  }
}

async function next() {
  if (!conversation || conversation.awaitingPlayback || ['PAUSED', 'COMPLETED', 'STOPPED'].includes(conversation.state)) return;
  $('#status').textContent = 'Preparing next speaker…';
  $('#retry').hidden = true;
  try {
    const result = await api(`/api/conversations/${conversation.id}/next`, 'POST', {});
    conversation = result.conversation;
    currentTurn = result.turn;
    metrics = {};
    $('#error').textContent = '';
    render();
    if (conversation.outputMode === 'TEXT') {
      settled = false;
      startedAt = performance.now();
      metrics = { provider: 'text-only', audio_duration_ms: 0, first_playable_ms: 0 };
      await finish(true);
    }
    else await play(result.turn);
  } catch (error) {
    $('#error').textContent = error.message;
    $('#status').textContent = `${conversation.format} · RESPONSE ERROR · retry is available`;
    $('#retry').hidden = false;
  }
}

$('#setup').onsubmit = async (event) => {
  event.preventDefault();
  try {
    replay.stop(); archivedView = false;
    $('#error').textContent = '';
    if (audioContext) await audioContext.resume();
    const participants = $$('.participant').filter((card) => card.style.display !== 'none').map(participant);
    if (new Set(participants.map((item) => item.voice)).size !== participants.length) throw new Error('Every participant needs a different voice.');
    conversation = await api('/api/conversations', 'POST', {
      format: $('#format').value,
      premise: $('#premise').value,
      style: $('#style').value,
      turnLimit: Number($('#turnLimit').value),
      turnLength: 55,
      speechMode: 'server',
      outputMode: $('#outputMode').value,
      speechProfile,
      delivery: $('#delivery').value,
      conversationHeat: selectedHeat(),
      interruptionAudio: $('#interruptionAudio').value,
      participants,
    });
    $('#setup').style.display = 'none';
    $('#controls').style.display = 'block';
    $('#transcript').hidden = false;
    $('#jsonExport').href = endpoint(`/api/conversations/${conversation.id}/export.json`);
    $('#mdExport').href = endpoint(`/api/conversations/${conversation.id}/export.md`);
    $('#audioExport').href = endpoint(`/api/conversations/${conversation.id}/conversation.mp3`);
    history.replaceState(null,'',`${endpoint('/audio.html')}?profile=${encodeURIComponent(speechProfile)}&conversation=${encodeURIComponent(conversation.id)}`);
    render();
    await next();
  } catch (error) {
    $('#error').textContent = error.message;
  }
};

$('#format').onchange = configure;
$('#refereeEnabled').onchange = configure;
$('#conversationHeat').oninput = () => renderHeat(selectedHeat());
$('#conversationHeat').onchange = async () => {
  const heat = selectedHeat();
  renderHeat(heat);
  if (!conversation) return;
  try {
    conversation = await api(`/api/conversations/${conversation.id}/heat`, 'POST', { heat });
    $('#bargeInStatus').textContent = `Conversation heat changed to ${conversation.conversationHeat}.`;
    render();
    if (conversation.awaitingPlayback && currentTurn) startBargeMonitor(currentTurn);
  } catch (error) {
    $('#error').textContent = error.message;
    renderHeat(conversation.conversationHeat);
  }
};
$('#archivePlaybackRate').onchange = () => {
  archivePlayer.playbackRate = Number($('#archivePlaybackRate').value);
  archivePlayer.preservesPitch = true;
};
$('#replayAll').onclick = () => { if(canReplay()) replay.play(0,true); };
$('#replaySkip').onclick = () => replay.skip();
$('#replayStop').onclick = () => replay.stop();
$('#transcript').onclick = event => {
  const button=event.target.closest('[data-replay-turn]');
  if(button && canReplay()) replay.play(replay.turns.findIndex(t=>t.turn_id===button.dataset.replayTurn),false);
};
$('#openSaved').onclick = () => {
  const id=$('#savedConversations').value;
  if(id) window.open(`${endpoint('/audio.html')}?conversation=${encodeURIComponent(id)}`,'_blank','noopener');
};
$('#pause').onclick = async () => {
  player.pause();
  if (audioContext) await audioContext.suspend();
  conversation = await api(`/api/conversations/${conversation.id}/pause`, 'POST', {});
  render();
};
$('#resume').onclick = async () => {
  replay.stop();
  conversation = await api(`/api/conversations/${conversation.id}/resume`, 'POST', {});
  if (audioContext) await audioContext.resume();
  if (conversation.awaitingPlayback && player.readyState >= 2 && !player.ended) await player.play();
  if (currentTurn && startedAt) speechBegan(currentTurn);
  render();
};
$('#skip').onclick = () => { stopAudio(); finish(true); };
$('#retry').onclick = () => conversation?.awaitingPlayback && currentTurn ? play(currentTurn) : next();
$('#stop').onclick = async () => {
  stopAudio();
  settled = true;
  if (completionWatch) clearInterval(completionWatch);
  completionWatch = null;
  conversation = await api(`/api/conversations/${conversation.id}/stop`, 'POST', {});
  render();
};

$('#grenadeThrow').onclick = async () => {
  const text = $('#grenadeText').value.trim();
  if (!text) { $('#grenadeStatus').textContent = 'Type or speak a curve ball first.'; return; }
  try {
    settled = true;
    if (completionWatch) clearInterval(completionWatch);
    completionWatch = null;
    const durationMs = startedAt ? Math.max(0, Math.round(performance.now() - startedAt)) : null;
    const estimatedDurationMs = currentTurn ? Math.max(1800, String(currentTurn.text || '').split(/\s+/).length / (2.45 * (currentTurn.speech_rate || 1)) * 1000) : 1;
    const playableDurationMs = Number.isFinite(player.duration) && player.duration > 0 ? player.duration * 1000 : estimatedDurationMs;
    const heardWordCountValue = currentTurn && durationMs ? heardWordCount(currentTurn, durationMs / playableDurationMs) : null;
    stopAudio();
    conversation = await api(`/api/conversations/${conversation.id}/intervention`, 'POST', { text, durationMs, heardWordCount: heardWordCountValue });
    $('#grenadeText').value = '';
    $('#grenadeStatus').textContent = 'Curve ball thrown. Everyone must respond.';
    render();
    await next();
  } catch (error) {
    $('#grenadeStatus').textContent = error.message;
  }
};

if (!SpeechRecognitionClass) {
  $('#grenadeMic').disabled = true;
  $('#grenadeMic').title = 'Browser speech recognition is unavailable; type the intervention instead.';
} else {
  $('#grenadeMic').onclick = () => {
    if (grenadeRecognition) { grenadeRecognition.stop(); return; }
    grenadeRecognition = new SpeechRecognitionClass();
    grenadeRecognition.lang = 'en-GB';
    grenadeRecognition.interimResults = true;
    grenadeRecognition.continuous = false;
    grenadeRecognition.onstart = () => { $('#grenadeMic').textContent = '■ Stop listening'; $('#grenadeStatus').textContent = 'Listening…'; };
    grenadeRecognition.onresult = (event) => {
      $('#grenadeText').value = Array.from(event.results).map((result) => result[0].transcript).join(' ').trim();
    };
    grenadeRecognition.onerror = (event) => { $('#grenadeStatus').textContent = `Speech input failed: ${event.error}`; };
    grenadeRecognition.onend = () => { grenadeRecognition = null; $('#grenadeMic').textContent = '🎙 Speak'; if ($('#grenadeText').value.trim()) $('#grenadeStatus').textContent = 'Ready to throw.'; };
    grenadeRecognition.start();
  };
}

$$('.preview').forEach((button) => {
  button.onclick = async () => {
    try {
      replay.stop();
      stopAudio();
      const card = button.closest('.participant');
      const response = await fetch(`${ttsBase}/synthesize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `Hello. This is the ${card.querySelector('h2').textContent.toLowerCase()} voice.`,
          voice: card.querySelector('.voice').value,
          delivery: $('#delivery').value,
          format: $('#format').value,
          role: card.dataset.role,
          speechRate: Number(card.querySelector('.speech-rate').value),
          profile: speechProfile,
        }),
      });
      if (!response.ok) throw new Error(`TTS ${response.status}: ${await response.text()}`);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(await previewAudioBlob(response));
      player.src = audioUrl;
      player.onerror = () => { $('#error').textContent = 'Audio preview playback failed'; };
      await player.play();
    } catch (error) {
      $('#error').textContent = error.message;
    }
  };
});

config = await api('/api/config');
renderHeat();
const voiceResponse = await fetch(`${ttsBase}/voices`).then((response) => response.json());
voices = voiceResponse.voices;
voiceOptions = voiceResponse.voiceOptions || voices.map((id) => ({ id, label: id }));
voiceProfiles = voiceResponse.voiceProfiles || [];
configure();
fill();
try {
  const saved=await api('/api/conversations');
  $('#savedConversations').replaceChildren(new Option('Choose a saved conversation…',''),...saved.map(c=>new Option(`${c.createdAt.slice(0,16).replace('T',' ')} · ${c.premise} · ${c.savedAudioCount} saved audio turns`,c.id)));
  const savedId=new URLSearchParams(location.search).get('conversation');
  if(savedId){
    conversation=await api(`/api/conversations/${encodeURIComponent(savedId)}`); archivedView=true;
    $('#setup').style.display='none'; $('#controls').style.display='block'; render();
    $('#status').textContent+=' · SAVED VIEW (no generation)';
  }
} catch(error) { $('#error').textContent=`Saved conversations: ${error.message}`; }
