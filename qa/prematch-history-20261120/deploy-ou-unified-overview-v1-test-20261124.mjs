// Guarded Cloudflare deployment of TEST O/U native summary only.
// Keeps 42 Adaptive formulas, all underlying ledger and other workers unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {combineOuOverview} from './b46-ou-overview-aggregate-test-v1.mjs';
import {patchOuUnifiedOverviewWorker,B46_OU_ALL_ACCOUNTS_OVERVIEW_V1} from './patch-ou-unified-overview-v1-test.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_SECRETS_MISSING');
const worker='ball46-premium-match-colors-test-20261120',host='https://'+worker+'.mccarey-supon.workers.dev';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedWorkers=['ball46-prematch-only-test-20261120','ball46-production',
 'nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
async function cf(path,opt={}){
 const r=await fetch(api+path,{...opt,headers:{authorization:'Bearer '+token,...opt.headers},signal:AbortSignal.timeout(55000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,220));
 return j.result;
}
const active=async name=>(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const frozen=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await active(n)])));
const previous=await active(worker);
const [installed,settings]=await Promise.all([
 cf('/workers/'+worker+'/versions/'+previous+'?include=modules'),
 cf('/scripts/'+worker+'/settings')
]);
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),
 ['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
const modules=Object.fromEntries(installed.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
const main=installed.main_module,before=modules[main];
assert(before.includes('B46_PM_CONTENT_ONLY_LOADING_V1'),'CURRENT_INLINE_LOADING_MISSING');
assert(before.includes('B46_ADAPTIVE_NATIVE_CHART_30_90_V3'),'CURRENT_ADAPTIVE_GRAPH_MISSING');
assert(!before.includes('B46_PREMATCH_UNIVERSAL_SPINNER_V1'),'FULLSCREEN_NOT_PERMITTED');
assert(!before.includes(B46_OU_ALL_ACCOUNTS_OVERVIEW_V1),'OVERVIEW_ALREADY_DEPLOYED');
const {worker:patched,client}=patchOuUnifiedOverviewWorker(before);
assert(client.includes('b46AggregateOuSnapshot'),'OVERVIEW_CALCULATOR_MISSING');
assert(client.includes("source:'OU_ADAPTIVE_COMBINED_VIEW_ONLY'"),'OU_SOURCE_MISSING');
assert(!client.includes("mode==='ou'&&performanceMetric!=='winRate'?[]"),'O_U_GRAPH_STILL_BLOCKED');
assert(client.includes("if(mode==='ou'&&b46OuCombined)content.append(board);"),'OVERVIEW_STATS_GRID_MISSING');
assert(client.includes('b46AdaptiveOverviewError'),'ERROR_FALLBACK_MISSING');
assert(client.includes('B46_ADAPTIVE_NATIVE_CHART_30_90_V3'),'RESEARCH_FORMULA_CHART_LOST');
assert(client.includes('b46pm-inline-spinner'),'INLINE_LOADER_LOST');
const e=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const oldEmbed=before.match(e),newEmbed=patched.match(e);
assert(oldEmbed&&newEmbed,'TEST_CLIENT_NOT_EMBEDDED');
assert.equal(before.replace(oldEmbed[0],'<PREMATCH_CLIENT>'),
 patched.replace(newEmbed[0],'<PREMATCH_CLIENT>'),'UNRELATED_WORKER_CODE_CHANGED');
for(const [name,code] of [['worker',patched],['client',client]]){
 const file='/tmp/b46-ou-aggregate-'+name+'.js';
 fs.writeFileSync(file,code);
 execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}
const [baseResponse,adaptiveResponse]=await Promise.all([
 fetch(host+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(26000)}),
 fetch(host+'/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(26000)})
]);
assert(baseResponse.ok&&adaptiveResponse.ok,'TEST_SNAPSHOT_API_MISSING');
const [base,adaptive]=await Promise.all([baseResponse.json(),adaptiveResponse.json()]);
assert.equal(base.ouLedger?.mode,'TEST_ONLY','OU_LEDGER_NOT_TEST');
assert.equal(adaptive.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(adaptive.formulas.length,42,'DONOT_REMOVE_OTHER_ADAPTIVE_FORMULAS');
assert.equal(adaptive.series30?.rangeDays,30);
assert.equal(adaptive.series90?.rangeDays,90);
const overview=combineOuOverview(base.ouLedger,base.ouDailySeries,base.ouDailyBook,adaptive);
assert.equal(overview.formulaCount,42,'ALL_42_FORMULAS_MUST_BE_INCLUDED');
assert.equal(overview.total.win,
 Number(base.ouLedger.stats.win)+adaptive.formulas.filter(f=>f.selection==='ALL').reduce((a,f)=>a+f.win,0));
assert(overview.total.win>base.ouLedger.stats.win,'ADAPTIVE_WINS_MISSING');
assert.equal(overview.total.units,
 Math.round((Number(base.ouLedger.stats.units)+adaptive.formulas.filter(f=>f.selection==='ALL').reduce((a,f)=>a+f.profitLoss,0))*1e8)/1e8);
const newModules={...modules,[main]:patched};
assert.equal(await active(worker),previous,'CONCURRENT_FRONTEND_UPDATE_ABORT');
console.log('B46_OU_COMBINED_TEST_PREFLIGHT '+JSON.stringify({
 from:previous,originalOULedger:base.ouLedger.stats,
 formulaCount:overview.formulaCount,summary:overview.total,
 dailyCloses:overview.daily.length,scope:overview.source,
 noNewPaidCalls:true,otherWorkerChange:false
}));
const metadata={main_module:main,compatibility_date:installed.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,code] of Object.entries(newModules))
 form.append(name,new Blob([code],{type:'application/javascript+module'}),name);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let next=null;
for(let i=0;i<45;i++){
 const id=await active(worker);
 if(id!==previous){
  const v=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const got=Object.fromEntries(v.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
  if(Object.keys(got).length===Object.keys(newModules).length&&
    Object.entries(newModules).every(([n,c])=>got[n]===c)){next=id;break}
 }
 await new Promise(ok=>setTimeout(ok,900));
}
assert(next,'NEW_OU_OVERVIEW_VERSION_NOT_VERIFIED');
await cf('/scripts/'+worker+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:next,percentage:100}],
 code_update_strategy:{mode:'immediate'}})});
