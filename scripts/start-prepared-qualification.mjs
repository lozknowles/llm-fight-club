// Isolated Linux qualification only. Never reads/restarts production services.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
const root = path.resolve(import.meta.dirname, '..');
const directory = process.env.PREPARED_QUALIFICATION_DIR;
if (!directory || !path.isAbsolute(directory)) throw Error('Set an absolute private PREPARED_QUALIFICATION_DIR');
fs.mkdirSync(directory, {recursive:true,mode:0o700});
const stateFile = path.join(directory,'runtime-private.json');
if (fs.existsSync(stateFile)) throw Error('Qualification state already exists; inspect running processes before starting again');
for (const port of [19396,18892]) await new Promise((resolve,reject) => {
  const s = net.connect({host:'127.0.0.1',port}); s.on('connect',()=>{s.destroy();reject(Error(`Port ${port} already in use`));}); s.on('error',e=>e.code==='ECONNREFUSED'?resolve():reject(e));
});
const token = randomBytes(32).toString('hex');
const environment = { ...process.env, AGENT_CONTROL_SPEECH_TOKEN:token, SPEECH_PORT:'19396', SPEECH_CACHE_DIR:path.join(directory,'cache'),
  SPEECH_WORKER_COMMAND:'/fast/work/omnivoice-social-voice-20260905/.venv/bin/python',
  SPEECH_WORKER_ARGS:JSON.stringify([path.join(root,'speech/backends/csm-worker.py')]),
  PYTHONPATH:'/fast/qualification/csm-1b-p5000-20260918/runtime/python-packages:/fast/qualification/csm-1b-p5000-20260918/runtime/csm-source',
  CSM_MODEL_DIR:'/fast/qualification/csm-1b-p5000-20260918/runtime/csm-native-singlefile',
  CSM_CHECKPOINT_SHA256:'2e7721144afe38b906d4f1048671da639fe142423f4a26283606ecebe894f4bf',
  CSM_ANCHOR_DIR:path.join(directory,'anchors'),
  CSM_MALLOW_SEED_WAV:'/fast/qualification/csm-1b-p5000-20260918/audio/00-mallow-seed.wav',
  CSM_MALLOW_SEED_SHA256:'99d05966582a591eacb4461aa81477c310ddb56dc6f06741cf4f7c68972f02fe',
  AGENT_CONTROL_SPEECH_URL:'http://127.0.0.1:19396', FIGHT_CLUB_PREPARED_ENABLED:'1', FIGHT_CLUB_DATA_DIR:path.join(directory,'app-data'),
  FIGHT_CLUB_MODEL_ROUTES:process.env.FIGHT_CLUB_MODEL_ROUTES || JSON.stringify({'qwen2.5-3b':'http://127.0.0.1:8080/v1','qwen2.5-coder-3b':'http://127.0.0.1:8081/v1'}),
  FIGHT_CLUB_SPEECH_URL:'http://127.0.0.1:18873', HOST:'127.0.0.1', PORT:'18892', VOICE_LAB_ENABLED:'0' };
const launch = (script, name) => {
  const log = fs.openSync(path.join(directory,`${name}.log`),'a',0o600);
  const child = spawn(process.execPath,[path.join(root,script)],{cwd:root,env:environment,detached:true,stdio:['ignore',log,log]});
  child.unref(); fs.closeSync(log); return child.pid;
};
const speechPid = launch('speech/capability-service.mjs','speech'), appPid = launch('server-spoken.mjs','app');
fs.writeFileSync(stateFile,JSON.stringify({token,speechPid,appPid,root,startedAt:new Date().toISOString()}),{mode:0o600});
console.log(JSON.stringify({speechPid,appPid,appUrl:'http://127.0.0.1:18892/prepared-battle.html',privateState:stateFile}));
