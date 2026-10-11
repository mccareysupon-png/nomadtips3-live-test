import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const worker = 'nomadtips3-engine-343';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const root = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers';
const target = 'https://www.ball46.com/api/engine/bridge-health';
const EXPECTED_ID="e8f4f122-f27c-4d96-984b-56f028891cfe";
const EXPECTED_SHA="cd88e2ca8cd4f1773f2a7c0d383ed61dfff3e4dc1e5cc87393906c227eeff652";
const CORNER_DRY_RUN=process.env.CORNER_DRY_RUN==="1";
const INJECT="\n/* Corner Referee: only bookmaker quotes verified from recent, recorded live ticks. */\nvar BALL46_CORNER_TICK_MAX_AGE_MS=90*1e3;\nvar BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2;\nfunction isVerifiedCornerMarket(key){\n  return key===\"ft_corner_over\"||key===\"ft_corner_under\"||key===\"ht_corner_over\"||key===\"ht_corner_under\"||key===\"ft_corner_ah\";\n}\nfunction cornerHistorySpec(key){\n  if(key===\"ft_corner_over\"||key===\"ft_corner_under\")return {market:\"corner\",field:\"corner_line\",first:\"over\",second:\"under\"};\n  if(key===\"ht_corner_over\"||key===\"ht_corner_under\")return {market:\"corner_half\",field:\"corner_line_half\",first:\"over\",second:\"under\"};\n  if(key===\"ft_corner_ah\")return {market:\"corner_asian\",field:\"corner_asian\",first:\"home\",second:\"away\"};\n  return null;\n}\nfunction verifyRecentCornerHistory(j,id,key,f,at=Date.now()){\n  const spec=cornerHistorySpec(key);\n  if(!spec||(j?.success!==1&&j?.success!==true))return null;\n  const d=j?.data;\n  if(String(d?.fixture_id??\"\")!==String(id)||String(d?.bookmaker?.slug??\"\").toLowerCase()!==\"bet365\"||d?.market!==spec.market)return null;\n  if(j?.pagination?.has_more!==false||!Array.isArray(d?.ticks)||!d.ticks.length)return null;\n  const tick=d.ticks[d.ticks.length-1];\n  if(tick?.suspended===true||tick?.half_time===true||tick?.minute===null||tick?.minute===undefined)return null;\n  const updatedAt=Date.parse(String(tick?.recorded_at??\"\"));\n  if(!Number.isFinite(updatedAt)||updatedAt>at+5e3||at-updatedAt>BALL46_CORNER_TICK_MAX_AGE_MS)return null;\n  const minute=Number(tick.minute),fixtureMinute=Number(f?.minute);\n  if(!Number.isFinite(minute)||!Number.isFinite(fixtureMinute)||Math.abs(minute-fixtureMinute)>5)return null;\n  const line=Number(tick.line),first=Number(tick[spec.first]),second=Number(tick[spec.second]);\n  if(tick.line==null||tick[spec.first]==null||tick[spec.second]==null||\n     !Number.isFinite(line)||(spec.market!==\"corner_asian\"&&line<0)||Math.abs(line*4-Math.round(line*4))>1e-6||\n     !Number.isFinite(first)||!Number.isFinite(second)||first<=1||second<=1)return null;\n  const bookRoot={[spec.field]:{inplay:{line,[spec.first]:first,[spec.second]:second}}};\n  return {payload:{fullOdds:{bookmakers:[{slug:\"bet365\",name:\"Bet 365\",odds:bookRoot}]}},recordedAt:tick.recorded_at};\n}\nasync function fetchVerifiedCornerOnly(env,id,key,fixture){\n  const spec=cornerHistorySpec(key);\n  if(!spec||!env.FIVEDOLLAR_API_KEY)return null;\n  const url=\"https://api.5dollarfootballapi.com/v1/fixtures/\"+encodeURIComponent(id)+\"/odds/history?market=\"+encodeURIComponent(spec.market)+\"&bookmaker=bet365&per_page=500\";\n  const response=await fetch(url,{headers:{Authorization:\"Bearer \"+env.FIVEDOLLAR_API_KEY,Accept:\"application/json\"},cache:\"no-store\",signal:AbortSignal.timeout(11000)});\n  if(!response.ok)return null;\n  const payload=await response.json().catch(()=>null);\n  return verifyRecentCornerHistory(payload,id,key,fixture,Date.now());\n}\n";
const hash = s => createHash('sha256').update(s).digest('hex');
const delay = ms => new Promise(done => setTimeout(done, ms));
const canonical = v => JSON.stringify(v, (k, e) => k === 'annotations' ? undefined :
    (e && typeof e === 'object' && !Array.isArray(e)
      ? Object.fromEntries(Object.entries(e).sort(([a],[b]) => a.localeCompare(b))) : e));
const log = (event, data) => console.log(event + ' ' + JSON.stringify(data));
mkdirSync('audit', { recursive: true });
const save = (file, obj) => writeFileSync('audit/' + file, JSON.stringify(obj, null, 2));


