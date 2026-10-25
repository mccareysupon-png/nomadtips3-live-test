import { patch } from './patch.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const worker = 'nomadtips3-engine-343';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const root = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers';
const target = 'https://www.ball46.com/api/engine/bridge-health';
const hash = s => createHash('sha256').update(s).digest('hex');
const delay = ms => new Promise(done => setTimeout(done, ms));
const canonical = v => JSON.stringify(v, (k, e) => k === 'annotations' ? undefined :
    (e && typeof e === 'object' && !Array.isArray(e)
      ? Object.fromEntries(Object.entries(e).sort(([a],[b]) => a.localeCompare(b))) : e));
const log = (event, data) => console.log(event + ' ' + JSON.stringify(data));
mkdirSync('audit', { recursive: true });
const save = (file, obj) => writeFileSync('audit/' + file, JSON.stringify(obj, null, 2));

async function api(path, opt = {}) {
  assert(account && token, 'CLOUDFLARE_CREDENTIALS_MISSING');
  const resp = await fetch(root + path, {
    ...opt,
    headers: { Authorization: 'Bearer ' + token, ...opt.headers },
    signal: AbortSignal.timeout(60000)
  });
  const json = await resp.json().catch(() => null);
  assert(resp.ok && json?.success === true, 'CLOUDFLARE_API_FAILED_' + resp.status + '_' + path + '_' +
      JSON.stringify(json?.errors || []).slice(0, 400));
  return json.result;
}
async function activeId() {
  const obj = await api('/scripts/' + worker + '/deployments');
  const versions = obj.deployments?.[0]?.versions || [];
  assert(versions.length === 1 && Number(versions[0].percentage) === 100,
    'PRODUCTION_VERSION_NOT_UNAMBIGUOUS_100_PERCENT');
  return versions[0].version_id;
}
const version = id => api('/workers/' + worker + '/versions/' + id + '?include=modules');
const settings = () => api('/scripts/' + worker + '/settings');
const schedules = () => api('/scripts/' + worker + '/schedules');
const bindings = v => canonical((v.bindings || []).map(x => ({ ...x })).sort((a,b) => a.name.localeCompare(b.name)));
const settingView = s => canonical(Object.fromEntries(Object.entries(s).filter(([key]) => key !== 'annotations')));
async function publicBridge() {
  const res = await fetch(target + '?age_deploy_audit=' + Date.now(), {
    cache:'no-store', signal: AbortSignal.timeout(25000)
  });
  const j = await res.json().catch(() => null);
  assert(res.ok && j?.ok === true, 'PUBLIC_BRIDGE_HEALTH_FAILED_' + res.status);
  return {
    version: j.version,
    statisticsLedgerVersion: j.statisticsLedgerVersion,
    workingStoreVersion: j.workingStoreVersion,
    finalReconcileVersion: j.finalReconcileVersion
  };
}
async function activate(id, message) {
  return api('/scripts/' + worker + '/deployments', {
    method:'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({
      strategy:'percentage',
      versions:[{ version_id:id, percentage:100 }],
      annotations:{ 'workers/message':message }
    })
  });
}
async function waitForActive(id) {
  for(let attempt = 0; attempt < 12; attempt++) {
    if(await activeId() === id) return;
    await delay(2500);
  }
  throw new Error('CANDIDATE_NOT_ACTIVE');
}

