import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchOuSidebarHistoryWorker,B46_OU_SIDEBAR_HISTORY_V1} from './patch-ou-sidebar-history-test-v1-20261124.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_CLOUDFLARE_SECRETS');
const frontend='ball46-premium-match-colors-test-20261120';
const host='https://'+frontend+'.mccarey-supon.workers.dev';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedNames=['ball46-production','ball46-prematch-only-test-20261120',
 'nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
async function cf(path,opt={}){
 const r=await fetch(api+path,{...opt,headers:{authorization:'Bearer '+token,...opt.headers},signal:AbortSignal.timeout(55000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,220));
 return j.result;
}
const version=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
const oldId=await version(frontend);
const [oldVersion,settings]=await Promise.all([
 cf('/workers/'+frontend+'/versions/'+oldId+'?include=modules'),
 cf('/scripts/'+frontend+'/settings')
]);
assert.deepEqual(settings.bindings.map(b=>b.name).sort(),
 ['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
const modules=Object.fromEntries(oldVersion.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const main=oldVersion.main_module,old=modules[main];
for(const mark of ['B46_OU_ALL_ACCOUNTS_OVERVIEW_V1','B46_OU_ALLTIME_DEFAULT_V2',
 'B46_PM_CONTENT_ONLY_LOADING_V1','B46_ADAPTIVE_NATIVE_CHART_30_90_V3'])
 assert(old.includes(mark),'REQUIRED_DEPLOYED_FRONTEND_FEATURE_MISSING_'+mark);
assert(!old.includes(B46_OU_SIDEBAR_HISTORY_V1),'SIDEBAR_HISTORY_ALREADY_DEPLOYED');
const {worker,client}=patchOuSidebarHistoryWorker(old);
const regex=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const b=old.match(regex),a=worker.match(regex);assert(b&&a,'EMBEDDED_CLIENT_MISSING');
const outsideOld=old.replace(b[0],'<EMBEDDED_CLIENT>');
const outsideNew=worker.replace(a[0],'<EMBEDDED_CLIENT>');
assert(outsideOld.includes('const pmStyles = '));
assert.equal(outsideNew.split('const pmStyles = ').length,outsideOld.split('const pmStyles = ').length,
 'UNEXPECTED_WORKER_OUTSIDE_CLIENT_STRUCTURE');
assert(client.includes("r.id==='ou'?rate(ouSnapshot??{})"),'SIDEBAR_STILL_LEGACY');
assert(!client.includes("r.id==='ou'?rate(ouLedger?.stats??{})"),'OLD_0_PERCENT_REMAINS');
assert(client.includes("b46OuHistoryMount(content,panel,rows);"),'PUBLIC_HISTORY_NOT_MOUNTED');
assert(client.includes('const pageSize=10,pages='),'PAGINATION_MISSING');
assert(client.includes('(Number(b.kickoff)||0)-(Number(a.kickoff)||0)'),'KICKOFF_SORT_MISSING');
assert(client.includes("updateMenu();\n          if(mode==='ou'&&content.isConnected)draw();"),'UPDATED_SNAPSHOT_NOT_PROPAGATED');
assert(!worker.includes('B46_PREMATCH_UNIVERSAL_SPINNER_V1'),'FULLSCREEN_SPINNER_RETURNED');
for(const [n,body] of [['worker',worker],['client',client]]){
 const file='/tmp/b46-sidebar-history-'+n+'.js';fs.writeFileSync(file,body);
 execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}
const [p,r]=await Promise.all([
 fetch(host+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(30000)}),
 fetch(host+'/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(30000)})
]);
assert(p.ok&&r.ok,'EXISTING_TEST_PUBLIC_DATA_MISSING');
const [base,adaptive]=await Promise.all([p.json(),r.json()]);
assert.equal(base.ouLedger?.mode,'TEST_ONLY','LEGACY_OU_NOT_TEST');
assert.equal(adaptive.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(adaptive.formulas?.length,42,'ALL_42_FORMULAS_MUST_STAY_ACTIVE');
assert(adaptive.records?.length>10,'HISTORY_REQUIRES_TWO_PAGES');
const originalOULedger=base.ouLedger.stats;
const aw=adaptive.formulas.filter(f=>f.selection==='ALL').reduce((sum,f)=>sum+Number(f.win||0),0);
const al=adaptive.formulas.filter(f=>f.selection==='ALL').reduce((sum,f)=>sum+Number(f.loss||0),0);
const combinedRate=100*(Number(originalOULedger.win)+aw)/
 (Number(originalOULedger.win)+aw+Number(originalOULedger.loss)+al);
assert(Number.isFinite(combinedRate),'COMBINED_RATE_NOT_FINITE');
assert.equal(await version(frontend),oldId,'CONCURRENT_FRONTEND_DEPLOY_ABORT');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),
 protectedBefore,'PROTECTED_WORKER_DRIFT');
const metadata={main_module:main,compatibility_date:oldVersion.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(oldVersion.compatibility_flags?.length?{compatibility_flags:oldVersion.compatibility_flags}:{})};
const nextModules={...modules,[main]:worker};
const body=new FormData();
body.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,src] of Object.entries(nextModules))
 body.append(name,new Blob([src],{type:'application/javascript+module'}),name);
console.log('B46_SIDEBAR_HISTORY_TEST_PREFLIGHT '+JSON.stringify({
 from:oldId,existing42Formulas:adaptive.formulas.length,
 existingRecords:adaptive.records.length,expectedRate:combinedRate.toFixed(2)+'%',
 frontendUIOnly:true,immutableBackend:true,productionUntouched:true}));
await cf('/scripts/'+frontend+'?bindings_inherit=strict',{method:'PUT',body});
let newId=null;
for(let i=0;i<45;i++){
 const n=await version(frontend);
 if(n!==oldId){
  const d=await cf('/workers/'+frontend+'/versions/'+n+'?include=modules');
  const parts=Object.fromEntries(d.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(parts).length===Object.keys(nextModules).length&&
   Object.entries(nextModules).every(([k,v])=>parts[k]===v)){newId=n;break}
 }
 await new Promise(resolve=>setTimeout(resolve,900));
}
assert(newId,'NEW_TEST_FRONTEND_VERSION_NOT_VERIFIED');
await cf('/scripts/'+frontend+'/deployments',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:newId,percentage:100}],
 code_update_strategy:{mode:'immediate'}})
});
let found=false;
for(let i=0;i<28;i++){
 await new Promise(ok=>setTimeout(ok,i?1300:2200));
 const js=await fetch(host+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(23000)});
 if(!js.ok)continue;
 const src=await js.text();
 if(src.includes(B46_OU_SIDEBAR_HISTORY_V1)&&src.includes('b46OuHistoryMount')&&
  !src.includes("r.id==='ou'?rate(ouLedger?.stats??{})")){found=true;break}
}
assert(found,'SIDEBAR_AND_PAGED_HISTORY_NOT_LIVE');
for(const path of ['/?b46pm=ou','/?b46pm=1x2','/?b46pm=btts']){
 const res=await fetch(host+path,{cache:'no-store',signal:AbortSignal.timeout(21000)});
 assert(res.ok,'PREMATCH_PAGE_MISSING_'+path);
 assert(!(await res.text()).includes('b46-pm-firstpaint-loader'),'FULLSCREEN_LOADER_RETURNED_'+path);
}
const frozenAfter=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.deepEqual(frozenAfter,protectedBefore,'PRODUCTION_OR_BACKEND_WORKER_CHANGED');
console.log('B46_SIDEBAR_HISTORY_TEST_DEPLOY_PASS '+JSON.stringify({
 url:host+'/?b46pm=ou',newVersion:newId,oldVersion:oldId,
 sidebarWinRateSource:'same_combined_all_time_snapshot_as_card',
 expectedRateAtPreflight:combinedRate.toFixed(2)+'%',
 pagination:10,sort:'kickoff_descending',formulasRetained:42,
 existingBackendsChanged:false,productionChanged:false,newPaidProviderCalls:0
}));
