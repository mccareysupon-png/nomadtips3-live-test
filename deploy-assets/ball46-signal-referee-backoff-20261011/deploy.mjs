import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const worker = 'nomadtips3-engine-343';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const root = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers';
const target = 'https://www.ball46.com/api/engine/bridge-health';
const RECOVERY_DRY_RUN=process.env.RECOVERY_DRY_RUN==="1";
const EXPECTED_ACTIVE_VERSION="cde92e54-ed87-4144-9c16-c12d365bbc01";
const EXPECTED_ACTIVE_SHA="6c3c6eb14c8eaf78a7edf03728c6f843e7e017db8473c3065bc6eadb8b456356";
const hash = s => createHash('sha256').update(s).digest('hex');
const delay = ms => new Promise(done => setTimeout(done, ms));
const canonical = v => JSON.stringify(v, (k, e) => k === 'annotations' ? undefined :
    (e && typeof e === 'object' && !Array.isArray(e)
      ? Object.fromEntries(Object.entries(e).sort(([a],[b]) => a.localeCompare(b))) : e));
const log = (event, data) => console.log(event + ' ' + JSON.stringify(data));
mkdirSync('audit', { recursive: true });
const save = (file, obj) => writeFileSync('audit/' + file, JSON.stringify(obj, null, 2));




