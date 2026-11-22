// BALL46 O/U TEST-only guarded Deploy + one real scheduled-style tick.
// Production, active HUB, Engine, frontend, BTTS CLOSED and 1X2 not deployed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchOuVerifiedPriceMain} from './patch-ou-verified-price-main-test-20261123.mjs';
import {patchOuPricedFtSettlement} from './patch-ou-priced-ft-settlement-test.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'TEST_DEPLOY_SECRETS_REQUIRED');
const worker='ball46-prematch-only-test-20261120';
const expected='5254176c-4280-4a68-9fad-3483eeda883f';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const mainName='prematch-only-worker.mjs',mathName='ou-math-v1-test.mjs';
const pickupName='ou-price-pickup-v1-test.mjs',parserName='ou-verified-price-ingest-v1-test.mjs';
const testPath='qa/prematch-history-20261120/';
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','ball46-prematch-ui-test-v5-20261120',
 'ball46-prematch-performance-test-20261121'];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const key=crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const host='https://'+worker+'.mccarey-supon.workers.dev';
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(50000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CLOUDFLARE_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
async function version(name){
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const v=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(v,'NO_VERSION_'+name);return v;
}
async function owner(path,method='GET'){
 const r=await fetch(host+path,{method,headers:{authorization:'Bearer '+key},cache:'no-store',
  signal:AbortSignal.timeout(45000)});
 const body=await r.json().catch(()=>null);
 assert(r.ok,'OWNER_'+path+'_'+r.status+'_'+JSON.stringify(body).slice(0,180));
 return body;
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
const oldVersion=await version(worker);
assert.equal(oldVersion,expected,'CURRENT_TEST_WORKER_VERSION_CHANGED_FAIL_CLOSED');
const active=await cf('/workers/'+worker+'/versions/'+expected+'?include=modules');
assert.equal(active.main_module,mainName);
assert.equal(active.modules.length,24,'UNEXPECTED_TEST_MODULE_SET');
assert(!active.modules.some(x=>[pickupName,parserName].includes(x.name)),'QUOTE_PICKUP_ALREADY_INSTALLED');
const original=Object.fromEntries(active.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString('utf8')]));
assert(original[mainName]&&original[mathName]&&original[mainName].includes('BTTS_PROJECT_CLOSED'));
const patchedMain=patchOuVerifiedPriceMain(original[mainName]);
const patchedMath=patchOuPricedFtSettlement(original[mathName]);
const modules={[mainName]:patchedMain.code,[mathName]:patchedMath.code,
 [pickupName]:fs.readFileSync(testPath+pickupName,'utf8'),
 [parserName]:fs.readFileSync(testPath+parserName,'utf8')};
for(const [name,src] of Object.entries(modules)){
 const target='/tmp/verify-b46-'+name;fs.writeFileSync(target,src);
 execFileSync(process.execPath,['--check',target],{stdio:'pipe'});
}
assert(modules[mainName].includes("https://prematch.internal/ou-price-pickup-tick"),'CRON_NOT_CONNECTED');
assert(modules[mainName].includes("BTTS_PROJECT_CLOSED"),'EXISTING_BTTS_CLOSED_NOT_PRESERVED');
assert(modules[mathName].includes('minProbability:.64'),'OU_THRESHOLD_CHANGED');
assert(modules[mathName].includes('minCombinedHistory:1'),'OU_HISTORY_POLICY_CHANGED');
const expectedBindings=['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'];
const bindings=(await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,expectedBindings);
const [before1x2,beforeAudit,beforeBtts,beforeOu,beforePreview]=await Promise.all([
 owner('/test-ledger'),owner('/prematch-stats-registry-audit-test'),
 owner('/btts-bulk-v2-state'),owner('/ou-state-test'),owner('/preview-data')
]);
assert(beforeAudit.verified===true,'PREMARKET_STATS_REGISTRY_INVALID');
assert(beforeBtts.config?.mode==='CLOSED','BTTS_MUST_REMAIN_CLOSED');
assert(beforeOu.policy.minCombinedHistory===1,'OU_MODEL_CHANGED');
assert(beforePreview.ouLedger.mode==='TEST_ONLY');
const preSnapshot={x1Count:before1x2.rows?.length,bttsCount:beforePreview.bttsLedger.rows?.length,
 ouCount:beforePreview.ouLedger.rows?.length,ouSnapshot:beforePreview.ouLedger.stats};
