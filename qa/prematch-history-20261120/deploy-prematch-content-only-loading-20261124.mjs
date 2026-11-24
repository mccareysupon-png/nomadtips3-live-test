import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchPreMatchContentWorker,B46_CONTENT_ONLY_LOADING_VERSION} from './patch-prematch-content-only-loading-20261124.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'TEST_CLOUDFLARE_SECRETS_MISSING');
const front='ball46-premium-match-colors-test-20261120';
const host='https://'+front+'.mccarey-supon.workers.dev';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedNames=['ball46-prematch-only-test-20261120','ball46-production',
'nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
async function cf(path,opt={}){
 const r=await fetch(api+path,{...opt,headers:{authorization:'Bearer '+token,...opt.headers},signal:AbortSignal.timeout(52000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,240));
 return j.result;
}
const active=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const frozen=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await active(n)])));
const originalId=await active(front);
const [installed,settings]=await Promise.all([
 cf('/workers/'+front+'/versions/'+originalId+'?include=modules'),cf('/scripts/'+front+'/settings')]);
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
const modules=Object.fromEntries(installed.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
const main=installed.main_module,old=modules[main];
assert(old.includes('B46_PREMATCH_NAV_SCROLL_V1'),'ROLLBACK_REMOVED_SCROLL_FIX');
assert(old.includes('B46_ADAPTIVE_NATIVE_CHART_30_90_V3'),'RESEARCH_UI_MISSING');
assert(!old.includes('B46_PREMATCH_UNIVERSAL_SPINNER_V1'),'OLD_FULLSCREEN_SPINNER_STILL_DEPLOYED');
const {worker,client}=patchPreMatchContentWorker(old);
assert(!client.includes("card('Data status','Data unavailable')"),'OLD_INTERSTITIAL_STILL_PRESENT');
assert(client.includes('content.append(b46PrematchLoadingContent());'),'CONTENT_WAIT_NOT_INSERTED');
assert(worker.includes('b46PMContentOnlySpin'),'CONTENT_SPINNER_CSS_MISSING');
assert(!worker.includes('data-b46-pm-initial-loading'),'FULLSCREEN_SPINNER_REINTRODUCED');
assert(worker.includes('["predictions", "all", "1x2", "ou", "btts"]'),'O_U_INITIAL_NATIVE_NOT_HIDDEN');
const oldEmbed=old.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
const newEmbed=worker.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
assert(oldEmbed&&newEmbed,'CLIENT_EMBED_MISSING');
const outsideOld=old.replace(oldEmbed[0],'<CLIENT>');
const outsideNew=worker.replace(newEmbed[0],'<CLIENT>');
assert(outsideOld.includes('const directPreMatchTest'),'NON_NATIVE_BOOT_ROUTE_SOURCE');
assert(outsideNew.includes('b46PMContentOnlySpin'),'CSS_SCOPE_MISSING');
assert.equal(outsideNew.split('const pmStyles =').length,2,'UNEXPECTED_PM_STYLE_ANCHOR');
for(const [name,body] of [['client',client],['worker',worker]]){
 const filepath='/tmp/b46-content-only-'+name+'.js';
 fs.writeFileSync(filepath,body);
 execFileSync(process.execPath,['--check',filepath],{stdio:'pipe'});
}
const pre=await fetch(host+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(25000)});
assert(pre.ok,'PREMATCH_BACKEND_UNAVAILABLE');
const dataset=await pre.json();
assert(dataset.testLedger?.mode==='TEST_ONLY','WRONG_TEST_LEDGER_MODE');
assert.equal(await active(front),originalId,'CONCURRENT_FRONTEND_VERSION_CHANGE');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await active(n)]))),frozen,'PROTECTED_VERSION_DRIFT_PREDEPLOY');
const meta={main_module:main,compatibility_date:installed.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
for(const [name,body] of Object.entries({...modules,[main]:worker}))
 form.append(name,new Blob([body],{type:'application/javascript+module'}),name);
console.log('B46_REMOVE_OLD_UI_PREFLIGHT '+JSON.stringify({from:originalId,scope:'TEST_FRONTEND_CLIENT_AND_CSS_ONLY',
  noFullscreen:true,viewCount:5,ledgerRows:dataset.testLedger.rows?.length,protectedNames}));
await cf('/scripts/'+front+'?bindings_inherit=strict',{method:'PUT',body:form});
let newId=null;
for(let i=0;i<45;i++){
 const v=await active(front);
 if(v!==originalId){
  const candidate=await cf('/workers/'+front+'/versions/'+v+'?include=modules');
  const afterModules=Object.fromEntries(candidate.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
  if(Object.keys(afterModules).length===Object.keys(modules).length&&
   Object.entries({...modules,[main]:worker}).every(([n,s])=>afterModules[n]===s)){newId=v;break}
 }
 await new Promise(resolve=>setTimeout(resolve,900));
}
assert(newId,'NEW_TEST_CLIENT_NOT_VERIFIED');
await cf('/scripts/'+front+'/deployments',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:newId,percentage:100}],code_update_strategy:{mode:'immediate'}})});
let live=false;
for(let i=0;i<25;i++){
 await new Promise(resolve=>setTimeout(resolve,i?1300:2300));
 const [script,html,ou]=await Promise.all([
  fetch(host+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(22000)}),
  fetch(host+'/?b46pm=predictions',{cache:'no-store',signal:AbortSignal.timeout(22000)}),
  fetch(host+'/?b46pm=ou',{cache:'no-store',signal:AbortSignal.timeout(22000)})]);
 if(!script.ok||!html.ok||!ou.ok)continue;
 const [s,h,o]=await Promise.all([script.text(),html.text(),ou.text()]);
 if(s.includes(B46_CONTENT_ONLY_LOADING_VERSION)&&
  !s.includes("card('Data status','Data unavailable')")&&
  h.includes('b46PMContentOnlySpin')&&o.includes('b46PMContentOnlySpin')&&
  o.includes('data-b46-pm-boot="1"')&&
  !h.includes('b46-pm-firstpaint-loader')&&
  !o.includes('b46-pm-firstpaint-loader')){live=true;break}
}
assert(live,'CONTENT_ONLY_LOADING_NOT_ACTIVE');
for(const view of ['all','1x2','btts']){
 const res=await fetch(host+'/?b46pm='+view,{cache:'no-store',signal:AbortSignal.timeout(22000)});
 assert(res.ok,'VIEW_UNAVAILABLE_'+view);
 const t=await res.text();
 assert(!t.includes('b46-pm-firstpaint-loader'),'FULLSCREEN_REAPPEARED_'+view);
}
const now=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await active(n)])));
assert.deepEqual(now,frozen,'PROTECTED_WORKERS_CHANGED');
const post=await fetch(host+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(22000)});
const data2=await post.json();
assert.equal(data2.testLedger?.rows?.length,dataset.testLedger.rows?.length,'LEDGER_COUNT_CHANGED');
console.log('B46_CONTENT_OLD_UI_REMOVED_DEPLOY_PASS '+JSON.stringify({
 url:host+'/?b46pm=predictions',from:originalId,to:newId,
 oldDataStatusRemoved:true,spinnerOnlyInContent:true,
 navigationAndResearchPreserved:true,ouNativePreflashGuard:true,
 backendChanged:false,productionChanged:false,providerCallsAdded:0}));
