import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pcmS16leToWav } from '../public/audio-format.js';

const safeId = (value, label) => {
  const id = String(value || '');
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error(`Invalid ${label}`);
  return id;
};

export function conversationAudioDirectory(dataDir, conversationId) {
  return path.join(dataDir, 'audio', safeId(conversationId, 'conversation id'));
}

export function turnAudioPath(dataDir, conversationId, turnId) {
  return path.join(conversationAudioDirectory(dataDir, conversationId), `${safeId(turnId, 'turn id')}.wav`);
}

export function conversationMp3Path(dataDir, conversationId) {
  return path.join(conversationAudioDirectory(dataDir, conversationId), 'conversation.mp3');
}

function run(command, args, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-1000)}`)));
  });
}

export async function saveTurnAudio({ dataDir, conversationId, turnId, bytes, audioFormat, ffmpeg = 'ffmpeg', spawnImpl = spawn }) {
  const directory = conversationAudioDirectory(dataDir, conversationId);
  const target = turnAudioPath(dataDir, conversationId, turnId);
  const source = path.join(directory, `.${safeId(turnId, 'turn id')}.source`);
  const input = Buffer.from(bytes);
  await fs.mkdir(directory, { recursive: true });

  if (audioFormat === 'pcm_s16le_24000_mono') {
    await fs.writeFile(target, pcmS16leToWav(input));
    return target;
  }
  if (input.subarray(0, 4).toString() === 'RIFF') {
    await fs.writeFile(target, input);
    return target;
  }

  await fs.writeFile(source, input);
  try {
    await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', source, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', target], spawnImpl);
  } finally {
    await fs.rm(source, { force: true });
  }
  return target;
}

export function buildConversationFfmpegArgs(turnFiles, outputFile, gapMs = 350) {
  if (!turnFiles.length) throw new Error('No turn audio is available');
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  const inputCount = turnFiles.length * 2 - 1;
  turnFiles.forEach((file, index) => {
    args.push('-i', file);
    if (index < turnFiles.length - 1) args.push('-f', 'lavfi', '-t', String(gapMs / 1000), '-i', 'anullsrc=r=24000:cl=mono');
  });
  const filters = Array.from({ length: inputCount }, (_, index) => `[${index}:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono[a${index}]`);
  const inputs = Array.from({ length: inputCount }, (_, index) => `[a${index}]`).join('');
  args.push(
    '-filter_complex', `${filters.join(';')};${inputs}concat=n=${inputCount}:v=0:a=1[out]`,
    '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', outputFile,
  );
  return args;
}

export async function assembleConversationMp3({ dataDir, conversation, gapMs = 350, ffmpeg = 'ffmpeg', spawnImpl = spawn }) {
  const directory = conversationAudioDirectory(dataDir, conversation.id);
  const candidates = conversation.transcript.map((turn) => turnAudioPath(dataDir, conversation.id, turn.turn_id));
  const present = [];
  for (const file of candidates) {
    try { await fs.access(file); present.push(file); } catch {}
  }
  if (!present.length) throw new Error('No saved turn audio is available');
  const target = conversationMp3Path(dataDir, conversation.id);
  const temporary = path.join(directory, '.conversation.tmp.mp3');
  await run(ffmpeg, buildConversationFfmpegArgs(present, temporary, gapMs), spawnImpl);
  await fs.rename(temporary, target);
  return { path: target, turnCount: present.length, gapMs };
}
