// Guarded surgical correction in the EXISTING isolated TEST Worker.
// Replace existing Prematch O/U module, patch ONLY its owner state to show
// the actual combined London-day O/U quote limit. No new module, no LIVE/PROD.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_SECRET_MISSING');
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const worker='ball46-prematch-only-test-20261120';
const expected='a251c251-6d59-48dc-97d8-7b50e9c49c14';
const main='prematch-only-worker.mjs',engine='prematch-ou-engine-v1-test.mjs';
const protectedNames=[
 'ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'nomadtips3-full-market-343-ball46','ball46-premium-match-colors-test-20261120',
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'
];
async function cf(path,init={}){
 const r=await fetch(api+path,{...init,
  headers:{authorization:'Bearer '+token,...init.headers},
  signal:AbortSignal.timeout(60000)});
 let d=await r.json();
 assert(r.ok&&d.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(d.errors??[]));
 return d.result;
}
const version=async name=>{
 const j=await cf('/scripts/'+name+'/deployments?per_page=1');
 const id=j.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'NO_WORKER_VERSION_'+name);return id;
};
const protectedBefore=Object.fromEntries(await Promise.all(
 protectedNames.map(async name=>[name,await version(name)])));
assert.equal(await version(worker),expected,'TEST_VERSION_CHANGED_ABORT');
const original=await cf('/workers/'+worker+'/versions/'+expected+'?include=modules');
assert.equal(original.main_module,main);
assert.equal(original.modules.length,31);
const originalMain=original.modules.find(x=>x.name===main);
const originalEngine=original.modules.find(x=>x.name===engine);
assert(originalMain?.content_base64&&originalEngine?.content_base64,'MISSING_INSTALLED_ENGINE');
const m=Buffer.from(originalMain.content_base64,'base64').toString('utf8');
const oldCode=Buffer.from(originalEngine.content_base64,'base64').toString('utf8');
const nextCode=fs.readFileSync('qa/prematch-history-20261120/'+engine,'utf8');
assert(oldCode.includes('captureOneValueV2Price')&&
 oldCode.includes('maxLookAheadSeconds:OU_VALUE_V2_POLICY.maxLookaheadSec')&&
 !oldCode.includes('maxSharedOuRequestsPerLondonDay:4'),'DRIFT_IN_OLD_ENGINE_MODULE');
assert(nextCode.includes('maxSharedOuRequestsPerLondonDay:4')&&
 nextCode.includes('maxFullMarketRequestsPerTick:1')&&
 nextCode.includes('fetchOneFullMarketOu')&&
 nextCode.includes("'/fixture-odds?fixtureId='")&&
 nextCode.includes('readPreMatchOuQuoteBudget'),'NEW_ENGINE_SOURCE_INVALID');
assert(m.includes('ctx.waitUntil(stub.fetch')&&
 m.includes("'/prematch-ou-engine-state'")&&
 m.includes('PREMATCH_OU_REPLACES_V2_OLD_CRON')&&
 m.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST')&&
 m.includes('BTTS_HISTORY_API_DISABLED_PROJECT_CLOSED'),'MAIN_MODULE_CHANGED_ABORT');
const oldImport="import {runPreMatchOuEngineV1,PREMATCH_OU_ENGINE_V1_POLICY} from './prematch-ou-engine-v1-test.mjs';";
const newImport="import {runPreMatchOuEngineV1,PREMATCH_OU_ENGINE_V1_POLICY,readPreMatchOuQuoteBudget} from './prematch-ou-engine-v1-test.mjs';";
assert.equal(m.split(oldImport).length-1,1,'NO_PREMATCH_MODULE_IMPORT');
let nextMain=m.replace(oldImport,newImport);
const oldQuota="quota:readOuValueV2BridgeState(this.db,now).sharedOuDailyBudget";
const occurrence=nextMain.split(oldQuota).length-1;
console.log('B46_TEST_OWNER_QUOTA_REFERENCES '+occurrence);
assert.equal(occurrence,2,'QUOTA_OWNER_VIEW_DRIFT');
nextMain=nextMain.split(oldQuota).join("quota:readPreMatchOuQuoteBudget(this.db,now)");
assert(nextMain.includes("quota:readPreMatchOuQuoteBudget(this.db,now)")&&
 nextMain.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST')&&
 nextMain.includes('PREMATCH_OU_REPLACES_V2_OLD_CRON')&&
 !nextMain.includes('PREMATCH_OU_OLD_CRON_DUPLICATE'),'MAIN_PRESERVATION_FAIL');
