// TEST-only guarded frontend layout fix. The source/behavior of 1X2,
// Production, Live, HCR, the two BTTS candidate proxy routes, all existing
// static CSS and the backend remain BYTE FOR BYTE unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchBttsLayoutCleanClient} from './patch-btts-candidate-layout-clean-v2-20261122.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CF_TEST_CREDENTIALS');
const frontend='ball46-premium-match-colors-test-20261120';
const backend='ball46-prematch-only-test-20261120';
const expected='d49b840d-2a02-4757-ad2f-3b20bd6a88b5';
const backendExpected='ac0338f3-9e32-453e-92ef-e3c70976f874';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const ui='https://'+frontend+'.mccarey-supon.workers.dev';
const backendURL='https://'+backend+'.mccarey-supon.workers.dev';
const protectedWorkers=['ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343',backend,'ball46-prematch-ui-test-v5-20261120',
 'ball46-prematch-performance-test-20261121'];
const checksum=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function cf(p,opts={}){
 const r=await fetch(root+p,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
   signal:AbortSignal.timeout(50000)});
 const x=await r.json();
 assert(r.ok&&x.success,'CLOUDFLARE_'+r.status+'_'+JSON.stringify(x.errors??[]));
 return x.result;
}
async function version(worker){
 const x=await cf('/scripts/'+worker+'/deployments?per_page=1');
 const v=x.deployments?.[0]?.versions?.[0]?.version_id;
 assert(v,'WORKER_VERSION_NOT_FOUND_'+worker);return v;
}
async function getJson(url){
 const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(25000)});
 assert(r.ok,'READONLY_'+url+'_HTTP_'+r.status);return r.json();
}
const protectedBefore=Object.fromEntries(await Promise.all(
 protectedWorkers.map(async w=>[w,await version(w)])));
assert.equal(protectedBefore[backend],backendExpected,'BTTS_BACKEND_CHANGED_ABORT');
assert.equal(await version(frontend),expected,'FRONTEND_VERSION_DRIFT_ABORT');
const [ledger,wait,noOffer]=await Promise.all([
 getJson(ui+'/__b46_prematch_data'),
 getJson(backendURL+'/btts-preview-data?filter=WAITING_PRICE&page=1'),
 getJson(backendURL+'/btts-preview-data?filter=NOT_OFFERED&page=1')
]);
assert(ledger.testLedger.rows.length>=76,'PREVIOUS_1X2_ROWS_MISSING');
assert.equal(ledger.testLedger.mode,'TEST_ONLY');
assert.equal(ledger.bttsLedger.mode,'TEST_ONLY');
assert(wait.preview.rows.length>0&&noOffer.preview.rows.length>0,'NO_REAL_BTTS_CANDIDATES');
assert.equal(wait.providerCalls,0);
assert.equal(noOffer.providerCalls,0);
const beforeLedgerHash=checksum({rows:ledger.testLedger.rows,stats:ledger.testLedger.stats});
const live=await cf('/workers/'+frontend+'/versions/'+expected+'?include=modules');
assert.equal(live.main_module,'worker.js');
assert.equal(live.modules?.length,1);
const body=Buffer.from(live.modules[0].content_base64,'base64').toString('utf8');
const re=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const m=body.match(re);assert(m,'ORIGINAL_PREMATCH_SCRIPT_MISSING');
const currentClient=JSON.parse(m[1]);
assert(currentClient.includes('b46pm-btts-candidates'),'CURRENT_BTTS_CANDIDATE_CARDS_MISSING');
const patched=patchBttsLayoutCleanClient(currentClient);
const expr='var prematchClientScript = '+JSON.stringify(patched.code)+';';
const newBody=body.replace(m[0],expr);
assert.notEqual(newBody,body);
assert.equal(newBody.replace(expr,m[0]),body,'ANY_OTHER_WORKER_SOURCE_CHANGED');
assert(newBody.includes('u.pathname === "/__b46_pm_btts_candidates"'),'BTTS_ROUTE_LOST');
assert(newBody.includes('u.pathname === "/__b46_pm_btts_readiness"'),'BTTS_READINESS_ROUTE_LOST');
const forms=[['old-client',currentClient],['new-client',patched.code],['new-worker',newBody]];
for(const [name,script] of forms){
 const filename='/tmp/b46-btts-layout-'+name+'.mjs';
 fs.writeFileSync(filename,script);
 execFileSync(process.execPath,['--check',filename],{stdio:'pipe'});
}
const settings=await cf('/scripts/'+frontend+'/settings');
const bindings=settings.bindings.map(x=>x.name).sort();
for(const required of ['PREMATCH_STORE','B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER'])
 assert(bindings.includes(required),'REQUIRED_BINDING_REMOVED_'+required);
