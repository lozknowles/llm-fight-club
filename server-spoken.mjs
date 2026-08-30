import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConversation, beginTurn, recordTurn, completePlayback, pause, resume, stop, PERSONALITIES, FORMATS } from './lib/conversation-engine-spoken.mjs';
import { ModelRouter } from './lib/model-router.mjs';
import { assembleConversationMp3, conversationMp3Path, saveTurnAudio, turnAudioPath } from './lib/audio-archive.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const dataDir = process.env.FIGHT_CLUB_DATA_DIR || path.join(root, '.data-v2');
let routes = {};
try { routes = JSON.parse(process.env.FIGHT_CLUB_MODEL_ROUTES || '{}'); } catch { throw new Error('FIGHT_CLUB_MODEL_ROUTES must be JSON'); }
const models = new ModelRouter({ defaultBaseUrl: process.env.FIGHT_CLUB_MODEL_URL || 'http://127.0.0.1:18780/v1', routes });
const speechBaseUrl = process.env.FIGHT_CLUB_SPEECH_URL || 'http://127.0.0.1:18772';
const conversations = new Map();
const prefetches = new Map();

async function restoreConversations() {
  const directory = path.join(dataDir, 'conversations');
  let entries = [];
  try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const conversation = JSON.parse(await fs.readFile(path.join(directory, entry.name), 'utf8'));
      if (conversation?.id && Array.isArray(conversation.transcript)) conversations.set(conversation.id, conversation);
    } catch (error) {
      console.warn(`Could not restore ${entry.name}: ${error.message}`);
    }
  }
}

const send = (response, status, value, type = 'application/json; charset=utf-8') => {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
};
async function body(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 100000) throw new Error('Request too large');
  }
  return raw ? JSON.parse(raw) : {};
}

