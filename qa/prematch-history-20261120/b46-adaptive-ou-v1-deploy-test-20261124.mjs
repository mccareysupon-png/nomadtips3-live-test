// Guarded TEST-only activation of B46_ADAPTIVE_OU_RESEARCH_V1.
// Add exactly 42 immutable research formulas without altering other TEST markets.
// Uses existing HCR FT and existing Full Market /board-cache (no new paid API).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_CLOUDFLARE_CREDENTIALS');
const worker='ball46-prematch-only-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const ownerAuthorization='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const protectedWorkers=['ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'];
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(55000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,250));
 return j.result;
}
const version=async name=>(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
async function owner(path,post=false){
 const r=await fetch(host+path,{method:post?'POST':'GET',
  headers:{authorization:ownerAuthorization,...(post?{'content-type':'application/json'}:{})},
  ...(post?{body:'{}'}:{}),cache:'no-store',signal:AbortSignal.timeout(50000)});
 assert(r.ok,'OWNER_TEST_'+path+'_'+r.status);return r.json();
}
function once(s,needle,replacement){
 const n=s.split(needle).length-1;assert.equal(n,1,'ANCHOR_MISMATCH_'+needle.slice(0,90)+'_'+n);
 return s.replace(needle,replacement);
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedWorkers.map(async name=>[name,await version(name)])));
const original=await version(worker);
const [installed,settings,ouBefore,shadowBefore,btssBefore,historyBefore]=await Promise.all([
 cf('/workers/'+worker+'/versions/'+original+'?include=modules'),
 cf('/scripts/'+worker+'/settings'),
 owner('/ou-v3-stage-one-audit-test'),
 owner('/prematch-ou-engine-state'),
 owner('/btts-bulk-v2-state'),
 owner('/ou-history-ft-state')
]);
assert.equal(ouBefore.policy.minimumPriceInclusive,1.40);
assert.equal(ouBefore.policy.maximumPriceInclusive,10);
assert.equal(shadowBefore.policy.minEV,.05);
assert.equal(btssBefore.config.mode,'CLOSED');
assert(historyBefore.archive.ft>=367);
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),
 ['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const oldModules=Object.fromEntries(installed.modules.map(m=>[
 m.name,Buffer.from(m.content_base64,'base64').toString()]));
const modules={...oldModules},main=installed.main_module;
const additions=[
 'b46-adaptive-ou-patterns-v1-test.mjs',
 'b46-adaptive-ou-ledger-v1-test.mjs',
 'b46-adaptive-ou-ui-v1-test.mjs'];
