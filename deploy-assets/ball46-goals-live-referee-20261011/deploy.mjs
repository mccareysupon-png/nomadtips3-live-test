import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const worker = 'nomadtips3-engine-343';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const root = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers';
const target = 'https://www.ball46.com/api/engine/bridge-health';
const GOALS_DRY_RUN=process.env.GOALS_DRY_RUN==="1";
const INJECT="\n/* Ball46 GOALS Over Under: Bet365 recorded live goal-line tick; independent from Corners. */\nvar BALL46_GOAL_TICK_MAX_AGE_MS=90*1e3;\nvar BALL46_GOAL_TICK_REQUESTS_PER_SCAN=1;\nfunction isVerifiedGoalMarket(key){\n  return key===\"ft_over\"||key===\"ft_under\"||key===\"ht_over\"||key===\"ht_under\";\n}\nfunction goalHistorySpec(key){\n  if(key===\"ft_over\"||key===\"ft_under\")return {market:\"goalline\",field:\"goal_line\"};\n  if(key===\"ht_over\"||key===\"ht_under\")return {market:\"goalline_half\",field:\"goal_line_half\"};\n  return null;\n}\nfunction verifyRecentGoalHistory(j,id,key,f,at=Date.now()){\n  const spec=goalHistorySpec(key);\n  if(!spec||(j?.success!==1&&j?.success!==true))return null;\n  const data=j?.data;\n  if(String(data?.fixture_id??\"\")!==String(id)||String(data?.bookmaker?.slug??\"\").toLowerCase()!==\"bet365\"||data?.market!==spec.market)return null;\n  if(j?.pagination?.has_more!==false||!Array.isArray(data?.ticks)||!data.ticks.length)return null;\n  const tick=data.ticks[data.ticks.length-1];\n  if(!tick||tick.suspended===true||tick.half_time===true||tick.minute==null)return null;\n  const recorded=Date.parse(String(tick.recorded_at??\"\"));\n  if(!Number.isFinite(recorded)||recorded>at+5e3||at-recorded>BALL46_GOAL_TICK_MAX_AGE_MS)return null;\n  const minute=Number(tick.minute),fm=Number(f?.minute);\n  if(!Number.isFinite(minute)||!Number.isFinite(fm)||Math.abs(minute-fm)>5)return null;\n  if(tick.line==null||tick.over==null||tick.under==null)return null;\n  const line=Number(tick.line),over=Number(tick.over),under=Number(tick.under);\n  if(!Number.isFinite(line)||line<0.25||Math.abs(line*4-Math.round(line*4))>1e-6||\n      !Number.isFinite(over)||!Number.isFinite(under)||over<=1||under<=1)return null;\n  const root={[spec.field]:{inplay:{line,over,under}}};\n  return {payload:{fullOdds:{bookmakers:[{slug:\"bet365\",name:\"Bet 365\",odds:root}]}},recordedAt:tick.recorded_at};\n}\nasync function fetchVerifiedGoalsOnly(env,id,key,fixture){\n  const spec=goalHistorySpec(key);\n  if(!spec||!env.FIVEDOLLAR_API_KEY)return null;\n  const url=\"https://api.5dollarfootballapi.com/v1/fixtures/\"+encodeURIComponent(id)+\n     \"/odds/history?market=\"+encodeURIComponent(spec.market)+\"&bookmaker=bet365&per_page=500\";\n  const response=await fetch(url,{headers:{Authorization:\"Bearer \"+env.FIVEDOLLAR_API_KEY,Accept:\"application/json\"},\n    cache:\"no-store\",signal:AbortSignal.timeout(11000)});\n  if(!response.ok)return null;\n  const json=await response.json().catch(()=>null);\n  return verifyRecentGoalHistory(json,id,key,fixture,Date.now());\n}\n";
const hash = s => createHash('sha256').update(s).digest('hex');
const delay = ms => new Promise(done => setTimeout(done, ms));
const canonical = v => JSON.stringify(v, (k, e) => k === 'annotations' ? undefined :
    (e && typeof e === 'object' && !Array.isArray(e)
      ? Object.fromEntries(Object.entries(e).sort(([a],[b]) => a.localeCompare(b))) : e));
const log = (event, data) => console.log(event + ' ' + JSON.stringify(data));
mkdirSync('audit', { recursive: true });
const save = (file, obj) => writeFileSync('audit/' + file, JSON.stringify(obj, null, 2));



