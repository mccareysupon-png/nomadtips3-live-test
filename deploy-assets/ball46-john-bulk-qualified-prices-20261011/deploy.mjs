import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const worker = 'nomadtips3-engine-343';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const root = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers';
const target = 'https://www.ball46.com/api/engine/bridge-health';
const JOHN_DRY_RUN=process.env.JOHN_DRY_RUN==="1";
const EXPECTED_ACTIVE_VERSION="42a8bf93-895c-4b10-898e-56c209165517";
const EXPECTED_ACTIVE_SHA="d64f2b966aa1b7f71fe7c5aa3f7e45623c369074b67cd3993a9e3b76b78726f6";
const INJECT="/* JOHN_BULK_QUALIFIED_PRICE_PREWARM_20261011.\n       * Use ONE prewarm and ONE cache-only snapshot for qualified fixtures.\n       * No per-fixture request in Engine; the central Full Market DO reserves rate.\n       */\n      const johnEligibleFixtureIds=[];\n      const johnQuotesByFixture=new Map();\n      for(const fixture of refereeScanOrder){\n        if(!isLive(fixture)||hub.stale===true)continue;\n        const fixtureId=String(fixture.fixtureId),hist=histories[fixtureId]||[];\n        let qualified=false;\n        for(const market of MARKET_KEYS){\n          if(!run[market]||isVerifiedCornerMarket(market)||isVerifiedGoalMarket(market)||\n             seen.has(fixtureId+\":\"+market))continue;\n          if(preCandidatesForRule(market,fixture,hist,settings[market]).candidates.length){\n            qualified=true;\n            break;\n          }\n        }\n        if(qualified)johnEligibleFixtureIds.push(fixtureId);\n      }\n      if(johnEligibleFixtureIds.length&&this.env.FULL_MARKET){\n        try{\n          const ids=johnEligibleFixtureIds.slice(0,128);\n          const requestBody=JSON.stringify({fixtureIds:ids});\n          const warmResp=await this.env.FULL_MARKET.fetch(\n            new Request(\"https://full-market.internal/prewarm\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:requestBody})\n          );\n          const warm=await warmResp.json();\n          if(!warmResp.ok||warm?.ok!==true)throw new Error(\"JOHN_CENTRAL_PREWARM_\"+String(warm?.error||warmResp.status));\n          refereeRequests+=Math.max(0,Number(warm.attempted)||0);\n          externalOddsRequests+=Math.max(0,Number(warm.externalRequestsAdded)||0);\n          const cacheResp=await this.env.FULL_MARKET.fetch(\n            new Request(\"https://full-market.internal/board-cache\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:requestBody})\n          );\n          const snapshot=await cacheResp.json();\n          if(!cacheResp.ok||snapshot?.ok!==true)throw new Error(\"JOHN_CENTRAL_CACHE_\"+String(snapshot?.error||cacheResp.status));\n          for(const [fixtureId,entry] of Object.entries(snapshot.entries||{})){\n            const age=Number(entry?.ageMs);\n            if(entry?.stale!==false||!Number.isFinite(age)||age<0||age>45000||\n               !Array.isArray(entry?.fullOdds?.bookmakers)||!entry.fullOdds.bookmakers.length)continue;\n            johnQuotesByFixture.set(fixtureId,{ok:true,fullOdds:entry.fullOdds,cached:true,stale:false,externalRequestsAdded:0});\n          }\n        }catch(error){\n          refereeErrors.push({error:\"JOHN_BULK_PRICING_GATE_\"+String(error?.message||error)});\n        }\n      }\n      for (const f of refereeScanOrder) {";
const hash = s => createHash('sha256').update(s).digest('hex');
const delay = ms => new Promise(done => setTimeout(done, ms));
const canonical = v => JSON.stringify(v, (k, e) => k === 'annotations' ? undefined :
    (e && typeof e === 'object' && !Array.isArray(e)
      ? Object.fromEntries(Object.entries(e).sort(([a],[b]) => a.localeCompare(b))) : e));
const log = (event, data) => console.log(event + ' ' + JSON.stringify(data));
mkdirSync('audit', { recursive: true });
const save = (file, obj) => writeFileSync('audit/' + file, JSON.stringify(obj, null, 2));




