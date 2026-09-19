// Site-specific, explicit private deployment. No production Agent Control changes.
// Never prints credentials or touches recordings, sessions, SSH policy or Apache.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {SpeechCapabilityClient} from '../speech/capability-client.mjs';

const release = path.resolve(import.meta.dirname, '..');
const privateDir = '/fast/work/llm-fight-club-csm-private-20260919';
const qualification = '/fast/qualification/fight-club-phase8-20260919';
const appUnit = 'llm-fight-club-app-internal.service';
const speechUnit = 'llm-fight-club-csm-capability.service';
const unitRoot = path.join(os.homedir(), '.config/systemd/user');
const dropin = path.join(unitRoot, `${appUnit}.d/90-csm-prepared-private.conf`);
const run = (...args) => execFileSync('systemctl', ['--user',...args], {encoding:'utf8'}).trim();
const sha = value => createHash('sha256').update(value).digest('hex');
const wait = ms => new Promise(r=>setTimeout(r,ms));
const envFor = async pid => Object.fromEntries((await fs.readFile(`/proc/${pid}/environ`,'utf8')).split('\0').filter(Boolean).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));
const envText = values => Object.entries(values).map(([k,v])=>`${k}="${String(v).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n')}"`).join('\n')+'\n';
const manifestFile = path.join(privateDir,'deployment.json');
const mode = process.argv[2];
if (!['prepare','activate','rollback','status'].includes(mode)) throw Error('Choose prepare, activate, rollback or status');
if (!release.startsWith('/fast/releases/spoken-ai-studio-csm-')) throw Error('Must run from immutable CSM release checkout');
if (execFileSync('git',['status','--porcelain'],{cwd:release,encoding:'utf8'}).trim()) throw Error('Release checkout must be clean');