fs.writeFileSync('/tmp/ball46-ou-test-main-fix.mjs',nextMain);
execFileSync(process.execPath,['--check','/tmp/ball46-ou-test-main-fix.mjs']);
execFileSync(process.execPath,['--check','qa/prematch-history-20261120/'+engine]);
const settings=await cf('/scripts/'+worker+'/settings');
const bindingNames=settings.bindings.map(x=>x.name).sort();
assert.deepEqual(bindingNames,['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const oldHashes=Object.fromEntries(original.modules.map(x=>
 [x.name,sha(Buffer.from(x.content_base64,'base64'))]));
assert.equal(await version(worker),expected,'TEST_VERSION_RACED_ABORT');
console.log('B46_OU_PRICE_FIX_PREFLIGHT '+JSON.stringify({
 worker,expectedVersion:expected,modules:31,
 changedExisting:[main,engine],newModules:0,fullMarketAppPath:'GET /fixture-odds',
 maxPerTick:1,maxDailySharedOuTest:4,
 preserveLiveAndProduction:true,paidCallsByDeploy:0,protectedBefore}));
const form=new FormData();
const metadata={main_module:main,compatibility_date:original.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(original.compatibility_flags?.length?{compatibility_flags:original.compatibility_flags}:{})};
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const module of original.modules){
 const content=module.name===main?nextMain:
  module.name===engine?nextCode:Buffer.from(module.content_base64,'base64');
 form.append(module.name,new Blob([content],{type:'application/javascript+module'}),module.name);
}
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let active=null,verified=null;
for(let i=0;i<40;i++){
 const id=await version(worker);
 if(id!==expected){
  const v=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const m1=v.modules.find(x=>x.name===main),m2=v.modules.find(x=>x.name===engine);
  if(v.modules.length===31&&
   Buffer.from(m1?.content_base64??'','base64').toString('utf8')===nextMain&&
   Buffer.from(m2?.content_base64??'','base64').toString('utf8')===nextCode){
   active=id;verified=v;break;
  }
 }
 await new Promise(r=>setTimeout(r,1000));
}
assert(active&&verified,'DEPLOYED_CODE_NOT_ACTIVE');
for(const module of original.modules){
 if([main,engine].includes(module.name))continue;
 const saved=verified.modules.find(x=>x.name===module.name);
 assert(saved,'LOST_OLD_MODULE_'+module.name);
 assert.equal(sha(Buffer.from(saved.content_base64,'base64')),
  oldHashes[module.name],'CHANGED_OTHER_MODULE_'+module.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindingNames);
const protectedAfter=Object.fromEntries(await Promise.all(
 protectedNames.map(async name=>[name,await version(name)])));
assert.deepEqual(protectedAfter,protectedBefore,'PROTECTED_WORKER_VERSION_CHANGED');
console.log('B46_PREMATCH_OU_REAL_PRICE_TEST_DEPLOY_PASS '+JSON.stringify({
 worker,from:expected,to:active,
 actualFullMarketRoute:'GET /fixture-odds?fixtureId=N',
 everyMinutes:15,requestsPerTick:1,combinedDailyTestQuota:4,
 originalOULedgerShared:true,originalPredictionShadowUnchanged:true,
 modulesChanged:[main,engine],modulesUnchanged:29,newModules:0,
 liveWorkerUnchanged:true,productionWorkerUnchanged:true,
 hubWorkerUnchanged:true,fullMarketWorkerUnchanged:true,
 paidProviderRequestsDuringDeploy:0}));
