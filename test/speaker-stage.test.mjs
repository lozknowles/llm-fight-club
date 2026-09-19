import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {speakerActivity} from '../public/speaker-stage.js';
const participants=[{id:'a',name:'A',role:'for'},{id:'b',name:'B',role:'against'},{id:'host',name:'Host',role:'referee'}];
test('only an actually audible participant talks, with other heads listening',()=>{
 const s=speakerActivity({participants,state:'ACTIVE',speakerId:'b',audible:true});
 assert.deepEqual(s.speakers.map(p=>p.activity),['listening','speaking','listening']);
});
test('preparation is distinct from playback and unknown speakers are not guessed',()=>{
 const s=speakerActivity({participants,state:'ACTIVE',phase:'voice',speakerId:'a',elapsed:12.6});
 assert.equal(s.elapsed,'12s');assert.equal(s.speakers[0].activity,'preparing');
 const thinking=speakerActivity({participants,state:'ACTIVE',phase:'response'});
 assert.equal(thinking.heading,'Preparing next response');assert.ok(thinking.speakers.every(s=>s.activity==='waiting'));
});
test('paused and completed shows are still; errors never look like speech',()=>{
 for(const state of ['PAUSED','COMPLETED','STOPPED']){
  const view=speakerActivity({participants,state,phase:'voice',speakerId:'a'});
  assert.ok(view.speakers.every(s=>!['speaking','preparing'].includes(s.activity)));assert.equal(view.elapsed,'');
 }
 assert.equal(speakerActivity({participants,state:'ACTIVE',phase:'error',speakerId:'a'}).speakers[0].activity,'error');
});
test('reduced motion and user animation opt-out retain text status',async()=>{
 const css=await fs.readFile(new URL('../public/speaker-stage.css',import.meta.url),'utf8');
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/data-motion="off"/);
 assert.match(css,/animation:none!important/);
});