if (mode === 'prepare') {
  await fs.mkdir(privateDir,{recursive:true,mode:0o700});
  try { await fs.access(manifestFile); throw Error('Deployment already prepared; inspect before replacing'); } catch(e) { if(e.code!=='ENOENT')throw e; }
  const q = JSON.parse(await fs.readFile(path.join(qualification,'runtime-private.json'),'utf8'));
  for (const [kind,script] of [['speech','speech/capability-service.mjs'],['app','server-spoken.mjs']]) {
    if (!(await fs.readFile(`/proc/${q[`${kind}Pid`]}/cmdline`,'utf8')).includes(path.join(q.root,script))) throw Error('Qualification process identity mismatch');
  }
  const oldAppPid = Number(run('show',appUnit,'-p','MainPID','--value'));
  const original = await envFor(oldAppPid), speechEnv = await envFor(q.speechPid), testEnv = await envFor(q.appPid);
  if(original.PORT!=='18871'||original.HOST!=='100.125.120.114')throw Error('Internal endpoint changed; inspect before promotion');
  if(!original.FIGHT_CLUB_DATA_DIR||!original.VOICE_LAB_DATA_DIR)throw Error('Persistent app/voice storage must remain configured');
  const client = new SpeechCapabilityClient({url:'http://127.0.0.1:19396',token:q.token});
  const health = await client.health(); if(health.state!=='ready'||health.pending!==0)throw Error('Wait for idle ready CSM worker');
  const capabilities = await client.capabilities();
  const workerValues = {};
  for(const key of ['PYTHONPATH','CSM_MODEL_DIR','CSM_CHECKPOINT_SHA256','CSM_ANCHOR_DIR','CSM_MALLOW_SEED_WAV','CSM_MALLOW_SEED_SHA256','SPEECH_WORKER_COMMAND','SPEECH_CACHE_DIR']) {
    if(!speechEnv[key])throw Error(`Missing worker setting ${key}`); workerValues[key]=speechEnv[key];
  }
  Object.assign(workerValues,{SPEECH_WORKER_ARGS:JSON.stringify([path.join(release,'speech/backends/csm-worker.py')]),SPEECH_PORT:'19396',AGENT_CONTROL_SPEECH_TOKEN:q.token});
  const appValues = {FIGHT_CLUB_PREPARED_ENABLED:'1',FIGHT_CLUB_PREPARED_REPLAY_ONLY:'0',AGENT_CONTROL_SPEECH_URL:'http://127.0.0.1:19396',AGENT_CONTROL_SPEECH_TOKEN:q.token,
    FIGHT_CLUB_PREPARED_MODEL_ROUTES:testEnv.FIGHT_CLUB_MODEL_ROUTES,FIGHT_CLUB_PREPARED_MODEL_API_KEYS:testEnv.FIGHT_CLUB_MODEL_API_KEYS||'{}'};
  const speechFile=path.join(privateDir,'speech.env'),appFile=path.join(privateDir,'app.env');
  await fs.writeFile(speechFile,envText(workerValues),{mode:0o600,flag:'wx'});
  await fs.writeFile(appFile,envText(appValues),{mode:0o600,flag:'wx'});
  const unit=`[Unit]\nDescription=Private CSM speech capability for prepared Fight Club\nAfter=network.target\nStartLimitIntervalSec=600\nStartLimitBurst=3\n\n[Service]\nType=simple\nWorkingDirectory=${release}\nEnvironmentFile=${speechFile}\nExecStart=/usr/bin/node ${release}/speech/capability-service.mjs\nRestart=on-failure\nRestartSec=30\nTimeoutStopSec=15\nKillMode=control-group\nUMask=0077\nNoNewPrivileges=true\n\n[Install]\nWantedBy=default.target\n`;
  const override=`[Service]\nWorkingDirectory=${release}\nEnvironmentFile=${appFile}\nExecStart=\nExecStart=/usr/bin/node ${release}/server-spoken.mjs\n`;
  await fs.writeFile(path.join(privateDir,'speech.service'),unit,{mode:0o600,flag:'wx'});
  await fs.writeFile(path.join(privateDir,'app-dropin.conf'),override,{mode:0o600,flag:'wx'});
  const manifest={release,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:release,encoding:'utf8'}).trim(),preparedAt:new Date().toISOString(),oldAppPid,
    previousWorkingDirectory:run('show',appUnit,'-p','WorkingDirectory','--value'),qualificationRoot:q.root,qualificationSpeechPid:q.speechPid,
    appDataDirectory:original.FIGHT_CLUB_DATA_DIR,voiceDataDirectory:original.VOICE_LAB_DATA_DIR,capabilities,unitHash:sha(unit),dropinHash:sha(override),activated:false};
  await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({prepared:true,commit:manifest.commit,persistentDataPreserved:true,privateOnly:true}));
} else {
  const m=JSON.parse(await fs.readFile(manifestFile,'utf8'));
  if(m.release!==release)throw Error('Release identity changed');
  if(mode==='activate') {
    if(m.activated)throw Error('Already activated');
    if(Number(run('show',appUnit,'-p','MainPID','--value'))!==m.oldAppPid)throw Error('Internal service changed since preparation');
    const unit=await fs.readFile(path.join(privateDir,'speech.service'),'utf8'),override=await fs.readFile(path.join(privateDir,'app-dropin.conf'),'utf8');
    if(sha(unit)!==m.unitHash||sha(override)!==m.dropinHash)throw Error('Deployment artifact changed');
    if(!(await fs.readFile(`/proc/${m.qualificationSpeechPid}/cmdline`,'utf8')).includes(path.join(m.qualificationRoot,'speech/capability-service.mjs')))throw Error('Worker ownership changed');
    await fs.writeFile(path.join(unitRoot,speechUnit),unit,{mode:0o600,flag:'wx'});
    process.kill(m.qualificationSpeechPid,'SIGTERM');
    await wait(6000); run('daemon-reload'); run('start',speechUnit);
    const q=JSON.parse(await fs.readFile(path.join(qualification,'runtime-private.json'),'utf8'));
    const client=new SpeechCapabilityClient({url:'http://127.0.0.1:19396',token:q.token}); let ready=false;
    for(let i=0;i<90;i++){try{if((await client.health()).state==='ready'){ready=true;break;}}catch{}await wait(2000);}
    if(!ready)throw Error('CSM failed readiness; existing live app was NOT changed');
    const caps=await client.capabilities();
    if(JSON.stringify(caps.voices)!==JSON.stringify(m.capabilities.voices)||caps.checkpoint!==m.capabilities.checkpoint)throw Error('Voice/checkpoint drift');
    await fs.mkdir(path.dirname(dropin),{recursive:true});
    await fs.writeFile(dropin,override,{mode:0o600,flag:'wx'});
    run('daemon-reload');
    try {
      run('restart',appUnit);
      await wait(2000);
      const r=await fetch('http://100.125.120.114:18871/api/prepared-battles/config');const config=await r.json();
      if(!r.ok||config.replayOnly||config.speechHealth.state!=='ready'||config.models.length<2)throw Error('Live application not ready');
      run('enable',speechUnit);m.activated=true;m.activatedAt=new Date().toISOString();
      await fs.writeFile(manifestFile,JSON.stringify(m,null,2),{mode:0o600});
      console.log(JSON.stringify({activated:true,commit:m.commit,models:config.models,speech:config.speechHealth}));
    } catch(e) {
      await fs.rename(dropin,path.join(privateDir,'failed-app-dropin.conf'));
      run('daemon-reload');run('restart',appUnit);throw Error('Readiness failed; previous app restored');
    }
  } else if(mode==='rollback') {
    if(sha(await fs.readFile(dropin))!==m.dropinHash)throw Error('Drop-in drift; refusing rollback overwrite');
    await fs.rename(dropin,path.join(privateDir,'rolled-back-app-dropin.conf'));
    run('daemon-reload');run('restart',appUnit);run('disable','--now',speechUnit);
    m.activated=false;m.rolledBackAt=new Date().toISOString();await fs.writeFile(manifestFile,JSON.stringify(m,null,2),{mode:0o600});
    console.log('Previous app restored. CSM data and credentials retained privately for recovery.');
  } else console.log(JSON.stringify({commit:m.commit,activated:m.activated,app:run('is-active',appUnit),speech:run('is-active',speechUnit)}));
}
