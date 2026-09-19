// Restart only the two isolated processes created by start-prepared-qualification.
// Credentials never enter stdout, Git, or browser configuration.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const directory = process.env.PREPARED_QUALIFICATION_DIR;
const file = path.join(directory, 'runtime-private.json');
const runtime = JSON.parse(fs.readFileSync(file, 'utf8'));
const root = path.resolve(import.meta.dirname, '..');
if (runtime.root !== root) throw Error('Qualification root mismatch');
const environments = {};
for (const [kind, script] of [['speech','speech/capability-service.mjs'],['app','server-spoken.mjs']]) {
  const pid = runtime[`${kind}Pid`];
  if (!Number.isInteger(pid) || !fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(path.join(root, script))) throw Error('Process identity mismatch; no restart');
  environments[kind] = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map(line => { const i = line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
}
if (process.env.QUALIFICATION_OPENAI_ENV_FILE) {
  const source = fs.readFileSync(process.env.QUALIFICATION_OPENAI_ENV_FILE, 'utf8');
  const key = source.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
  if (!key) throw Error('Existing OpenAI key not found; no key was requested or printed');
  const response = await fetch('https://api.openai.com/v1/models', {headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error(`OpenAI model discovery HTTP ${response.status}`);
  const data = await response.json(), selected = ['gpt-4.1-mini-2025-04-14','gpt-4.1-nano-2025-04-14'];
  if (selected.some(id=>!data.data.some(m=>m.id===id))) throw Error('Qualification model snapshots not available');
  const routes = JSON.parse(environments.app.FIGHT_CLUB_MODEL_ROUTES);
  for (const id of selected) routes[id] = 'https://api.openai.com/v1';
  environments.app.FIGHT_CLUB_MODEL_ROUTES = JSON.stringify(routes);
  environments.app.FIGHT_CLUB_MODEL_API_KEYS = JSON.stringify(Object.fromEntries(selected.map(id=>[id,key])));
  console.log('Two existing API model snapshots verified; credentials retained server-side only.');
}
for (const kind of ['speech','app']) process.kill(runtime[`${kind}Pid`],'SIGTERM');
await new Promise(r=>setTimeout(r,5000));
for (const [kind, script] of [['speech','speech/capability-service.mjs'],['app','server-spoken.mjs']]) {
  const log = fs.openSync(path.join(directory,`${kind}.log`),'a',0o600);
  const child = spawn(process.execPath,[path.join(root,script)],{cwd:root,env:environments[kind],detached:true,stdio:['ignore',log,log]});
  child.unref(); fs.closeSync(log); runtime[`${kind}Pid`] = child.pid;
}
fs.writeFileSync(file,JSON.stringify(runtime),{mode:0o600});
console.log('Isolated qualification processes refreshed; production untouched.');
