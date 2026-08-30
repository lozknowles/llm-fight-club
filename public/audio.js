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
let voices = [];
let audioUrl = null;
let startedAt = 0;
let settled = false;
let completionWatch = null;
let streamAbort = null;
let activeSources = [];
let scheduledEnd = 0;
let streamComplete = false;
let previousSpeechEndedAt = null;
let metrics = {};
const player = $('#player');
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioContext = AudioContextClass ? new AudioContextClass({ latencyHint: 'interactive', sampleRate: 24000 }) : null;

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
    attempts,
    response_headers_ms: Math.round(performance.now() - began),
    router_first_byte_ms: Number(response.headers.get('x-tts-first-byte-ms')) || null,
    first_byte_ms: null,
    first_decodable_ms: null,
    first_playable_ms: null,
    stream_complete_ms: null,
    audio_duration_ms: null,
    inter_speaker_silence_ms: null,
  };
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

async function streamPcm(response, began) {
  if (!audioContext) throw new Error('Web Audio is unavailable in this browser');
  await audioContext.resume();
  const reader = response.body.getReader();
  let carry = new Uint8Array();
  let totalSamples = 0;
  let firstScheduled = false;
  scheduledEnd = audioContext.currentTime + 0.055;
  streamComplete = false;
  activeSources = [];
  while (true) {
    const chunk = await reader.read();
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
    source.connect(audioContext.destination);
    const startAt = Math.max(scheduledEnd, audioContext.currentTime + 0.025);
    source.start(startAt);
    scheduledEnd = startAt + buffer.duration;
    activeSources.push(source);
    totalSamples += decoded.samples.length;
    if (!firstScheduled) {
      firstScheduled = true;
      const untilStartMs = Math.max(0, (startAt - audioContext.currentTime) * 1000);
      metrics.first_playable_ms = Math.round(performance.now() - began + untilStartMs);
      startedAt = performance.now() + untilStartMs;
      metrics.inter_speaker_silence_ms = previousSpeechEndedAt == null ? null : Math.max(0, Math.round(startedAt - previousSpeechEndedAt));
      render();
      if (conversation?.id) {
        api(`/api/conversations/${conversation.id}/prefetch`, 'POST', {}).catch((error) => {
          console.warn('Turn prefetch was unavailable', error);
        });
      }
    }
  }
  streamComplete = true;
  metrics.stream_complete_ms = Math.round(performance.now() - began);
  metrics.audio_duration_ms = Math.round(totalSamples / 24);
  completionWatch = setInterval(() => {
    if (streamComplete && audioContext.currentTime >= scheduledEnd - 0.01) finish(false);
  }, 25);
}

async function playContainer(response, began) {
  const chunks = [];
  const reader = response.body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (metrics.first_byte_ms == null) metrics.first_byte_ms = Math.round(performance.now() - began);
    chunks.push(chunk.value);
  }
  metrics.first_decodable_ms = Math.round(performance.now() - began);
  metrics.stream_complete_ms = metrics.first_decodable_ms;
  audioUrl = URL.createObjectURL(new Blob(chunks, { type: response.headers.get('content-type') || 'audio/wav' }));
  player.src = audioUrl;
  player.onplay = () => {
    startedAt = performance.now();
    metrics.first_playable_ms = Math.round(startedAt - began);
    metrics.inter_speaker_silence_ms = previousSpeechEndedAt == null ? null : Math.max(0, Math.round(startedAt - previousSpeechEndedAt));
    render();
    if (conversation?.id) api(`/api/conversations/${conversation.id}/prefetch`, 'POST', {}).catch(() => {});
  };
  player.onended = () => finish(false);
  player.onerror = () => { $('#error').textContent = 'Audio playback failed'; };
  await player.play();
}

async function speech(turn) {
  const began = performance.now();
  streamAbort = new AbortController();
  const response = await fetch(`${ttsBase}/stream`, {
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
      profile: speechProfile,
    }),
    signal: streamAbort.signal,
  });
  if (!response.ok) throw new Error(`TTS ${response.status}: ${await response.text()}`);
  metrics = responseMetrics(response, began);
  if (response.headers.get('x-audio-format') === 'pcm_s16le_24000_mono') await streamPcm(response, began);
  else await playContainer(response, began);
}

function roles() {
  return {
    INTERVIEW: [['interviewer', 'INTERVIEWER'], ['guest', 'GUEST']],
    DEBATE: [['for', 'FOR'], ['against', 'AGAINST']],
    PANEL: [['host', 'HOST'], ['panelist', 'PANELIST 1'], ['panelist', 'PANELIST 2']],
    CROSS_EXAMINATION: [['examiner', 'EXAMINER'], ['witness', 'WITNESS']],
  }[$('#format').value];
}

function configure() {
  const list = roles();
  $$('.participant').forEach((card, index) => {
    card.dataset.role = list[index]?.[0] || '';
    card.querySelector('h2').textContent = list[index]?.[1] || '';
    card.style.display = list[index] ? 'block' : 'none';
  });
  $('#third').style.display = list.length === 3 ? 'block' : 'none';
  $('#setup .primary').textContent = `START ${$('#format').value.replace('_', ' ')}`;
}