let priorId = null;
let candidateId = null;
let activated = false;
try {
  await import('./test.mjs');
  priorId = await activeId();
  const [before, beforeSettings, beforeSchedules, beforeBridge] = await Promise.all([
    version(priorId), settings(), schedules(), publicBridge()
  ]);
  const main = before.modules?.find(m => m.name === before.main_module);
  assert(main?.content_base64, 'ACTIVE_MAIN_MODULE_UNAVAILABLE');
  const source = Buffer.from(main.content_base64, 'base64').toString('utf8');
  const nextSource = patch(source);
  const beforeHash = hash(source), afterHash = hash(nextSource);
  save('checkpoint.json', { worker, priorId, beforeHash, afterHash,
    mainModule: before.main_module, compatibilityDate: before.compatibility_date,
    moduleCount: before.modules.length, note:'Phase2 Goals/Corners OVER live full WIN + reversible V2 Ledger; Phase1 preserved' });
  log('PHASE2_DEPLOY_PREFLIGHT_PASS', { worker, priorId, beforeHash, afterHash,
    phase2Markets:['ft_over','ht_over','ft_corner_over','ht_corner_over'], sourceBytes:Buffer.byteLength(source),
    phase1Retained:true, beforeBridge });

  assert.equal(await activeId(), priorId, 'ACTIVE_VERSION_CHANGED_DURING_PREFLIGHT');
  const metadata = {
    main_module:before.main_module,
    compatibility_date:before.compatibility_date,
    compatibility_flags:beforeSettings.compatibility_flags || [],
    bindings:(before.bindings || []).map(b =>
      b.type === 'secret_text' ? { name:b.name, type:'inherit', version_id:'latest' } : { ...b }),
    annotations:{
      'workers/message':'Ball46 Phase2: 5USD LIVE Goals/Corners OVER full WIN with reversal',
      'workers/commit_sha':process.env.GITHUB_SHA || ''
    }
  };
  for(const key of ['logpush','observability','limits','placement','tail_consumers']){
    if(beforeSettings[key] != null) metadata[key] = beforeSettings[key];
  }
  const form = new FormData();
  form.set('metadata', new Blob([JSON.stringify(metadata)], { type:'application/json' }));
  for(const module of before.modules){
    const bytes = module.name === before.main_module ?
      Buffer.from(nextSource) : Buffer.from(module.content_base64, 'base64');
    form.set(module.name, new Blob([bytes], { type:module.content_type }), module.name);
  }
  const uploaded = await api('/scripts/' + worker + '/versions?bindings_inherit=strict',
    { method:'POST', body:form });
  candidateId = uploaded.id;
  assert(candidateId, 'NO_UPLOADED_CANDIDATE_ID');
  const candidate = await version(candidateId);
  const candidateMain = candidate.modules?.find(m => m.name === candidate.main_module);
  assert(candidateMain?.content_base64, 'UPLOADED_MAIN_UNAVAILABLE');
  assert.equal(hash(Buffer.from(candidateMain.content_base64, 'base64')), afterHash,
    'UPLOADED_MODULE_DIFFERS_FROM_TESTED_PHASE2_PATCH');
  assert.equal(candidate.main_module,before.main_module,'MAIN_MODULE_CHANGED');
  assert.equal(candidate.modules.length,before.modules.length,'MODULE_COUNT_CHANGED');
  assert.equal(bindings(candidate),bindings(before),'BINDINGS_CHANGED');
  assert.equal(candidate.compatibility_date,before.compatibility_date,'COMPAT_DATE_CHANGED');
  assert.equal(await activeId(),priorId,'ANOTHER_DEPLOY_INTERVENED_ABORT');

  await activate(candidateId, 'Ball46 Phase2 LIVE OVER full WIN and 5USD corrections');
  activated = true;
  await waitForActive(candidateId);
  const current = await version(candidateId);
  const currentMain = current.modules.find(m => m.name === current.main_module);
  assert.equal(hash(Buffer.from(currentMain.content_base64,'base64')),afterHash,
    'ACTIVE_WORKER_SOURCE_UNEXPECTED');
  assert.equal(bindings(current),bindings(before),'ACTIVE_BINDINGS_CHANGED');
  assert.equal(settingView(await settings()),settingView(beforeSettings),'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()),canonical(beforeSchedules),'SCHEDULES_CHANGED');
  const afterBridge = await publicBridge();
  assert.equal(canonical(afterBridge),canonical(beforeBridge),'PUBLIC_BRIDGE_VERSION_CHANGED');
  for (const endpoint of ['/health', '/ledger-health']) {
    const url = 'https://www.ball46.com/api/engine' + endpoint + '?phase2_deploy_qa=' + Date.now();
    const res = await fetch(url, {cache:'no-store',signal:AbortSignal.timeout(45000)});
    const body = await res.json().catch(() => null);
    assert(res.ok && body?.ok===true, 'PUBLIC_QA_FAILED_' + endpoint + '_' + res.status);
    log('PHASE2_PUBLIC_QA_PASS',{endpoint,status:res.status,version:body.version});
  }
  const success = { worker, previousVersionId:priorId, deployedVersionId:candidateId,
    priorSourceHash:beforeHash, newSourceHash:afterHash,
    phase2Markets:['ft_over','ht_over','ft_corner_over','ht_corner_over'], phase1SignalAgeZero:true, beforeBridge, afterBridge,
    settingsUnchanged:true, schedulesUnchanged:true, bindingsUnchanged:true };
  save('success.json',success);
  log('PHASE2_DEPLOY_SUCCESS',success);
} catch(error) {
  save('failure.json',{ message:String(error?.message || error), previousVersionId:priorId,
    candidateVersionId:candidateId, activated });
  console.error('PHASE2_DEPLOY_FAILED',String(error?.stack || error));
  if(activated && priorId && candidateId){
    try {
      if(await activeId() === candidateId){
        await activate(priorId, 'Rollback Ball46 Phase2 after postdeploy QA failure');
        await waitForActive(priorId);
        log('PHASE2_ROLLBACK_SUCCESS',{ restoredVersionId:priorId });
      }
    } catch(rollbackError) {
      console.error('PHASE2_ROLLBACK_FAILED',String(rollbackError?.message || rollbackError));
    }
  }
  process.exitCode = 1;
}
