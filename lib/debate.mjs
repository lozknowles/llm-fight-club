import { randomUUID } from 'node:crypto';

export const STATES = Object.freeze({ CREATED:'CREATED', READY:'READY', INTRODUCTION:'INTRODUCTION', FOR_OPENING:'FOR_OPENING', AGAINST_OPENING:'AGAINST_OPENING', FOR_REBUTTAL:'FOR_REBUTTAL', AGAINST_REBUTTAL:'AGAINST_REBUTTAL', REFEREE_INTERVENTION:'REFEREE_INTERVENTION', AUDIENCE_INTERVENTION:'AUDIENCE_INTERVENTION', CLOSING_FOR:'CLOSING_FOR', CLOSING_AGAINST:'CLOSING_AGAINST', VERDICT:'VERDICT', COMPLETED:'COMPLETED', PAUSED:'PAUSED', STOPPED:'STOPPED', ERROR:'ERROR' });
const active = new Set(Object.values(STATES).filter(s => ![STATES.COMPLETED, STATES.STOPPED, STATES.ERROR, STATES.PAUSED].includes(s)));
const roleFor = state => state === STATES.INTRODUCTION || state === STATES.REFEREE_INTERVENTION || state === STATES.AUDIENCE_INTERVENTION || state === STATES.VERDICT ? 'referee' : state.includes('FOR') ? 'for' : 'against';
const nextOf = (debate, state) => {
  const round = debate.round;
  if (state === STATES.READY) return debate.referee.enabled ? STATES.INTRODUCTION : STATES.FOR_OPENING;
  if (state === STATES.INTRODUCTION) return STATES.FOR_OPENING;
  if (state === STATES.FOR_OPENING) return STATES.AGAINST_OPENING;
  if (state === STATES.AGAINST_OPENING) return STATES.FOR_REBUTTAL;
  if (state === STATES.FOR_REBUTTAL) return STATES.AGAINST_REBUTTAL;
  if (state === STATES.AGAINST_REBUTTAL) return round < debate.rounds ? STATES.FOR_REBUTTAL : (debate.referee.enabled ? STATES.REFEREE_INTERVENTION : STATES.CLOSING_FOR);
  if (state === STATES.REFEREE_INTERVENTION) return STATES.CLOSING_FOR;
  if (state === STATES.CLOSING_FOR) return STATES.CLOSING_AGAINST;
  if (state === STATES.CLOSING_AGAINST) return debate.referee.enabled ? STATES.VERDICT : STATES.COMPLETED;
  if (state === STATES.VERDICT) return STATES.COMPLETED;
  return STATES.ERROR;
};

export function createDebate(input) {
  if (!input.proposition || input.proposition.trim().length > 600) throw new Error('Proposition must be 1-600 characters');
  const participants=[input.for, input.against, ...(input.referee?.enabled ? [input.referee] : [])];
  if (participants.some(person=>!person?.voice) || new Set(participants.map(person=>person.voice)).size !== participants.length) throw new Error('FOR, AGAINST and the enabled referee must use distinct voices');
  const rounds = Math.max(1, Math.min(5, Number(input.rounds) || 2));
  return { id:randomUUID(), createdAt:new Date().toISOString(), proposition:input.proposition.trim(), format:input.format || 'SERIOUS', rounds, turnLength:Math.max(40, Math.min(280, Number(input.turnLength) || 120)), state:STATES.READY, resumeState:null, round:1, awaitingAudio:false, audienceQueue:[], activeAudience:null, audienceResponses:0, transcript:[], telemetry:[], agents:{for:input.for, against:input.against}, referee:input.referee || {enabled:false}, current:null };
}
export function pause(debate) { if (!active.has(debate.state) || debate.awaitingAudio) throw new Error('Cannot pause at this moment'); debate.resumeState=debate.state; debate.state=STATES.PAUSED; return debate; }
export function resume(debate) { if (debate.state !== STATES.PAUSED) throw new Error('Debate is not paused'); debate.state=debate.resumeState; debate.resumeState=null; return debate; }
export function stop(debate) { if ([STATES.COMPLETED, STATES.STOPPED].includes(debate.state)) throw new Error('Debate already ended'); debate.state=STATES.STOPPED; debate.awaitingAudio=false; return debate; }
export function submitAudience(debate, text) { const clean=String(text || '').trim(); if (!clean || clean.length>600) throw new Error('Intervention must be 1-600 characters'); if ([STATES.COMPLETED, STATES.STOPPED, STATES.ERROR].includes(debate.state)) throw new Error('Debate has ended'); debate.audienceQueue.push(clean); return debate; }
export function beginNext(debate) {
  if (debate.awaitingAudio) throw new Error('Wait for playback completion');
  if (debate.state === STATES.PAUSED) throw new Error('Debate is paused');
  if ([STATES.COMPLETED, STATES.STOPPED, STATES.ERROR].includes(debate.state)) throw new Error('Debate has ended');
  if (debate.audienceQueue.length && debate.state !== STATES.AUDIENCE_INTERVENTION) { debate.resumeState=debate.state; debate.activeAudience=debate.audienceQueue[0]; debate.audienceResponses=2; debate.state=STATES.AUDIENCE_INTERVENTION; }
  else if (debate.state === STATES.READY) debate.state=nextOf(debate, STATES.READY);
  debate.current={state:debate.state, speaker:roleFor(debate.state)}; return debate.current;
}
export function completeAudio(debate) {
  if (!debate.awaitingAudio) throw new Error('No audio is awaiting completion');
  debate.awaitingAudio=false;
  if (debate.state === STATES.AUDIENCE_INTERVENTION) { debate.audienceQueue.shift(); debate.current=null; debate.state=debate.resumeState; debate.resumeState=null; return debate; }
  if (debate.state === STATES.AGAINST_REBUTTAL && debate.round < debate.rounds) debate.round += 1;
  debate.state=nextOf(debate, debate.state); debate.current=null; return debate;
}
export function recordTurn(debate, turn) { if (!debate.current) throw new Error('No turn is active'); const row={debate_id:debate.id,turn_id:randomUUID(),round:debate.round,speaker:debate.current.speaker,role:debate.current.state, timestamp:new Date().toISOString(),...turn}; debate.transcript.push(row); if (debate.activeAudience && ['for','against'].includes(row.speaker) && debate.audienceResponses > 0) { debate.audienceResponses--; if (!debate.audienceResponses) debate.activeAudience=null; } debate.awaitingAudio=true; return row; }
export function contextFor(debate, speaker) { const recent=debate.transcript.slice(-6).map(t=>`${t.speaker.toUpperCase()}: ${t.text}`).join('\n'); const opponent=debate.transcript.slice().reverse().find(t=>t.speaker !== speaker && t.speaker !== 'referee'); return { proposition:debate.proposition, format:debate.format, recent, opponent:opponent?.text || '', audience:debate.state===STATES.AUDIENCE_INTERVENTION ? debate.audienceQueue[0] : debate.activeAudience || '' }; }
