// BALL46 O/U Pre-Match TEST-only change of accepted SELECTED odds to [1.40,10.00].
// Price freshness, optional H2H, 3+ all-ground FT, EV >=5%, paid quota intact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_CLOUDFLARE_SECRETS');
const worker='ball46-prematch-only-test-20261120';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const protectedWorkers=['ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'];
const touched=['ou-value-screener-v2-test.mjs','prematch-ou-engine-v1-test.mjs'];
const originalCommit='fc74109fc42982cdd26da7059949826e655f5643';
async function cf(path,opts={}){
 const r=await fetch(api+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(48000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,200));
 return j.result;
}
async function version(name){
 const id=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'MISSING_VERSION_'+name);return id;
}
async function owner(path){
 const r=await fetch(host+path,{headers:{authorization:auth},cache:'no-store',signal:AbortSignal.timeout(35000)});
 assert(r.ok,'TEST_OWNER_'+path+'_'+r.status);
 return r.json();
}
function one(s,a,b){
 const n=s.split(a).length-1;assert.equal(n,1,'EXPECTED_ONE_MATCH_'+a+'_'+n);return s.replace(a,b);
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedWorkers.map(async name=>[name,await version(name)])));
const oldId=await version(worker);
const [v,settings,preV3,preEngine,preTruck,preLedger,preVault]=await Promise.all([
 cf('/workers/'+worker+'/versions/'+oldId+'?include=modules'),
 cf('/scripts/'+worker+'/settings'),
 owner('/ou-v3-stage-one-audit-test'),
 owner('/prematch-ou-engine-state'),
 owner('/btts-bulk-v2-state'),
 owner('/preview-data'),
 owner('/ou-history-ft-state')
]);
assert.equal(preV3.policy.minimumPriceExclusive,1.5,'LIVE_PRIOR_POLICY_MISMATCH');
assert.equal(preEngine.policy.minPriceExclusive,1.5,'ENGINE_PRIOR_POLICY_MISMATCH');
assert.equal(preEngine.policy.maxSharedOuRequestsPerLondonDay,4);
assert.equal(preTruck.config.mode,'CLOSED');
assert(preVault.archive.ft>=367,'HISTORY_FT_VAULT_EMPTY');
assert(preLedger.ouLedger.rows.some(x=>Number(x.fixture_id)===204906152&&x.status==='LOSS'&&x.units===-1),'OLD_LEDGER_REQUIRED');
const mods=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const main=v.main_module;
assert(mods[main].includes('BTTS_PROJECT_CLOSED'),'CLOSED_FENCE_NOT_PRESENT');
assert(mods[main].includes("path==='/ou-raw-expired-odds-18-audit-test'"),'DIAGNOSTIC_ROUTE_MISSING');
for(const name of touched){
 const old=execFileSync('git',['show',originalCommit+':qa/prematch-history-20261120/'+name],{encoding:'utf8'});
 assert.equal(mods[name],old,'TEST_MODULE_CHANGED_SINCE_EXPECTED_'+name);
 const newText=fs.readFileSync('qa/prematch-history-20261120/'+name,'utf8');
 assert(newText.includes('PriceInclusive'),'NEW_RANGE_MISSING_'+name);
 mods[name]=newText;
}
const oldPolicy="h2hOverlapExcluded:true,minimumPriceExclusive:OU_V3_POLICY.minimumPriceExclusive,";
const newPolicy="h2hOverlapExcluded:true,minimumPriceInclusive:OU_V3_POLICY.minimumPriceInclusive,maximumPriceInclusive:OU_V3_POLICY.maximumPriceInclusive,";
mods[main]=one(mods[main],oldPolicy,newPolicy);
for(const name of [main,...touched]){
 const path='/tmp/b46-140-10-'+name;
 fs.writeFileSync(path,mods[name]);execFileSync(process.execPath,['--check',path]);
}
const originals=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
assert(Object.keys(mods).length===v.modules.length);
for(const [name,contents] of Object.entries(originals)){
 if(name===main||touched.includes(name))continue;
 assert.equal(mods[name],contents,'MUTATED_UNRELATED_MODULE_'+name);
}
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),
 ['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
console.log('B46_OU_PRICE_GATE_PREFLIGHT '+JSON.stringify({
 from:oldId,minimumPriceOld:preV3.policy.minimumPriceExclusive,
 newPriceMinimum:1.40,newPriceMaximum:10.00,inclusive:true,
 minEV:preV3.policy.minimumEV,
 existingArchiveFT:preVault.archive.ft,
 existingModels:preV3.counts?.modeled??null,
 existingOuShadowCount:preEngine.shadowCount??null,
 existingQuota:preEngine.quota,productionCalls:0,providerCalls:0
}));
assert.equal(await version(worker),oldId,'CONCURRENT_DEPLOY_FORBIDDEN');
const metadata={main_module:main,compatibility_date:v.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(v.compatibility_flags?.length?{compatibility_flags:v.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,contents] of Object.entries(mods))
 form.append(name,new Blob([contents],{type:'application/javascript+module'}),name);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let newId=null;
for(let i=0;i<45;i++){
 const id=await version(worker);
 if(id!==oldId){
  const installed=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const check=Object.fromEntries(installed.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(check).length===Object.keys(mods).length&&
   Object.entries(mods).every(([name,contents])=>check[name]===contents)){newId=id;break}
 }
 await new Promise(ok=>setTimeout(ok,850));
}
assert(newId,'NEW_BINARY_NOT_VERIFIED');
await cf('/scripts/'+worker+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:newId,percentage:100}],
 code_update_strategy:{mode:'immediate'}})});
