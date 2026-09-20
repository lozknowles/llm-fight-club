import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PERSONALITIES} from '../lib/conversation-engine.mjs';

test('anonymous HTTP lifecycle isolates two visitors and protects generation, exports and voice tools',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'public-debate-test-'));
  let calls=0;
  const model=http.createServer((req,res)=>{calls++;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'Creative tools can help people explore an idea, but judgement still belongs to the person.'}}],usage:{total_tokens:25}}));});
  model.listen(0,'127.0.0.1'); await once(model,'listening');
  const child=spawn(process.execPath,['server-spoken.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,
    HOST:'127.0.0.1',PORT:'0',FIGHT_CLUB_PUBLIC:'1',FIGHT_CLUB_PUBLIC_ORIGINS:'https://example.test',
    FIGHT_CLUB_PUBLIC_INSECURE_LOCAL:'1',FIGHT_CLUB_PUBLIC_PATH:'/',FIGHT_CLUB_DATA_DIR:dir,
    VOICE_LAB_ENABLED:'0',FIGHT_CLUB_PREPARED_ENABLED:'0',
    FIGHT_CLUB_MODEL_ROUTES:JSON.stringify({'local-a':`http://127.0.0.1:${model.address().port}/v1`}),
  },stdio:['ignore','pipe','pipe']});
  try {
    let output='';
    const base=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Public server did not start')),15000);
      child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/listening on (http:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
      child.once('exit',code=>{clearTimeout(timer);reject(Error('Public server exited '+code));});
    });
    const initial=await fetch(base+'/api/config'); const cookie=initial.headers.get('set-cookie').split(';')[0];
    assert.equal(initial.status,200);
    const second=await fetch(base+'/api/config'); const other=second.headers.get('set-cookie').split(';')[0];
    const request=(route,{owner=cookie,method='GET',body,origin='https://example.test'}={})=>fetch(base+route,{method,headers:{cookie:owner,origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const input={format:'DEBATE',premise:'AI helps creative people.',outputMode:'TEXT',turnLimit:40,participants:[
      {name:'Mara',role:'for',model:'local-a',voice:'awb',personality:PERSONALITIES[0]},
      {name:'Cedric',role:'against',model:'local-a',voice:'slt',personality:PERSONALITIES[1]},
    ]};
    const created=await request('/api/conversations',{method:'POST',body:input}); assert.equal(created.status,201);
    const c=await created.json(); assert.equal(c.turnLimit,6); assert.equal(c.publicOwner,undefined);
    const next=await request(`/api/conversations/${c.id}/next`,{method:'POST',body:{}}); assert.equal(next.status,200);
    const result=await next.json(); assert(result.turn.text); assert(calls>0); assert.equal(result.conversation.publicOwner,undefined);
    const ownList=await (await request('/api/conversations')).json(); assert.equal(ownList.length,1);
    assert.deepEqual(await (await request('/api/conversations',{owner:other})).json(),[]);
    for(const suffix of ['', '/export.json','/export.md','/playback/turn.wav','/audio/turn.wav','/conversation.mp3']) {
      assert.equal((await request(`/api/conversations/${c.id}${suffix}`,{owner:other})).status,404,suffix);
    }
    assert.equal((await request(`/api/conversations/${c.id}/stop`,{owner:other,method:'POST',body:{}})).status,404);
    assert.equal((await request(`/api/conversations/${c.id}/stop`,{origin:'https://evil.test',method:'POST',body:{}})).status,403);
    for(const route of ['/voice-lab.html','/prepared-battle.html','/api/voice-lab/profiles','/api/battles'])assert.equal((await request(route)).status,404);
    assert.equal((await request('/tts/stream',{method:'POST',body:{voice:'eleven-interviewer',text:'Hello'}})).status,400);
    assert.equal((await request('/tts/stream',{owner:other,method:'POST',body:{voice:'awb',text:'Hello',conversationId:c.id}})).status,404);
    const voices=await(await request('/tts/voices')).json(); assert.deepEqual(voices.voices,['awb','slt','rms']);
    const page=await(await request('/audio.html')).text(); assert(page.includes('data-public-demo="true"')); assert(!page.includes('voice-lab.html'));
  } finally {
    child.kill(); await once(child,'exit').catch(()=>{}); model.close();
    assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)); await fs.rm(dir,{recursive:true,force:true});
  }
});
