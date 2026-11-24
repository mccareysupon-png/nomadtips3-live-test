// BALL46 TEST-ONLY automatic FT reconciliation of Adaptive O/U 42-formula
// research into its own existing Ledger + Snapshot UI. No stats-Total merge.
// HUB snapshot is already fetched by the existing Pre-Match monitor. No paid API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_CREDENTIALS');
const worker='ball46-prematch-only-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const ownerAuthorization='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const protectedWorkers=['ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'];
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(55000)});
 const d=await r.json();
 assert(r.ok&&d.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(d.errors??[]).slice(0,250));
 return d.result;
}
const version=async name=>(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
async function owner(path){
 const r=await fetch(host+path,{headers:{authorization:ownerAuthorization},cache:'no-store',signal:AbortSignal.timeout(40000)});
 assert(r.ok,'TEST_OWNER_'+path+'_'+r.status);
 return r.json();
}
function once(s,from,to){
 const n=s.split(from).length-1;
 assert.equal(n,1,'EXPECTED_EXACTLY_ONE_'+from.slice(0,80)+'_'+n);
 return s.replace(from,to);
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
const previousId=await version(worker);
const [installed,settings,adaptiveBefore,existingOuBefore,closedBefore,hcrBefore]=await Promise.all([
 cf('/workers/'+worker+'/versions/'+previousId+'?include=modules'),
 cf('/scripts/'+worker+'/settings'),
 owner('/ou-adaptive-research-state-test'),
 owner('/prematch-ou-engine-state'),
 owner('/btts-bulk-v2-state'),
 owner('/ou-history-ft-state')
]);
assert.equal(adaptiveBefore.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(adaptiveBefore.formulas.length,42);
assert.equal(adaptiveBefore.bySelection.length,84);
assert.equal(existingOuBefore.policy.minPriceInclusive,1.40);
assert.equal(existingOuBefore.policy.maxPriceInclusive,10);
assert.equal(closedBefore.config.mode,'CLOSED');
assert.deepEqual(settings.bindings.map(b=>b.name).sort(),
 ['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const original=Object.fromEntries(installed.modules.map(m=>[
 m.name,Buffer.from(m.content_base64,'base64').toString()]));
const modules={...original};
const main=installed.main_module;
const research='b46-adaptive-ou-ledger-v1-test.mjs';
assert(modules[main]&&modules[research],'MISSING_INSTALLED_ADAPTIVE');
assert(modules[main].includes("path==='/ou-adaptive-research-run-test'"),'ADAPTIVE_NOT_ACTIVE');
const originalSource=execFileSync('git',['show','77b2239c14f41d372cde75c1bcbb86a514a51acc:qa/prematch-history-20261120/'+research],{encoding:'utf8'});
assert.equal(modules[research],originalSource,'DEPLOYED_ADAPTIVE_LEDGER_DRIFT');
modules[research]=fs.readFileSync('qa/prematch-history-20261120/'+research,'utf8');
assert(modules[research].includes('function verifiedHubFt('));
const importOld="import {runAdaptiveOu,readAdaptiveStats} from './b46-adaptive-ou-ledger-v1-test.mjs';";
const importNew="import {runAdaptiveOu,readAdaptiveStats,settleAdaptiveOu} from './b46-adaptive-ou-ledger-v1-test.mjs';";
modules[main]=once(modules[main],importOld,importNew);
const ftAnchor="const imported=parsed.finals.length?ingest(this.db,parsed.finals,parsed.observed):{added:0,duplicate:0,corrected:0,rejected:0};";
const hook="const adaptiveFt=settleAdaptiveOu(this.db,now,{snapshot});if(adaptiveFt.settled>0)console.log('B46_ADAPTIVE_OU_FT_SETTLED '+JSON.stringify({settled:adaptiveFt.settled,win:adaptiveFt.win,loss:adaptiveFt.loss,paidCalls:0}));";
modules[main]=once(modules[main],ftAnchor,ftAnchor+'\n   '+hook);
assert(!modules[main].includes("syncPreMarketStatsRegistry(this.db,now,adaptive"),'STATS_TOTAL_MERGE_FORBIDDEN');
assert.equal(Object.keys(modules).length,Object.keys(original).length);
for(const [name,body] of Object.entries(original))
 if(name!==main&&name!==research)assert.equal(modules[name],body,'UNRELATED_MODULE_CHANGED_'+name);
for(const n of [main,research]){
 const tmp='/tmp/adaptive-ft-'+n;fs.writeFileSync(tmp,modules[n]);
 execFileSync(process.execPath,['--check',tmp]);
}
console.log('B46_ADAPTIVE_FT_PREFLIGHT '+JSON.stringify({
 version:previousId,pendingResearch:adaptiveBefore.formulas.reduce((s,x)=>s+x.pending,0),
 existingOldOuShadow:existingOuBefore.shadowCount,archivedFT:hcrBefore.archive.ft,
 42FormulasPreserved:true,existingStatsUI:true,existingCronOnly:true,
 noExtraHubCalls:true,noPaidApiCalls:true}));
assert.equal(await version(worker),previousId,'CONCURRENT_TEST_DEPLOY');
const metadata={main_module:main,compatibility_date:installed.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,code] of Object.entries(modules))
 form.append(name,new Blob([code],{type:'application/javascript+module'}),name);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let nextVersion=null;
for(let i=0;i<50;i++){
 const id=await version(worker);
 if(id!==previousId){
  const ver=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const actual=Object.fromEntries(ver.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(actual).length===Object.keys(modules).length&&
   Object.entries(modules).every(([name,code])=>actual[name]===code)){
   nextVersion=id;break
  }
 }
 await new Promise(ok=>setTimeout(ok,850));
}
assert(nextVersion,'NEW_TEST_BINARY_NOT_VERIFIED');
await cf('/scripts/'+worker+'/deployments',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:nextVersion,percentage:100}],
  code_update_strategy:{mode:'immediate'}})
});
let after=null;
for(let i=0;i<30;i++){
 await new Promise(ok=>setTimeout(ok,i?1450:2500));
 try{after=await owner('/ou-adaptive-research-state-test');
  if(after.code==='B46_ADAPTIVE_OU_RESEARCH_V1')break
 }catch{}
}
assert(after?.formulas.length===42,'ADAPTIVE_STATS_NOT_ACTIVE');
const [oldOuAfter,btssAfter,hcrAfter,protectedAfter]=await Promise.all([
 owner('/prematch-ou-engine-state'),
 owner('/btts-bulk-v2-state'),
 owner('/ou-history-ft-state'),
 Promise.all(protectedWorkers.map(async n=>[n,await version(n)])).then(Object.fromEntries)
]);
assert.equal(oldOuAfter.shadowCount,existingOuBefore.shadowCount,'OLD_OU_LEDGER_CHANGED');
assert.equal(btssAfter.config.mode,'CLOSED');
assert.equal(hcrAfter.archive.ft,hcrBefore.archive.ft,'HCR_ARCHIVE_MUTATED');
assert.deepEqual(protectedAfter,protectedBefore,'PRODUCTION_OR_HUB_WORKER_CHANGED');
assert(after.records.every(x=>['PENDING','WIN','LOSS'].includes(x.status)));
const ui=await fetch(host+'/ou-adaptive-research-test',{signal:AbortSignal.timeout(30000)});
assert.equal(ui.status,200);
const body=await ui.text();
for(const item of ['Adaptive Over / Under 2.5 Research V1','Recent research predictions','42-formula performance'])
 assert(body.includes(item),'EXISTING_UI_NOT_PRESERVED_'+item);
