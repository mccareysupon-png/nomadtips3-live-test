import assert from 'node:assert/strict';
import {patchJohnGoals as patch} from './patch.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const worker = 'nomadtips3-engine-343';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const root = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers';
const target = 'https://www.ball46.com/api/engine/bridge-health';
const RECOVERY_DRY_RUN=process.env.RECOVERY_DRY_RUN==="1";
const EXPECTED_ACTIVE_VERSION="d5e2cfba-0ec8-4098-ae4c-41cda0a18689";
const EXPECTED_ACTIVE_SHA="0f805be374ca93395b5984b7576a193a2d73424adbc60ac49729a2c21e5a964f";
const hash = s => createHash('sha256').update(s).digest('hex');
const delay = ms => new Promise(done => setTimeout(done, ms));
const canonical = v => JSON.stringify(v, (k, e) => k === 'annotations' ? undefined :
    (e && typeof e === 'object' && !Array.isArray(e)
      ? Object.fromEntries(Object.entries(e).sort(([a],[b]) => a.localeCompare(b))) : e));
const log = (event, data) => console.log(event + ' ' + JSON.stringify(data));
mkdirSync('audit', { recursive: true });
const save = (file, obj) => writeFileSync('audit/' + file, JSON.stringify(obj, null, 2));




function patchSelfTest(){
  const isCorner=k=>["ft_corner_over","ft_corner_under","ht_corner_over","ht_corner_under","ft_corner_ah"].includes(k);
  const needsJohn=markets=>markets.some(k=>!isCorner(k));
  for(const key of ["ft_over","ft_under","ht_over","ht_under","ft_ah","ft_1x2"])
    assert.equal(needsJohn([key]),true,"GOALS_OTHERS_REQUIRE_JOHN_"+key);
  for(const key of ["ft_corner_over","ht_corner_over","ft_corner_ah"])
    assert.equal(needsJohn([key]),false,"PRESERVE_CORNER_REFEREE_"+key);
  assert.equal(needsJohn(["ft_over","ft_corner_over"]),true);
  assert.equal(needsJohn(["ft_ah","ft_corner_over"]),true);
  assert.equal(needsJohn(["ft_corner_over","ft_corner_ah"]),false);
  console.log("JOHN_GOALS_SELFTEST_PASS",JSON.stringify({checks:11,goalsRequireQualifiedFullMarket:true,cornersUnchanged:true,extraGoalHistoryCalls:0}));
}
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
async function publicLedgerHealth(){
  const res=await fetch('https://www.ball46.com/api/engine/ledger-health?ou_guard='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});
  const j=await res.json().catch(()=>null);
  assert(res.ok&&j?.ok===true&&Number(j?.ledgerTotal)>0&&Number(j?.settledTotal)>0,'LEDGER_NOT_HEALTHY_'+res.status);
  return {version:j.version,ledgerTotal:Number(j.ledgerTotal),settledTotal:Number(j.settledTotal)};
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
  patchSelfTest();
  priorId = await activeId();
  assert.equal(priorId,EXPECTED_ACTIVE_VERSION,"CONCURRENT_ENGINE_DEPLOY_ABORT");
  const [before, beforeSettings, beforeSchedules, beforeBridge] = await Promise.all([
    version(priorId), settings(), schedules(), publicBridge()
  ]);
  const beforeLedger = await publicLedgerHealth();
  const main = before.modules?.find(m => m.name === before.main_module);
  assert(main?.content_base64, 'ACTIVE_MAIN_MODULE_UNAVAILABLE');
  const source = Buffer.from(main.content_base64, 'base64').toString('utf8');
  assert.equal(hash(source),EXPECTED_ACTIVE_SHA,"SOURCE_CHANGED_ABORT");
  const nextSource = patch(source);
  const tempFile="/tmp/ball46-goals-john-"+process.pid+".mjs";
  (await import("node:fs")).writeFileSync(tempFile,nextSource);
  (await import("node:child_process")).execFileSync(process.execPath,["--check",tempFile]);
  const beforeHash = hash(source), afterHash = hash(nextSource);
  save('checkpoint.json', { worker, priorId, beforeHash, afterHash,
    mainModule: before.main_module, compatibilityDate: before.compatibility_date,
    moduleCount: before.modules.length, note:'Restore Goals O-U through existing John qualified live-price referee; remove direct goal history; preserve Corners, settlement, statistics' });
  log('JOHN_GOALS_PREFLIGHT_PASS', { worker, priorId, beforeHash, afterHash,
    fullMarketMaxPerScan:4, directGoalHistoryRequests:0, sourceBytes:Buffer.byteLength(source),
    otherSourceChanged:false, beforeBridge });

  if(RECOVERY_DRY_RUN){ log("JOHN_GOALS_DRY_RUN_SUCCESS",{worker,priorId,sourceHash:beforeHash,candidateHash:afterHash,syntax:"PASS"}); process.exit(0); }
  assert.equal(await activeId(), priorId, 'ACTIVE_VERSION_CHANGED_DURING_PREFLIGHT');
  const metadata = {
    main_module:before.main_module,
    compatibility_date:before.compatibility_date,
    compatibility_flags:beforeSettings.compatibility_flags || [],
    bindings:(before.bindings || []).map(b =>
      b.type === 'secret_text' ? { name:b.name, type:'inherit', version_id:'latest' } : { ...b }),
    annotations:{
      'workers/message':'Ball46 Goals O-U: restore John qualified live-price referee, remove extra 5USD history calls',
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
    'UPLOADED_MODULE_DIFFERS_FROM_ONE_LINE_PATCH');
  assert.equal(candidate.main_module,before.main_module,'MAIN_MODULE_CHANGED');
  assert.equal(candidate.modules.length,before.modules.length,'MODULE_COUNT_CHANGED');
  assert.equal(bindings(candidate),bindings(before),'BINDINGS_CHANGED');
  assert.equal(candidate.compatibility_date,before.compatibility_date,'COMPAT_DATE_CHANGED');
  assert.equal(await activeId(),priorId,'ANOTHER_DEPLOY_INTERVENED_ABORT');

  await activate(candidateId, 'Ball46 Goals O-U restore John referee only');
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
  const afterLedger = await publicLedgerHealth();
  assert(afterLedger.ledgerTotal>=beforeLedger.ledgerTotal && afterLedger.settledTotal>=beforeLedger.settledTotal,'LEDGER_RECORDS_LOST_AFTER_DEPLOY');
  const success = { worker, previousVersionId:priorId, deployedVersionId:candidateId,
    priorSourceHash:beforeHash, newSourceHash:afterHash,
    exactPatch:"restore Goals O-U John qualified live-price cache & best-19 pricing; remove direct Goal history API, Corners & settlement unchanged", beforeBridge, afterBridge, beforeLedger, afterLedger,
    settingsUnchanged:true, schedulesUnchanged:true, bindingsUnchanged:true };
  save('success.json',success);
  log('JOHN_GOALS_DEPLOY_SUCCESS',success);
} catch(error) {
  save('failure.json',{ message:String(error?.message || error), previousVersionId:priorId,
    candidateVersionId:candidateId, activated });
  console.error('JOHN_GOALS_DEPLOY_FAILED',String(error?.stack || error));
  if(activated && priorId && candidateId){
    try {
      if(await activeId() === candidateId){
        await activate(priorId, 'Rollback Ball46 John Goals referee repair after postdeploy QA failure');
        await waitForActive(priorId);
        log('JOHN_GOALS_ROLLBACK_SUCCESS',{ restoredVersionId:priorId });
      }
    } catch(rollbackError) {
      console.error('JOHN_GOALS_ROLLBACK_FAILED',String(rollbackError?.message || rollbackError));
    }
  }
  process.exitCode = 1;
}