const originalHashes=Object.fromEntries(active.modules.map(m=>[m.name,hash(Buffer.from(m.content_base64,'base64'))]));
console.log('OU_PRICE_DEPLOY_PREFLIGHT '+JSON.stringify({worker,version:oldVersion,modules:active.modules.length,
 oneX2Rows:preSnapshot.x1Count,ouRows:preSnapshot.ouCount,statsRegistry:beforeAudit.verified,
 bttsMode:beforeBtts.config.mode,protectedWorkers:protectedBefore,
 extraProviderCallsBeforeDeploy:0,maxNewCallsPerLondonDay:1}));
assert.equal(await version(worker),expected,'CONCURRENT_TEST_DEPLOY_STOP');
const metadata={main_module:mainName,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const source=modules[m.name]??Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([source],{type:'application/javascript+module'}),m.name);
}
for(const name of [pickupName,parserName]){
 form.append(name,new Blob([modules[name]],{type:'application/javascript+module'}),name);
}
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let newVersion=null,installed=null;
for(let i=0;i<40;i++){
 const v=await version(worker);
 if(v!==oldVersion){
  const a=await cf('/workers/'+worker+'/versions/'+v+'?include=modules');
  const names=a.modules.map(x=>x.name);
  if(names.includes(pickupName)&&names.includes(parserName)){
   const main=a.modules.find(x=>x.name===mainName);
   if(Buffer.from(main.content_base64,'base64').toString('utf8')===patchedMain.code){
    newVersion=v;installed=a;break;
   }
  }
 }
 await new Promise(resolve=>setTimeout(resolve,1000));
}
assert(newVersion&&installed,'NEW_VERSION_NOT_ACTIVE');
assert.equal(installed.modules.length,active.modules.length+2);
for(const m of active.modules){
 const updated=installed.modules.find(x=>x.name===m.name);
 assert(updated,'MODULE_DISAPPEARED_'+m.name);
 if(m.name===mainName||m.name===mathName){
  assert.equal(Buffer.from(updated.content_base64,'base64').toString('utf8'),modules[m.name],'PATCH_NOT_MATCHING_'+m.name);
 }else assert.equal(hash(Buffer.from(updated.content_base64,'base64')),originalHashes[m.name],'PROTECTED_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings);
console.log('OU_PRICE_DEPLOY_VERSION_ACTIVE '+JSON.stringify({before:oldVersion,after:newVersion,
 originalModuleCount:24,newModuleCount:26,protectedModulesIntact:true,bindingsIntact:true}));
let state=null;
for(let i=0;i<30;i++){
 try{
  const res=await owner('/ou-price-pickup-state');
  if(res?.system==='O_U_VERIFIED_PRICE_PICKUP_TEST'){state=res;break}
 }catch(error){if(i===29)throw error}
 await new Promise(resolve=>setTimeout(resolve,1100));
}
assert(state,'OU_PRICE_TEST_OWNER_ROUTE_NOT_READY');
assert.equal(state.mode,'ACTIVE_TEST');assert.equal(state.policy.maxProviderCallsPerLondonDay,1);
assert.equal(state.policy.sharedQuotaGuarantee,false);
const [after1x2,afterAudit,afterBtts]=await Promise.all([
 owner('/test-ledger'),owner('/prematch-stats-registry-audit-test'),owner('/btts-bulk-v2-state')
]);
assert.equal(after1x2.rows?.length,preSnapshot.x1Count,'1X2_COUNT_DRIFT_DURING_TEST_DEPLOY');
assert(afterAudit.verified,'MARKET_STATS_AUDIT_FAILED');
assert.equal(afterBtts.config.mode,'CLOSED','BTTS_CLOSED_STATE_CHANGED');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)]))),protectedBefore);
console.log('OU_PRICE_DEPLOY_SAFE_PASS '+JSON.stringify({version:newVersion,ownerState:state.system,
 configuredDailyLimit:state.policy.maxProviderCallsPerLondonDay,
 btTsStillClosed:true,oneX2Rows:after1x2.rows.length,productionWrites:0,providerCallsSoFar:0}));
