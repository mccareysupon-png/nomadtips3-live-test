// BALL46 existing TEST PreMatch Over/Under page ONLY.
// Mount 30D/90D per-formula daily Snapshot chart INSIDE the previously fixed
// isolated Adaptive Research panel, without changing any normal stats totals.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchAdaptiveNativeChartWorker,ADAPTIVE_30_90_CHART_VERSION} from './b46-adaptive-native-chart-v3-test.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_SECRET');
const name='ball46-premium-match-colors-test-20261120';
const host='https://'+name+'.mccarey-supon.workers.dev';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedNames=['ball46-prematch-only-test-20261120','ball46-production',
 'nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(52000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,230));
 return j.result;
}
const ver=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const frozen=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await ver(n)])));
const orig=await ver(name);
const [deployment,settings]=await Promise.all([
 cf('/workers/'+name+'/versions/'+orig+'?include=modules'),
 cf('/scripts/'+name+'/settings')]);
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),
 ['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
const prior=Object.fromEntries(deployment.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const mods={...prior};
const main=deployment.main_module;
const old=mods[main];
assert(old.includes('B46_ADAPTIVE_NATIVE_RESEARCH_LAYOUT_FIX_V2'));
assert(!old.includes(ADAPTIVE_30_90_CHART_VERSION));
const patched=patchAdaptiveNativeChartWorker(old);
assert(patched.client.includes('series30?.byFormula'));
assert(patched.client.includes('series90?.byFormula'));
assert(patched.client.includes("panel.className='b46pm-adaptive-research-isolated'"));
assert(!patched.client.includes("panel.className='b46pm-stats-board'"));
assert(patched.worker.replace('var prematchClientScript = '+JSON.stringify(patched.client)+';','')===
 old.replace(old.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/)[0],''),
 'NATIVE_FRONTEND_CHANGED_OUTSIDE_CLIENT');
for(const [n,code] of [['native-client',patched.client],['native-worker',patched.worker]]){
 const path='/tmp/b46-adaptive-v3-'+n+'.js';fs.writeFileSync(path,code);
 execFileSync(process.execPath,['--check',path]);
}
const backend=await fetch(host+'/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(28000)});
assert(backend.ok,'ORIGINAL_TEST_BACKEND_PROXY_FAILED');
const data=await backend.json();
assert.equal(data.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(data.formulas.length,42);
assert.equal(data.series30?.rangeDays,30);
assert.equal(data.series90?.rangeDays,90);
assert(data.eventJournal,'EVENT_JOURNAL_MISSING');
mods[main]=patched.worker;
assert.equal(await ver(name),orig,'FRONTEND_TEST_CONCURRENT_CHANGE');
const meta={main_module:main,
 compatibility_date:deployment.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(deployment.compatibility_flags?.length?{compatibility_flags:deployment.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
for(const [n,s] of Object.entries(mods))
 form.append(n,new Blob([s],{type:'application/javascript+module'}),n);
console.log('B46_ADAPTIVE_NATIVE_CHART_PREFLIGHT '+JSON.stringify({
 previous:orig,formulaCount:42,backendSeries30:true,backendSeries90:true,
 existingResearchEntries:data.formulas.reduce((a,x)=>a+x.totalPredictions,0),
 patchScope:'EXISTING_ISOLATED_NATIVE_OVERUNDER_PANEL_ONLY'}));
await cf('/scripts/'+name+'?bindings_inherit=strict',{method:'PUT',body:form});
let target=null;
for(let i=0;i<44;i++){
 const v=await ver(name);
 if(v!==orig){
  const r=await cf('/workers/'+name+'/versions/'+v+'?include=modules');
  const got=Object.fromEntries(r.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(got).length===Object.keys(mods).length&&
   Object.entries(mods).every(([n,s])=>got[n]===s)){target=v;break}
 }
 await new Promise(ok=>setTimeout(ok,850));
}
assert(target,'NEW_GRAPH_FRONTEND_BINARY_NOT_VERIFIED');
await cf('/scripts/'+name+'/deployments',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:target,percentage:100}],code_update_strategy:{mode:'immediate'}})});
let live=false;
for(let i=0;i<24;i++){
 await new Promise(ok=>setTimeout(ok,i?1250:2300));
 const [js,dataResponse]=await Promise.all([
  fetch(host+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(19000)}),
  fetch(host+'/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(19000)})
 ]);
 if(!js.ok||!dataResponse.ok)continue;
 const text=await js.text(),stats=await dataResponse.json().catch(()=>null);
 if(text.includes(ADAPTIVE_30_90_CHART_VERSION)&&
  text.includes("panel.append(graph)")&&
  text.includes('series30?.byFormula')&&text.includes('series90?.byFormula')&&
  stats?.series30?.rangeDays===30&&stats?.series90?.rangeDays===90){live=true;break}
}
assert(live,'GRAPH_NOT_VISIBLE_ON_ORIGINAL_TEST_FRONTEND');
const page=await fetch(host+'/?b46pm=ou',{cache:'no-store',signal:AbortSignal.timeout(23000)});
assert(page.ok,'ORIGINAL_NATIVE_OVERUNDER_PAGE_MISSING');
const after=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await ver(n)])));
assert.deepEqual(after,frozen,'UNRELATED_WORKER_VERSION_CHANGED');
console.log('B46_ADAPTIVE_NATIVE_30_90_DEPLOY_SUCCESS '+JSON.stringify({
 url:host+'/?b46pm=ou',worker:name,from:orig,to:target,
 chart:'30D/90D_PER_FORMULA',source:'PERSISTED_DAILY_SNAPSHOT',
 existingOverUnderPanelKept:true,priorOverlayFixKept:true,
 untouchedOriginalOddsAndStats:true,unchangedBackends:true,
 noExtraApiCalls:true,productionWrites:0
}));