function oneAnchor(src,from,to,label){
  assert.equal(src.split(from).length,2,'JOHN_ANCHOR_NOT_UNIQUE_'+label);
  return src.replace(from,to);
}
function patch(source){
  assert(source.includes('B46_REFEREE_BACKOFF_FIX_20261011'),'BACKOFF_FIX_MISSING');
  assert(source.includes('BALL46_GOAL_TICK_MAX_AGE_MS=90*1e3'),'GOALS_GUARD_MISSING');
  assert(source.includes('BALL46_CORNER_TICK_MAX_AGE_MS=90*1e3'),'CORNERS_GUARD_MISSING');
  assert(source.includes('missing-final-direct-v1'),'SETTLEMENT_BRIDGE_MISSING');
  assert(!source.includes('JOHN_BULK_QUALIFIED_PRICE_PREWARM_20261011'),'ALREADY_PATCHED');
  let next=oneAnchor(source,'for (const f of refereeScanOrder) {',INJECT,'PREQUALIFIED_BATCH');
  const start=next.indexOf('let full = null;\n            const requiresFullMarket=');
  const end=next.indexOf('if (!full && !marketCandidates.some(',start);
  assert(start>=0&&end>start&&end-start<2500,'REFEREE_REGION_CHANGED');
  const old=next.slice(start,end);
  assert(old.includes('this.env.FULL_MARKET.fetch'),'MISSING_OLD_FANOUT');
  const replacement='const requiresFullMarket=marketCandidates.some(c=>!isVerifiedGoalMarket(c.market)&&!isVerifiedCornerMarket(c.market));\n            const full=requiresFullMarket?(johnQuotesByFixture.get(id)||null):null;\n            if(requiresFullMarket&&!full)refereeErrors.push({fixtureId:id,error:"JOHN_QUALIFIED_PRICE_CACHE_MISS"});\n            ';
  next=next.slice(0,start)+replacement+next.slice(end);
  const scan=next.slice(next.indexOf('async scan() {'),next.indexOf('async fetch(request) {',next.indexOf('async scan() {')));
  assert(!scan.includes('/fixture-odds?fixtureId='),'PER_FIXTURE_FANOUT_NOT_REMOVED');
  assert(scan.includes('JOHN_BULK_QUALIFIED_PRICE_PREWARM_20261011'),'MISSING_BATCH_GATE');
  assert(next.includes('var BALL46_GOAL_TICK_REQUESTS_PER_SCAN=1;'),'GOAL_GUARD_CHANGED');
  assert(next.includes('var BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2;'),'CORNER_GUARD_CHANGED');
  assert(next.includes('FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0'),'SETTLEMENT_AGE_CHANGED');
  return next;
}
function patchSelfTest(){
  const fixtures=Array.from({length:132},(_,i)=>({id:i,qualified:i%3===0}));
  const eligible=fixtures.filter(x=>x.qualified);
  assert.equal(eligible.length,44);
  let apiCalls=0,providerCalls=0;
  const preview={prewarm:ids=>{apiCalls++;providerCalls+=Math.min(6,ids.length)},cache:ids=>{apiCalls++;return ids}};
  preview.prewarm(eligible);preview.cache(eligible);
  assert.equal(apiCalls,2,'ONLY_BATCH_AND_CACHE_READ');
  assert.equal(providerCalls,6,'PROVIDER_GATE_NOT_BOUNDED');
  const valid=x=>x?.stale===false&&Number.isFinite(x.ageMs)&&x.ageMs>=0&&x.ageMs<=45000&&Array.isArray(x.fullOdds?.bookmakers);
  const quote={stale:false,ageMs:20000,fullOdds:{bookmakers:[{slug:'bet365'}]}};
  assert(valid(quote));assert(!valid({...quote,stale:true}));assert(!valid({...quote,ageMs:60000}));
  console.log('JOHN_BULK_QUALIFIED_SELFTEST_PASS',JSON.stringify({fixtures:132,qualified:eligible.length,batchCalls:apiCalls,providerBudget:providerCalls}));
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
  const tempFile="/tmp/ball46-john-bulk-"+process.pid+".mjs";
  (await import("node:fs")).writeFileSync(tempFile,nextSource);
  (await import("node:child_process")).execFileSync(process.execPath,["--check",tempFile]);
  const beforeHash = hash(source), afterHash = hash(nextSource);
  save('checkpoint.json', { worker, priorId, beforeHash, afterHash,
    mainModule: before.main_module, compatibilityDate: before.compatibility_date,
    moduleCount: before.modules.length, note:'John bulk-first: one central prewarm and one cached quote snapshot of qualified fixtures; all old Signal rules and settlement preserved' });
  log('JOHN_PREFLIGHT_PASS', { worker, priorId, beforeHash, afterHash,
    qualifiedBatchPrewarm:1, cacheOnlyRead:1, perFixtureEnginePriceRequests:0, sourceBytes:Buffer.byteLength(source),
    otherSourceChanged:false, beforeBridge });

  if(JOHN_DRY_RUN){ log("JOHN_DRY_RUN_SUCCESS",{worker,priorId,sourceHash:beforeHash,candidateHash:afterHash,syntax:"PASS"}); process.exit(0); }
  assert.equal(await activeId(), priorId, 'ACTIVE_VERSION_CHANGED_DURING_PREFLIGHT');
  const metadata = {
    main_module:before.main_module,
    compatibility_date:before.compatibility_date,
    compatibility_flags:beforeSettings.compatibility_flags || [],
    bindings:(before.bindings || []).map(b =>
      b.type === 'secret_text' ? { name:b.name, type:'inherit', version_id:'latest' } : { ...b }),
    annotations:{
      'workers/message':'Ball46 John bulk-first: eligible fixture prewarm once, cache snapshot once; no per fixture request',
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

  await activate(candidateId, 'Ball46 John: Central qualified pricing from bulk');
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
    exactPatch:"qualified-only centralized 1x prewarm and cache-only odds read, no Engine per-fixture fanout; fresh cache only; Corner/Goals guards and settlement unchanged", beforeBridge, afterBridge, beforeLedger, afterLedger,
    settingsUnchanged:true, schedulesUnchanged:true, bindingsUnchanged:true };
  save('success.json',success);
  log('JOHN_BULK_PRICE_DEPLOY_SUCCESS',success);
} catch(error) {
  save('failure.json',{ message:String(error?.message || error), previousVersionId:priorId,
    candidateVersionId:candidateId, activated });
  console.error('JOHN_BULK_PRICE_DEPLOY_FAILED',String(error?.stack || error));
  if(activated && priorId && candidateId){
    try {
      if(await activeId() === candidateId){
        await activate(priorId, 'Rollback John bulk-first qualified price engine');
        await waitForActive(priorId);
        log('JOHN_BULK_PRICE_ROLLBACK_SUCCESS',{ restoredVersionId:priorId });
      }
    } catch(rollbackError) {
      console.error('JOHN_BULK_PRICE_ROLLBACK_FAILED',String(rollbackError?.message || rollbackError));
    }
  }
  process.exitCode = 1;
}
