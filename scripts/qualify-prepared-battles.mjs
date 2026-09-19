// Real bounded qualification: two local, two API, mixed. No fixture speech.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SpeechCapabilityClient, sha256, canonical } from '../speech/capability-client.mjs';
const directory = process.env.PREPARED_QUALIFICATION_DIR;
const runtime = JSON.parse(await fs.readFile(path.join(directory,'runtime-private.json'),'utf8'));
const speech = new SpeechCapabilityClient({url:'http://127.0.0.1:19396',token:runtime.token});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const api = async (route, body) => {
  const res = await fetch(`http://127.0.0.1:18892/api/prepared-battles${route}`,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const data = await res.json(); if(!res.ok) throw Error(data.error); return data;
};
const report = {schema:'fight-club.phase8-real-qualification/v1',startedAt:new Date().toISOString(),battles:[]};
const save = () => fs.writeFile(path.join(directory,'qualification.json'),JSON.stringify(report,null,2));
let ready = false;
for(let i=0;i<90;i++) { if((await speech.health()).state==='ready'){ready=true;break;} await sleep(2000); }
assert.ok(ready,'CSM failed to become ready');
report.capabilities = await speech.capabilities();
for (const [label,models,blind] of [
  ['local',['qwen2.5-3b','qwen2.5-coder-3b'],false],
  ['api',['gpt-4.1-mini-2025-04-14','gpt-4.1-nano-2025-04-14'],true],
  ['mixed',['qwen2.5-3b','gpt-4.1-nano-2025-04-14'],true],
]) {
  const created = await api('',{premise:'Public libraries should stay open late.',models,rounds:1,blind,speechMode:'CSM'});
  console.log(JSON.stringify({event:'battle-created',label,id:created.id}));
  let b;
  for(let i=0;i<450;i++) {
    b = await api(`/${created.id}`);
    if(b.executionState==='FAILED') throw Error(`${label}: model or judge failed`);
    if(b.executionState==='COMPLETED' && b.presentation.every(r=>['READY','TEXT_ONLY','CANCELLED'].includes(r.state))) break;
    await sleep(2000);
  }
  assert.equal(b.executionState,'COMPLETED');
  const raw = JSON.parse(await fs.readFile(path.join(directory,'app-data/prepared-battles',`${b.id}.json`),'utf8'));
  assert.ok(raw.presentation.every(r=>r.state==='READY'),`speech fallback in ${label}`);
  assert.ok(raw.responses.every(r=>sha256(r.text)===r.transcriptHash));
  const fighters=raw.presentation.filter(r=>r.lane!=='HOST');
  assert.equal(canonical(fighters[0].evidence.settings),canonical(fighters[1].evidence.settings));
  assert.notEqual(fighters[0].evidence.voiceIdentity.revision,fighters[1].evidence.voiceIdentity.revision);
  if(blind) for(const model of models) assert.ok(!JSON.stringify(b).includes(model));
  for(const row of raw.presentation) {
    const response=await fetch(`http://127.0.0.1:18892/api/prepared-battles/${b.id}/audio/${row.id}.wav`);
    assert.equal(response.status,200); assert.equal(sha256(Buffer.from(await response.arrayBuffer())),row.evidence.audioHash);
  }
  report.battles.push({label,id:b.id,models:raw.responses.map(r=>r.model),blind,winner:b.judgement.winner,benchmarkHash:b.benchmarkHash,
    modelLatencyMs:raw.responses.map(r=>r.modelLatencyMs),speech:raw.presentation.map(r=>({lane:r.lane,...r.evidence})),status:'PASS'});
  console.log(JSON.stringify({event:'battle-completed',label,id:b.id,winner:b.judgement.winner,audioSeconds:raw.presentation.reduce((n,r)=>n+r.evidence.audioDurationSeconds,0)})); await save();
  const first=raw.presentation[0]; const cached=await speech.synthesise({text:first.text,voice:first.voiceIdentity});
  assert.equal(cached.evidence.cacheHit,true); assert.equal(cached.evidence.audioHash,first.evidence.audioHash);
  report.cachedReplay={status:'PASS',audioHash:cached.evidence.audioHash,requestLatencyMs:cached.evidence.requestLatencyMs}; await save();
}
report.completedAt=new Date().toISOString(); await save();
console.log('Real local/API/mixed prepared-battle generation PASS. Browser playback is a separate check.');
