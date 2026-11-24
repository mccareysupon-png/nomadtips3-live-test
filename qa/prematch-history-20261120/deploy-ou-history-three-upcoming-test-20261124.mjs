// Guarded TEST ONLY: switch Over/Under V2 history gate to >=3 FT PER TEAM,
// and update HCR supply planning ONLY for Upcoming/Waiting via merged archived FT.
// Never wake CLOSED Ultra truck, never call a paid provider and never touch Production.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_CREDS_REQUIRED');
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const test='ball46-prematch-only-test-20261120',br='fix/ball46-btts-stats-registry-snapshot-test-20261122';
const files=[
 'ou-value-screener-v2-test.mjs',
 'history-cargo-registry.mjs'
];
const protectedWorkers=['ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46',
 'ball46-premium-match-colors-test-20261120'];
async function cf(p,opts={}){
 const r=await fetch(api+p,{...opts,headers:{authorization:'Bearer '+token,...(opts.headers||{})},
  signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+p+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,240));
 return j.result;
}
const version=async name=>(await cf('/scripts/'+name+'/deployments?per_page=1'))
 .deployments[0].versions[0].version_id;
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const beforeOther=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
const oldVersion=await version(test);
const old=await cf('/workers/'+test+'/versions/'+oldVersion+'?include=modules');
const settings=await cf('/scripts/'+test+'/settings');
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),
 ['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const oldModules=Object.fromEntries(old.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64')]));
const finalModules={...oldModules};
const oldDigests=Object.fromEntries(Object.entries(oldModules).map(([n,v])=>[n,digest(v)]));
assert(old.main_module==='prematch-only-worker.mjs','MAIN_UNEXPECTED');
assert(oldModules['prematch-ou-engine-v1-test.mjs'],'EXISTING_OU_ENGINE_LOST');
assert(oldModules['btts-bulk-truck-v2-test.mjs'],'CLOSED_TRUCK_MODULE_LOST');
for(const name of files){
 const p='qa/prematch-history-20261120/'+name;
 const upstream=execFileSync('git',['show','dbb7595b9509e2fbb3d52e5750456c393f3d89f8:'+p],
  {encoding:'utf8'});
 const installed=oldModules[name]?.toString('utf8');
 assert(installed&&installed===upstream,'CLOUDFLARE_SOURCE_DRIFT_'+name);
 const next=fs.readFileSync(p,'utf8');
 assert(next!==upstream&&next.length>1000,'NEW_MODULE_NOT_CHANGED_'+name);
 if(name.startsWith('ou-')){
  assert(next.includes('minCombinedHistory:6,minHistoryPerTeam:3')&&
   next.includes('home.length<OU_VALUE_V2_POLICY.minHistoryPerTeam')&&
   next.includes('away.length<OU_VALUE_V2_POLICY.minHistoryPerTeam'));
 }else{
  assert(next.includes("targetHistoryPerTeam:3")&&
   next.includes("pendingStates=new Set(['scheduled','upcoming','waiting'])")&&
   next.includes('bttsLastMatches(db,teamId,kickoff,now,10)'));
 }
 finalModules[name]=Buffer.from(next);
}
const privateKey='Bearer '+crypto.createHmac('sha256',token)
 .update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const baseUrl='https://'+test+'.mccarey-supon.workers.dev';
async function get(path){
 const r=await fetch(baseUrl+path,{headers:{authorization:privateKey},cache:'no-store',
  signal:AbortSignal.timeout(35000)});
 assert.equal(r.status,200,'OWNER_ENDPOINT_UNAVAILABLE_'+path);
 return r.json();
}
const [currentHCR,currentEngine,currentTransport,oldPublic]=await Promise.all([
 get('/history-cargo-registry?detail=0'),get('/prematch-ou-engine-state'),
 get('/btts-bulk-v2-state'),get('/preview-data')
]);
assert(currentTransport.config.mode==='CLOSED','ULTRA_TRUCK_NOT_CLOSED');
assert.equal(currentHCR.supplyPlanning.targetHistoryPerTeam,10,'ORIGINAL_HCR_TARGET_DRIFT');
assert.equal(currentEngine.policy.minHistoryPerTeam??null,null,'OU_ALREADY_SET_3');
const originalSettled=oldPublic.ouLedger?.rows?.find(x=>Number(x.fixture_id)===204906152);
assert(originalSettled?.status==='LOSS'&&originalSettled?.units===-1,
 'ORIGINAL_SETTLED_PREDICTION_NOT_FOUND');
assert.equal(await version(test),oldVersion,'CONCURRENT_WORKER_CHANGE');
console.log('B46_3_FT_TEST_PREFLIGHT '+JSON.stringify({
 oldVersion,oldHistory:currentHCR.inventory,
 upcoming:currentHCR.supplyPlanning.upcomingFixtures,
 oldModeledCount:currentEngine.last?.scan?.modeled,
 priorHistoryMinimum:currentEngine.policy.minHistoryPerTeam??1,
 newMinPerTeam:3,priceFormulaUnchanged:true,ultraState:currentTransport.config.mode,
 moduleCount:Object.keys(oldModules).length,
 providerCalls:0,productionWrites:0}));