for(const name of additions){
 assert(!modules[name],'ADAPTIVE_ALREADY_INSTALLED_'+name);
 modules[name]=fs.readFileSync('qa/prematch-history-20261120/'+name,'utf8');
}
assert(modules[main].includes('/ou-v3-stage-one-audit-test'),'TEST_VERSION_UNEXPECTED_NO_HISTORY');
assert(!modules[main].includes('/ou-adaptive-research-run-test'),'ADAPTIVE_ALREADY_ACTIVE');
const importAnchor="import {DurableObject} from 'cloudflare:workers';";
const imports=[
 "import {screenAdaptiveResearch,ADAPTIVE_OU_ID} from './b46-adaptive-ou-patterns-v1-test.mjs';",
 "import {runAdaptiveOu,readAdaptiveStats} from './b46-adaptive-ou-ledger-v1-test.mjs';",
 "import {adaptiveOuResearchHtml} from './b46-adaptive-ou-ui-v1-test.mjs';"
].join('\n');
modules[main]=once(modules[main],importAnchor,importAnchor+'\n'+imports);
const routeAnchor=" if(path==='/ou-v3-stage-one-audit-test'&&req.method==='GET'){";
const route=[
" if(path==='/ou-adaptive-research-state-test'&&req.method==='GET'){",
"  const last=await this.ctx.storage.get('b46AdaptiveOuResearchLastV1')??null;",
"  const fixtures=await this.ctx.storage.get('botFixtures')??[];",
"  const patterns=screenAdaptiveResearch(this.db,fixtures,now);",
"  const data=readAdaptiveStats(this.db,now,{limit:500});",
"  for(const [f,c] of Object.entries(patterns.formulaCounts)){",
"   c.pricedFixtures=last?.priced?.perFormula?.[f]??0;",
"   c.issued=data.formulas.find(s=>s.formula===f)?.totalPredictions??0;",
"  }",
"  return json({...data,screeningCounts:patterns.counts,",
"   formulaCounts:patterns.formulaCounts,",
"   rawCandidates:patterns.candidates.slice(0,250),",
"   priced:last?.priced??{fixtures:0,quotes:0,matchedFormulaSelections:0},",
"   lastRunAt:last?.at??null});",
" }",
" if(path==='/ou-adaptive-research-run-test'&&req.method==='POST'){",
"  if(!this.env.FULL_MARKET)",
"   return json({code:ADAPTIVE_OU_ID,error:'FULL_MARKET_CACHE_BINDING_MISSING',providerCalls:0});",
"  const fixtures=await this.ctx.storage.get('botFixtures')??[];",
"  const market=async(path,opts={})=>{",
"   if(path!=='/board-cache'||opts.method!=='POST')throw Error('ADAPTIVE_CACHE_ONLY_PATH');",
"   const r=await this.env.FULL_MARKET.fetch('https://full-market.internal/board-cache',{",
"    method:'POST',headers:{accept:'application/json','content-type':'application/json'},",
"    body:JSON.stringify(opts.body??{}),signal:AbortSignal.timeout(18000)});",
"   if(!r.ok)throw Error('ADAPTIVE_CACHE_HTTP_'+r.status);",
"   return r.json();",
"  };",
"  const result=await runAdaptiveOu(this.db,{fixtures,now,market});",
"  const last={at:new Date(now*1000).toISOString(),",
"   counts:result.raw.counts,formulaCounts:result.raw.formulaCounts,",
"   priced:result.priced,record:result.record,settlement:result.settlement};",
"  await this.ctx.storage.put('b46AdaptiveOuResearchLastV1',last);",
"  return json({code:ADAPTIVE_OU_ID,...last,",
"   stats:result.stats,providerCalls:0,productionWrites:0});",
" }"
].join('\n');
modules[main]=once(modules[main],routeAnchor,route+'\n'+routeAnchor);
const publicAnchor="if(req.method==='GET'&&p==='/preview')";
const publicRoutes=[
"if(req.method==='GET'&&p==='/ou-adaptive-research-test')",
" return new Response(adaptiveOuResearchHtml,{headers:{'content-type':'text/html;charset=utf-8',",
" 'cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});",
"if(req.method==='GET'&&p==='/ou-adaptive-research-data')",
" return env.STORE.get(env.STORE.idFromName('prematch-only-v1')).fetch(",
" 'https://prematch.internal/ou-adaptive-research-state-test');"
].join('');
modules[main]=once(modules[main],publicAnchor,publicRoutes+publicAnchor);
const scheduled="async scheduled(event,env,ctx){";
const cronPlus=[
"if(event.cron==='*/15 * * * *'&&ctx?.waitUntil){",
" const b46s=env.STORE.get(env.STORE.idFromName('prematch-only-v1'));",
" ctx.waitUntil(b46s.fetch('https://prematch.internal/ou-adaptive-research-run-test',",
" {method:'POST'}).then(async r=>{",
"  if(!r.ok){console.log('B46_ADAPTIVE_TEST_ERROR_HTTP_'+r.status);return}",
"  const d=await r.json();",
"  console.log('B46_ADAPTIVE_OU_RESEARCH_V1_TEST candidates='+(d.counts?.uniqueFixturesWithPatterns??0)",
"   +' priced='+(d.priced?.fixtures??0)+' picks='+(d.record?.added??0)+' paid='+(d.providerCalls??0));",
" }).catch(e=>console.log('B46_ADAPTIVE_TEST_ERR '+String(e.message).slice(0,100))));",
"}"
].join('');
modules[main]=once(modules[main],scheduled,scheduled+cronPlus);
assert.equal(Object.keys(modules).length,Object.keys(oldModules).length+3);
for(const [name,body] of Object.entries(oldModules))
 if(name!==main)assert.equal(modules[name],body,'UNRELATED_TEST_MODULE_MODIFIED_'+name);
