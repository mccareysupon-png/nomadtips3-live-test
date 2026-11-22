// Deploy minimal wiring in EXISTING PreMatch TEST client.
// No CSS, no HTML redesign, no code outside prematchClientScript, no
// other Worker, 1X2, Live, HCR, receiver or production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchExistingBttsClient} from './patch-existing-btts-client-test.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_CLOUDFLARE_CREDENTIALS');
const worker='ball46-premium-match-colors-test-20261120';
const beforeExpected='3cbd0b37-5b43-49bb-a894-87c18c76269a';
const backendExpected='d2e9c9ce-4f1b-4661-818e-a5cc44fdc3ef';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-prematch-only-test-20261120','ball46-prematch-ui-test-v5-20261120',
 'ball46-prematch-performance-test-20261121'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const ui='https://'+worker+'.mccarey-supon.workers.dev';
async function cf(path,options={}){
 const r=await fetch(root+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+r.status+'_'+JSON.stringify(j.errors||[]));return j.result;
}
async function version(n){
 const d=await cf('/scripts/'+n+'/deployments?per_page=1');
 const x=d.deployments?.[0]?.versions?.[0]?.version_id;assert(x,'NO_ACTIVE_VERSION_'+n);return x;
}
async function publicJson(path,expected){
 let err=null;
 for(let i=0;i<18;i++){
  try{
   const r=await fetch(ui+path,{cache:'no-store',signal:AbortSignal.timeout(16000)});
   assert(r.ok,'UI_PUBLIC_'+path+'_'+r.status);
   const j=await r.json();expected(j);return j;
  }catch(e){err=e;if(i<17)await new Promise(f=>setTimeout(f,1100))}
 }
 throw err;
}
const expectedProtected=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.equal(expectedProtected['ball46-prematch-only-test-20261120'],backendExpected,'BACKEND_NOT_CURRENT');
const data=await publicJson('/__b46_prematch_data',j=>{
 assert.equal(j?.testLedger?.mode,'TEST_ONLY');
 assert.equal(j?.bttsLedger?.mode,'TEST_ONLY');
 assert.equal(j?.allLedger?.mode,'TEST_ONLY');
 assert.equal(j?.allLedger?.stats?.total,j.testLedger.stats.total+j.bttsLedger.stats.total);
 assert.equal(j?.marketDailyBooks?.all?.selected?.total,j.marketDailyBooks.oneX2.selected.total+j.marketDailyBooks.btts.selected.total);
 assert.equal(j?.testLedger?.rows?.length,75,'EXISTING_1X2_RECORDS_CHANGED');
});
const before=await version(worker);assert.equal(before,beforeExpected,'UI_WORKER_DRIFT_ABORT');
const active=await cf('/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(active.main_module,'worker.js','UNEXPECTED_FRONTEND_ENTRY');
assert.equal(active.modules.length,1,'FRONTEND_MODULE_COUNT_DRIFT');
const module=active.modules[0];assert(module.name==='worker.js'&&module.content_base64,'FRONTEND_MODULE_MISSING');
const source=Buffer.from(module.content_base64,'base64').toString('utf8');
const re=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const m=source.match(re);assert(m,'ORIGINAL_PREMATCH_CLIENT_NOT_FOUND');
const oldClient=JSON.parse(m[1]);
const patched=patchExistingBttsClient(oldClient);
const newSource=source.replace(m[0],'var prematchClientScript = '+JSON.stringify(patched.code)+';');
assert.notEqual(newSource,source,'EMPTY_BTTS_CLIENT_DIFF');
assert.equal(newSource.slice(0,m.index),source.slice(0,m.index),'FRONTEND_PREFIX_CHANGED');
assert.equal(newSource.slice(m.index+('var prematchClientScript = '+JSON.stringify(patched.code)+';').length),
 source.slice(m.index+m[0].length),'FRONTEND_SUFFIX_CHANGED');
for(const [name,code] of [['patched-client',patched.code],['patched-worker',newSource]]){
 const path='/tmp/b46-'+name+'.mjs';fs.writeFileSync(path,code);
 execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
}
const bindings=(await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
for(const n of ['PREMATCH_STORE','B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER'])assert(bindings.includes(n),'MISSING_PREEXISTING_SERVICE_'+n);
assert.equal(await version(worker),before,'CONCURRENT_FRONTEND_CHANGE_ABORT');
console.log('B46_BTTS_EXISTING_CLIENT_PREFLIGHT '+JSON.stringify({
 before,oldClientBytes:oldClient.length,newClientBytes:patched.code.length,
 oneX2Rows:data.testLedger.rows.length,bttsRows:data.bttsLedger.rows.length,
 totalRows:data.allLedger.rows.length,bindings,
 frontendChangedOnly:'prematchClientScript',providerCalls:0,productionWrites:0
}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
form.append('worker.js',new Blob([newSource],{type:'application/javascript+module'}),'worker.js');
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,current;
for(let i=0;i<35;i++){
 after=await version(worker);
 try{current=await cf('/workers/'+worker+'/versions/'+after+'?include=modules')}
 catch{await new Promise(r=>setTimeout(r,1200));continue}
 if(after!==before&&current.modules?.length===1&&
 Buffer.from(current.modules[0].content_base64,'base64').toString('utf8')===newSource)break;
 await new Promise(r=>setTimeout(r,1200));
}
assert.notEqual(after,before,'TEST_UI_DEPLOYMENT_NOT_UPDATED');
assert.equal(current.modules.length,1);
assert.equal(Buffer.from(current.modules[0].content_base64,'base64').toString('utf8'),newSource,'ACTIVE_UI_SOURCE_NOT_MATCHING');
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings,'UI_BINDINGS_CHANGED');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),expectedProtected,'PROTECTED_WORKER_VERSION_CHANGED');
console.log('B46_BTTS_EXISTING_UI_DEPLOYED '+JSON.stringify({
 worker,before,after,onlyClientCodeChanged:true,originalCSSUnchanged:true,
 cardRendererUnchanged:true,bet365SourceUnchanged:true,
 oneX2Rows:data.testLedger.rows.length,bttsRows:data.bttsLedger.rows.length,
 allRows:data.allLedger.rows.length,
 publicUrl:ui+'/?b46pm=predictions',bttsUrl:ui+'/?b46pm=btts',
 allUrl:ui+'/?b46pm=all',oneX2Url:ui+'/?b46pm=1x2',
 providerCallsAdded:0,productionWrites:0,otherWorkersUnchanged:true
}));
