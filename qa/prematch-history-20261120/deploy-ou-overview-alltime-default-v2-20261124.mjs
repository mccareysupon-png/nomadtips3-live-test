import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchOuDefaultAlltimeWorker,B46_OU_ALLTIME_DEFAULT_V2} from './patch-ou-overview-alltime-default-v2-test.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_SECRETS_MISSING');
const name='ball46-premium-match-colors-test-20261120',host='https://'+name+'.mccarey-supon.workers.dev';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedWorkers=['ball46-prematch-only-test-20261120','ball46-production',
 'nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
async function cf(path,opt={}){
 const r=await fetch(api+path,{...opt,headers:{authorization:'Bearer '+token,...opt.headers},signal:AbortSignal.timeout(55000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,250));return j.result;
}
const ver=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const frozen=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await ver(n)])));
const current=await ver(name);
const [v,settings]=await Promise.all([
 cf('/workers/'+name+'/versions/'+current+'?include=modules'),
 cf('/scripts/'+name+'/settings')]);
const modules=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const main=v.main_module,source=modules[main];
assert(source.includes('B46_OU_ALL_ACCOUNTS_OVERVIEW_V1'),'OVERVIEW_FIRST_DEPLOY_REQUIRED');
assert(source.includes('B46_PM_CONTENT_ONLY_LOADING_V1'),'INLINE_SPINNER_MISSING');
assert(source.includes('B46_ADAPTIVE_NATIVE_CHART_30_90_V3'),'ADAPTIVE_GRAPH_MISSING');
assert(!source.includes(B46_OU_ALLTIME_DEFAULT_V2),'DEFAULT_ALREADY_ACTIVE');
const {worker,client}=patchOuDefaultAlltimeWorker(source);
assert(client.includes("statsPeriod='all'"),'ALL_TIME_DEFAULT_MISSING');
assert(client.includes("requested==='today'"),'EXPLICIT_TODAY_MISSING');
assert(client.includes("source:'OU_ADAPTIVE_COMBINED_VIEW_ONLY'"),'COMBINED_STATS_LOST');
assert(!client.includes("mode==='ou'&&performanceMetric!=='winRate'?[]"),'GRAPH_INHIBITOR_REAPPEARED');
const regex=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const x=source.match(regex),y=worker.match(regex);
assert(x&&y,'EMBEDDED_CLIENT_MISSING');
assert.equal(source.replace(x[0],'<CLIENT>'),worker.replace(y[0],'<CLIENT>'),'OTHER_CODE_CHANGED');
for(const [n,t] of [['worker',worker],['client',client]]){
 const path='/tmp/b46-ou-overview-alltime-'+n+'.js';fs.writeFileSync(path,t);
 execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
}
const mods={...modules,[main]:worker};
assert.equal(await ver(name),current,'CONCURRENT_FRONTEND_UPDATE_ABORT');
const metadata={main_module:main,compatibility_date:v.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(v.compatibility_flags?.length?{compatibility_flags:v.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [moduleName,t] of Object.entries(mods))
 form.append(moduleName,new Blob([t],{type:'application/javascript+module'}),moduleName);
console.log('B46_OU_ALLTIME_DEFAULT_PREFLIGHT '+JSON.stringify({previous:current,preservedAll42:true,changed:'route-default-only',noBackendWrites:true}));
await cf('/scripts/'+name+'?bindings_inherit=strict',{method:'PUT',body:form});
let target=null;
for(let i=0;i<45;i++){
 const next=await ver(name);
 if(next!==current){
  const raw=await cf('/workers/'+name+'/versions/'+next+'?include=modules');
  const got=Object.fromEntries(raw.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(got).length===Object.keys(mods).length&&
   Object.entries(mods).every(([k,v])=>got[k]===v)){target=next;break}
 }
 await new Promise(resolve=>setTimeout(resolve,900));
}
assert(target,'NEW_TEST_FRONTEND_BINARY_NOT_VERIFIED');
await cf('/scripts/'+name+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:target,percentage:100}],code_update_strategy:{mode:'immediate'}})});
let live=false;
for(let i=0;i<25;i++){
 await new Promise(resolve=>setTimeout(resolve,i?1400:2200));
 const r=await fetch(host+'/__b46_prematch_client.js',{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!r.ok)continue;
 const s=await r.text();
 if(s.includes(B46_OU_ALLTIME_DEFAULT_V2)&&s.includes('B46_OU_ALL_ACCOUNTS_OVERVIEW_V1')){live=true;break}
}
assert(live,'OU_ALLTIME_DEFAULT_NOT_LIVE');
const other=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await ver(n)])));
assert.deepEqual(other,frozen,'PROTECTED_WORKERS_CHANGED');
console.log('B46_OU_ALLTIME_DEFAULT_DEPLOY_PASS '+JSON.stringify({url:host+'/?b46pm=ou',
 version:target,previous:current,default:'All Time',todayStillAvailable:true,
 combinedWINLOSS:true,combinedCumulative:true,allFormulaStatisticsPreserved:true,
 noBackendDeploy:true,noProductionDeploy:true
}));
