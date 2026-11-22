// Deploy only current existing BALL46 TEST UI with true BTTS pre-price
// candidate cards sourced from isolated TEST backend read-only previews.
// Preserve Production/Live, 1X2, HCR, BTTS ledger and original stylesheet.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchBttsCandidateClient,patchBttsCandidateRoute} from './patch-existing-btts-candidate-cards-test-20261122.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_DEPLOY_CREDENTIALS');
const frontend='ball46-premium-match-colors-test-20261120';
const backend='ball46-prematch-only-test-20261120';
const frontendBefore='07d59e00-a88d-473c-bb45-c3a73b9deb96';
const backendVersion='ac0338f3-9e32-453e-92ef-e3c70976f874';
const cloud='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const ui='https://'+frontend+'.mccarey-supon.workers.dev';
const backendHost='https://'+backend+'.mccarey-supon.workers.dev';
const protect=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',backend,
  'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function cf(path,options={}){
 const r=await fetch(cloud+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},
  signal:AbortSignal.timeout(50000)});
 const d=await r.json();assert(r.ok&&d.success,
  'CF_'+r.status+'_'+JSON.stringify(d.errors??[]));return d.result;
}
async function ver(n){
 const d=await cf('/scripts/'+n+'/deployments?per_page=1');
 const v=d.deployments?.[0]?.versions?.[0]?.version_id;assert(v,'NO_VERSION_'+n);return v;
}
async function publicUI(path){
 const r=await fetch(ui+path,{cache:'no-store',signal:AbortSignal.timeout(28000)});
 assert(r.ok,'PUBLIC_UI_'+path+'_HTTP_'+r.status);return r.json();
}
async function fromBackend(filter){
 const r=await fetch(backendHost+'/btts-preview-data?filter='+filter+'&page=1',{
   cache:'no-store',signal:AbortSignal.timeout(24000)});
 assert(r.ok,'BACKEND_PREVIEW_'+filter+'_'+r.status);
 const d=await r.json();
 assert.equal(d.mode,'READ_ONLY_BTTS_SHADOW');
 assert.equal(d.preview.filter,filter);
 assert.equal(d.providerCalls,0);assert.equal(d.published,0);
 assert(Array.isArray(d.preview.rows));
 return d;
}
const beforeProtect=Object.fromEntries(await Promise.all(protect.map(async n=>[n,await ver(n)])));
assert.equal(beforeProtect[backend],backendVersion,'BACKEND_TEST_CHANGED_STOP');
assert.equal(await ver(frontend),frontendBefore,'FRONTEND_TEST_CHANGED_STOP');
const [beforeLedger,waiting,noOffer]=await Promise.all([
 publicUI('/__b46_prematch_data'),
 fromBackend('WAITING_PRICE'),
 fromBackend('NOT_OFFERED')
]);
assert.equal(beforeLedger.testLedger.mode,'TEST_ONLY');
assert(beforeLedger.testLedger.rows.length>=76,'1X2_LEDGER_PREEXISTING_DATA_MISSING');
assert.equal(beforeLedger.allLedger.stats.total,
 beforeLedger.testLedger.stats.total+beforeLedger.bttsLedger.stats.total);
const previousOneX2Hash=hash({rows:beforeLedger.testLedger.rows,stats:beforeLedger.testLedger.stats});
const original=await cf('/workers/'+frontend+'/versions/'+frontendBefore+'?include=modules');
assert.equal(original.main_module,'worker.js');
assert.equal(original.modules?.length,1,'FRONTEND_MODULE_COUNT_DRIFT');
const workerSource=Buffer.from(original.modules[0].content_base64,'base64').toString('utf8');
const re=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const oldMatch=workerSource.match(re);assert(oldMatch,'PREMATCH_CLIENT_NOT_FOUND');
const oldClient=JSON.parse(oldMatch[1]);
const patched=patchBttsCandidateClient(oldClient);
const newExpression='var prematchClientScript = '+JSON.stringify(patched.code)+';';
const onlyClient=workerSource.replace(oldMatch[0],newExpression);
const extra=patchBttsCandidateRoute(onlyClient);
const newSource=extra.code;
assert.notEqual(newSource,workerSource,'EMPTY_BTTS_CANDIDATE_CHANGE');
assert.equal(newSource.replace('\n  '+extra.extra,'').replace(newExpression,oldMatch[0]),
 workerSource,'CHANGES_OUTSIDE_EXISTING_BTTS_CLIENT_AND_PROXY');
for(const [name,code] of [
 ['ball46-btts-candidate-client',patched.code],
 ['ball46-btts-candidate-worker',newSource]
]){
 const file='/tmp/'+name+'.mjs';fs.writeFileSync(file,code);
 execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}
const originalBindings=(await cf('/scripts/'+frontend+'/settings')).bindings.map(x=>x.name).sort();
for(const k of ['PREMATCH_STORE','B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER'])
 assert(originalBindings.includes(k),'MISSING_EXISTING_UI_BINDING_'+k);
