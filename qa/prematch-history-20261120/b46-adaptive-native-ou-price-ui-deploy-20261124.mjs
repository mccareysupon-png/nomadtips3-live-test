// Deploy the existing O/U statistical view's Adaptive Research subsection.
// Frontend TEST Worker ONLY. No standalone page or changes to Total/1X2/BTTS,
// legacy O/U calculations or Provider API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchAdaptiveNativeWorker,ADAPTIVE_NATIVE_UI_V1}
 from './patch-adaptive-research-native-ou-test.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'TEST_CLOUDFLARE_SECRETS_MISSING');
const front='ball46-premium-match-colors-test-20261120';
const backend='ball46-prematch-only-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const base='https://'+front+'.mccarey-supon.workers.dev';
const backendHost='https://'+backend+'.mccarey-supon.workers.dev';
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(55000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,200));
 return j.result;
}
const version=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const protect=[backend,'ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
const protectedBefore=Object.fromEntries(await Promise.all(protect.map(async n=>[n,await version(n)])));
const oldId=await version(front);
const [v,settings]=await Promise.all([
 cf('/workers/'+front+'/versions/'+oldId+'?include=modules'),
 cf('/scripts/'+front+'/settings')
]);
assert.deepEqual(settings.bindings.map(b=>b.name).sort(),
 ['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
const modules=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const mainName=v.main_module,oldMain=modules[mainName];
assert(oldMain.includes('var prematchClientScript = '),'CLIENT_NOT_FOUND');
assert(oldMain.includes('PREMATCH_STORE.fetch'),'PREMATCH_SERVICE_PROXY_MISSING');
assert(!oldMain.includes(ADAPTIVE_NATIVE_UI_V1),'RESEARCH_PATCH_ALREADY_PRESENT');
const patched=patchAdaptiveNativeWorker(oldMain);
const src='/tmp/b46-adaptive-native-client.js',workerPath='/tmp/b46-adaptive-native-worker.js';
fs.writeFileSync(src,patched.client);
fs.writeFileSync(workerPath,patched.worker);
execFileSync(process.execPath,['--check',src]);
execFileSync(process.execPath,['--check',workerPath]);
assert(patched.client.includes("if(mode==='ou')b46AdaptivePanel(content)"));
assert(!patched.client.includes("if(mode==='all')b46AdaptivePanel(content)"));
assert(patched.worker.includes('/__b46_pm_adaptive_research'));
const unchangedBefore=oldMain.slice(0,oldMain.indexOf('var prematchClientScript = '));
assert(patched.worker.startsWith(unchangedBefore),'OUTSIDE_UI_PATCH_UNEXPECTED');
const sourceWeb=await fetch(backendHost+'/ou-adaptive-research-data',{cache:'no-store',signal:AbortSignal.timeout(40000)});
assert(sourceWeb.status===200,'BACKEND_PUBLIC_RESEARCH_ROUTE_HTTP_'+sourceWeb.status);
const latest=await sourceWeb.json();
assert.equal(latest.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(latest.formulas?.length,42);
console.log('B46_NATIVE_PRICE_UI_PREFLIGHT '+JSON.stringify({
 oldVersion:oldId,backendResearchPicks:latest.formulas.reduce((s,x)=>s+x.totalPredictions,0),
 pricedFixtures:latest.priced?.fixtures,
 patterns:latest.screeningCounts?.uniqueFixturesWithPatterns,
 renderOnly:'b46pm=ou',statisticsCombined:false,
 willNotChangeBackend:true,noApiCalls:true
}));
modules[mainName]=patched.worker;
assert.equal(await version(front),oldId,'CONCURRENT_FRONTEND_CHANGE');
const meta={main_module:mainName,compatibility_date:v.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(v.compatibility_flags?.length?{compatibility_flags:v.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
for(const [name,content] of Object.entries(modules))
 form.append(name,new Blob([content],{type:'application/javascript+module'}),name);
await cf('/scripts/'+front+'?bindings_inherit=strict',{method:'PUT',body:form});
let target=null;
for(let i=0;i<46;i++){
 const id=await version(front);
 if(id!==oldId){
  const ver=await cf('/workers/'+front+'/versions/'+id+'?include=modules');
  const actual=Object.fromEntries(ver.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(actual).length===Object.keys(modules).length&&
   Object.entries(modules).every(([name,src])=>actual[name]===src)){target=id;break}
 }
 await new Promise(ok=>setTimeout(ok,850));
}
assert(target,'NEW_NATIVE_FRONTEND_BINARY_NOT_VERIFIED');
await cf('/scripts/'+front+'/deployments',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:target,percentage:100}],
 code_update_strategy:{mode:'immediate'}})});
let uiGood=false,proxyData=null;
for(let i=0;i<28;i++){
 await new Promise(ok=>setTimeout(ok,i?1400:2400));
 const [code,data]=await Promise.all([
  fetch(base+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(18000)}),
  fetch(base+'/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(20000)})
 ]);
 if(!code.ok||!data.ok)continue;
 const js=await code.text();
 try{const j=await data.json();
  if(js.includes(ADAPTIVE_NATIVE_UI_V1)&&js.includes("if(mode==='ou')b46AdaptivePanel(content)")&&
   j.code==='B46_ADAPTIVE_OU_RESEARCH_V1'&&j.formulas?.length===42){
   proxyData=j;uiGood=true;break}
 }catch{}
}
assert(uiGood,'NATIVE_TEST_OU_RESEARCH_NOT_VISIBLE');
const url=base+'/?b46pm=ou';
const page=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});
assert(page.status===200,'EXISTING_NATIVE_PREMATCH_OU_PAGE_FAIL_'+page.status);
const protectedAfter=Object.fromEntries(await Promise.all(protect.map(async n=>[n,await version(n)])));
assert.deepEqual(protectedAfter,protectedBefore,'BACKEND_OR_PROD_MODIFIED');
assert(proxyData.records.every(x=>x.odds>=1.4&&x.odds<=10));
console.log('B46_NATIVE_OU_RESEARCH_TEST_DEPLOY_PASS '+JSON.stringify({
 url,worker:front,from:oldId,to:target,
 priceBackedMatches:proxyData.priced?.fixtures??0,
 ledgerSelections:proxyData.formulas.reduce((s,x)=>s+x.totalPredictions,0),
 patterns:proxyData.screeningCounts?.uniqueFixturesWithPatterns,
 isNativeTab:true,tab:'Pre-Match Statistics > Over/Under',
 separate42FormulaLedger:true,notIncludedInTotal:true,
 noNewStandalonePage:true,noAdditionalApiCalls:true,
 productionWrites:0
}));
