const $ = id => document.getElementById(id);
const base = new URL('./', location.href), audio = $('player');
let battle, current = -1, watch = false, requestedAt = 0, pollBusy = false, changing = false, replayOnly = false;
const cards = new Map();
async function api(route, body) {
  const response = await fetch(new URL(`api/prepared-battles${route}`, base), body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw Error(data.error || 'Request failed'); return data;
}
const fail = error => { $('error').textContent = error.message; };
const action = fn => async () => { $('error').textContent = ''; try { await fn(); } catch (e) { fail(e); } };
function event(type) {
  const row = battle?.presentation[current]; if (!row) return;
  api(`/${battle.id}/playback`, { rowId: row.id, type, positionSeconds: audio.currentTime || 0,
    latencyMs: type === 'play' ? Math.round(performance.now() - requestedAt) : null }).catch(() => {});
}
function stop() { changing = true; audio.pause(); audio.removeAttribute('src'); audio.load(); changing = false; }
function controls() {
  const row = battle?.presentation[current], ready = row?.state === 'READY', disabled = $('textOnly').checked;
  $('pause').disabled = !ready || audio.paused; $('resume').disabled = !ready || !audio.paused || !audio.src || audio.ended || disabled;
  $('watch').disabled = !battle?.presentation.length || disabled;
  $('skip').disabled = current < 0 || current >= (battle?.presentation.length || 0) - 1;
  $('cancel').disabled = !battle?.presentation.some(r => ['QUEUED','PREPARING'].includes(r.state));
  $('retry').disabled = replayOnly || !battle || battle.executionState !== 'COMPLETED' || battle.speechMode === 'TEXT' || disabled || !$('cancel').disabled;
  for (const [id, card] of cards) {
    const row = battle.presentation.find(r => r.id === id);
    card.play.disabled = disabled || row.state !== 'READY'; card.pause.disabled = row.id !== battle.presentation[current]?.id || audio.paused;
    card.replay.disabled = disabled || row.state !== 'READY';
  }
}
async function play(index, replay = false) {
  if ($('textOnly').checked) return;
  const row = battle.presentation[index]; if (!row || row.state !== 'READY') return;
  if (index !== current || !audio.src || replay) {
    stop(); current = index; audio.src = new URL(`api/prepared-battles/${battle.id}/audio/${row.id}.wav`, base).href;
    $('caption').textContent = `${row.publicLabel}: ${row.text}`;
  }
  requestedAt = performance.now();
  try { await audio.play(); } catch { watch = false; fail(Error('Playback needs a tap. Press Play on the ready response.')); }
  render();
}
function next() {
  event('skip'); stop(); current++; controls(); maybePlay();
}
function maybePlay() {
  if (!watch || $('textOnly').checked || !battle) return;
  while (current < battle.presentation.length && ['TEXT_ONLY','CANCELLED'].includes(battle.presentation[current].state)) current++;
  const row = battle.presentation[current];
  if (!row) { watch = false; controls(); return; }
  if (row.state === 'READY' && !audio.src) play(current).catch(fail);
  else if (row.state !== 'READY') $('caption').textContent = `${row.publicLabel}: speech is being prepared. You can read the exact text below.`;
}
function render() {
  if (!battle) return;
  const ready = battle.presentation.filter(r => r.state === 'READY').length;
  $('status').textContent = `Models / judging: ${battle.executionState} · Speech: ${ready}/${battle.presentation.length} ready · ${battle.speechMode}`;
  if (battle.error) fail(Error(battle.error));
  for (const row of battle.presentation) {
    if (!cards.has(row.id)) {
      const section = document.createElement('section'); section.className = `card response ${row.lane === 'HOST' ? 'host' : ''}`;
      const heading = document.createElement('h2'), text = document.createElement('p'), state = document.createElement('p'), buttons = {};
      heading.textContent = row.publicLabel; text.className = 'transcript'; text.textContent = row.text; state.className = 'muted';
      section.append(heading, text, state);
      for (const name of ['play','pause','replay','skip']) {
        const button = document.createElement('button'); button.textContent = `${name[0].toUpperCase()}${name.slice(1)}`;
        button.onclick = action(async () => {
          const index = battle.presentation.findIndex(r => r.id === row.id);
          if (name === 'play' || name === 'replay') { watch = false; await play(index, name === 'replay'); }
          else if (name === 'pause') audio.pause();
          else { watch = true; if (current !== index) { stop(); current = index; } next(); }
        });
        section.append(button); buttons[name] = button;
      }
      $('responses').append(section); cards.set(row.id, { section, state, ...buttons });
    }
    const card = cards.get(row.id); card.section.classList.toggle('active', battle.presentation[current]?.id === row.id);
    card.state.textContent = `${row.state}${row.evidence ? ` · ${row.evidence.backend} · ${row.evidence.cacheHit ? 'cached' : 'generated'} · ${(row.evidence.generationLatencyMs / 1000).toFixed(1)}s synthesis · ${row.evidence.audioDurationSeconds.toFixed(1)}s audio · watermark: ${row.evidence.watermark}` : ''}${row.events.some(e => e.type === 'fallback') ? ' · Text retained; speech unavailable' : ''}`;
  }
  if (!battle.presentation.length) {
    $('caption').textContent = battle.responses.map(r => `${r.publicLabel}: ${r.text}`).join('\n\n');
  }
  if (battle.judgement) {
    $('result').hidden = false; $('result').textContent = `Text-based judge: Fighter A ${battle.judgement.score_a}/10; Fighter B ${battle.judgement.score_b}/10. ${battle.judgement.winner === 'TIE' ? 'Tie.' : `Winner: Fighter ${battle.judgement.winner}.`} ${battle.judgement.reason} (LLM opinion, not an objective benchmark.)`;
  }
  $('evidence').hidden = false; $('evidence').href = new URL(`api/prepared-battles/${battle.id}/evidence`, base).href;
  controls(); maybePlay();
}
$('run').onclick = action(async () => {
  $('run').disabled = true;
  try {
    stop(); watch = false; current = -1;
    battle = await api('', { premise: $('premise').value, models: [$('modelA').value, $('modelB').value], rounds: Number($('rounds').value), speechMode: $('mode').value, blind: $('blind').checked });
    cards.clear(); $('responses').replaceChildren(); $('result').hidden = true; $('setup').open = false; $('textOnly').checked = battle.speechMode === 'TEXT';
    history.replaceState(null, '', `?battle=${encodeURIComponent(battle.id)}`); render();
  } finally { $('run').disabled = false; }
});
$('watch').onclick = action(async () => { watch = true; stop(); current = 0; maybePlay(); });
$('pause').onclick = () => { audio.pause(); controls(); };
$('resume').onclick = action(async () => { requestedAt = performance.now(); await audio.play(); controls(); });
$('skip').onclick = next;
$('mute').onchange = () => { audio.muted = $('mute').checked; };
$('textOnly').onchange = action(async () => { if ($('textOnly').checked) { watch = false; stop(); if (battle && !replayOnly) battle = await api(`/${battle.id}/cancel`, {}); } render(); });
$('cancel').onclick = action(async () => { watch = false; stop(); battle = await api(`/${battle.id}/cancel`, {}); render(); });
$('retry').onclick = action(async () => { battle = await api(`/${battle.id}/prepare`, {}); render(); });
audio.onplaying = () => { event('play'); controls(); };
audio.onpause = () => { if (!changing) event('pause'); controls(); };
audio.onended = () => { event('ended'); stop(); if (watch) { current++; maybePlay(); } controls(); };
audio.onerror = () => { if (!audio.getAttribute('src')) return; event('error'); watch = false; fail(Error('Audio failed. The text and judge result are preserved; retry playback or use text only.')); controls(); };
audio.ontimeupdate = () => {
  const row = battle?.presentation[current]; if (!row || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const fraction = Math.min(1, audio.currentTime / audio.duration); $('progress').value = fraction;
  const words = row.text.split(/\s+/), index = Math.floor(fraction * words.length);
  $('caption').textContent = `${row.publicLabel}: ${words.slice(Math.max(0, index - 7), index + 12).join(' ')} (approximate)`;
};
async function poll() {
  if (!battle || pollBusy) return; pollBusy = true;
  try { battle = await api(`/${battle.id}`); render(); } catch (e) { fail(e); } finally { pollBusy = false; }
}
try {
  const config = await api('/config');
  for (const id of ['modelA','modelB']) for (const name of config.models) { const option = document.createElement('option'); option.value = name; option.textContent = name; $(id).append(option); }
  if (config.models.length > 1) $('modelB').selectedIndex = 1;
  replayOnly = config.replayOnly; $('run').disabled = replayOnly;
  $('studioLink').hidden = Boolean(replayOnly);
  $('status').textContent = `${replayOnly ? 'Read-only evidence replay' : `CSM service: ${config.speechHealth.state}`}. No audio will play until you press Play or Watch.`;
  const id = new URL(location.href).searchParams.get('battle');
  if (id && /^[a-f0-9-]{36}$/.test(id)) { battle = await api(`/${id}`); $('setup').open = false; render(); }
} catch (e) { fail(e); }
setInterval(poll, 2000);
