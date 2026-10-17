import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const worker = 'nomadtips3-engine-343';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const root = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers';
const target = 'https://ball46-production.mccarey-supon.workers.dev/api/engine/bridge-health';
const JOHN_DRY_RUN=process.env.JOHN_DRY_RUN==="1";
const EXPECTED_ACTIVE_VERSION="7f7377ac-0bcb-44ed-b7ce-8abac4439bd4";
const EXPECTED_ACTIVE_SHA="d4011f656dc9e9bcfd057c2a08bbc5e09202c71606e5a01e5d9a675cdcef5ff7";
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
  assert(source.includes('JOHN_BULK_QUALIFIED_PRICE_PREWARM_20261011'),'QUALIFIED_PREWARM_MISSING');
  assert(source.includes('JOHN_QUALIFIED_PRICE_CACHE_MISS'),'CACHE_GATING_MISSING');
  assert(source.includes('PRICE_REFEREE_UNAVAILABLE'),'PRICE_REFEREE_GUARD_MISSING');
  assert(!source.includes('B46_FAIR_CACHE_20261017'),'ALREADY_PATCHED');
  // This existing rotation step 17 can never visit all offsets when the fixture count shares a factor with 17.
  let next=oneAnchor(source,'(Math.floor(startedAt/6e4)*17)%orderedRefereeFixtures.length',
    '(Math.floor(startedAt/6e4))%orderedRefereeFixtures.length','COPRIME_ROTATION');
  const begin=next.indexOf('          const cacheResp=await this.env.FULL_MARKET.fetch(');
  assert(begin>=0,'CACHE_SNAPSHOT_READ_MISSING');
  const end=next.indexOf('        }catch(error){',begin);
  assert(end>begin && end-begin<2000,'CACHE_SNAPSHOT_REGION_CHANGED');
  const old=next.slice(begin,end);
  assert(old.includes('https://full-market.internal/board-cache'),'CACHE_READER_INVALID');
  assert(old.includes('body:requestBody'),'CACHE_READER_INPUT_MISSING');
  assert(old.includes('age>45000') && old.includes('entry?.stale!==false'),'FRESHNESS_GUARDS_CHANGED');
  const replacement =
    '          /* B46_FAIR_CACHE_20261017: prewarm budget unchanged; read existing fresh central-cache quotes for every qualified match. */\n'+
    '          for(let cacheOffset=0;cacheOffset<johnEligibleFixtureIds.length;cacheOffset+=128){\n'+
    '            const cacheRequestBody=JSON.stringify({fixtureIds:johnEligibleFixtureIds.slice(cacheOffset,cacheOffset+128)});\n'+
    old.replace('body:requestBody','body:cacheRequestBody')+
    '          }\n';
  next=next.slice(0,begin)+replacement+next.slice(end);
  assert.equal(next.split('https://full-market.internal/prewarm').length-1,source.split('https://full-market.internal/prewarm').length-1,'CHANGED_PREWARM_CALLS');
  assert.equal(next.split('https://full-market.internal/fixture-odds').length-1,source.split('https://full-market.internal/fixture-odds').length-1,'CHANGED_DIRECT_ODDS_CALLS');
  assert(next.includes('const ids=johnEligibleFixtureIds.slice(0,128);'),'PREWARM_BUDGET_CHANGED');
  assert(next.includes('age>45000'),'FRESHNESS_THRESHOLD_CHANGED');
  assert(next.includes('B46_FAIR_CACHE_20261017'),'PATCH_MARK_MISSING');
  return next;
}
function patchSelfTest(){
  const rotation=n=>Array.from({length:n},(_,i)=>i%n);
  assert.equal(new Set(rotation(476)).size,476,'ROTATION_MUST_VISIT_ALL_FIXTURES');
  const eligible=Array.from({length:162},(_,i)=>String(i+1));
  const chunks=[];for(let i=0;i<eligible.length;i+=128)chunks.push(eligible.slice(i,i+128));
  assert.deepEqual(chunks.map(x=>x.length),[128,34],'ALL_QUALIFIED_CACHE_BATCHES');
  assert.equal(new Set(chunks.flat()).size,162,'NO_ELIGIBLE_FIXTURE_STARVED');
  assert.equal(eligible.slice(0,128).length,128,'UPSTREAM_PREWARM_LIMIT_UNCHANGED');
  const valid=e=>e?.stale===false&&Number.isFinite(e.ageMs)&&e.ageMs>=0&&e.ageMs<=45000&&Array.isArray(e.fullOdds?.bookmakers)&&e.fullOdds.bookmakers.length>0;
  const fresh={stale:false,ageMs:40000,fullOdds:{bookmakers:[{bookmaker:'bet365'}]}};
  assert(valid(fresh)&&!valid({...fresh,stale:true})&&!valid({...fresh,ageMs:45001})&&!valid({...fresh,fullOdds:{bookmakers:[]}}),'NO_STALE_OR_MISSING_PRICES');
  console.log('B46_FAIR_CACHE_SELFTEST_PASS',JSON.stringify({qualified:162,prewarmCap:128,cacheChunks:[128,34],source:"current-active-worker",externalLimitUnchanged:true}));
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
  const res=await fetch('https://ball46-production.mccarey-supon.workers.dev/api/engine/ledger-health?ou_guard='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});
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
    moduleCount: before.modules.length, note:'Ball46 Fair Cache: unchanged prewarm budget, read all eligible fresh cached quotes, fair scan rotation; other rules preserved' });
  log('JOHN_PREFLIGHT_PASS', { worker, priorId, beforeHash, afterHash,
    qualifiedBatchPrewarm:1, cacheOnlyRead:'batched all qualified', perFixtureEnginePriceRequests:0, sourceBytes:Buffer.byteLength(source),
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
    exactPatch:"fairly rotate fixture scan, read existing fresh odds for all qualified fixtures in 128-id cache-only batches; upstream quota and all Signal rules unchanged", beforeBridge, afterBridge, beforeLedger, afterLedger,
    settingsUnchanged:true, schedulesUnchanged:true, bindingsUnchanged:true };
  save('success.json',success);
  log('B46_FAIR_CACHE_DEPLOY_SUCCESS',success);
} catch(error) {
  save('failure.json',{ message:String(error?.message || error), previousVersionId:priorId,
    candidateVersionId:candidateId, activated });
  console.error('B46_FAIR_CACHE_DEPLOY_FAILED',String(error?.stack || error));
  if(activated && priorId && candidateId){
    try {
      if(await activeId() === candidateId){
        await activate(priorId, 'Rollback John bulk-first qualified price engine');
        await waitForActive(priorId);
        log('B46_FAIR_CACHE_ROLLBACK_SUCCESS',{ restoredVersionId:priorId });
      }
    } catch(rollbackError) {
      console.error('B46_FAIR_CACHE_ROLLBACK_FAILED',String(rollbackError?.message || rollbackError));
    }
  }
  process.exitCode = 1;
}
