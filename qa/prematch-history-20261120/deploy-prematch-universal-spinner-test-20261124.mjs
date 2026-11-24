// Deploy only original BALL46 PreMatch TEST frontend universal loading spinner.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchFirstPaintWorker,B46_FIRSTPAINT_SPINNER_VERSION} from './patch-prematch-universal-spinner-test-20261124.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'TEST_CLOUDFLARE_SECRETS_MISSING');
const front='ball46-premium-match-colors-test-20261120',url='https://'+front+'.mccarey-supon.workers.dev';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedNames=['ball46-prematch-only-test-20261120','ball46-production',
 'nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
async function cf(path,opt={}){
 const response=await fetch(root+path,{...opt,
  headers:{authorization:'Bearer '+token,...opt.headers},signal:AbortSignal.timeout(55000)});
 const data=await response.json();
 assert(response.ok&&data.success,'CF_'+path+'_'+response.status+'_'+JSON.stringify(data.errors??[]).slice(0,250));
 return data.result;
}
const version=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const frozen=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
const previous=await version(front);
const [v,settings]=await Promise.all([
 cf('/workers/'+front+'/versions/'+previous+'?include=modules'),cf('/scripts/'+front+'/settings')]);
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),
 ['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
const modules=Object.fromEntries(v.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString('utf8')]));
const main=v.main_module,before=modules[main];
assert(before.includes('B46_PREMATCH_NAV_SCROLL_V1'),'NAVIGATION_FIX_MISSING');
assert(before.includes('B46_ADAPTIVE_NATIVE_CHART_30_90_V3'),'LATEST_RESEARCH_PANEL_MISSING');
assert(!before.includes(B46_FIRSTPAINT_SPINNER_VERSION),'SPINNER_ALREADY_INSTALLED');
const {worker,client}=patchFirstPaintWorker(before);
assert(worker.includes('data-b46-pm-initial-loading'),'SERVER_INITIAL_LOADING_FLAG_MISSING');
assert(worker.includes('e.prepend(firstPaintLoaderHtml'),'BOOT_LOADER_MISSING');
assert(worker.includes('["predictions", "all", "1x2", "ou", "btts"]'),'O_U_UNPROTECTED');
assert(client.includes('b46FirstPaintReady()'),'READY_HANDLER_MISSING');
assert(client.includes('b46FirstPaintFailure()'),'ERROR_HANDLER_MISSING');
assert(client.includes('b46PrematchLastScrollRoute!==currentRoute'),'NAVIGATION_SCROLL_LOST');
const priorDeclaration=before.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
const nextDeclaration=worker.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
assert(priorDeclaration&&nextDeclaration,'CLIENT_SCRIPT_ANCHOR_MISSING');
const plainBefore=before.replace(priorDeclaration[0],'<CLIENT>');
const plainAfter=worker.replace(nextDeclaration[0],'<CLIENT>');
assert.equal(plainAfter.split('const pmStyles =').length,plainBefore.split('const pmStyles =').length,
 'PREMATCH_CSS_ANCHOR_UNEXPECTED');
for(const [name,source] of [['client',client],['worker',worker]]){
 const filepath='/tmp/b46-firstpaint-'+name+'.js';
 fs.writeFileSync(filepath,source);
 execFileSync(process.execPath,['--check',filepath],{stdio:'pipe'});
}
const pre=await fetch(url+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(25000)});
assert(pre.ok,'TEST_EXISTING_DATA_MISSING');
const predata=await pre.json();
assert(predata.testLedger?.mode==='TEST_ONLY','TEST_LEDGER_CHANGED');
assert.equal(await version(front),previous,'CONCURRENT_FRONTEND_EDIT_ABORT');
const metadata={main_module:main,compatibility_date:v.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(v.compatibility_flags?.length?{compatibility_flags:v.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,source] of Object.entries({...modules,[main]:worker}))
 form.append(name,new Blob([source],{type:'application/javascript+module'}),name);
console.log('B46_FIRSTPAINT_PREFLIGHT '+JSON.stringify({
 worker:front,previous,preRows:predata.testLedger.rows?.length,
 change:'ONLY_TEST_FRONTEND_JS_AND_FIRSTPAINT_CSS',protectedNames,
 noNewProviderCalls:true,otherWorkerChanges:0
}));
await cf('/scripts/'+front+'?bindings_inherit=strict',{method:'PUT',body:form});
let target=null;
for(let i=0;i<45;i++){
 const id=await version(front);
 if(id!==previous){
  const candidate=await cf('/workers/'+front+'/versions/'+id+'?include=modules');
  const got=Object.fromEntries(candidate.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
  if(Object.keys(got).length===Object.keys(modules).length&&
    Object.entries({...modules,[main]:worker}).every(([name,source])=>got[name]===source)){target=id;break}
 }
 await new Promise(ok=>setTimeout(ok,900));
}
assert(target,'NEW_TEST_FRONTEND_BINARY_NOT_VERIFIED');
await cf('/scripts/'+front+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:target,percentage:100}],code_update_strategy:{mode:'immediate'}})});
let checked=false;
for(let attempt=0;attempt<24;attempt++){
 await new Promise(ok=>setTimeout(ok,attempt?1250:2200));
 const clientResp=await fetch(url+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(21000)});
 if(!clientResp.ok)continue;
 const js=await clientResp.text();
 if(!js.includes(B46_FIRSTPAINT_SPINNER_VERSION))continue;
 let all=true;
 for(const route of ['predictions','all','1x2','ou','btts']){
  const resp=await fetch(url+'/?b46pm='+route,{cache:'no-store',signal:AbortSignal.timeout(21000)});
  if(!resp.ok){all=false;break}
  const page=await resp.text();
  if(!page.includes('data-b46-pm-initial-loading="1"')||
     !page.includes('id="b46-pm-firstpaint-loader"')||
     !page.includes('b46PmSpinnerSpin')||
     !page.includes('/__b46_prematch_client.js')){all=false;break}
 }
 if(all){checked=true;break}
}
assert(checked,'ALL_FIVE_SERVER_BOOT_ROUTES_NOT_VERIFIED');
const frozenAfter=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.deepEqual(frozenAfter,frozen,'PROTECTED_WORKER_VERSION_CHANGED');
const post=await fetch(url+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(21000)});
assert(post.ok,'PREMATCH_DATA_LOST');
const postData=await post.json();
assert.deepEqual(postData.testLedger?.rows?.length,predata.testLedger.rows?.length,'LEDGER_ROW_COUNT_CHANGED');
console.log('B46_PREMATCH_UNIVERSAL_SPINNER_TEST_DEPLOY_PASS '+JSON.stringify({
 url:url+'/?b46pm=predictions',version:target,from:previous,
 allFiveRoutes:['predictions','all','1x2','ou','btts'],
 initialSpinnerServerRendered:true,readyGateRequiresRealData:true,
 errorRetryAvailable:true,fixPersistentRouteScroll:true,
 noBackendDeploy:true,noProductionDeploy:true,noNewAPI:true
}));
