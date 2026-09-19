import test from 'node:test';
import assert from 'node:assert/strict';
import {CapabilityMenuProvider,CAPABILITY_VOICES,conversationAudioExportAllowed} from '../speech/providers/capability-menu-provider.mjs';
import {sha256} from '../speech/capability-client.mjs';
import {pcmS16leToWav} from '../public/audio-format.js';
function fixture(){
 const bytes=Buffer.from(pcmS16leToWav(Buffer.alloc(48000)));
 const caps={backend:'fixture-capability',checkpoint:'checkpoint',settings:{seed:1},codecVersion:'wav-v1',voices:CAPABILITY_VOICES.map((v,i)=>({id:v.backendVoice,revision:String(i+1).repeat(64),provenance:'original-generated-synthetic'}))};
 let calls=0;
 const client={capabilities:async()=>structuredClone(caps),synthesise:async input=>{calls++;return{bytes,evidence:{backend:caps.backend,checkpoint:caps.checkpoint,settings:caps.settings,codecVersion:caps.codecVersion,voiceIdentity:caps.voices.find(v=>v.id===input.voice),audioHash:sha256(bytes),transcriptHash:sha256(input.text),generationLatencyMs:10,audioDurationSeconds:1,realTimeFactor:.01,watermark:'NOT_APPLIED'}};}};
 return {caps,client,calls:()=>calls,provider:new CapabilityMenuProvider({enabled:true,client})};
}
test('main voice menu exposes three labelled CSM performers only when enabled',()=>{
 const f=fixture();assert.equal(f.provider.voicesForMenu().length,3);assert.match(f.provider.voicesForMenu()[2].label,/Mallow/);
 assert.deepEqual(new CapabilityMenuProvider().voicesForMenu(),[]);
 assert.equal(conversationAudioExportAllowed({participants:[{voice:'csm-fighter-a'}]}),false);
 assert.equal(conversationAudioExportAllowed({participants:[{voice:'enrolled:existing'}]}),true);
});
test('conversation bridge pins identity, preserves exact text and audio evidence, and refuses changed voices',async()=>{
 const f=fixture(),binding=await f.provider.bind('csm-fighter-a');
 const r=await f.provider.response({voice:'csm-fighter-a',text:'Exact\nwords',voiceBinding:binding});
 const evidence=JSON.parse(decodeURIComponent(r.headers.get('x-speech-evidence')));
 assert.equal(evidence.transcriptHash,sha256('Exact\nwords'));assert.equal(evidence.audioHash,sha256(Buffer.from(await r.arrayBuffer())));assert.equal(evidence.exportAllowed,false);
 f.caps.voices[0].revision='b'.repeat(64);
 await assert.rejects(f.provider.response({voice:'csm-fighter-a',text:'New words',voiceBinding:binding}),/voice changed/);
 assert.equal(f.calls(),1);
});
test('speed affects presentation only, and cancellation is never silently substituted',async()=>{
 const f=fixture();let rate;
 f.provider.tempo=async(bytes,value)=>{rate=value;return bytes;};
 const r=await f.provider.response({voice:'csm-fighter-b',text:'Hello',speechRate:1.1});
 assert.equal(rate,1.1);assert.equal(JSON.parse(decodeURIComponent(r.headers.get('x-speech-evidence'))).presentationTransform,'ffmpeg-atempo-v1');
 const controller=new AbortController();controller.abort();
 await assert.rejects(f.provider.response({voice:'csm-fighter-a',text:'No',signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(f.provider.response({voice:'csm-unknown',text:'No'}),/Unknown/);
});
