// Revert only mistaken full-screen spinner deploy by re-deploying previous immutable TEST frontend version.
// Does not edit code, backend, stores, 1X2, BTTS, Adaptive, or production.
import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_SECRETS_MISSING');
const worker='ball46-premium-match-colors-test-20261120';
const mustBe='d493c8d6-d0a1-4271-90a6-c1d37d43cf5a';
const restore='9bbbeb00-5937-4a43-966e-91a5b97fcf94';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const url='https://'+worker+'.mccarey-supon.workers.dev';
async function cf(path,init={}){
 const response=await fetch(root+path,{...init,headers:{authorization:'Bearer '+token,...init.headers},signal:AbortSignal.timeout(50000)});
 const j=await response.json();
 assert(response.ok&&j.success,'CLOUDFLARE_'+response.status+'_'+path+'_'+JSON.stringify(j.errors??[]).slice(0,220));
 return j.result;
}
const active=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const protectedNames=['ball46-prematch-only-test-20261120','ball46-production',
 'nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await active(n)])));
const actual=await active(worker);
assert.equal(actual,mustBe,'CONCURRENT_TEST_FRONTEND_CHANGE_DO_NOT_ROLLBACK');
const [newV,oldV]=await Promise.all([
 cf('/workers/'+worker+'/versions/'+mustBe+'?include=modules'),
 cf('/workers/'+worker+'/versions/'+restore+'?include=modules')
]);
assert.equal(newV.main_module,oldV.main_module,'PREVIOUS_MAIN_MODULE_CHANGED');
const decode=v=>Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const newCode=decode(newV),oldCode=decode(oldV);
const present=newCode[newV.main_module],prior=oldCode[oldV.main_module];
assert(present.includes('B46_PREMATCH_UNIVERSAL_SPINNER_V1'),'CURRENT_NOT_EXPECTED_SPINNER_VERSION');
assert(!prior.includes('B46_PREMATCH_UNIVERSAL_SPINNER_V1'),'PREVIOUS_VERSION_HAS_SPINNER');
for(const tag of ['B46_PREMATCH_NAV_SCROLL_V1','B46_ADAPTIVE_NATIVE_CHART_30_90_V3',
 'B46_ADAPTIVE_NATIVE_RESEARCH_LAYOUT_FIX_V2']){
 assert(prior.includes(tag),'PREVIOUS_LACKS_REQUIRED_UI_'+tag);
}
assert(Object.keys(newCode).length===Object.keys(oldCode).length,'MODULE_COUNT_DIFFERS');
assert.equal(await active(worker),mustBe,'CONCURRENT_CHANGE_BEFORE_RESTORE');
console.log('B46_PREMATCH_REMOVE_FULLSCREEN_LOADER_PREFLIGHT '+JSON.stringify({
 worker,current:mustBe,restore,changedScope:'TEST_FRONTEND_DEPLOYMENT_ONLY',
 originalScrollFix:true,researchPanel:true,productionChanges:0
}));
await cf('/scripts/'+worker+'/deployments',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:restore,percentage:100}],
 code_update_strategy:{mode:'immediate'}})
});
let ok=false;
for(let i=0;i<30;i++){
 await new Promise(r=>setTimeout(r,i?1300:1800));
 const deployed=await active(worker);
 if(deployed!==restore)continue;
 const [js,ou,main]=await Promise.all([
  fetch(url+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(18000)}),
  fetch(url+'/?b46pm=ou',{cache:'no-store',signal:AbortSignal.timeout(18000)}),
  fetch(url+'/?b46pm=predictions',{cache:'no-store',signal:AbortSignal.timeout(18000)})
 ]);
 if(!js.ok||!ou.ok||!main.ok)continue;
 const source=await js.text(),o=await ou.text(),p=await main.text();
 if(source.includes('B46_PREMATCH_NAV_SCROLL_V1')&&
   !source.includes('B46_PREMATCH_UNIVERSAL_SPINNER_V1')&&
   !o.includes('b46-pm-firstpaint-loader')&&!p.includes('b46-pm-firstpaint-loader')&&
   !o.includes('data-b46-pm-initial-loading')&&!p.includes('data-b46-pm-initial-loading')){
  ok=true;break
 }
}
assert(ok,'TEST_ROLLBACK_NOT_VERIFIED');
for(const mode of ['all','1x2','btts']){
 const r=await fetch(url+'/?b46pm='+mode,{cache:'no-store',signal:AbortSignal.timeout(19000)});
 assert(r.ok,'RESTORED_ROUTE_FAIL_'+mode);
 const html=await r.text();
 assert(!html.includes('b46-pm-firstpaint-loader'),'FULLSCREEN_SPINNER_REMAINED_'+mode);
}
const protectedAfter=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await active(n)])));
assert.deepEqual(protectedAfter,protectedBefore,'PROTECTED_WORKER_CHANGED');
console.log('B46_PREMATCH_FULLSCREEN_SPINNER_REMOVED_TEST_PASS '+JSON.stringify({
 url:url+'/?b46pm=predictions',restoredVersion:restore,
 noFullscreenSpinner:true,normalOpeningRestored:true,
 preservedNavigationFix:true,preservedNativeAdaptive:true,
 backendUntouched:true,productionUntouched:true,noNewApiCalls:true
}));
