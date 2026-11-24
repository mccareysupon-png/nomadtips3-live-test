// Guarded TEST-only correction: accept real provider O/U 2.5 quote already in
// cache (6h research evidence), clearly mark not live; original live path unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const worker='ball46-prematch-only-test-20261120';
const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const base='https://'+worker+'.mccarey-supon.workers.dev';
const ownerAuth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(p,opts={}){
 const r=await fetch(url+p,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(50000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_'+p+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,180));
 return j.result;
}
const version=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
async function owner(path,post=false){
 const res=await fetch(base+path,{method:post?'POST':'GET',
  headers:{authorization:ownerAuth,...(post?{'content-type':'application/json'}:{})},
  ...(post?{body:'{}'}:{}),cache:'no-store',signal:AbortSignal.timeout(48000)});
 assert(res.ok,'OWNER_'+path+'_'+res.status);return res.json();
}
const protect=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','nomadtips3-full-market-343-ball46'];
const baseline=Object.fromEntries(await Promise.all(protect.map(async n=>[n,await version(n)])));
const initial=await version(worker);
const [installed,settings,before,oldOu,quota]=await Promise.all([
 cf('/workers/'+worker+'/versions/'+initial+'?include=modules'),
 cf('/scripts/'+worker+'/settings'),
 owner('/ou-adaptive-research-state-test'),
 owner('/prematch-ou-engine-state'),
 owner('/btts-bulk-v2-state')]);
assert.equal(before.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(before.formulas.length,42);assert.equal(before.bySelection.length,84);
assert.equal(oldOu.policy.minPriceInclusive,1.4);assert.equal(oldOu.policy.maxPriceInclusive,10);
assert.equal(quota.config.mode,'CLOSED');
const modules=Object.fromEntries(installed.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const changes=[
 ['ou-value-screener-v2-test.mjs','64177a1f90e21a8fa5dfd3e058c9120ed64e6595'],
 ['b46-adaptive-ou-ledger-v1-test.mjs','d81475de074eee47a07300c84b4a06a4b7fec475']
];
for(const [name,expectedCommit] of changes){
 const path='qa/prematch-history-20261120/'+name;
 const old=execFileSync('git',['show',expectedCommit+':'+path],{encoding:'utf8'});
 assert.equal(modules[name],old,'MODULE_DRIFT_'+name);
 const next=fs.readFileSync(path,'utf8');
 assert(next!==old&&next.includes('researchHistorical'),'EXPECTED_NEW_RESEARCH_PRICE_CHANGE_'+name);
 modules[name]=next;
 const temp='/tmp/b46-research-price-'+name;
 fs.writeFileSync(temp,next);execFileSync(process.execPath,['--check',temp]);
}
assert.equal(await version(worker),initial,'TEST_VERSION_CHANGED_CONCURRENTLY');
const metadata={main_module:installed.main_module,
 compatibility_date:installed.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,src] of Object.entries(modules))
 form.append(name,new Blob([src],{type:'application/javascript+module'}),name);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let target=null;
for(let i=0;i<50;i++){
 const id=await version(worker);
 if(id!==initial){
  const v=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const contents=Object.fromEntries(v.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
  if(Object.keys(contents).length===Object.keys(modules).length&&
   Object.entries(modules).every(([name,src])=>contents[name]===src)){target=id;break}
 }
 await new Promise(ok=>setTimeout(ok,850));
}
assert(target,'NEW_BINARY_NOT_VERIFIED');
await cf('/scripts/'+worker+'/deployments',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:target,percentage:100}],
  code_update_strategy:{mode:'immediate'}})});
let ready=null;
for(let i=0;i<26;i++){
 await new Promise(ok=>setTimeout(ok,i?1500:2500));
 try{
  const check=await owner('/ou-adaptive-research-state-test');
  if(check?.code==='B46_ADAPTIVE_OU_RESEARCH_V1'){ready=check;break}
 }catch{}
}
assert(ready&&ready.formulas.length===42,'NEW_TEST_READ_NOT_READY');
// Real run from stored verified Full Market data. No paid provider requests.
const tick=await owner('/ou-adaptive-research-run-test',true);
assert.equal(tick.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(tick.providerCalls,0);
assert(tick.priced?.matchedFormulaSelections>=0);
const [after,oldOuAfter,quotaAfter,productionAfter]=await Promise.all([
 owner('/ou-adaptive-research-state-test'),
 owner('/prematch-ou-engine-state'),
 owner('/btts-bulk-v2-state'),
 Promise.all(protect.map(async n=>[n,await version(n)])).then(Object.fromEntries)
]);
assert.equal(after.formulas.length,42);
assert.equal(after.bySelection.length,84);
assert.equal(oldOuAfter.shadowCount,oldOu.shadowCount,'OLD_LIVE_PRICED_OU_MODIFIED');
assert.equal(oldOuAfter.policy.minEV,.05);
assert.equal(quotaAfter.config.mode,'CLOSED');
assert.deepEqual(productionAfter,baseline);
assert(after.records.every(p=>p.odds>=1.40&&p.odds<=10));
console.log('B46_ADAPTIVE_RESEARCH_REAL_ODDS_DEPLOY_PASS '+JSON.stringify({
 testBackend:worker,version:target,original:initial,
 fixturesChecked:tick.counts?.validUpcoming,
 historicalPatternFixtures:tick.counts?.uniqueFixturesWithPatterns,
 historicalPriceEligible:tick.priced?.fixtures,
 formulaSideMatchesWithOdds:tick.priced?.matchedFormulaSelections,
 newlyIssuedResearchOnly:tick.record?.added,
 byFormula:tick.formulaCounts,
 latestResearchCount:after.formulas.reduce((s,x)=>s+x.totalPredictions,0),
 samplePricedRecords:after.records.slice(0,15).map(x=>({
   fixtureId:x.fixture_id,match:x.home+' — '+x.away,
   formula:x.formula_id,selection:x.selection,odds:x.odds,bookmaker:x.bookmaker,
   observedAt:new Date(x.quote_observed_at*1000).toISOString(),
   priceFromHistoricalCache:x.odds_source.includes('HISTORICAL_RESEARCH_ONLY'),
   status:x.status
 })),
 oldOuShadowUnaffected:true,legacyPriceGateSeconds:120,
 researchPriceMaxAgeSec:21600,
 noExtraPaidCalls:true,productionWrites:0
}).slice(0,22000));
