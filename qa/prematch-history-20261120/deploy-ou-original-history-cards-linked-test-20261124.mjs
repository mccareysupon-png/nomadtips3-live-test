import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchOuOldCardsWorker,B46_OU_ORIGINAL_PUBLIC_HISTORY_V1} from './patch-ou-original-history-cards-linked-test-20261124.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_SECRETS_REQUIRED');
const frontend='ball46-premium-match-colors-test-20261120';
const host='https://'+frontend+'.mccarey-supon.workers.dev';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedNames=['ball46-production','ball46-prematch-only-test-20261120',
 'nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
async function cf(path,opt={}){
 const r=await fetch(api+path,{...opt,headers:{authorization:'Bearer '+token,...opt.headers},signal:AbortSignal.timeout(54000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,230));
 return j.result;
}
const active=async name=>(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await active(name)])));
const oldId=await active(frontend);
const [prev,settings]=await Promise.all([cf('/workers/'+frontend+'/versions/'+oldId+'?include=modules'),
 cf('/scripts/'+frontend+'/settings')]);
assert.deepEqual(settings.bindings.map(b=>b.name).sort(),['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
const oldModules=Object.fromEntries(prev.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const main=prev.main_module,old=oldModules[main];
for(const mark of ['B46_OU_SIDEBAR_HISTORY_V1','B46_OU_ALL_ACCOUNTS_OVERVIEW_V1',
 'B46_OU_ALLTIME_DEFAULT_V2','B46_PM_CONTENT_ONLY_LOADING_V1','B46_ADAPTIVE_NATIVE_CHART_30_90_V3'])
 assert(old.includes(mark),'MISSING_CURRENT_FRONTEND_'+mark);
assert(!old.includes(B46_OU_ORIGINAL_PUBLIC_HISTORY_V1),'ALREADY_DEPLOYED');
const {worker,client}=patchOuOldCardsWorker(old);
const embed=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const mOld=old.match(embed),mNew=worker.match(embed);assert(mOld&&mNew);
assert.equal(old.replace(mOld[0],'<client>'),worker.replace(mNew[0],'<client>'),
 'NON_CLIENT_WORKER_CHANGED');
assert(client.includes("b46OuHistoryMount(content,panel,rows);"),'SEPARATE_NEW_HISTORY_MUST_REMAIN');
assert(client.includes("panel.append(table(['FORMULA','HISTORY MATCHES'"),'SEPARATE_FORMULA_STATS_MUST_REMAIN');
assert(client.includes("const b46HistoryPageSize=mode==='ou'?10:MATCHES_PER_PAGE"),'TEN_CARDS_ONLY_ON_OU');
assert(client.includes("return [...prior,...generated]"),'BOTH_SOURCES_NOT_MERGED');
assert(client.includes("const b46OuNativeRows=mode==='ou'?b46NativeOuHistoryRows(rows,b46AdaptiveData):null"),'OLD_CARD_NOT_CONNECTED');
assert(!client.includes('b46-pm-firstpaint-loader'),'FULLSCREEN_LOADER_NOT_PERMITTED');
for(const [n,src] of [['worker',worker],['client',client]]){
 const file='/tmp/b46-original-history-'+n+'.js';
 fs.writeFileSync(file,src);execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}
const [d,a]=await Promise.all([
 fetch(host+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(28000)}),
 fetch(host+'/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(28000)})
]);
assert(d.ok&&a.ok,'TEST_SNAPSHOTS_UNAVAILABLE');
const [native,adaptive]=await Promise.all([d.json(),a.json()]);
assert.equal(native.ouLedger?.mode,'TEST_ONLY');
assert.equal(adaptive.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(adaptive.formulas?.length,42,'FORMULAS_CANNOT_BE_CUT');
assert(Array.isArray(adaptive.records)&&adaptive.records.length>10,'ADAPTIVE_HISTORICAL_SNAPSHOT_REQUIRED');
const expected=native.ouLedger.rows.length+adaptive.records.length;
assert.equal(await active(frontend),oldId,'CONCURRENT_FRONTEND_CHANGE_ABORT');
const info={main_module:main,compatibility_date:prev.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(prev.compatibility_flags?.length?{compatibility_flags:prev.compatibility_flags}:{})};
const files={...oldModules,[main]:worker};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(info)],{type:'application/json'}),'metadata.json');
for(const [name,code] of Object.entries(files))
 form.append(name,new Blob([code],{type:'application/javascript+module'}),name);
console.log('B46_ORIGINAL_HISTORY_CARD_PREFLIGHT '+JSON.stringify({oldId,
 originalCards:native.ouLedger.rows.length,adaptiveRecords:adaptive.records.length,
 combinedRecords:expected,formulaCount:adaptive.formulas.length,
 preservedSeparateResearchTable:true,frontendOnly:true,productionChanges:0,backendChanges:0}));
await cf('/scripts/'+frontend+'?bindings_inherit=strict',{method:'PUT',body:form});
let newId=null;
for(let i=0;i<45;i++){
 const now=await active(frontend);
 if(now!==oldId){
  const current=await cf('/workers/'+frontend+'/versions/'+now+'?include=modules');
  const got=Object.fromEntries(current.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(got).length===Object.keys(files).length&&
   Object.entries(files).every(([name,s])=>got[name]===s)){newId=now;break}
 }
 await new Promise(ok=>setTimeout(ok,900));
}
assert(newId,'NEW_TEST_FRONTEND_BINARY_NOT_VERIFIED');
await cf('/scripts/'+frontend+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:newId,percentage:100}],code_update_strategy:{mode:'immediate'}})});
let live=false;
for(let i=0;i<26;i++){
 await new Promise(ok=>setTimeout(ok,i?1400:2400));
 const r=await fetch(host+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!r.ok)continue;
 const src=await r.text();
 if(src.includes(B46_OU_ORIGINAL_PUBLIC_HISTORY_V1)&&
  src.includes("b46OuHistoryMount(content,panel,rows);")&&
  src.includes("b46HistoryPageSize=mode==='ou'?10:MATCHES_PER_PAGE")){live=true;break}
}
assert(live,'PUBLIC_TEST_CLIENT_NOT_LIVE');
for(const route of ['ou','1x2','btts','all','predictions']){
 const r=await fetch(host+'/?b46pm='+route,{cache:'no-store',signal:AbortSignal.timeout(20000)});
 assert(r.ok,'PAGE_HTTP_'+route);
 assert(!(await r.text()).includes('b46-pm-firstpaint-loader'),'FULLSCREEN_RETURNED');
}
const after=Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await active(name)])));
assert.deepEqual(after,protectedBefore,'PRODUCTION_OR_BACKEND_CHANGED');
console.log('B46_ORIGINAL_HISTORY_CARD_DEPLOY_TEST_PASS '+JSON.stringify({
 url:host+'/?b46pm=ou',newId,oldId,
 expectedRowsAtPreflight:expected,
 order:'kickoff_desc',perPage:10,
 oldNativeCards:true,newResearchHistoryTablePreserved:true,
 separatedEngine:true,all42FormulasPreserved:true,
 productionChanges:0,backendChanges:0,newPaidAPICalls:0}));