for(const name of [main,...additions]){
 const tmp='/tmp/b46-adaptive-'+name;
 fs.writeFileSync(tmp,modules[name]);
 execFileSync(process.execPath,['--check',tmp]);
}
console.log('B46_ADAPTIVE_DEPLOY_PREFLIGHT '+JSON.stringify({
 previous:original,modulesAdded:additions,
 historyFT:historyBefore.archive.ft,
 oldModelCount:ouBefore.counts.modeled,
 preExistingOuShadow:shadowBefore.shadowCount,
 noHCRChange:true,priceGate:[1.4,10],noExtraPaidCalls:true}));
assert.equal(await version(worker),original,'CONCURRENT_VERSION_CHANGE');
const metadata={main_module:main,compatibility_date:installed.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,body] of Object.entries(modules))
 form.append(name,new Blob([body],{type:'application/javascript+module'}),name);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let next=null;
for(let i=0;i<45;i++){
 const id=await version(worker);
 if(id!==original){
  const check=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const actual=Object.fromEntries(check.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(actual).length===Object.keys(modules).length&&
   Object.entries(modules).every(([name,content])=>actual[name]===content)){next=id;break}
 }
 await new Promise(ok=>setTimeout(ok,850));
}
assert(next,'VERIFY_ADAPTIVE_BINARY_FAILED');
await cf('/scripts/'+worker+'/deployments',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:next,percentage:100}],
 code_update_strategy:{mode:'immediate'}})});
let read=null;
for(let i=0;i<25;i++){
 await new Promise(ok=>setTimeout(ok,i?1500:2500));
 try{
  read=await owner('/ou-adaptive-research-state-test');
  if(read?.code==='B46_ADAPTIVE_OU_RESEARCH_V1')break;
 }catch(e){if(i===24)throw e}
}
assert(read&&read.formulas?.length===42,'READ_ADAPTIVE_42_NOT_READY');
assert.equal(read.bySelection.length,84);
const first=await owner('/ou-adaptive-research-run-test',true);
assert.equal(first.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(first.providerCalls,0);
assert.equal(first.stats.formulas.length,42);
const [afterState,afterOldOu,afterClosed,afterHistory,protectedAfter]=await Promise.all([
 owner('/ou-adaptive-research-state-test'),
 owner('/prematch-ou-engine-state'),
 owner('/btts-bulk-v2-state'),
 owner('/ou-history-ft-state'),
 Promise.all(protectedWorkers.map(async name=>[name,await version(name)])).then(Object.fromEntries)
]);
assert.equal(afterState.formulas.length,42);
assert.equal(afterState.bySelection.length,84);
assert.equal(afterOldOu.shadowCount,shadowBefore.shadowCount,'EXISTING_OU_PREDICTIONS_CHANGED');
assert.equal(afterClosed.config.mode,'CLOSED');
assert.equal(afterHistory.archive.ft,historyBefore.archive.ft);
assert.deepEqual(protectedAfter,protectedBefore,'PROTECTED_WORKER_MODIFIED');
const page=await fetch(host+'/ou-adaptive-research-test',{signal:AbortSignal.timeout(30000)});
assert.equal(page.status,200,'ADAPTIVE_DASHBOARD_UNAVAILABLE');
assert((await page.text()).includes('Adaptive Over / Under 2.5 Research V1'));
const publicData=await fetch(host+'/ou-adaptive-research-data',{signal:AbortSignal.timeout(30000)});
assert.equal(publicData.status,200,'ADAPTIVE_PUBLIC_READ_ONLY_DATA_UNAVAILABLE');
const publicJson=await publicData.json();
assert.equal(publicJson.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
console.log('B46_ADAPTIVE_OU_V1_DEPLOY_SUCCESS '+JSON.stringify({
 worker,version:next,runAt:first.at,url:host+'/ou-adaptive-research-test',
 checked:first.counts.validUpcoming,
 patternFixtures:first.counts.uniqueFixturesWithPatterns,
 matchedFormulaSides:first.counts.formulasTriggered,
 freshPricedFixtures:first.priced.fixtures,
 pricedFormulaSelections:first.priced.matchedFormulaSelections,
 newLedgerRows:first.record.added,
 settled:first.settlement.settled,
 formulaCounts:first.formulaCounts,
 separateStats:true,all42Published:true,unmodified1X2BTTSLegacyOu:true,
 newPaidApiCalls:0,productionWrites:0
}).slice(0,24000));