assert.equal(await ver(frontend),frontendBefore,'CONCURRENT_FRONTEND_DEPLOY_STOP');
const firstCount=[...new Set([...waiting.preview.rows,...noOffer.preview.rows].filter(r=>{
 const yes=Number(r.probabilityYes),no=Number(r.probabilityNo);
 return Math.max(Number.isFinite(yes)?yes:0,Number.isFinite(no)?no:0)>=0.6;
}).map(x=>String(x.fixtureId)))].length;
console.log('B46_BTTS_CANDIDATE_UI_PREFLIGHT '+JSON.stringify({
 before:frontendBefore,backend:backendVersion,
 upcoming:waiting.totals.upcoming,historyReady:waiting.totals.historyReady,
 modelReady:waiting.totals.modelProbabilityReady,
 waitingPrice:waiting.preview.total,notOffered:noOffer.preview.total,
 candidatesFirstPage:firstCount,fullyQualified:waiting.totals.qualified,
 bttsRecordedPicks:beforeLedger.bttsLedger.rows.length,oneX2Rows:beforeLedger.testLedger.rows.length,
 scope:'EXISTING_BTTS_TEST_UI_ONLY',newProviderCalls:0,productionWrites:0
}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:original.main_module,
 compatibility_date:original.compatibility_date||'2026-11-20',
 bindings:originalBindings.map(name=>({name,type:'inherit'})),
 ...(original.compatibility_flags?.length?{compatibility_flags:original.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
form.append('worker.js',new Blob([newSource],{type:'application/javascript+module'}),'worker.js');
await cf('/scripts/'+frontend+'?bindings_inherit=strict',{method:'PUT',body:form});
let currentVersion=null,readback;
for(let i=0;i<35;i++){
 currentVersion=await ver(frontend);
 if(currentVersion!==frontendBefore){
  try{
   readback=await cf('/workers/'+frontend+'/versions/'+currentVersion+'?include=modules');
   if(readback.modules?.length===1&&
    Buffer.from(readback.modules[0].content_base64,'base64').toString('utf8')===newSource)break;
  }catch{}
 }
 await new Promise(resolve=>setTimeout(resolve,1300));
}
assert(currentVersion&&currentVersion!==frontendBefore,'NEW_TEST_UI_NOT_ACTIVE');
assert.equal(Buffer.from(readback?.modules?.[0]?.content_base64||'', 'base64').toString('utf8'),
 newSource,'ACTIVE_UI_MODULE_MISMATCH');
assert.deepEqual((await cf('/scripts/'+frontend+'/settings')).bindings.map(x=>x.name).sort(),
 originalBindings,'FRONTEND_BINDINGS_CHANGED');
// Cloudflare may take a few seconds to route the new endpoint.
async function assertCandidateEndpoint(filter){
 let last=null;
 for(let i=0;i<28;i++){
  try{
   const r=await fetch(ui+'/__b46_pm_btts_candidates?filter='+filter+'&page=1',
    {cache:'no-store',signal:AbortSignal.timeout(22000)});
   assert(r.ok,'CANDIDATE_PROXY_HTTP_'+r.status);
   const d=await r.json();
   assert.equal(d.mode,'READ_ONLY_BTTS_SHADOW');
   assert.equal(d.preview.filter,filter);
   assert(Array.isArray(d.preview.rows));
   assert.equal(d.providerCalls,0);assert.equal(d.published,0);
   return d;
  }catch(e){last=e;await new Promise(resolve=>setTimeout(resolve,1200))}
 }
 throw last;
}
const [uWait,uNot,afterLedger]=await Promise.all([
 assertCandidateEndpoint('WAITING_PRICE'),assertCandidateEndpoint('NOT_OFFERED'),
 publicUI('/__b46_prematch_data')
]);
assert.equal(hash({rows:afterLedger.testLedger.rows,stats:afterLedger.testLedger.stats}),
 previousOneX2Hash,'FRONTEND_MUTATED_1X2_LEDGER');
assert.equal(afterLedger.bttsLedger.rows.length,beforeLedger.bttsLedger.rows.length,'BTTS_PICK_LEDGER_CHANGED');
assert.deepEqual(Object.fromEntries(await Promise.all(protect.map(async n=>[n,await ver(n)]))),
 beforeProtect,'PROTECTED_WORKERS_MODIFIED');
console.log('B46_BTTS_CANDIDATES_TEST_DEPLOY_PASS '+JSON.stringify({
 ui:ui+'/?b46pm=btts',oldVersion:frontendBefore,newVersion:currentVersion,
 backendVersion,backendUnchanged:true,oneX2LedgerRows:afterLedger.testLedger.rows.length,
 currentHistoryReady:uWait.totals.historyReady,probabilityPassed:uWait.totals.modelProbabilityReady,
 statusWaitingPrice:uWait.preview.total,statusNotOffered:uNot.preview.total,
 picksPublished:afterLedger.bttsLedger.rows.length,
 proxyModes:['WAITING_PRICE','NOT_OFFERED'],
 originalHTMLUnchanged:true,originalCSSUnchanged:true,original1X2CardCodeUnchanged:true,
 newProviderCalls:0,productionWrites:0,verdict:'PASS'
}));
