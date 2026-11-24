// BALL46 PreMatch original TEST Worker only: prevent Adaptive research UI
// from rendering before the legacy O/U panel or sharing its layout class.
// No price, model, history, FT, Ledger or production changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fixAdaptiveOverlayWorker,ADAPTIVE_LAYOUT_REPAIR} from './fix-adaptive-ou-native-overlay-v2-test.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_SECRETS');
const front='ball46-premium-match-colors-test-20261120';
const host='https://'+front+'.mccarey-supon.workers.dev';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path,opts={}){
 const response=await fetch(root+path,{...opts,
  headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(52000)});
 const result=await response.json();
 assert(response.ok&&result.success,'CF_'+path+'_'+response.status+'_'+JSON.stringify(result.errors??[]).slice(0,220));
 return result.result;
}
const getVersion=async name=>(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const protectedNames=['ball46-prematch-only-test-20261120','ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
const baseline=Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await getVersion(name)])));
const oldVersion=await getVersion(front);
const [installed,settings]=await Promise.all([
 cf('/workers/'+front+'/versions/'+oldVersion+'?include=modules'),
 cf('/scripts/'+front+'/settings')
]);
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),
 ['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
const mods=Object.fromEntries(installed.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const main=installed.main_module;
const before=mods[main],patched=fixAdaptiveOverlayWorker(before);
assert(patched.client.includes(ADAPTIVE_LAYOUT_REPAIR));
assert(patched.client.includes('order:999'));
assert(patched.client.includes('queueMicrotask'));
assert(!patched.client.includes("panel.className='b46pm-stats-board'"));
assert(patched.client.includes("if(mode!=='ou'||!content||!ledger)return"));
assert(before.split('/__b46_pm_adaptive_research').length===3,'EXISTING_PROXY_CHANGED');
for(const [name,data] of [['native-client.js',patched.client],['frontend-worker.js',patched.main]]){
 const file='/tmp/b46-fix-overlay-'+name;
 fs.writeFileSync(file,data);
 execFileSync(process.execPath,['--check',file]);
}
mods[main]=patched.main;
assert.equal(await getVersion(front),oldVersion,'TEST_FRONT_CONCURRENT_DEPLOY');
const meta={main_module:main,
 compatibility_date:installed.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
for(const [name,source] of Object.entries(mods))
 form.append(name,new Blob([source],{type:'application/javascript+module'}),name);
console.log('B46_NATIVE_OVERLAY_PREDEPLOY '+JSON.stringify({from:oldVersion,
 target:front,onlyFrontendCode:true,cssClassIsolated:true,mountedAfterOriginalContent:true}));
await cf('/scripts/'+front+'?bindings_inherit=strict',{method:'PUT',body:form});
let newVersion=null;
for(let i=0;i<42;i++){
 const v=await getVersion(front);
 if(v!==oldVersion){
  const x=await cf('/workers/'+front+'/versions/'+v+'?include=modules');
  const bytes=Object.fromEntries(x.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(bytes).length===Object.keys(mods).length&&
   Object.entries(mods).every(([n,src])=>bytes[n]===src)){
   newVersion=v;break
  }
 }
 await new Promise(ok=>setTimeout(ok,800));
}
assert(newVersion,'OVERLAY_BINARY_NOT_VERIFIED');
await cf('/scripts/'+front+'/deployments',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:newVersion,percentage:100}],
 code_update_strategy:{mode:'immediate'}})
});
let visible=false,liveData=null;
for(let i=0;i<26;i++){
 await new Promise(ok=>setTimeout(ok,i?1250:2100));
 const [jsRes,dataRes]=await Promise.all([
  fetch(host+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(20000)}),
  fetch(host+'/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(20000)})
 ]);
 if(!jsRes.ok||!dataRes.ok)continue;
 const js=await jsRes.text();
 const data=await dataRes.json().catch(()=>null);
 if(js.includes(ADAPTIVE_LAYOUT_REPAIR)&&
  js.includes("panel.className='b46pm-adaptive-research-isolated'")&&
  js.includes('queueMicrotask')&&
  !js.includes("panel.className='b46pm-stats-board'")&&
  data?.code==='B46_ADAPTIVE_OU_RESEARCH_V1'&&data.formulas?.length===42){
  visible=true;liveData=data;break
 }
}
assert(visible,'NEW_LAYOUT_NOT_ACTIVE');
const page=await fetch(host+'/?b46pm=ou',{cache:'no-store',signal:AbortSignal.timeout(22000)});
assert(page.status===200,'ORIGINAL_TEST_OU_ROUTE_UNAVAILABLE');
const afterProtected=Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await getVersion(name)])));
assert.deepEqual(afterProtected,baseline,'UNRELATED_WORKER_DEPLOYED');
console.log('B46_NATIVE_OVERLAY_FIXED '+JSON.stringify({
 testUrl:host+'/?b46pm=ou',from:oldVersion,to:newVersion,
 independentResearchEntries:liveData.formulas.reduce((s,r)=>s+r.totalPredictions,0),
 newCssClass:'b46pm-adaptive-research-isolated',
 deferredUntilOriginalLedger:true,
 renderedAfterOriginalContent:true,
 originalStatsAndOtherRoutesUnchanged:true,
 noBackendChanges:true,noExtraApiCalls:true,productionWrites:0
}));