let live=false;
for(let i=0;i<25;i++){
 await new Promise(ok=>setTimeout(ok,i?1300:2200));
 const response=await fetch(host+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(19000)});
 if(!response.ok)continue;
 const text=await response.text();
 if(text.includes(B46_OU_ALL_ACCOUNTS_OVERVIEW_V1)&&
  text.includes("source:'OU_ADAPTIVE_COMBINED_VIEW_ONLY'")&&
  !text.includes("mode==='ou'&&performanceMetric!=='winRate'?[]")){live=true;break}
}
assert(live,'DEPLOYED_AGGREGATE_FRONTEND_NOT_VISIBLE');
const page=await fetch(host+'/?b46pm=ou',{cache:'no-store',signal:AbortSignal.timeout(20000)});
assert(page.ok,'OU_PAGE_NOT_AVAILABLE');
assert(!(await page.text()).includes('b46-pm-firstpaint-loader'),'FULLSCREEN_LOADER_REINTRODUCED');
const protectedAfter=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await active(n)])));
assert.deepEqual(protectedAfter,frozen,'UNRELATED_WORKER_VERSION_CHANGED');
console.log('B46_OU_AGGREGATE_OVERVIEW_TEST_DEPLOY_PASS '+JSON.stringify({
 url:host+'/?b46pm=ou',version:next,from:previous,formulaCount:42,
 expectedTotals:overview.total,dailySeriesPoints:overview.daily.length,
 noLedgerMutation:true,noBackendDeploy:true,noProductionDeploy:true,noExtraAPI:true
}));
