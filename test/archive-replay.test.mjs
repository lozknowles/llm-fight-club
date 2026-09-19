import test from 'node:test';
import assert from 'node:assert/strict';
import {ArchiveReplay} from '../public/archive-replay.js';

function fixture(){
 const player={src:'',plays:[],pause(){},removeAttribute(){this.src='';},load(){},async play(){this.plays.push(this.src);}};
 const states=[];
 const replay=new ArchiveReplay(player,{url:(id,turn)=>`/${id}/playback/${turn}.wav`,onState:s=>states.push(s)});
 replay.setConversation({id:'saved',transcript:[{turn_id:'a',audio_file:'a.wav'},{turn_id:'missing'},{turn_id:'b',audio_file:'b.wav'}]});
 return {player,replay,states};
}
test('saved replay is manual, ordered, skips unavailable audio and never starts another generation',async()=>{
 const {player,replay,states}=fixture();assert.equal(player.plays.length,0);
 await replay.play(0,true);player.onended();await Promise.resolve();
 assert.deepEqual(player.plays,['/saved/playback/a.wav','/saved/playback/b.wav']);
 player.onended();assert.equal(states.at(-1).state,'Finished');assert.equal(replay.continuous,false);
});
test('individual replay does not advance; skip and stop cancel continuous playback',async()=>{
 const {player,replay,states}=fixture();await replay.play(0);player.onended();assert.equal(player.plays.length,1);
 await replay.play(0,true);await replay.skip();assert.equal(replay.index,1);
 replay.stop();player.onended();assert.equal(player.src,'');assert.equal(replay.index,-1);assert.equal(replay.continuous,false);
 assert.equal(states.at(-1).state,'Finished');
});
test('missing audio and blocked browser playback fail visibly without synthesising substitutes',async()=>{
 const {player,replay,states}=fixture();player.play=async()=>{throw Error('NotAllowed');};
 await replay.play(0,true);assert.match(states.at(-1).state,/Press play/);
 player.onerror();assert.equal(replay.continuous,false);assert.match(states.at(-1).state,/could not be loaded/);
});
test('pause and resume preserve the saved source and continuous sequence',async()=>{
 const {player,replay}=fixture();let paused=0;player.pause=()=>paused++;
 await replay.play(0,true);const src=player.src;replay.pause();await replay.resume();
 assert.equal(player.src,src);assert.equal(replay.continuous,true);assert.ok(paused>=1);
 assert.deepEqual(player.plays,[src,src]);
});
