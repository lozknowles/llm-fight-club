import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicAccess, PUBLIC_RETENTION_MS, publicView } from '../lib/public-access.mjs';

function context() {
  let now = Date.now();
  const access = new PublicAccess({enabled:true, origins:['https://example.test'], models:['local-a','local-b'],clock:()=>now});
  const headers = {};
  const request = {method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}};
  const response = {setHeader:(name,value)=>headers[name]=value};
  const visitor = access.begin(request,response,new URL('https://example.test/api/config'),new Map());
  request.headers.cookie = headers['Set-Cookie'].split(';')[0];
  return {access,request,response,visitor,headers,advance:ms=>{now+=ms;}};
}
test('public sessions use scoped secure cookies and hide all other visitors and expired records',()=>{
  const c=context();
  assert.match(c.headers['Set-Cookie'], /HttpOnly; SameSite=Strict; Max-Age=86400; Secure/);
  assert.match(c.headers['Set-Cookie'], /Path=\/llm-debate\//);
  const own={id:'one',createdAt:new Date().toISOString(),publicOwner:c.visitor.owner};
  assert(c.access.owns(own,c.visitor));
  assert(!c.access.owns({...own,publicOwner:'another'},c.visitor));
  assert(!c.access.owns({...own,publicOwner:undefined},c.visitor));
  c.advance(PUBLIC_RETENTION_MS+1000); assert(!c.access.owns(own,c.visitor));
});
test('every transcript, audio and mutation route checks ownership; private tools stay unavailable',()=>{
  const c=context(), records=new Map([['one',{id:'one',createdAt:new Date().toISOString(),publicOwner:'not-this-visitor'}]]);
  for(const route of ['/api/conversations/one','/api/conversations/one/export.json','/api/conversations/one/export.md',
    '/api/conversations/one/playback/turn.wav','/api/conversations/one/audio/turn.wav','/api/conversations/one/conversation.mp3',
    '/api/conversations/one/next','/api/voice-lab/profiles','/voice-lab.html','/prepared-battle.html','/api/battles','/x/audio.html']) {
    assert.throws(()=>c.access.begin(c.request,c.response,new URL('https://example.test'+route),records),e=>e.publicStatus===404,route);
  }
});
test('cross-origin mutations cannot use the anonymous session',()=>{
  const c=context(); c.request.method='POST';
  for(const origin of [undefined,'https://evil.test','null']){
    c.request.headers.origin=origin;
    assert.throws(()=>c.access.begin(c.request,c.response,new URL('https://example.test/api/conversations'),new Map()),e=>e.publicStatus===403);
  }
});
test('public creation restricts models, voices and turns, with per-address admission limits',()=>{
  const c=context();
  const input={turnLimit:40,participants:[{model:'local-a',voice:'awb',voiceProfile:{secret:'private'}},{model:'local-b',voice:'slt'}]};
  const output=c.access.creation(structuredClone(input),c.visitor);
  assert.equal(output.turnLimit,6); assert.equal(output.interruptionLevel,'OFF'); assert.equal(output.participants[0].voiceProfile,null);
  assert.throws(()=>c.access.creation({...input,participants:[{model:'paid',voice:'awb'},{model:'local-b',voice:'slt'}]},c.visitor),e=>e.publicStatus===400);
  c.access.creation(structuredClone(input),c.visitor); c.access.creation(structuredClone(input),c.visitor);
  assert.throws(()=>c.access.creation(input,c.visitor),e=>e.publicStatus===429);
});
test('generation concurrency is bounded and speech rejects private voices or foreign conversations',()=>{
  const c=context(); const release=c.access.generation(c.visitor);
  assert.throws(()=>c.access.generation(c.visitor),e=>e.publicStatus===503);
  release(); c.access.generation(c.visitor)();
  assert.throws(()=>c.access.speech({voice:'csm-fighter-a',text:'Hello'},c.visitor,new Map()),e=>e.publicStatus===400);
  assert.throws(()=>c.access.speech({voice:'awb',text:'Hello',conversationId:'other'},c.visitor,new Map()),e=>e.publicStatus===404);
});
test('public responses remove ownership and internal routing while retaining replay availability',()=>{
  const result=publicView({publicOwner:'secret',transcript:[{text:'An argument',baseUrl:'http://private',audio_file:'/private/turn.wav',speech_evidence:{secret:'x'}}]});
  assert.deepEqual(result,{transcript:[{text:'An argument',audio_file:'saved'}]});
});