function fill() {
  for (const select of $$('.model')) select.innerHTML = config.models.map((model) => `<option>${model}</option>`).join('');
  for (const select of $$('.personality')) select.innerHTML = config.personalities.map((profile) => `<option value="${profile.id}">${profile.name}</option>`).join('');
  for (const select of $$('.voice')) select.innerHTML = voices.map((voice) => `<option>${voice}</option>`).join('');
  $$('.personality')[0].value = 'mara-vale';
  $$('.personality')[1].value = 'cedric-pump';
  $$('.personality')[2].value = 'nina-quark';
  if (config.models[1]) $$('.model')[1].value = config.models[1];
  const defaults = ['live-interviewer', 'live-guest', 'live-host'];
  $$('.voice').forEach((select, index) => { select.value = defaults[index] || voices[index]; });
}

function participant(card) {
  const personality = config.personalities.find((profile) => profile.id === card.querySelector('.personality').value);
  return {
    id: crypto.randomUUID(),
    name: personality.name,
    role: card.dataset.role,
    model: card.querySelector('.model').value,
    voice: card.querySelector('.voice').value,
    personality,
  };
}

function render() {
  if (!conversation) return;
  $('#status').textContent = `${conversation.format} · ${conversation.state} · ${conversation.transcript.length}/${conversation.turnLimit} · ${speechProfile}`;
  $('#transcript').innerHTML = conversation.transcript.map((turn, index) => {
    const participantIndex = conversation.participants.findIndex((item) => item.id === turn.speaker_id);
    const speaking = conversation.awaitingPlayback && index === conversation.transcript.length - 1 ? 'speaking' : '';
    const live = index === conversation.transcript.length - 1 && conversation.awaitingPlayback
      ? ` · first playable ${metrics.first_playable_ms ?? 'waiting'} ms · provider ${metrics.provider || 'routing'}`
      : '';
    return `<article class="turn ${speaking}" style="--accent:${['#63d2ff', '#ff6b9a', '#ffd166'][participantIndex % 3]}">
      <b>${turn.speaker}</b> <span class="meta">${turn.role} · ${turn.model} · voice ${turn.voice}</span>
      <p>${turn.text}</p>
      <span class="meta">LLM ${turn.generation_latency_ms} ms · playback ${turn.audio_duration_ms ?? 'in progress'} ms${live}</span>
    </article>`;
  }).join('');
}

function stopAudio() {
  player.pause();
  if (streamAbort) streamAbort.abort();
  streamAbort = null;
  for (const source of activeSources) {
    try { source.stop(); } catch {}
  }
  activeSources = [];
}

async function finish(skipped = false) {
  if (settled) return;
  settled = true;
  if (completionWatch) clearInterval(completionWatch);
  completionWatch = null;
  previousSpeechEndedAt = performance.now();
  const durationMs = metrics.audio_duration_ms || Math.max(0, Math.round(previousSpeechEndedAt - startedAt));
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
  conversation = await api(`/api/conversations/${conversation.id}/complete-playback`, 'POST', {
    durationMs,
    skipped,
    ttsProvider: metrics.provider,
    ttsLatencyMs: metrics.first_playable_ms,
    ttsMetrics: metrics,
  });
  render();
  if (!['COMPLETED', 'STOPPED'].includes(conversation.state)) await next();
}

async function play(turn) {
  if (completionWatch) clearInterval(completionWatch);
  completionWatch = null;
  settled = false;
  try {
    await speech(turn);
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
  }
}

async function next() {
  if (!conversation || conversation.awaitingPlayback || ['PAUSED', 'COMPLETED', 'STOPPED'].includes(conversation.state)) return;
  $('#status').textContent = 'Preparing next speaker…';
  const result = await api(`/api/conversations/${conversation.id}/next`, 'POST', {});
  conversation = result.conversation;
  metrics = {};
  render();
  await play(result.turn);
}

$('#setup').onsubmit = async (event) => {
  event.preventDefault();
  try {
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
      speechMode: 'server-streaming',
      speechProfile,
      participants,
    });
    $('#setup').style.display = 'none';
    $('#controls').style.display = 'block';
    $('#jsonExport').href = endpoint(`/api/conversations/${conversation.id}/export.json`);
    $('#mdExport').href = endpoint(`/api/conversations/${conversation.id}/export.md`);
    render();
    await next();
  } catch (error) {
    $('#error').textContent = error.message;
  }
};

$('#format').onchange = configure;
$('#pause').onclick = async () => {
  player.pause();
  if (audioContext) await audioContext.suspend();
  conversation = await api(`/api/conversations/${conversation.id}/pause`, 'POST', {});
  render();
};
$('#resume').onclick = async () => {
  conversation = await api(`/api/conversations/${conversation.id}/resume`, 'POST', {});
  if (audioContext) await audioContext.resume();
  if (player.src) await player.play();
  render();
};
$('#skip').onclick = () => { stopAudio(); finish(true); };
$('#stop').onclick = async () => {
  stopAudio();
  settled = true;
  if (completionWatch) clearInterval(completionWatch);
  completionWatch = null;
  conversation = await api(`/api/conversations/${conversation.id}/stop`, 'POST', {});
  render();
};

$$('.preview').forEach((button) => {
  button.onclick = async () => {
    try {
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
          profile: speechProfile,
        }),
      });
      if (!response.ok) throw new Error(`TTS ${response.status}: ${await response.text()}`);
      audioUrl = URL.createObjectURL(await response.blob());
      player.src = audioUrl;
      await player.play();
    } catch (error) {
      $('#error').textContent = error.message;
    }
  };
});

config = await api('/api/config');
voices = (await fetch(`${ttsBase}/voices`).then((response) => response.json())).voices;
configure();
fill();
