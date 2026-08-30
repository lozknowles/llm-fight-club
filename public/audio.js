const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const appBase = new URL('.', window.location.href).pathname;
const endpoint = (pathname) => `${appBase}${pathname.replace(/^\//, '')}`;
const ttsBase = endpoint('/tts');

let config;
let conversation;
let voices = [];
let audioUrl = null;
let startedAt = 0;
let ttsLatency = 0;
let ttsProvider = 'unknown';
let settled = false;
const player = $('#player');

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

async function speech(text, voice, deliveryHints = []) {
  const began = performance.now();
  const response = await fetch(`${ttsBase}/synthesize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, voice, deliveryHints }),
  });
  if (!response.ok) throw new Error(`TTS ${response.status}: ${await response.text()}`);
  ttsLatency = Number(response.headers.get('x-tts-latency-ms')) || Math.round(performance.now() - began);
  ttsProvider = response.headers.get('x-tts-provider') || 'unknown';
  return URL.createObjectURL(await response.blob());
}

function roles() {
  const formats = {
    INTERVIEW: [['interviewer', 'INTERVIEWER'], ['guest', 'GUEST']],
    DEBATE: [['for', 'FOR'], ['against', 'AGAINST']],
    PANEL: [['host', 'HOST'], ['panelist', 'PANELIST 1'], ['panelist', 'PANELIST 2']],
    CROSS_EXAMINATION: [['examiner', 'EXAMINER'], ['witness', 'WITNESS']],
  };
  return formats[$('#format').value];
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
  $$('.voice').forEach((select, index) => { select.value = voices[index]; });
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
  $('#status').textContent = `${conversation.format} · ${conversation.state} · ${conversation.transcript.length}/${conversation.turnLimit}`;
  $('#transcript').innerHTML = conversation.transcript.map((turn, index) => {
    const participantIndex = conversation.participants.findIndex((item) => item.id === turn.speaker_id);
    const speaking = conversation.awaitingPlayback && index === conversation.transcript.length - 1 ? 'speaking' : '';
    return `<article class="turn ${speaking}" style="--accent:${['#63d2ff', '#ff6b9a', '#ffd166'][participantIndex % 3]}">
      <b>${turn.speaker}</b> <span class="meta">${turn.role} · ${turn.model} · voice ${turn.voice}</span>
      <p>${turn.text}</p>
      <span class="meta">LLM ${turn.generation_latency_ms} ms · TTS ${turn.tts_generation_latency_ms ?? (index === conversation.transcript.length - 1 ? ttsLatency : 'recorded')} ms · playback ${turn.audio_duration_ms ?? 'in progress'} ms</span>
    </article>`;
  }).join('');
}

async function finish(skipped = false) {
  if (settled) return;
  settled = true;
  const durationMs = Math.round(performance.now() - startedAt);
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
  conversation = await api(`/api/conversations/${conversation.id}/complete-playback`, 'POST', {
    durationMs,
    skipped,
    ttsProvider,
    ttsLatencyMs: ttsLatency,
  });
  render();
  if (!['COMPLETED', 'STOPPED'].includes(conversation.state)) await next();
}

async function play(turn) {
  audioUrl = await speech(turn.text, turn.voice, turn.delivery_hints || []);
  player.src = audioUrl;
  settled = false;
  player.onplay = () => {
    startedAt = performance.now();
    render();
  };
  player.onended = () => finish(false);
  player.onerror = () => { $('#error').textContent = 'Audio playback failed'; };
  await player.play();
}

async function next() {
  if (!conversation || conversation.awaitingPlayback || ['PAUSED', 'COMPLETED', 'STOPPED'].includes(conversation.state)) return;
  $('#status').textContent = 'Generating…';
  const result = await api(`/api/conversations/${conversation.id}/next`, 'POST', {});
  conversation = result.conversation;
  render();
  await play(result.turn);
}

$('#setup').onsubmit = async (event) => {
  event.preventDefault();
  try {
    $('#error').textContent = '';
    const participants = $$('.participant').filter((card) => card.style.display !== 'none').map(participant);
    if (new Set(participants.map((item) => item.voice)).size !== participants.length) throw new Error('Every participant needs a different voice.');
    conversation = await api('/api/conversations', 'POST', {
      format: $('#format').value,
      premise: $('#premise').value,
      style: $('#style').value,
      turnLimit: Number($('#turnLimit').value),
      turnLength: 55,
      speechMode: 'server',
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
$('#pause').onclick = async () => { player.pause(); conversation = await api(`/api/conversations/${conversation.id}/pause`, 'POST', {}); render(); };
$('#resume').onclick = async () => { conversation = await api(`/api/conversations/${conversation.id}/resume`, 'POST', {}); await player.play(); render(); };
$('#skip').onclick = () => { player.pause(); finish(true); };
$('#stop').onclick = async () => { player.pause(); settled = true; conversation = await api(`/api/conversations/${conversation.id}/stop`, 'POST', {}); render(); };

$$('.preview').forEach((button) => {
  button.onclick = async () => {
    try {
      player.pause();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const card = button.closest('.participant');
      audioUrl = await speech(`Hello. This is the ${card.querySelector('h2').textContent.toLowerCase()} voice.`, card.querySelector('.voice').value);
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