const run=await owner('/ou-price-pickup-tick','POST');
assert(['PRICED_IMPORTED','PRICE_NOT_OFFERED','PRICE_WITHDRAWN','MAIN_GOAL_LINE_MISMATCH',
 'INVALID_FIXED_LINE_LADDER','NO_NEW_QUALIFIED_UNPRICED_FIXTURE','FRESH_SCHEDULED_FEED_REQUIRED',
 'HUB_NOT_HEALTHY_OR_STALE','UNVERIFIED_SHARED_CAPACITY','DAILY_QUOTE_CAP',
 'HTTP_403','HTTP_429','HTTP_404','HTTP_500','ERROR_NO_RETRY',
 'DUPLICATE_OR_DAY_CAP','BET365_NOT_UNIQUELY_IDENTIFIED',
 'PRICE_NOT_BEFORE_KICKOFF_CUTOFF','QUOTE_NO_LONGER_APPLICABLE',
 'FIXTURE_ID_MISMATCH','PRICE_NOT_OFFERED','INVALID_OR_LATE_PRICE_CONTEXT'].includes(run.state),
 'UNEXPECTED_OU_TICK_STATE_'+run.state);
assert([0,1].includes(run.providerCalls),'QUOTE_DAILY_PROVIDER_CAP_VIOLATED');
const repeat=await owner('/ou-price-pickup-tick','POST');
assert.equal(repeat.providerCalls,0,'SAME_DAY_OU_PICKUP_RETRIED');
const [afterState,finalPreview,auditFinal,finalBtts,oneX2Final]=await Promise.all([
 owner('/ou-price-pickup-state'),owner('/preview-data'),
 owner('/prematch-stats-registry-audit-test'),owner('/btts-bulk-v2-state'),
 owner('/test-ledger')
]);
assert(afterState.providerCallsToday<=1,'DAILY_PROVIDER_CALL_LIMIT_EXCEEDED');
assert(finalPreview.ouLedger?.mode==='TEST_ONLY');
assert.equal(finalPreview.ouLedger.rows.length,preSnapshot.ouCount,'OU_PICKS_MUST_REMAIN_IMMUTABLE');
assert.equal(finalPreview.testLedger.rows.length,preSnapshot.x1Count,'1X2_CHANGED');
assert.equal(oneX2Final.rows?.length,preSnapshot.x1Count,'1X2_LEDGER_CHANGED');
assert(auditFinal.verified);
assert.equal(finalBtts.config.mode,'CLOSED');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)]))),protectedBefore);
console.log('OU_PRICE_TEST_RUNNING_VERIFIED '+JSON.stringify({
 backendVersion:newVersion,testCron:'*/15 * * * *',btts:'CLOSED',
 firstRun:{state:run.state,providerCalls:run.providerCalls,fixtureId:run.fixtureId??null,
  priced:run.priced??null,remaining:run.providerRemaining??null},
 duplicateRun:{state:repeat.state,providerCalls:repeat.providerCalls},
 persisted:{callsToday:afterState.providerCallsToday,pricedImported:afterState.pricedImported,
  recent:afterState.recent.slice(0,2)},
 oneX2Rows:preSnapshot.x1Count,ouPicks:finalPreview.ouLedger.rows.length,
 allMarketsUnchanged:true,productionWrites:0,
 sharedQuotaGuarantee:false,maxNewPaidCallsPerLondonDay:1
}));