let postV3=null,postEngine=null;
for(let i=0;i<30;i++){
 await new Promise(ok=>setTimeout(ok,i?1350:2300));
 try{
  const [a,b]=await Promise.all([owner('/ou-v3-stage-one-audit-test'),owner('/prematch-ou-engine-state')]);
  if(a.policy?.minimumPriceInclusive===1.4&&a.policy?.maximumPriceInclusive===10&&
    b.policy?.minPriceInclusive===1.4&&b.policy?.maxPriceInclusive===10){postV3=a;postEngine=b;break}
 }catch{}
}
assert(postV3&&postEngine,'NEW_PRICE_POLICY_NOT_ACTIVE');
assert.equal(postV3.policy.minimumEV,0.05);
assert.equal(postEngine.policy.minEV,0.05);
assert.equal(postEngine.policy.maxSharedOuRequestsPerLondonDay,4);
assert.equal(postEngine.policy.maxFullMarketRequestsPerTick,1);
assert.equal(postEngine.policy.useExistingOULedger,true);
const [afterTruck,afterLedger,afterVault,protectedAfter]=await Promise.all([
 owner('/btts-bulk-v2-state'),owner('/preview-data'),owner('/ou-history-ft-state'),
 Promise.all(protectedWorkers.map(async name=>[name,await version(name)])).then(Object.fromEntries)
]);
assert.equal(afterTruck.config.mode,'CLOSED');
assert(afterLedger.ouLedger.rows.some(x=>Number(x.fixture_id)===204906152&&x.status==='LOSS'&&x.units===-1),'OLD_PICKS_CHANGED');
assert.equal(afterVault.archive.ft,preVault.archive.ft,'ARCHIVE_CHANGED');
assert.deepEqual(protectedAfter,protectedBefore,'PROTECTED_WORKER_DEPLOY_CHANGED');
console.log('B46_OU_PRICE_GATE_DEPLOY_PASS '+JSON.stringify({
 worker,from:oldId,to:newId,
 selectedOddsMinInclusive:postV3.policy.minimumPriceInclusive,
 selectedOddsMaxInclusive:postV3.policy.maximumPriceInclusive,
 minimumEV:postV3.policy.minimumEV,
 minHistoryPerTeam:postV3.policy.minimumPerTeam,
 H2HMinimum:postV3.policy.h2hMinimum,
 fullmarketMaxAgeMs:120000,
 sharedQuoteCap:postEngine.policy.maxSharedOuRequestsPerLondonDay,
 otherModulesUnchanged:true,oldLedgerUnchanged:true,archiveUnchanged:true,
 btssClosed:true,paidProviderCalls:0,productionWrites:0
}));