const metadata={main_module:old.main_module,compatibility_date:old.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(old.compatibility_flags?.length?{compatibility_flags:old.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,bytes] of Object.entries(finalModules))
 form.append(name,new Blob([bytes],{type:'application/javascript+module'}),name);
await cf('/scripts/'+test+'?bindings_inherit=strict',{method:'PUT',body:form});
let newVersion=null;
for(let i=0;i<45;i++){
 const id=await version(test);
 if(id!==oldVersion){
  const got=await cf('/workers/'+test+'/versions/'+id+'?include=modules');
  const modules=Object.fromEntries(got.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64')]));
  if(Object.keys(modules).length===Object.keys(finalModules).length&&
    Object.entries(finalModules).every(([name,bytes])=>digest(modules[name])===digest(bytes))){
   newVersion=id;break;
  }
 }
 await new Promise(resolve=>setTimeout(resolve,800));
}
assert(newVersion,'TEST_VERSION_DEPLOY_NOT_CONFIRMED');
const applied=await cf('/workers/'+test+'/versions/'+newVersion+'?include=modules');
for(const mod of applied.modules){
 if(files.includes(mod.name))continue;
 assert.equal(digest(Buffer.from(mod.content_base64,'base64')),oldDigests[mod.name],
  'UNRELATED_MODULE_CHANGED_'+mod.name);
}
// Official Cloudflare DO code rollout: apply immediately to TEST without restarting production.
await cf('/scripts/'+test+'/deployments',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',
  versions:[{version_id:newVersion,percentage:100}],
  code_update_strategy:{mode:'immediate'}})
});
let state=null,engine=null;
for(let i=0;i<15;i++){
 await new Promise(resolve=>setTimeout(resolve,i===0?1800:1700));
 try{
  [state,engine]=await Promise.all([
   get('/history-cargo-registry?detail=0'),get('/prematch-ou-engine-state')
  ]);
  if(state.supplyPlanning.targetHistoryPerTeam===3&&engine.policy.minHistoryPerTeam===3)break;
 }catch(e){console.log('B46_3_FT_TEST_PROPAGATION_WAIT '+String(e?.message??e).slice(0,130))}
 state=null;
}
assert(state&&engine&&state.supplyPlanning.targetHistoryPerTeam===3&&engine.policy.minHistoryPerTeam===3,
 'THREE_FT_TEST_ACTIVE_WORKER_NOT_VERIFIED');
assert.equal(engine.policy.minCombinedHistory,6);
assert.equal(state.supplyPlanning.historySource,'DEDUPED_1X2_AND_BTTS_FINISHED_FT_ASOF');
assert.deepEqual(state.supplyPlanning.fixtureTargetStatuses,['scheduled','upcoming','waiting']);
const [transport,ouAfter]=await Promise.all([
 get('/btts-bulk-v2-state'),get('/preview-data')
]);
assert(transport.config.mode==='CLOSED','ULTRA_REACTIVATED');
assert.equal(transport.transport.providerCalls,currentTransport.transport.providerCalls,'PAID_HISTORY_REQUEST_DETECTED');
const samePick=ouAfter.ouLedger.rows.find(x=>Number(x.fixture_id)===204906152);
assert(samePick?.status==='LOSS'&&samePick?.units===-1&&Number(samePick.price)===2.8,
 'HISTORICAL_PREDICTION_MUTATED');
assert.equal(ouAfter.allLedger?.stats?.total,oldPublic.allLedger?.stats?.total,
 'TOTAL_LEDGER_CHANGED_WITHOUT_PREDICTION');
const afterOther=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
assert.deepEqual(afterOther,beforeOther,'PROTECTED_WORKER_VERSION_CHANGED');
console.log('B46_OU_THREE_FT_PER_TEAM_TEST_DEPLOY_PASS '+JSON.stringify({
 testVersion:newVersion,
 targeting:'ONLY_SCHEDULED_UPCOMING_WAITING_BEFORE_KICKOFF',
 verifiedHistorySource:state.supplyPlanning.historySource,
 minimumFTPerHome:3,minimumFTPerAway:3,maximumUsedPerTeam:10,
 hcr:{upcoming:state.supplyPlanning.upcomingFixtures,ready3:state.supplyPlanning.readyFixtures,
  incomplete:state.supplyPlanning.incompleteFixtures,
  missingUniqueTeams:state.supplyPlanning.uniqueTeamsNeedingHistory,
  deduplicatedMissingTeamGames:state.supplyPlanning.deduplicatedTeamMatchGaps},
 closedUltraTruck:true,unchangedOriginalSettlement:true,pricesUnchanged:true,
 extra5UsdCalls:0,productionWrites:0
}));