function one(src,from,to,label){
  assert.equal(src.split(from).length,2,'CORNER_ANCHOR_NOT_UNIQUE_'+label);
  return src.replace(from,to);
}
function patch(source){
  assert(source.includes('nomad343-engine-v5-best19-referee'),'INCOMPATIBLE_ENGINE');
  assert(source.includes('missing-final-direct-v1'),'INCOMPATIBLE_LEDGER');
  assert(!source.includes('BALL46_CORNER_TICK_MAX_AGE_MS'),'CORNER_PATCH_ALREADY_PRESENT');
  let next=one(source,'function pickBestPriced(candidates, fullPayload, bulkRoot, f, settings) {',
    INJECT+'\nfunction pickBestPriced(candidates, fullPayload, bulkRoot, f, settings) {','INJECT');
  next=one(next,'let refereeRequests = 0, externalOddsRequests = 0, refereeQueued = 0;',
    'let refereeRequests = 0, externalOddsRequests = 0, refereeQueued = 0;\n      let cornerTickRequests=0;\n      const cornerTickCache=new Map();','BUDGET');
  next=one(next,'if (!full) {\n              for (const c of marketCandidates) analysis[c.market] = { state: "PRICE_REFEREE_UNAVAILABLE" };',
    'if (!full && !marketCandidates.some(c=>isVerifiedCornerMarket(c.market))) {\n              for (const c of marketCandidates) analysis[c.market] = { state: "PRICE_REFEREE_UNAVAILABLE" };','WITHOUT_FULL_QUOTE');
  const target='for (const [key, cands] of grouped) {\n                const best = pickBestPriced(cands, full, root, f, settings);';
  const replacement=[
    'for (const [key, cands] of grouped) {',
    '                if (!full && !isVerifiedCornerMarket(key)) {',
    '                  analysis[key]={state:"PRICE_REFEREE_UNAVAILABLE"};',
    '                  continue;',
    '                }',
    '                let verifiedCorner=null;',
    '                if (isVerifiedCornerMarket(key)) {',
    '                  const spec=cornerHistorySpec(key),cacheKey=id+"|"+spec.market;',
    '                  if (!cornerTickCache.has(cacheKey)) {',
    '                    if (cornerTickRequests>=BALL46_CORNER_TICK_REQUESTS_PER_SCAN) {',
    '                      analysis[key]={state:"CORNER_HISTORY_BUDGET"};',
    '                      continue;',
    '                    }',
    '                    cornerTickRequests++;',
    '                    try{cornerTickCache.set(cacheKey,await fetchVerifiedCornerOnly(this.env,id,key,f));}',
    '                    catch(error){',
    '                      cornerTickCache.set(cacheKey,null);',
    '                      refereeErrors.push({fixtureId:id,market:key,error:"CORNER_HISTORY_"+String(error?.message||error)});',
    '                    }',
    '                  }',
    '                  verifiedCorner=cornerTickCache.get(cacheKey);',
    '                  if(!verifiedCorner){',
    '                    analysis[key]={state:"CORNER_LIVE_PRICE_UNVERIFIED"};',
    '                    continue;',
    '                  }',
    '                }',
    '                const best = pickBestPriced(cands,verifiedCorner?verifiedCorner.payload:full,root,f,settings);'
  ].join('\n');
  next=one(next,target,replacement,'PICK_ONLY_CORNERS');
  const oldPrice='priceSource: "BEST_OF_19_INPLAY"';
  assert.equal(next.split(oldPrice).length-1,3,'SOURCE_TAG_COUNT_CHANGED');
  next=next.split(oldPrice).join('priceSource: verifiedCorner ? "BET365_VERIFIED_HISTORY_INPLAY" : "BEST_OF_19_INPLAY"');
  const oldRef='priceReference: "BEST19_CONSENSUS_LINE"';
  assert.equal(next.split(oldRef).length-1,2,'REFERENCE_TAG_COUNT_CHANGED');
  next=next.split(oldRef).join('priceReference: verifiedCorner ? "BET365_RECENT_CORNER_TICK" : "BEST19_CONSENSUS_LINE"');
  assert(next.includes('var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;'),'SETTLEMENT_AGE_MUST_STAY_ZERO');
  return next;
}
function patchSelfTest(){
  const verify=new Function(INJECT+'\nreturn verifyRecentCornerHistory;')();
  const at=Date.now(),fixture={minute:60};
  const quote=()=>({success:1,data:{fixture_id:101,bookmaker:{slug:"bet365"},market:"corner",ticks:[{minute:60,line:9.5,over:1.9,under:1.85,recorded_at:new Date(at-10000).toISOString()}]},pagination:{has_more:false}});
  assert(verify(quote(),101,'ft_corner_over',fixture,at));
  assert.equal(verify({...quote(),pagination:{has_more:true}},101,'ft_corner_over',fixture,at),null);
  const old=quote();old.data.ticks[0].recorded_at=new Date(at-180000).toISOString();
  assert.equal(verify(old,101,'ft_corner_over',fixture,at),null);
  const stopped=quote();stopped.data.ticks[0].suspended=true;
  assert.equal(verify(stopped,101,'ft_corner_over',fixture,at),null);
  const empty=quote();empty.data.ticks[0].over=null;
  assert.equal(verify(empty,101,'ft_corner_over',fixture,at),null);
  const other=quote();other.data.bookmaker.slug='pinnacle';
  assert.equal(verify(other,101,'ft_corner_over',fixture,at),null);
  assert.equal(verify(quote(),101,'ft_corner_ah',fixture,at),null);
  const ah={success:1,data:{fixture_id:101,bookmaker:{slug:"bet365"},market:"corner_asian",ticks:[{minute:60,line:-1.5,home:1.91,away:1.89,recorded_at:new Date(at-10000).toISOString()}]},pagination:{has_more:false}};
  assert(verify(ah,101,'ft_corner_ah',fixture,at));
  const half=quote();half.data.ticks[0].half_time=true;
  assert.equal(verify(half,101,'ft_corner_over',fixture,at),null);
  console.log('CORNER_PRICE_GUARD_SELFTEST_PASS cases=9');
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
  assert(priorId,"NO_ACTIVE_DEPLOYMENT");
  const [before, beforeSettings, beforeSchedules, beforeBridge] = await Promise.all([
    version(priorId), settings(), schedules(), publicBridge()
  ]);
  const main = before.modules?.find(m => m.name === before.main_module);
  assert(main?.content_base64, 'ACTIVE_MAIN_MODULE_UNAVAILABLE');
  const source = Buffer.from(main.content_base64, 'base64').toString('utf8');
  assert(source.includes("function pickBestPriced(candidates, fullPayload, bulkRoot, f, settings) {"),"ACTIVE_REFEREE_UNKNOWN");
  const nextSource = patch(source);
  const tempFile="/tmp/ball46-corner-verified-"+process.pid+".mjs";
  (await import("node:fs")).writeFileSync(tempFile,nextSource);
  (await import("node:child_process")).execFileSync(process.execPath,["--check",tempFile]);
  const beforeHash = hash(source), afterHash = hash(nextSource);
  save('checkpoint.json', { worker, priorId, beforeHash, afterHash,
    mainModule: before.main_module, compatibilityDate: before.compatibility_date,
    moduleCount: before.modules.length, note:'ONLY verified live Corner referee; 90s tick; 2 checks per scan' });
  log('CORNER_PREFLIGHT_PASS', { worker, priorId, beforeHash, afterHash,
    freshnessMaxSeconds:90, extraApiRequestsMaxPerScan:2, sourceBytes:Buffer.byteLength(source),
    otherSourceChanged:false, beforeBridge });

  if(CORNER_DRY_RUN){ log("CORNER_REFEREE_DRY_RUN_SUCCESS",{worker,priorId,sourceHash:beforeHash,candidateHash:afterHash,syntax:"PASS"}); process.exit(0); }
  assert.equal(await activeId(), priorId, 'ACTIVE_VERSION_CHANGED_DURING_PREFLIGHT');
  const metadata = {
    main_module:before.main_module,
    compatibility_date:before.compatibility_date,
    compatibility_flags:beforeSettings.compatibility_flags || [],
    bindings:(before.bindings || []).map(b =>
      b.type === 'secret_text' ? { name:b.name, type:'inherit', version_id:'latest' } : { ...b }),
    annotations:{
      'workers/message':'Ball46 Corners only: Bet365 verified recent history ticks; fail closed; no other market changes',
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

  await activate(candidateId, 'Ball46 verified Corners referee only');
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
  const success = { worker, previousVersionId:priorId, deployedVersionId:candidateId,
    priorSourceHash:beforeHash, newSourceHash:afterHash,
    exactPatch:"verified recent Corners tick only, keep conditions and settlement unchanged", beforeBridge, afterBridge,
    settingsUnchanged:true, schedulesUnchanged:true, bindingsUnchanged:true };
  save('success.json',success);
  log('CORNER_REFEREE_DEPLOY_SUCCESS',success);
} catch(error) {
  save('failure.json',{ message:String(error?.message || error), previousVersionId:priorId,
    candidateVersionId:candidateId, activated });
  console.error('CORNER_REFEREE_DEPLOY_FAILED',String(error?.stack || error));
  if(activated && priorId && candidateId){
    try {
      if(await activeId() === candidateId){
        await activate(priorId, 'Rollback Ball46 Signal age only after postdeploy QA failure');
        await waitForActive(priorId);
        log('CORNER_REFEREE_ROLLBACK_SUCCESS',{ restoredVersionId:priorId });
      }
    } catch(rollbackError) {
      console.error('CORNER_REFEREE_ROLLBACK_FAILED',String(rollbackError?.message || rollbackError));
    }
  }
  process.exitCode = 1;
}
