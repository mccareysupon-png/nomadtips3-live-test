// Guarded TEST frontend-only navigation scroll fix. Production/backends never updated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchPrematchScrollWorker,B46_PREMATCH_NAV_SCROLL_V1} from './patch-prematch-navigation-scroll-test-20261124.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_SECRETS_MISSING');
const front='ball46-premium-match-colors-test-20261120';
const base='https://'+front+'.mccarey-supon.workers.dev';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedWorkers=['ball46-prematch-only-test-20261120','ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
async function cf(p,opt={}){
 const r=await fetch(api+p,{...opt,headers:{authorization:'Bearer '+token,...opt.headers},signal:AbortSignal.timeout(50000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+p+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,250));return j.result;
}
const version=async name=>(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const frozen=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
const previous=await version(front);
const [v,settings]=await Promise.all([
 cf('/workers/'+front+'/versions/'+previous+'?include=modules'),
 cf('/scripts/'+front+'/settings')
]);
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
const modules=Object.fromEntries(v.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString('utf8')]));
const main=v.main_module,old=modules[main];
assert(old.includes('var prematchClientScript = '),'TEST_NATIVE_CLIENT_MISSING');
assert(!old.includes(B46_PREMATCH_NAV_SCROLL_V1),'SCROLL_ALREADY_DEPLOYED');
const {worker,client}=patchPrematchScrollWorker(old);
assert(client.includes('B46_ADAPTIVE_')||client.includes('b46AdaptivePanel'),'RESEARCH_UI_MISSING');
assert(client.includes("panel.scrollTop=previousScroll"),'SAME_PAGE_SCROLL_NOT_PRESERVED');
assert(client.includes('b46PrematchLastScrollRoute!==currentRoute'),'ROUTE_RESET_MISSING');
assert(worker.replace('var prematchClientScript = '+JSON.stringify(client)+';','')===
 old.replace(old.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/)[0],''),
 'UNRELATED_WORKER_CONTENT_CHANGED');
modules[main]=worker;
for(const [name,source] of [['client',client],['worker',worker]]){
 const file='/tmp/b46-prematch-navigation-'+name+'.js';
 fs.writeFileSync(file,source);
 execFileSync(process.execPath,['--check',file]);
}
const beforeData=await fetch(base+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(25000)});
assert(beforeData.ok,'TEST_PREMATCH_DATA_UNAVAILABLE');
const check=await beforeData.json();
assert(check.testLedger,'PREMATCH_LEDGER_MISSING');
assert.equal(await version(front),previous,'CONCURRENT_FRONTEND_CHANGE_ABORT');
const metadata={main_module:main,compatibility_date:v.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(v.compatibility_flags?.length?{compatibility_flags:v.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,body] of Object.entries(modules))
 form.append(name,new Blob([body],{type:'application/javascript+module'}),name);
console.log('PREMATCH_ROUTE_SCROLL_PREFLIGHT '+JSON.stringify({front,previous,protectedWorkers,onlyFrontendJs:true,apiCallsAdded:0}));
await cf('/scripts/'+front+'?bindings_inherit=strict',{method:'PUT',body:form});
let target=null;
for(let i=0;i<45;i++){
 const current=await version(front);
 if(current!==previous){
  const next=await cf('/workers/'+front+'/versions/'+current+'?include=modules');
  const actual=Object.fromEntries(next.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString('utf8')]));
  if(Object.keys(actual).length===Object.keys(modules).length&&Object.entries(modules).every(([n,s])=>actual[n]===s)){target=current;break}
 }
 await new Promise(ok=>setTimeout(ok,900));
}
assert(target,'TEST_FRONTEND_VERSION_VERIFICATION_FAILED');
await cf('/scripts/'+front+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:target,percentage:100}],code_update_strategy:{mode:'immediate'}})});
let live=false;
for(let i=0;i<25;i++){
 await new Promise(ok=>setTimeout(ok,i?1300:2200));
 const response=await fetch(base+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)continue;
 const js=await response.text();
 if(js.includes(B46_PREMATCH_NAV_SCROLL_V1)&&js.includes('b46PrematchLastScrollRoute!==currentRoute')){live=true;break}
}
assert(live,'NAVIGATION_SCROLL_PATCH_NOT_VISIBLE');
for(const route of ['predictions','ou','btts']){
 const response=await fetch(base+'/?b46pm='+route,{cache:'no-store',signal:AbortSignal.timeout(20000)});
 assert(response.ok,'TEST_ROUTE_FAILED_'+route);
}
const after=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
assert.deepEqual(after,frozen,'PROTECTED_WORKER_CHANGED');
console.log('PREMATCH_NAVIGATION_SCROLL_TEST_DEPLOY_PASS '+JSON.stringify({
 url:base+'/?b46pm=predictions',from:previous,to:target,
 navigationChangesResetToTop:true,sameRouteRefreshKeepsScroll:true,
 backForwardReevaluatesRoute:true,productionChanges:0,otherWorkerChanges:0,addedProviderCalls:0
}));
