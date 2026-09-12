// Technical checks only: any reference created here is original synthetic speech,
// not a person's recording and not an accepted Voice Lab profile.
import fs from 'node:fs/promises';
const directory = '/fast/work/llm-fight-club-voice-lab-private-20260912';
async function envValue(file, name) {
  const lines = (await fs.readFile(file, 'utf8')).split('\n');
  const value = lines.find(line => line.startsWith(`${name}=`))?.slice(name.length + 1).trim();
  if (!value) throw Error('Required private credential missing');
  return value.replace(/^['"]|['"]$/g, '');
}
const oldKey = await envValue('/fast/qualification/agent-control-social-voice-20260905/speech.env', 'AGENT_CONTROL_SPEECH_TOKEN');
const newKey = await envValue(`${directory}/worker.env`, 'VOICE_LAB_WORKER_TOKEN');
async function request(route, key, payload) {
  const response = await fetch(`http://127.0.0.1:19194${route}`, { method: payload ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(payload ? 180000 : 5000) });
  if (!response.ok) throw Error(`Worker ${route} failed (${response.status})`);
  return response.json();
}
let oldHealth;
for (let i = 0; i < 10; i++) {
  try { oldHealth = await request('/health', oldKey); break; } catch { await new Promise(resolve => setTimeout(resolve, 3000)); }
}
if (!oldHealth) throw Error('Existing worker health did not recover');
const newHealth = await request('/voice-lab/health', newKey);
const unauthorized = await fetch('http://127.0.0.1:19194/voice-lab/health', { headers: { authorization: `Bearer ${oldKey}` } });
if (unauthorized.status !== 401) throw Error('Dedicated worker authentication regression');
const report = { at: new Date().toISOString(), oldHealth: oldHealth.state, newHealth, oldKeyRejectedForEnrolment: true, humanEnrolment: false };
console.log(JSON.stringify(report));
if (process.argv.includes('--synthetic')) {
  const referenceText = 'This is an original synthetic test voice. We are checking that the existing speech worker still works correctly.';
  const original = await request('/synthesize', oldKey, { text: referenceText, voice: oldHealth.voice, format: 'wav' });
  const created = await request('/voice-lab/create', newKey, { audio: original.audio, text: referenceText });
  const cloned = await request('/voice-lab/synthesize', newKey, { representation: created.representation, version: created.version,
    text: 'The next round asks whether a town should build a new library. Let us hear both sides before reaching a decision.' });
  const evidence = `${directory}/technical-evidence`;
  await fs.mkdir(evidence, { recursive: true, mode: 0o700 });
  await fs.writeFile(`${evidence}/original-synthetic-reference.wav`, Buffer.from(original.audio, 'base64'), { mode: 0o600 });
  await fs.writeFile(`${evidence}/synthetic-conditioned-test.wav`, Buffer.from(cloned.audio, 'base64'), { mode: 0o600 });
  report.syntheticTest = { referenceKind: 'newly generated original synthetic speech, not human', version: created.version, method: created.method,
    originalMetrics: original.metrics, conditionedMetrics: cloned.metrics, physicalQualification: false };
  console.log(JSON.stringify(report.syntheticTest));
}
await fs.writeFile(`${directory}/worker-verification.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
const activation = JSON.parse(await fs.readFile(`${directory}/activation.json`, 'utf8'));
activation.status = 'WORKER_VERIFIED'; activation.verified_at = report.at;
await fs.writeFile(`${directory}/activation.json`, JSON.stringify(activation, null, 2), { mode: 0o600 });