function one(src,from,to,label){
  assert.equal(src.split(from).length,2,'GOAL_ANCHOR_NOT_UNIQUE_'+label);
  return src.replace(from,to);
}
function patch(source){
  assert(source.includes('nomad343-engine-v5-best19-referee'),'UNKNOWN_ENGINE');
  assert(source.includes('missing-final-direct-v1'),'MISSING_SETTLEMENT_BRIDGE');
  assert(source.includes('BALL46_CORNER_TICK_MAX_AGE_MS=90*1e3'),'MISSING_EXISTING_CORNERS_GUARD');
  assert(source.includes('function fetchVerifiedCornerOnly(env,id,key,fixture)'),'CORNERS_SOURCE_NOT_EXPECTED');
  assert(!source.includes('BALL46_GOAL_TICK_MAX_AGE_MS'),'GOAL_PATCH_ALREADY_PRESENT');
  let next=one(source,'function isVerifiedCornerMarket(key){',
    INJECT+'\nfunction isVerifiedCornerMarket(key){','INJECT_GOALS_ONLY');
  next=one(next,'let cornerTickRequests=0;\n      const cornerTickCache=new Map();',
    'let cornerTickRequests=0;\n      const cornerTickCache=new Map();\n      let goalTickRequests=0;\n      const goalTickCache=new Map();','GOAL_QUOTA_ONE');
  next=one(next,'if (!full && !marketCandidates.some(c=>isVerifiedCornerMarket(c.market))) {',
    'if (!full && !marketCandidates.some(c=>isVerifiedCornerMarket(c.market)||isVerifiedGoalMarket(c.market))) {','GOAL_WITHOUT_FULL');
  next=one(next,'if (!full && !isVerifiedCornerMarket(key)) {',
    'if (!full && !isVerifiedCornerMarket(key) && !isVerifiedGoalMarket(key)) {','GOAL_ALLOWED_WITHOUT_FULL');
  const original='const best = pickBestPriced(cands,verifiedCorner?verifiedCorner.payload:full,root,f,settings);';
  const goalLines=[
    'let verifiedGoal=null;',
    '                if(isVerifiedGoalMarket(key)){',
    '                  const spec=goalHistorySpec(key),cacheKey=id+"|"+spec.market;',
    '                  if(!goalTickCache.has(cacheKey)){',
    '                    if(goalTickRequests>=BALL46_GOAL_TICK_REQUESTS_PER_SCAN){',
    '                      analysis[key]={state:"GOAL_HISTORY_BUDGET"};',
    '                      continue;',
    '                    }',
    '                    goalTickRequests++;',
    '                    try{goalTickCache.set(cacheKey,await fetchVerifiedGoalsOnly(this.env,id,key,f));}',
    '                    catch(error){',
    '                      goalTickCache.set(cacheKey,null);',
    '                      refereeErrors.push({fixtureId:id,market:key,error:"GOAL_HISTORY_"+String(error?.message||error)});',
    '                    }',
    '                  }',
    '                  verifiedGoal=goalTickCache.get(cacheKey);',
    '                  if(!verifiedGoal){',
    '                    analysis[key]={state:"GOAL_LIVE_PRICE_UNVERIFIED"};',
    '                    continue;',
    '                  }',
    '                }',
    '                const best = pickBestPriced(cands,verifiedGoal?verifiedGoal.payload:(verifiedCorner?verifiedCorner.payload:full),root,f,settings);'
  ].join('\n                ');
  next=one(next,original,goalLines,'GOAL_REFEREE_SELECTION');
  const p='priceSource: verifiedCorner ? "BET365_VERIFIED_HISTORY_INPLAY" : "BEST_OF_19_INPLAY"';
  const p2='priceSource: verifiedGoal ? "BET365_VERIFIED_GOALS_HISTORY_INPLAY" : verifiedCorner ? "BET365_VERIFIED_HISTORY_INPLAY" : "BEST_OF_19_INPLAY"';
  assert.equal(next.split(p).length-1,3,'PRICE_SOURCE_N_3_CHANGED');
  next=next.split(p).join(p2);
  const r='priceReference: verifiedCorner ? "BET365_RECENT_CORNER_TICK" : "BEST19_CONSENSUS_LINE"';
  const r2='priceReference: verifiedGoal ? "BET365_RECENT_GOAL_TICK" : verifiedCorner ? "BET365_RECENT_CORNER_TICK" : "BEST19_CONSENSUS_LINE"';
  assert.equal(next.split(r).length-1,2,'PRICE_REF_N_2_CHANGED');
  next=next.split(r).join(r2);
  assert(next.includes('var BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2;'),'CORNERS_BUDGET_CHANGED');
  assert(next.includes('var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;'),'SIGNAL_AGE_CHANGED');
  return next;
}
function patchSelfTest(){
  const verify=new Function(INJECT+'\nreturn verifyRecentGoalHistory;')();
  const at=Date.now(),f={minute:27};
  const tick=()=>({success:1,data:{fixture_id:202532755,bookmaker:{slug:'bet365'},market:'goalline',ticks:[{minute:27,line:2.75,over:1.925,under:1.875,recorded_at:new Date(at-20000).toISOString()}]},pagination:{has_more:false}});
  assert(verify(tick(),202532755,'ft_over',f,at),'FT_ACCEPT');
  assert(verify(tick(),202532755,'ft_under',f,at),'FT_UNDER_ACCEPT');
  assert.equal(verify(tick(),202532755,'ht_over',f,at),null,'WRONG_MARKET_REJECT');
  const half=tick();half.data.market='goalline_half';half.data.ticks[0].line=1.5;
  assert(verify(half,202532755,'ht_over',f,at),'HT_ACCEPT');
  assert(verify(half,202532755,'ht_under',f,at),'HT_UNDER_ACCEPT');
  const stale=tick();stale.data.ticks[0].recorded_at=new Date(at-120000).toISOString();
  assert.equal(verify(stale,202532755,'ft_over',f,at),null,'STALE_REJECT');
  const suspended=tick();suspended.data.ticks[0].suspended=true;
  assert.equal(verify(suspended,202532755,'ft_over',f,at),null,'SUSPENDED_REJECT');
  const missing=tick();missing.data.ticks[0].over=null;
  assert.equal(verify(missing,202532755,'ft_over',f,at),null,'MISSING_ODDS_REJECT');
  const mismatch=tick();mismatch.data.fixture_id=1;
  assert.equal(verify(mismatch,202532755,'ft_over',f,at),null,'MATCH_REJECT');
  const wrongBook=tick();wrongBook.data.bookmaker.slug='pinnacle';
  assert.equal(verify(wrongBook,202532755,'ft_over',f,at),null,'BOOKMAKER_REJECT');
  const paged=tick();paged.pagination.has_more=true;
  assert.equal(verify(paged,202532755,'ft_over',f,at),null,'PAGINATION_REJECT');
  const wrongMinute=tick();wrongMinute.data.ticks[0].minute=9;
  assert.equal(verify(wrongMinute,202532755,'ft_over',f,at),null,'MINUTE_REJECT');
  const halted=tick();halted.data.ticks[0].half_time=true;
  assert.equal(verify(halted,202532755,'ft_over',f,at),null,'HALF_TIME_REJECT');
  const quarter=tick();quarter.data.ticks[0].line=2.32;
  assert.equal(verify(quarter,202532755,'ft_over',f,at),null,'LINE_FORMAT_REJECT');
  console.log('GOAL_LIVE_TICK_TEST_PASS 14 scenarios');
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
  assert(source.includes("function isVerifiedCornerMarket(key){"),"CORNERS_GUARD_MISSING");
  const nextSource = patch(source);
  const tempFile="/tmp/ball46-corner-verified-"+process.pid+".mjs";
  (await import("node:fs")).writeFileSync(tempFile,nextSource);
  (await import("node:child_process")).execFileSync(process.execPath,["--check",tempFile]);
  const beforeHash = hash(source), afterHash = hash(nextSource);
  save('checkpoint.json', { worker, priorId, beforeHash, afterHash,
    mainModule: before.main_module, compatibilityDate: before.compatibility_date,
    moduleCount: before.modules.length, note:'ONLY GOALS Over Under live referee; Corners unchanged; 90s tick; 1 extra request per scan' });
  log('GOALS_PREFLIGHT_PASS', { worker, priorId, beforeHash, afterHash,
    freshnessMaxSeconds:90, extraApiRequestsMaxPerScan:1, sourceBytes:Buffer.byteLength(source),
    otherSourceChanged:false, beforeBridge });

  if(GOALS_DRY_RUN){ log("GOALS_REFEREE_DRY_RUN_SUCCESS",{worker,priorId,sourceHash:beforeHash,candidateHash:afterHash,syntax:"PASS"}); process.exit(0); }
  assert.equal(await activeId(), priorId, 'ACTIVE_VERSION_CHANGED_DURING_PREFLIGHT');
  const metadata = {
    main_module:before.main_module,
    compatibility_date:before.compatibility_date,
    compatibility_flags:beforeSettings.compatibility_flags || [],
    bindings:(before.bindings || []).map(b =>
      b.type === 'secret_text' ? { name:b.name, type:'inherit', version_id:'latest' } : { ...b }),
    annotations:{
      'workers/message':'Ball46 Goals O-U FT/HT only: verified Bet365 goal ticks; preserve Corners, statistics, settlement',
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

  await activate(candidateId, 'Ball46 verified Goals O-U referee only');
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
    exactPatch:"verified recent Goal-Line O-U tick only, preserve Corners, conditions and settlement", beforeBridge, afterBridge,
    settingsUnchanged:true, schedulesUnchanged:true, bindingsUnchanged:true };
  save('success.json',success);
  log('GOALS_REFEREE_DEPLOY_SUCCESS',success);
} catch(error) {
  save('failure.json',{ message:String(error?.message || error), previousVersionId:priorId,
    candidateVersionId:candidateId, activated });
  console.error('GOALS_REFEREE_DEPLOY_FAILED',String(error?.stack || error));
  if(activated && priorId && candidateId){
    try {
      if(await activeId() === candidateId){
        await activate(priorId, 'Rollback Ball46 Signal age only after postdeploy QA failure');
        await waitForActive(priorId);
        log('GOALS_REFEREE_ROLLBACK_SUCCESS',{ restoredVersionId:priorId });
      }
    } catch(rollbackError) {
      console.error('GOALS_REFEREE_ROLLBACK_FAILED',String(rollbackError?.message || rollbackError));
    }
  }
  process.exitCode = 1;
}
