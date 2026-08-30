import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveTurnAudio, buildConversationFfmpegArgs } from '../lib/audio-archive.mjs';

test('saves streamed PCM as an individually downloadable WAV turn', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spoken-audio-'));
  try {
    const file = await saveTurnAudio({
      dataDir, conversationId: 'conversation-1', turnId: 'turn-1',
      bytes: new Uint8Array([0, 0, 255, 127]), audioFormat: 'pcm_s16le_24000_mono',
    });
    const wav = await fs.readFile(file);
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
    assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
    assert.equal(wav.readUInt32LE(40), 4);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('builds an MP3 assembly with a natural silence gap between every turn', () => {
  const args = buildConversationFfmpegArgs(['/one.wav', '/two.wav', '/three.wav'], '/conversation.mp3', 350);
  assert.equal(args.filter((value) => value === 'anullsrc=r=24000:cl=mono').length, 2);
  assert.match(args[args.indexOf('-filter_complex') + 1], /concat=n=5:v=0:a=1/);
  assert.deepEqual(args.slice(-6), ['-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', '/conversation.mp3'].slice(-6));
});