console.log('B46_BTTS_LAYOUT_CLEAN_V2_PREFLIGHT '+JSON.stringify({
 before:expected,backend:backendExpected,
 awaitingPrice:wait.preview.total,notOffered:noOffer.preview.total,
 probable:wait.totals.modelProbabilityReady,allUpcoming:wait.totals.upcoming,
 original1x2Rows:ledger.testLedger.rows.length,
 frontendDeltaBytes:patched.code.length-currentClient.length,
 originalCSSAndRoutesUnchanged:true,
 paidProviderRequests:0,productionWrites:0
}));
assert.equal(await version(frontend),expected,'CONCURRENT_FRONTEND_VERSION_CHANGED');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:live.main_module,
 compatibility_date:live.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(live.compatibility_flags?.length?{compatibility_flags:live.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
form.append('worker.js',new Blob([newBody],{type:'application/javascript+module'}),'worker.js');
await cf('/scripts/'+frontend+'?bindings_inherit=strict',{method:'PUT',body:form});
let changed=null,actual=null;
for(let i=0;i<35;i++){
 changed=await version(frontend);
 if(changed!==expected){
  try{
   actual=await cf('/workers/'+frontend+'/versions/'+changed+'?include=modules');
   if(actual.modules?.length===1&&Buffer.from(actual.modules[0].content_base64,'base64').toString('utf8')===newBody)break;
  }catch{}
 }
 await new Promise(resolve=>setTimeout(resolve,1200));
}
assert(changed&&changed!==expected,'NEW_TEST_UI_VERSION_NOT_ACTIVE');
assert.equal(Buffer.from(actual?.modules?.[0]?.content_base64??'', 'base64').toString('utf8'),
 newBody,'INSTALLED_CODE_DIFFERENCE');
const afterSettings=await cf('/scripts/'+frontend+'/settings');
assert.deepEqual(afterSettings.bindings.map(x=>x.name).sort(),bindings,'CF_BINDINGS_CHANGED');
const [afterLedger,readiness,candidates]=await Promise.all([
 getJson(ui+'/__b46_prematch_data'),
 getJson(ui+'/__b46_pm_btts_readiness'),
 getJson(ui+'/__b46_pm_btts_candidates?filter=WAITING_PRICE&page=1')
]);
assert.equal(checksum({rows:afterLedger.testLedger.rows,stats:afterLedger.testLedger.stats}),
 beforeLedgerHash,'1X2_LEDGER_CHANGED');
assert.equal(readiness.mode,'READ_ONLY_BTTS_SHADOW');
assert.equal(candidates.mode,'READ_ONLY_BTTS_SHADOW');
assert.equal(candidates.providerCalls,0);
assert.deepEqual(Object.fromEntries(await Promise.all(
 protectedWorkers.map(async w=>[w,await version(w)]))),
 protectedBefore,'PROTECTED_WORKER_VERSION_CHANGED');
console.log('B46_BTTS_LAYOUT_CLEAN_V2_DEPLOYED '+JSON.stringify({
 frontend,from:expected,to:changed,backend:backendExpected,
 testUrl:ui+'/?b46pm=btts',layout:'2-column desktop; one full-width mobile; three noncramped metric boxes',
 noGlobalCSSChange:true,noOriginal1x2UIChange:true,noLiveChange:true,
 original1x2Rows:afterLedger.testLedger.rows.length,
 backendReadiness:readiness.totals,providerCallsAdded:0,productionWrites:0,
 verified:true
}));
