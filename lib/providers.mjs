import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const clean = value => String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim();
export class OpenAICompatibleModelProvider {
  constructor({baseUrl, timeoutMs=90000}) { this.baseUrl=baseUrl.replace(/\/$/, ''); this.timeoutMs=timeoutMs; }
  async generate({model, system, user}) { const started=performance.now(); const signal=AbortSignal.timeout(this.timeoutMs); const response=await fetch(`${this.baseUrl}/chat/completions`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:user}],temperature:0.85,max_tokens:320,chat_template_kwargs:{enable_thinking:false}}),signal}); if (!response.ok) throw new Error(`Model provider ${response.status}: ${await response.text()}`); const data=await response.json(); const text=clean(data.choices?.[0]?.message?.content); if (!text) throw new Error('Model provider returned no text'); return {text, latencyMs:Math.round(performance.now()-started), usage:data.usage || null, provider:'openai-compatible', model}; }
}
export class MeloSpeechProvider {
  constructor({baseUrl, cacheDir}) { this.baseUrl=baseUrl.replace(/\/$/, ''); this.cacheDir=cacheDir; }
  async synthesize({text, voice}) { const key=createHash('sha256').update(`${voice}\0${text}`).digest('hex'); const file=path.join(this.cacheDir,`${key}.wav`); try { const bytes=await fs.readFile(file); return {file, bytes, cacheHit:true, latencyMs:0, durationMs:waveDuration(bytes), provider:'melo-tts', voice}; } catch {} const started=performance.now(); const res=await fetch(`${this.baseUrl}/synthesize`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,voice,speed:1})}); if (!res.ok) throw new Error(`Speech provider ${res.status}: ${await res.text()}`); const bytes=Buffer.from(await res.arrayBuffer()); if (bytes.subarray(0,4).toString() !== 'RIFF') throw new Error('Speech provider did not return WAV audio'); await fs.mkdir(this.cacheDir,{recursive:true}); await fs.writeFile(file,bytes); return {file,bytes,cacheHit:false,latencyMs:Math.round(performance.now()-started),durationMs:waveDuration(bytes),provider:'melo-tts',voice}; }
}
export function waveDuration(bytes) { if (bytes.length<44 || bytes.subarray(0,4).toString()!=='RIFF') return null; const rate=bytes.readUInt32LE(28), size=bytes.readUInt32LE(40); return rate ? Math.round(size/rate*1000) : null; }
