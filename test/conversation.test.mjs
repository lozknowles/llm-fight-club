import test from 'node:test';import assert from'node:assert/strict';import{createConversation,beginTurn,recordTurn,completePlayback,submitAudienceIntervention,panelIntroductionBrief,STATES,PERSONALITIES}from'../lib/conversation-engine.mjs';
const participant=(role,index)=>({name:`P${index}`,role,model:`m${index}`,voice:`v${index}`,personality:PERSONALITIES[index]});
const speak=c=>{const p=beginTurn(c);recordTurn(c,{text:`${p.role} says something`,generation_latency_ms:1,tts_provider:'browser-speech-synthesis'});completePlayback(c,{durationMs:250});return p;};
test('interview alternates and completes only after playback',()=>{const c=createConversation({format:'INTERVIEW',premise:'A premise',turnLimit:4,participants:[participant('interviewer',0),participant('guest',1)]});assert.equal(speak(c).role,'interviewer');assert.equal(speak(c).role,'guest');assert.equal(speak(c).role,'interviewer');assert.equal(speak(c).role,'guest');assert.equal(c.state,STATES.COMPLETED);assert.equal(c.transcript[0].audio_duration_ms,250);});
test('debate uses the same engine with opposing roles',()=>{const c=createConversation({format:'DEBATE',premise:'A proposition',turnLimit:2,participants:[participant('for',0),participant('against',1)]});assert.equal(speak(c).role,'for');assert.equal(speak(c).role,'against');assert.equal(c.state,STATES.COMPLETED);});
test('panel rotates host and two panelists',()=>{const c=createConversation({format:'PANEL',premise:'A topic',turnLimit:4,participants:[participant('host',0),participant('panelist',1),participant('panelist',2)]});assert.deepEqual([speak(c).role,speak(c).name,speak(c).name,speak(c).role],['host','P1','P2','host']);});
test('panel introduction brief names the selected personalities and subject',()=>{const c=createConversation({format:'PANEL',premise:'Should every town have a strategic queue?',turnLimit:4,participants:[participant('host',0),participant('panelist',1),participant('panelist',2)]});const brief=panelIntroductionBrief(c);assert.equal(brief.hostName,'P0');assert.equal(brief.subject,c.premise);assert.deepEqual(brief.panelists.map(item=>item.name),['P1','P2']);assert.ok(brief.panelists.every(item=>item.description));});
test('cross-examination alternates examiner and witness',()=>{const c=createConversation({format:'CROSS_EXAMINATION',premise:'A claim',turnLimit:2,participants:[participant('examiner',0),participant('witness',1)]});assert.equal(speak(c).role,'examiner');assert.equal(speak(c).role,'witness');});
test('all participants require distinct voices',()=>assert.throws(()=>createConversation({format:'INTERVIEW',premise:'A',participants:[participant('interviewer',0),{...participant('guest',1),voice:'v0'}]}),/distinct voice/));
test('voice identity and model are independent and the profile is retained per turn',()=>{const interviewer={...participant('interviewer',0),model:'model-a',voice:'omnivoice-moderator',voiceProfile:{id:'omnivoice-moderator',name:'Rowan',provider:'omnivoice'}};const c=createConversation({format:'INTERVIEW',premise:'A',outputMode:'TEXT_AND_VOICE',participants:[interviewer,participant('guest',1)]});c.participants[0].model='model-b';beginTurn(c);const row=recordTurn(c,{text:'Question'});assert.equal(row.model,'model-b');assert.equal(row.voice,'omnivoice-moderator');assert.equal(row.voice_profile.id,'omnivoice-moderator');assert.equal(c.outputMode,'TEXT_AND_VOICE');});
test('output modes are validated',()=>assert.throws(()=>createConversation({format:'INTERVIEW',premise:'A',outputMode:'MIME',participants:[participant('interviewer',0),participant('guest',1)]}),/output mode/));
test('user-defined turn count is rounded and safely bounded',()=>{
  const participants=[participant('interviewer',0),participant('guest',1)];
  assert.equal(createConversation({format:'INTERVIEW',premise:'A',turnLimit:7.6,participants}).turnLimit,8);
  assert.equal(createConversation({format:'INTERVIEW',premise:'A',turnLimit:100,participants}).turnLimit,40);
  assert.equal(createConversation({format:'INTERVIEW',premise:'A',turnLimit:1,participants}).turnLimit,2);
});
test('participant speech speed is independent and bounded',()=>{
  const participants=[{...participant('interviewer',0),speechRate:.5},{...participant('guest',1),speechRate:1.25}];
  const conversation=createConversation({format:'INTERVIEW',premise:'A',participants});
  assert.equal(conversation.participants[0].speechRate,.7);
  assert.equal(conversation.participants[1].speechRate,1.25);
});
test('participant personality direction is preserved and bounded',()=>{
  const participants=[participant('interviewer',0),{...participant('guest',1),personality:{...PERSONALITIES[1],customPrompt:`  ${'x'.repeat(1400)}  `}}];
  const conversation=createConversation({format:'INTERVIEW',premise:'A',participants});
  assert.equal(conversation.participants[1].personality.customPrompt.length,1200);
  assert.equal(conversation.participants[0].personality.customPrompt,'');
});
test('built-in comic archetypes remain original fictional personalities',()=>{
  for(const id of ['theodore-gridley','crispin-bell','morris-fenn']){
    const profile=PERSONALITIES.find(item=>item.id===id);
    assert.ok(profile);
    assert.match(profile.privateNotes,/Original fictional archetype/);
  }
});
test('audience intervention interrupts playback and requires every participant to address it',()=>{
  const conversation=createConversation({format:'INTERVIEW',premise:'A',turnLimit:2,participants:[participant('interviewer',0),participant('guest',1)]});
  beginTurn(conversation);recordTurn(conversation,{text:'Opening',generation_latency_ms:1});
  const intervention=submitAudienceIntervention(conversation,'But what if the queue is imaginary?',{durationMs:125});
  assert.equal(conversation.awaitingPlayback,false);
  assert.equal(conversation.transcript[0].interrupted_by_audience,true);
  assert.equal(conversation.transcript[0].audio_duration_ms,125);
  assert.equal(intervention.pendingParticipantIds.length,2);
  assert.equal(conversation.turnLimit,3);
  const first=beginTurn(conversation);
  assert.equal(first.id,conversation.transcript[0].speaker_id);
  recordTurn(conversation,{text:'Direct response',generation_latency_ms:1,addressed_intervention_ids:[intervention.id]});
  completePlayback(conversation,{durationMs:250});
  const second=beginTurn(conversation);
  assert.notEqual(second.id,first.id);
  recordTurn(conversation,{text:'Second direct response',generation_latency_ms:1,addressed_intervention_ids:[intervention.id]});
  completePlayback(conversation,{durationMs:250});
  assert.equal(intervention.pendingParticipantIds.length,0);
  assert.equal(intervention.acknowledgedBy.length,2);
});
test('unrelated turns do not falsely clear an audience intervention',()=>{
  const conversation=createConversation({format:'DEBATE',premise:'A',turnLimit:2,participants:[participant('for',0),participant('against',1)]});
  beginTurn(conversation);recordTurn(conversation,{text:'Opening',generation_latency_ms:1});
  const intervention=submitAudienceIntervention(conversation,'That is nonsense',{durationMs:50});
  const responder=beginTurn(conversation);
  recordTurn(conversation,{text:'A normal continuation',generation_latency_ms:1});
  completePlayback(conversation,{durationMs:250});
  assert.equal(responder.id,conversation.transcript[0].speaker_id);
  assert.equal(intervention.pendingParticipantIds.length,2);
  assert.equal(conversation.state,STATES.ACTIVE);
});
test('audience intervention rejects empty and overlong comments',()=>{
  const conversation=createConversation({format:'INTERVIEW',premise:'A',participants:[participant('interviewer',0),participant('guest',1)]});
  assert.throws(()=>submitAudienceIntervention(conversation,'   '),/1-500/);
  assert.throws(()=>submitAudienceIntervention(conversation,'x'.repeat(501)),/1-500/);
});