const data=await fetch(host+'/ou-adaptive-research-data',{signal:AbortSignal.timeout(30000)});
assert.equal(data.status,200);
assert.equal((await data.json()).code,'B46_ADAPTIVE_OU_RESEARCH_V1');
console.log('B46_ADAPTIVE_FT_MONITOR_DEPLOY_PASS '+JSON.stringify({
 worker,from:previousId,to:nextVersion,
 automaticFT:'EXISTING_HUB_MONITOR_AND_ARCHIVE',
 allowedFTSources:['VERIFIED_EXISTING_HCR','VERIFIED_HUB_CACHE','VERIFIED_OU_FT_VAULT'],
 polling:'EXISTING_15_MIN_CRON',noNewCron:true,noAddedProviderCalls:true,
 pricing:'UNCHANGED_FRESH_OU2.5_ONLY',
 ledgerStats:'42_INDEPENDENT_FORMULAS',
 pages:[host+'/ou-adaptive-research-test'],
 researchRows:after.formulas.reduce((s,x)=>s+x.totalPredictions,0),
 researchPending:after.formulas.reduce((s,x)=>s+x.pending,0),
 researchSettled:after.formulas.reduce((s,x)=>s+x.settled,0),
 existingStatsTotalMerged:false,existingUIKept:true,productionWrites:0
}).slice(0,13000));
