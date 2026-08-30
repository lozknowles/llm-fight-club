import test from 'node:test'; import assert from 'node:assert/strict';
import {waveDuration,OpenAICompatibleModelProvider} from '../lib/providers.mjs';
test('WAV duration parser rejects non-WAV and reads PCM byte rate',()=>{assert.equal(waveDuration(Buffer.from('nope')),null);let b=Buffer.alloc(44);b.write('RIFF');b.writeUInt32LE(16000,28);b.writeUInt32LE(32000,40);assert.equal(waveDuration(b),2000);});
test('model provider surfaces an unavailable provider rather than inventing a turn',async()=>{let p=new OpenAICompatibleModelProvider({baseUrl:'http://127.0.0.1:9',timeoutMs:100});await assert.rejects(()=>p.generate({model:'x',system:'s',user:'u'}));});
