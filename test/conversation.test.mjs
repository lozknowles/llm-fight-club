import test from 'node:test';import assert from'node:assert/strict';import{createConversation,beginTurn,recordTurn,completePlayback,STATES,PERSONALITIES}from'../lib/conversation-engine.mjs';
const participant=(role,index)=>({name:`P${index}`,role,model:`m${index}`,voice:`v${index}`,personality:PERSONALITIES[index]});
const speak=c=>{const p=beginTurn(c);recordTurn(c,{text:`${p.role} says something`,generation_latency_ms:1,tts_provider:'browser-speech-synthesis'});completePlayback(c,{durationMs:250});return p;};
test('interview alternates and completes only after playback',()=>{const c=createConversation({format:'INTERVIEW',premise:'A premise',turnLimit:4,participants:[participant('interviewer',0),participant('guest',1)]});assert.equal(speak(c).role,'interviewer');assert.equal(speak(c).role,'guest');assert.equal(speak(c).role,'interviewer');assert.equal(speak(c).role,'guest');assert.equal(c.state,STATES.COMPLETED);assert.equal(c.transcript[0].audio_duration_ms,250);});
test('debate uses the same engine with opposing roles',()=>{const c=createConversation({format:'DEBATE',premise:'A proposition',turnLimit:2,participants:[participant('for',0),participant('against',1)]});assert.equal(speak(c).role,'for');assert.equal(speak(c).role,'against');assert.equal(c.state,STATES.COMPLETED);});
test('panel rotates host and two panelists',()=>{const c=createConversation({format:'PANEL',premise:'A topic',turnLimit:4,participants:[participant('host',0),participant('panelist',1),participant('panelist',2)]});assert.deepEqual([speak(c).role,speak(c).name,speak(c).name,speak(c).role],['host','P1','P2','host']);});
test('cross-examination alternates examiner and witness',()=>{const c=createConversation({format:'CROSS_EXAMINATION',premise:'A claim',turnLimit:2,participants:[participant('examiner',0),participant('witness',1)]});assert.equal(speak(c).role,'examiner');assert.equal(speak(c).role,'witness');});
test('all participants require distinct voices',()=>assert.throws(()=>createConversation({format:'INTERVIEW',premise:'A',participants:[participant('interviewer',0),{...participant('guest',1),voice:'v0'}]}),/distinct voice/));
test('user-defined turn count is rounded and safely bounded',()=>{
  const participants=[participant('interviewer',0),participant('guest',1)];
  assert.equal(createConversation({format:'INTERVIEW',premise:'A',turnLimit:7.6,participants}).turnLimit,8);
  assert.equal(createConversation({format:'INTERVIEW',premise:'A',turnLimit:100,participants}).turnLimit,40);
  assert.equal(createConversation({format:'INTERVIEW',premise:'A',turnLimit:1,participants}).turnLimit,2);
});
