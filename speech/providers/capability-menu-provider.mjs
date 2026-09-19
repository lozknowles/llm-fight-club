import {SpeechCapabilityClient, canonical, sha256} from '../capability-client.mjs';
import {changeTempo} from './enrolled-speech-provider.mjs';

export const CAPABILITY_VOICES = [
  {id:'csm-fighter-a', backendVoice:'fighter-a', label:'CSM: Fighter A — stable synthetic voice (high quality, slow)'},
  {id:'csm-fighter-b', backendVoice:'fighter-b', label:'CSM: Fighter B — distinct synthetic voice (high quality, slow)'},
  {id:'csm-mallow', backendVoice:'mallow', label:'CSM: Mallow — host / commentator (high quality, slow)'},
];
export const isCapabilityVoice = voice => typeof voice==='string' && voice.startsWith('csm-');
export const conversationAudioExportAllowed = c => !(c.participants||[]).some(p=>isCapabilityVoice(p.voice));
const bindingOf = (caps,voice) => ({backend:caps.backend,checkpoint:caps.checkpoint,codecVersion:caps.codecVersion,settings:caps.settings,voiceIdentity:caps.voices.find(v=>v.id===voice)});

// Existing conversation UI bridge to generic Agent Control speech capabilities.
// No model-specific imports; identity and generation settings are pinned per conversation.
export class CapabilityMenuProvider {
  constructor({url,token,enabled=false,client,tempo=changeTempo}={}) {
    this.enabled=enabled && Boolean(client||(url&&token)); this.client=client||new SpeechCapabilityClient({url,token}); this.tempo=tempo;
  }
  supports(voice){return isCapabilityVoice(voice);}
  voicesForMenu(){return this.enabled?CAPABILITY_VOICES.map(({id,label})=>({id,label})):[];}
  async bind(voice){
    if(!this.enabled)throw Error('CSM is not enabled on this deployment');
    const selection=CAPABILITY_VOICES.find(v=>v.id===voice);if(!selection)throw Error('Unknown CSM voice');
    const caps=await this.client.capabilities();
    const selected=bindingOf(caps,selection.backendVoice);
    if(!selected.voiceIdentity?.revision?.match(/^[a-f0-9]{64}$/)||selected.voiceIdentity.provenance!=='original-generated-synthetic')throw Error('CSM voice provenance unavailable');
    return selected;
  }
  async response({voice,text,speechRate=1,voiceBinding,signal}){
    const rate=Number(speechRate);if(!Number.isFinite(rate)||rate<.7||rate>1.4)throw Error('Invalid voice speed');
    signal?.throwIfAborted();
    const current=await this.bind(voice),binding=voiceBinding||current;
    if(canonical(current)!==canonical(binding))throw Error('CSM voice changed; start a new conversation after qualification');
    const start=performance.now();
    const result=await this.client.synthesise({text,voice:binding.voiceIdentity.id},signal);
    const e=result.evidence;
    const actual={backend:e.backend,checkpoint:e.checkpoint,codecVersion:e.codecVersion,settings:e.settings,voiceIdentity:e.voiceIdentity};
    if(canonical(actual)!==canonical(binding)||e.audioHash!==sha256(result.bytes)||e.transcriptHash!==sha256(text))throw Error('CSM speech evidence mismatch');
    const processingStarted=performance.now();
    const bytes=rate===1?result.bytes:await this.tempo(result.bytes,rate);signal?.throwIfAborted();
    const evidence={...e,sourceAudioHash:e.audioHash,audioHash:sha256(bytes),presentationSpeechRate:rate,
      presentationTransform:rate===1?'none':'ffmpeg-atempo-v1',presentationLatencyMs:performance.now()-processingStarted,
      audioDurationSeconds:rate===1?e.audioDurationSeconds:(bytes.length-44)/48000,exportAllowed:false};
    return new Response(bytes,{headers:{'content-type':'audio/wav','x-audio-format':'wav',
      'x-tts-provider':e.backend,'x-tts-model':e.checkpoint,'x-tts-voice':voice,'x-tts-profile':'CSM',
      'x-tts-generation-ms':String(e.generationLatencyMs),'x-tts-latency-ms':String(performance.now()-start),
      'x-tts-audio-duration-ms':String(evidence.audioDurationSeconds*1000),'x-tts-rtf':String(e.realTimeFactor),'x-tts-fallback':'false',
      'x-speech-evidence':encodeURIComponent(JSON.stringify(evidence))}});
  }
}