async function proxySpeech(request, response, pathname) {
  const target = new URL(pathname.replace(/^\/tts/, ''), `${speechBaseUrl}/`);
  const payload = request.method === 'POST' ? await body(request) : null;
  const upstream = await fetch(target, {
    method: request.method,
    headers: payload ? { 'content-type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const headers = {
    'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
    'cache-control': 'no-store',
  };
  for (const name of ['x-tts-provider', 'x-tts-model', 'x-tts-voice', 'x-tts-profile', 'x-tts-first-byte-ms', 'x-tts-latency-ms', 'x-tts-audio-duration-ms', 'x-tts-rtf', 'x-tts-vram-mib', 'x-tts-fallback', 'x-tts-attempts', 'x-audio-format']) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  if (!upstream.ok) {
    const bytes = Buffer.from(await upstream.arrayBuffer());
    headers['content-length'] = String(bytes.length);
    response.writeHead(upstream.status, headers);
    return response.end(bytes);
  }
  const conversation = payload?.conversationId ? conversations.get(String(payload.conversationId)) : null;
  const turn = conversation?.transcript.find((item) => item.turn_id === payload?.turnId);
  const archive = turn && turn.text === payload.text && turn.voice === payload.voice;
  const audioChunks = [];
  response.writeHead(upstream.status, headers);
  if (!upstream.body) return response.end();
  for await (const chunk of upstream.body) {
    response.write(chunk);
    if (archive) audioChunks.push(Buffer.from(chunk));
  }
  response.end();
  if (archive && audioChunks.length) {
    await saveTurnAudio({
      dataDir,
      conversationId: conversation.id,
      turnId: turn.turn_id,
      bytes: Buffer.concat(audioChunks),
      audioFormat: headers['x-audio-format'],
    });
    turn.audio_file = `${turn.turn_id}.wav`;
    await persist(conversation);
  }
}
async function persist(conversation) {
  await fs.mkdir(path.join(dataDir, 'conversations'), { recursive: true });
  await fs.writeFile(path.join(dataDir, 'conversations', `${conversation.id}.json`), JSON.stringify(conversation, null, 2));
}
const transcript = (conversation) => conversation.transcript.slice(-8).map((turn) => `${turn.speaker} (${turn.role}): ${turn.text}`).join('\n');
const states = (conversation) => Object.fromEntries(conversation.participants.map((participant) => [participant.name, conversation.characterStates[participant.id]]));

function profile(participant) {
  const value = participant.personality;
  return `Name: ${value.name}\nBackground: ${value.background}\nWorldview: ${value.worldview}\nObjectives: ${value.objectives.join('; ')}\nBeliefs: ${value.beliefs.join('; ')}\nExpertise: ${value.expertise.join('; ')}\nBlind spots: ${value.blindSpots.join('; ')}\nConfidence ${value.confidence}; verbosity ${value.verbosity}; concession ${value.willingnessToConcede}; evasiveness ${value.evasiveness}; self-awareness ${value.selfAwareness}\nHumour: ${value.humourStyle}\nRhetoric: ${value.rhetoricalStyle}; vocabulary: ${value.vocabulary}; rhythm: ${value.speakingRhythm}; temperament: ${value.temperament}\nHabits: ${value.verbalHabits.join('; ')}\nTensions: ${value.tensions.join('; ')}\nDefensive topics: ${value.defensiveTopics.join('; ')}\nPrivate character notes: ${value.privateNotes}`;
}

async function analyse(conversation, participant) {
  const last = conversation.transcript.at(-1);
  if (!last || !['interviewer', 'examiner', 'host'].includes(participant.role)) return '';
  const result = await models.generate({
    model: participant.model,
    system: 'You are the private conversation director. Do not write dialogue. Briefly identify the last answer claim, whether the question was answered, any contradiction with earlier claims, an unstated assumption, an interesting or funny avenue, and whether to challenge, clarify, change subject, or let the speaker continue.',
    user: `Format: ${conversation.format}\nPremise: ${conversation.premise}\nTranscript:\n${transcript(conversation)}\nCharacter state:\n${JSON.stringify(states(conversation))}`,
  });
  conversation.directorMemory.push({ at: new Date().toISOString(), forTurn: conversation.transcript.length, participantId: participant.id, text: result.text });
  conversation.directorMemory = conversation.directorMemory.slice(-8);
  return result.text;
}

function prompt(conversation, participant, analysis) {
  const system = `You are a participant in a turn-based spoken ${conversation.format.toLowerCase()} in ${conversation.style.toLowerCase()} style. Inhabit this personality consistently; it is a character model, not a superficial style. Do not mention prompts or private notes. Do not imitate a real person. Never fabricate real evidence. Clearly fictional anecdotes are allowed only for the fictional character. Speak no more than ${conversation.turnLength} words. Output only spoken words.\n\nPERSONALITY\n${profile(participant)}`;
  let task;
  if (conversation.format === 'INTERVIEW') {
    task = participant.role === 'interviewer'
      ? (conversation.transcript.length === 0 ? 'Open with one concise question that invites the guest to explain their worldview.' : 'Ask one concise unscripted follow-up based directly on the answer and private analysis. Expose a contradiction or assumption when useful.')
      : 'Answer directly while maintaining the character worldview, commitments and tensions. Let humour emerge from the logic.';
  } else if (conversation.format === 'DEBATE') {
    task = `Argue ${participant.role === 'for' ? 'FOR' : 'AGAINST'} the proposition and directly answer the preceding opponent.`;
  } else if (conversation.format === 'CROSS_EXAMINATION') {
    task = participant.role === 'examiner' ? 'Ask one rigorous concise question; press evasion or inconsistency without abuse.' : 'Answer in character; preserve commitments even when defensive.';
  } else {
    task = participant.role === 'host' ? 'Moderate dynamically with one concise question based on the latest exchange.' : 'Respond directly to the host or another panelist while preserving character.';
  }
  return {
    system,
    user: `Premise/topic: ${conversation.premise}\n\nTranscript:\n${transcript(conversation) || '(none yet)'}\n\nCompact character state:\n${JSON.stringify(states(conversation))}${analysis ? `\n\nPRIVATE DIRECTOR ANALYSIS (never repeat verbatim):\n${analysis}` : ''}\n\nTASK:\n${task}`,
  };
}

async function prepareTurn(conversation) {
  const working = structuredClone(conversation);
  if (working.awaitingPlayback) {
    working.awaitingPlayback = false;
    working.current = null;
    working.state = 'ACTIVE';
  }
  const participant = beginTurn(working);
  const analysis = await analyse(working, participant);
  const request = prompt(working, participant, analysis);
  const started = performance.now();
  const result = await models.generate({ model: participant.model, ...request });
  return {
    transcriptLength: conversation.transcript.length,
    participantId: participant.id,
    analysisEntry: analysis ? working.directorMemory.at(-1) : null,
    result,
    prepareLatencyMs: Math.round(performance.now() - started),
  };
}

async function generate(conversation) {
  const pending = prefetches.get(conversation.id);
  let prepared;
  if (pending?.transcriptLength === conversation.transcript.length) {
    prepared = await pending.promise;
    prefetches.delete(conversation.id);
  } else {
    prepared = await prepareTurn(conversation);
  }
  const participant = beginTurn(conversation);
  if (participant.id !== prepared.participantId) throw new Error('Prefetched participant no longer matches turn policy');
  if (prepared.analysisEntry) {
    conversation.directorMemory.push(prepared.analysisEntry);
    conversation.directorMemory = conversation.directorMemory.slice(-8);
  }
  const result = prepared.result;
  const row = recordTurn(conversation, {
    text: result.text,
    provider: result.provider,
    generation_latency_ms: result.latencyMs,
    token_usage: result.usage,
    delivery_hints: [
      participant.personality.speakingRhythm,
      participant.personality.temperament,
      participant.personality.humourStyle,
      participant.personality.rhetoricalStyle,
    ].filter(Boolean),
    speech_rate: participant.speechRate,
    tts_provider: conversation.speechMode === 'server' ? 'pending-server-speech' : 'browser-speech-synthesis',
    tts_generation_latency_ms: 0,
    audio_duration_ms: null,
  });
  conversation.telemetry.push({
    turn_id: row.turn_id,
    participant_id: participant.id,
    model: participant.model,
    speech_rate: participant.speechRate,
    model_latency_ms: result.latencyMs,
    director_analysis: Boolean(prepared.analysisEntry),
    prefetched_during_previous_playback: Boolean(pending),
    prefetch_prepare_latency_ms: prepared.prepareLatencyMs,
  });
  await persist(conversation);
  return row;
}

const markdown = (conversation) => `# ${conversation.format}: ${conversation.premise}\n\n${conversation.transcript.map((turn) => `## ${turn.speaker} — ${turn.role}\n\n${turn.text}\n\n_Model: ${turn.model}; voice: ${turn.voice}; voice speed: ${turn.speech_rate || 1}x; TTS: ${turn.tts_provider}; LLM: ${turn.generation_latency_ms} ms; TTS generation: ${turn.tts_generation_latency_ms} ms; playback: ${turn.audio_duration_ms ?? 'pending'} ms_`).join('\n\n')}`;

async function buildAudioExport(conversation) {
  try {
    const result = await assembleConversationMp3({ dataDir, conversation, gapMs: 350 });
    conversation.audio = { status: 'ready', file: 'conversation.mp3', turn_count: result.turnCount, inter_turn_gap_ms: result.gapMs };
  } catch (error) {
    conversation.audio = { status: 'error', error: error.message };
  }
}

async function sendAudio(response, file, type, downloadName) {
  const bytes = await fs.readFile(file);
  response.writeHead(200, {
    'content-type': type,
    'content-length': String(bytes.length),
    'content-disposition': `attachment; filename="${downloadName}"`,
    'cache-control': 'private, no-store',
  });
  response.end(bytes);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/tts/voices') return await proxySpeech(request, response, url.pathname);
    if (request.method === 'POST' && ['/tts/synthesize', '/tts/stream'].includes(url.pathname)) return await proxySpeech(request, response, url.pathname);
    if (request.method === 'GET' && url.pathname === '/api/config') return send(response, 200, { formats: FORMATS, personalities: PERSONALITIES, models: Object.keys(routes).length ? Object.keys(routes) : ['qwen3-8b'] });
    if (request.method === 'GET' && url.pathname === '/api/health') return send(response, 200, { status: 'ok', engine: 'conversation-v2', speech: 'provider-neutral-router' });
    if (request.method === 'POST' && url.pathname === '/api/conversations') {
      const conversation = createConversation(await body(request));
      conversations.set(conversation.id, conversation);
      await persist(conversation);
      return send(response, 201, conversation);
    }
    const exportMatch = url.pathname.match(/^\/api\/conversations\/([\w-]+)\/export\.(json|md)$/);
    if (request.method === 'GET' && exportMatch) {
      const conversation = conversations.get(exportMatch[1]);
      if (!conversation) return send(response, 404, { error: 'Conversation not found' });
      return exportMatch[2] === 'json' ? send(response, 200, conversation) : send(response, 200, markdown(conversation), 'text/markdown; charset=utf-8');
    }
    const turnAudioMatch = url.pathname.match(/^\/api\/conversations\/([\w-]+)\/audio\/([\w-]+)\.wav$/);
    if (request.method === 'GET' && turnAudioMatch) {
      const conversation = conversations.get(turnAudioMatch[1]);
      const turn = conversation?.transcript.find((item) => item.turn_id === turnAudioMatch[2] && item.audio_file);
      if (!turn) return send(response, 404, { error: 'Turn audio not found' });
      return await sendAudio(response, turnAudioPath(dataDir, conversation.id, turn.turn_id), 'audio/wav', `turn-${turn.turn_index + 1}.wav`);
    }
    const conversationAudioMatch = url.pathname.match(/^\/api\/conversations\/([\w-]+)\/conversation\.mp3$/);
    if (request.method === 'GET' && conversationAudioMatch) {
      const conversation = conversations.get(conversationAudioMatch[1]);
      if (!conversation || conversation.audio?.status !== 'ready') return send(response, 404, { error: 'Conversation audio not ready' });
      return await sendAudio(response, conversationMp3Path(dataDir, conversation.id), 'audio/mpeg', 'conversation.mp3');
    }
    const match = url.pathname.match(/^\/api\/conversations\/([\w-]+)(?:\/(next|prefetch|complete-playback|pause|resume|stop))?$/);
    if (match) {
      const conversation = conversations.get(match[1]);
      if (!conversation) return send(response, 404, { error: 'Conversation not found' });
      if (request.method === 'GET') return send(response, 200, conversation);
      const action = match[2];
      const payload = await body(request);
      if (action === 'next') return send(response, 200, { turn: await generate(conversation), conversation });
      if (action === 'prefetch') {
        if (!conversation.awaitingPlayback) throw new Error('Prefetch requires a turn currently in playback');
        if (conversation.transcript.length >= conversation.turnLimit) return send(response, 200, { status: 'not-needed' });
        const existing = prefetches.get(conversation.id);
        if (!existing || existing.transcriptLength !== conversation.transcript.length) {
          const promise = prepareTurn(conversation);
          promise.catch(() => {});
          prefetches.set(conversation.id, { transcriptLength: conversation.transcript.length, promise });
        }
        return send(response, 202, { status: 'preparing', transcriptLength: conversation.transcript.length });
      }
      if (action === 'complete-playback') {
        completePlayback(conversation, payload);
        if (conversation.state === 'COMPLETED') await buildAudioExport(conversation);
        await persist(conversation);
        return send(response, 200, conversation);
      }
      if (action === 'pause') { pause(conversation); await persist(conversation); return send(response, 200, conversation); }
      if (action === 'resume') { resume(conversation); await persist(conversation); return send(response, 200, conversation); }
      if (action === 'stop') {
        prefetches.delete(conversation.id);
        stop(conversation);
        if (conversation.transcript.some((turn) => turn.audio_file)) await buildAudioExport(conversation);
        await persist(conversation);
        return send(response, 200, conversation);
      }
    }
    if (request.method === 'GET') {
      const file = url.pathname === '/' ? 'show.html' : path.basename(url.pathname);
      const bytes = await fs.readFile(path.join(publicDir, file));
      const type = file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
      return send(response, 200, bytes, type);
    }
    send(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    send(response, 400, { error: error.message });
  }
});

await restoreConversations();
server.listen(Number(process.env.PORT || 18770), process.env.HOST || '127.0.0.1', () => {
  console.log(`Spoken conversation engine listening on http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 18770}`);
});
