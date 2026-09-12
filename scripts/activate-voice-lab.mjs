// Operator-approved activation on hpubuntu only. No credentials in stdout.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const unit = 'agent-control-social-voice-speech-pilot.service';
const root = '/fast/work/llm-fight-club-voice-lab-20260912';
const privateRoot = '/fast/work/llm-fight-club-voice-lab-private-20260912';
const dropin = path.join(os.homedir(), '.config/systemd/user', `${unit}.d/60-voice-lab.conf`);
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const show = (name, field) => run('systemctl', ['--user', 'show', name, `--property=${field}`, '--value']);
const exists = async file => fs.access(file).then(() => true, () => false);
if (os.hostname() !== 'hpubuntu' || process.getuid?.() !== 1000) throw Error('This activation is scoped to the hpubuntu operator account');
if (process.argv[2] !== '--activate') throw Error('Explicit --activate required');
if (await exists(dropin)) throw Error('Existing activation override found; inspect it instead of overwriting');
if (show(unit, 'ActiveState') !== 'active') throw Error('Existing worker is not active');
if (run('ss', ['-Htn', 'state', 'established', 'sport', '=', ':19194'])) throw Error('Worker has an active connection; do not interrupt it');
const pid = show('llm-fight-club-app-internal.service', 'MainPID');
if (!/^\d+$/.test(pid) || pid === '0') throw Error('Cannot inspect existing app routes');
const env = Object.fromEntries((await fs.readFile(`/proc/${pid}/environ`, 'utf8')).split('\0').filter(Boolean).map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));
await fs.mkdir(privateRoot, { recursive: true, mode: 0o700 });
if (await exists(`${privateRoot}/app.env`)) throw Error('Private configuration already exists; refusing to replace credentials');
const workerKey = randomBytes(32).toString('hex'), ownerKey = randomBytes(32).toString('hex');
const safe = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const appEnv = { HOST: '127.0.0.1', PORT: '18891', FIGHT_CLUB_DATA_DIR: `${privateRoot}/app-data`,
  FIGHT_CLUB_SPEECH_URL: env.FIGHT_CLUB_SPEECH_URL || 'http://127.0.0.1:18873',
  FIGHT_CLUB_MODEL_URL: env.FIGHT_CLUB_MODEL_URL || 'http://127.0.0.1:18780/v1',
  FIGHT_CLUB_MODEL_ROUTES: env.FIGHT_CLUB_MODEL_ROUTES || '{}', VOICE_LAB_ENABLED: '1',
  VOICE_LAB_DATA_DIR: `${privateRoot}/profiles`, VOICE_LAB_ACCESS_KEY: ownerKey,
  VOICE_LAB_WORKER_URL: 'http://127.0.0.1:19194', VOICE_LAB_WORKER_TOKEN: workerKey };
await fs.writeFile(`${privateRoot}/worker.env`, `VOICE_LAB_WORKER_TOKEN=${workerKey}\n`, { mode: 0o600 });
await fs.writeFile(`${privateRoot}/app.env`, Object.entries(appEnv).map(([k, v]) => `${k}=${safe(v)}`).join('\n') + '\n', { mode: 0o600 });
await fs.writeFile(`${privateRoot}/access-key.txt`, ownerKey, { mode: 0o600 });
await fs.writeFile(`${privateRoot}/activation.json`, JSON.stringify({ at: new Date().toISOString(), previousPid: show(unit, 'MainPID'),
  previousActivation: show(unit, 'ActiveEnterTimestamp'), workerUnit: unit, override: dropin, sourceRoot: root,
  authority: 'Operator explicitly approved controlled existing-worker activation', status: 'ACTIVATING' }, null, 2), { mode: 0o600 });
await fs.mkdir(path.dirname(dropin), { recursive: true, mode: 0o700 });
await fs.writeFile(dropin, `[Service]\nEnvironmentFile=${privateRoot}/worker.env\nExecStart=\nExecStart=/fast/work/omnivoice-social-voice-20260905/.venv/bin/python ${root}/scripts/run-voice-lab-worker.py /fast/work/agent-control-social-voice-20260905/scripts/speech-worker.py --model /fast/qualification/agent-control-social-voice-20260905/omnivoice-model --state /fast/qualification/agent-control-social-voice-20260905/speech-pilot\n`, { mode: 0o600 });
try {
  run('systemctl', ['--user', 'daemon-reload']);
  if (!show(unit, 'ExecStart').includes('run-voice-lab-worker.py')) throw Error('Worker override did not apply');
  run('systemctl', ['--user', 'restart', unit]);
  console.log(JSON.stringify({ status: 'worker-restarting', previousSourceUntouched: true, privateConfiguration: privateRoot, pid: show(unit, 'MainPID') }));
} catch (error) {
  await fs.unlink(dropin);
  run('systemctl', ['--user', 'daemon-reload']); run('systemctl', ['--user', 'restart', unit]);
  throw Error('Activation failed; restored original worker startup. Inspect service status without exposing private environment files.');
}