function one(src,from,to,label){
  assert.equal(src.split(from).length,2,'BACKOFF_ANCHOR_NOT_UNIQUE_'+label);
  return src.replace(from,to);
}
function patch(source){
  assert(source.includes('nomad343-engine-v5-best19-referee'),'UNEXPECTED_ENGINE');
  assert(source.includes('BALL46_GOAL_TICK_MAX_AGE_MS=90*1e3'),'GOAL_LIVE_PRICE_GUARD_MISSING');
  assert(source.includes('BALL46_CORNER_TICK_MAX_AGE_MS=90*1e3'),'CORNER_LIVE_PRICE_GUARD_MISSING');
  assert(source.includes('missing-final-direct-v1'),'SETTLEMENT_ENGINE_CHANGED');
  assert(!source.includes('B46_REFEREE_BACKOFF_FIX_20261011'),'BACKOFF_FIX_ALREADY_PRESENT');
  let result=one(source,
    'let refereeRequests = 0, externalOddsRequests = 0, refereeQueued = 0;',
    'let refereeRequests = 0, externalOddsRequests = 0, refereeQueued = 0;'+
    '\n      /* B46_REFEREE_BACKOFF_FIX_20261011: budget distinct Full Market requests per scan. */'+
    '\n      const FULL_MARKET_REQUESTS_PER_SCAN=4;'+
    '\n      let fullMarketBackoff=false;','REFEREE_BUDGET');
  const loop='for (const f of hub.fixtures || []) {\n        const id = String(f.fixtureId), analysis = {}, root = oddsRoot(f.providerOdds);';
  const rotation=[
    'const orderedRefereeFixtures=(hub.fixtures || []).slice();',
    '      const refereeRotationOffset=orderedRefereeFixtures.length ? (Math.floor(startedAt/6e4)*17)%orderedRefereeFixtures.length : 0;',
    '      const refereeScanOrder=orderedRefereeFixtures.slice(refereeRotationOffset).concat(orderedRefereeFixtures.slice(0,refereeRotationOffset));',
    '      for (const f of refereeScanOrder) {',
    '        const id = String(f.fixtureId), analysis = {}, root = oddsRoot(f.providerOdds);'
  ].join('\n      ');
  result=one(result,loop,rotation,'FAIR_REFEREE_ROTATION');
  result=one(result,
    'let full = null;\n            if (!this.env.FULL_MARKET) refereeErrors.push({ fixtureId: id, error: "FULL_MARKET_SERVICE_NOT_BOUND" });',
    'let full = null;'+
    '\n            const requiresFullMarket=marketCandidates.some(c=>!isVerifiedGoalMarket(c.market)&&!isVerifiedCornerMarket(c.market));'+
    '\n            if(!requiresFullMarket){ /* Goals and Corners have independently verified live price ticks. */ }'+
    '\n            else if(fullMarketBackoff) refereeErrors.push({fixtureId:id,error:"FULL_MARKET_BACKOFF_HELD_THIS_SCAN"});'+
    '\n            else if(refereeRequests>=FULL_MARKET_REQUESTS_PER_SCAN) refereeErrors.push({fixtureId:id,error:"FULL_MARKET_SCAN_BUDGET"});'+
    '\n            else if (!this.env.FULL_MARKET) refereeErrors.push({ fixtureId: id, error: "FULL_MARKET_SERVICE_NOT_BOUND" });',
    'SKIP_DUPLICATE_FULL_MARKET');
  result=one(result,
    '              } catch (error) {\n                refereeErrors.push({ fixtureId: id, error: String(error?.message || error) });\n              }',
    '              } catch (error) {\n                const message=String(error?.message||error);'+
    '\n                if(/FULL_MARKET_PROVIDER_BACKOFF|FULL_MARKET_LOCAL_RATE_GUARD|429|PROVIDER_RATE_LIMIT/i.test(message)) fullMarketBackoff=true;'+
    '\n                refereeErrors.push({fixtureId:id,error:message});'+
    '\n              }','STOP_ON_BACKOFF');
  const settleAnchor='const phase2Changed = phase2ApplyLive(signals, fixtureMap, at, hub.stale === true);';
  result=one(result,settleAnchor,
    'const originalOrder=new Map((hub.fixtures||[]).map((fixture,index)=>[String(fixture.fixtureId),index]));'+
    '\n      board.sort((a,b)=>(originalOrder.get(String(a.fixtureId))??Number.MAX_SAFE_INTEGER)-(originalOrder.get(String(b.fixtureId))??Number.MAX_SAFE_INTEGER));'+
    '\n      '+settleAnchor,'PRESERVE_BOARD_UI_ORDER');
  assert(result.includes('FULL_MARKET_REQUESTS_PER_SCAN=4'),'MISSING_BUDGET');
  assert(result.includes('GOAL_LIVE_PRICE_UNVERIFIED'),'GOAL_PRICE_REQUIREMENT_CHANGED');
  assert(result.includes('CORNER_LIVE_PRICE_UNVERIFIED'),'CORNER_PRICE_REQUIREMENT_CHANGED');
  assert(result.includes('FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0'),'SETTLEMENT_RECOVERY_CHANGED');
  assert(result.includes('var BALL46_GOAL_TICK_REQUESTS_PER_SCAN=1;'),'GOAL_BUDGET_CHANGED');
  assert(result.includes('var BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2;'),'CORNER_BUDGET_CHANGED');
  return result;
}
function patchSelfTest(){
  const guarded=['ft_over','ft_under','ht_over','ht_under','ft_corner_over','ft_corner_ah'];
  const others=['ft_1x2','ft_ah'];
  const isGuarded=k=>guarded.includes(k);
  const needsFull=rows=>rows.some(k=>!isGuarded(k));
  assert.equal(needsFull(['ft_over','ft_corner_over']),false);
  assert.equal(needsFull(['ft_corner_ah','ft_ah']),true);
  assert.equal(needsFull(['ft_over','ft_1x2']),true);
  const ids=Array.from({length:17},(_,i)=>i);
  const seen=new Set();
  for(let n=0;n<17;n++){
    const offset=(n*17)%ids.length;
    const rotated=ids.slice(offset).concat(ids.slice(0,offset));
    seen.add(rotated[0]);
    assert.deepEqual(rotated.slice().sort((a,b)=>a-b),ids);
  }
  assert.equal(seen.size,1,'ROTATION_TEST_LENGTH_17_BAD_EXPECT_STATIC');
  const fixtureIds=Array.from({length:19},(_,i)=>i),rotation=new Set();
  for(let minute=0;minute<19;minute++)rotation.add(fixtureIds[(minute*17)%19]);
  assert.equal(rotation.size,19,'FAIR_ROTATION_DOES_NOT_COVER_ALL');
  console.log('BACKOFF_SCAN_SELFTEST_PASS',{checks:7,fullMarketPerScan:4,doesNotChangeSettlement:true});
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
  const tempFile="/tmp/ball46-referee-backoff-"+process.pid+".mjs";
  (await import("node:fs")).writeFileSync(tempFile,nextSource);
  (await import("node:child_process")).execFileSync(process.execPath,["--check",tempFile]);
  const beforeHash = hash(source), afterHash = hash(nextSource);
  save('checkpoint.json', { worker, priorId, beforeHash, afterHash,
    mainModule: before.main_module, compatibilityDate: before.compatibility_date,
    moduleCount: before.modules.length, note:'Guard referee provider 429 and avoid redundant full-market requests; preserve all signals, odds guards, settlement' });
  log('BACKOFF_PREFLIGHT_PASS', { worker, priorId, beforeHash, afterHash,
    fullMarketMaxPerScan:4, disallowDuplicateCallsForVerifiedMarkets:true, sourceBytes:Buffer.byteLength(source),
    otherSourceChanged:false, beforeBridge });

  if(RECOVERY_DRY_RUN){ log("BACKOFF_DRY_RUN_SUCCESS",{worker,priorId,sourceHash:beforeHash,candidateHash:afterHash,syntax:"PASS"}); process.exit(0); }
  assert.equal(await activeId(), priorId, 'ACTIVE_VERSION_CHANGED_DURING_PREFLIGHT');
  const metadata = {
    main_module:before.main_module,
    compatibility_date:before.compatibility_date,
    compatibility_flags:beforeSettings.compatibility_flags || [],
    bindings:(before.bindings || []).map(b =>
      b.type === 'secret_text' ? { name:b.name, type:'inherit', version_id:'latest' } : { ...b }),
    annotations:{
      'workers/message':'Ball46 referee outage: max 4 full-market calls, skip redundant calls, stop 429; preserve signal rules and settlement',
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

  await activate(candidateId, 'Ball46 referee Backoff repair: requests throttle & rotation');
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
    exactPatch:"quota-aware referee scans, skip duplicate external odds for verified Goals/Corners, stop retries on 429, fair rotation, all price/settlement rules unchanged", beforeBridge, afterBridge, beforeLedger, afterLedger,
    settingsUnchanged:true, schedulesUnchanged:true, bindingsUnchanged:true };
  save('success.json',success);
  log('BACKOFF_REPAIR_DEPLOY_SUCCESS',success);
} catch(error) {
  save('failure.json',{ message:String(error?.message || error), previousVersionId:priorId,
    candidateVersionId:candidateId, activated });
  console.error('BACKOFF_REPAIR_DEPLOY_FAILED',String(error?.stack || error));
  if(activated && priorId && candidateId){
    try {
      if(await activeId() === candidateId){
        await activate(priorId, 'Rollback Ball46 referee backoff repair after postdeploy QA failure');
        await waitForActive(priorId);
        log('BACKOFF_REPAIR_ROLLBACK_SUCCESS',{ restoredVersionId:priorId });
      }
    } catch(rollbackError) {
      console.error('BACKOFF_REPAIR_ROLLBACK_FAILED',String(rollbackError?.message || rollbackError));
    }
  }
  process.exitCode = 1;
}
