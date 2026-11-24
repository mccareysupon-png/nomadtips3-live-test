// 2026-11-24 BALL46 Adaptive 42 TEST-only event journal + 30D/90D daily
// snapshot series; no formula, price policy, selection or production changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_SECRETS');
const name='ball46-prematch-only-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+name+'.mccarey-supon.workers.dev';
const ownerAuthorization='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const keep=['ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46',
 'ball46-premium-match-colors-test-20261120'];
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(55000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,240));
 return j.result;
}
const version=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
async function state(path){
 const r=await fetch(host+path,{headers:{authorization:ownerAuthorization},cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert(r.ok,'OWNER_STATE_'+path+'_'+r.status);return r.json();
}
const base=Object.fromEntries(await Promise.all(keep.map(async n=>[n,await version(n)])));
const oldVersion=await version(name);
const [existing,settings,pre,legacy,oldBTTS]=await Promise.all([
 cf('/workers/'+name+'/versions/'+oldVersion+'?include=modules'),
 cf('/scripts/'+name+'/settings'),
 state('/ou-adaptive-research-state-test'),
 state('/prematch-ou-engine-state'),
 state('/btts-bulk-v2-state')
]);
assert.equal(pre.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(pre.formulas.length,42);
assert(!pre.eventJournal,'V2_EVENT_JOURNAL_ALREADY_ACTIVE');
assert.equal(legacy.policy.minEV,.05);
assert.equal(legacy.policy.minPriceInclusive,1.4);
assert.equal(legacy.policy.maxPriceInclusive,10);
assert.equal(oldBTTS.config.mode,'CLOSED');
const modules=Object.fromEntries(existing.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const source='qa/prematch-history-20261120/';
const changing='b46-adaptive-ou-ledger-v1-test.mjs';
const baselineSource=execFileSync('git',['show','0385653f5e8a2ba6fe4d66c06f084c58ba45a445:'+source+changing],{encoding:'utf8'});
assert.equal(modules[changing],baselineSource,'LIVE_LEDGER_DRIFT_REQUIRES_AUDIT');
assert(modules[existing.main_module].includes('settleAdaptiveOu(this.db,now,{snapshot})'),'LIVE_FT_HOOK_MISSING');
for(const added of ['b46-adaptive-ou-events-v2-test.mjs','b46-adaptive-ou-series-v2-test.mjs'])
 assert(!modules[added],'V2_MODULE_ALREADY_ACTIVE_'+added);
for(const n of [changing,'b46-adaptive-ou-events-v2-test.mjs','b46-adaptive-ou-series-v2-test.mjs']){
 modules[n]=fs.readFileSync(source+n,'utf8');
 const tmp='/tmp/b46-adaptive-42-v2-'+n;fs.writeFileSync(tmp,modules[n]);
 execFileSync(process.execPath,['--check',tmp]);
}
assert(modules[changing].includes('reconcileAdaptiveFtRevisions'));
assert(modules[changing].includes('adaptiveSnapshotSeries(db,now,90)'));
assert(modules[changing].includes('eventJournal:readAdaptiveEventJournal(db)'));
assert.equal(await version(name),oldVersion,'CONCURRENT_TEST_BACKEND_CHANGE');
const meta={main_module:existing.main_module,
 compatibility_date:existing.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(existing.compatibility_flags?.length?{compatibility_flags:existing.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
for(const [n,src] of Object.entries(modules))
 form.append(n,new Blob([src],{type:'application/javascript+module'}),n);
console.log('B46_ADAPTIVE_V2_PREDEPLOY '+JSON.stringify({worker:name,oldVersion,
 formulas:42,existingPredictions:pre.formulas.reduce((a,x)=>a+x.totalPredictions,0),
 previousSettled:pre.formulas.reduce((a,x)=>a+x.settled,0),
 onlyLedgerJournalSeriesModules:true,noNewApiCalls:true}));
await cf('/scripts/'+name+'?bindings_inherit=strict',{method:'PUT',body:form});
let next=null;
for(let i=0;i<46;i++){
 const id=await version(name);
 if(id!==oldVersion){
  const fresh=await cf('/workers/'+name+'/versions/'+id+'?include=modules');
  const actual=Object.fromEntries(fresh.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(actual).length===Object.keys(modules).length&&
   Object.entries(modules).every(([n,src])=>actual[n]===src)){next=id;break}
 }
 await new Promise(ok=>setTimeout(ok,850));
}
assert(next,'NEW_V2_BINARY_MISMATCH');
await cf('/scripts/'+name+'/deployments',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:next,percentage:100}],code_update_strategy:{mode:'immediate'}})});
let after=null;
for(let i=0;i<28;i++){
 await new Promise(ok=>setTimeout(ok,i?1400:2600));
 try{
  after=await state('/ou-adaptive-research-state-test');
  if(after?.eventJournal&&after?.series30&&after?.series90)break;
 }catch{}
}
assert(after?.formulas?.length===42,'MISSING_ADAPTIVE_V2_SNAPSHOT');
assert.equal(after.series30.rangeDays,30);
assert.equal(after.series90.rangeDays,90);
assert.equal(after.series30.source,'PERSISTED_ADAPTIVE_DAILY_SNAPSHOT');
assert.equal(after.eventJournal.events,after.formulas.reduce((a,x)=>a+x.settled,0),
 'MIGRATED_JOURNAL_COUNT_MISMATCH');
for(const field of ['totalPredictions','pending','settled','win','loss','profitLoss','maximumDrawdown'])
 assert.deepEqual(after.formulas.map(x=>x[field]),pre.formulas.map(x=>x[field]),'RESEARCH_STATS_CHANGED_'+field);
const [oldAfter,btssAfter,others]=await Promise.all([
 state('/prematch-ou-engine-state'),state('/btts-bulk-v2-state'),
 Promise.all(keep.map(async n=>[n,await version(n)])).then(Object.fromEntries)]);
assert.equal(oldAfter.shadowCount,legacy.shadowCount,'EXISTING_ODDS_LEDGER_MODIFIED');
assert.equal(btssAfter.config.mode,'CLOSED');
assert.deepEqual(others,base,'OTHER_WORKERS_MODIFIED');
const publicly=await fetch(host+'/ou-adaptive-research-data',{signal:AbortSignal.timeout(25000)});
assert(publicly.ok,'PUBLIC_READ_ONLY_DATA_FAILED');
const payload=await publicly.json();
assert.equal(payload.series30.rangeDays,30);
assert.equal(payload.series90.rangeDays,90);
console.log('B46_ADAPTIVE_V2_BACKEND_DEPLOY_SUCCESS '+JSON.stringify({
 worker:name,oldVersion,newVersion:next,
 researchEntries:after.formulas.reduce((a,x)=>a+x.totalPredictions,0),
 settled:after.formulas.reduce((a,x)=>a+x.settled,0),
 eventJournal:after.eventJournal.events,corrections:after.eventJournal.revisions,
 chartDays:[after.series30.rangeDays,after.series90.rangeDays],
 chartSource:after.series90.source,
 retainedFTMonitoring:true,unchangedPriceRange:[1.4,10],unchangedOldOu:true,
 unaffectedProduction:true,paidProviderCalls:0
}));
