// Deploy ONLY the existing PreMatch TEST front-end Worker, preserving every
// original CSS/HTML/1X2 render/BTTS picked-ledger function and route, except:
// - BTTS tab receives read-only screening readiness numbers
// - one test-only UI proxy route points at the existing read-only backend
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchExistingBttsV2ReadinessUI,patchBttsReadinessWorkerRoute,BTTS_READINESS_ROUTE} from './patch-existing-btts-bulk-v2-readiness-ui-20261122.mjs';

const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_READ_WRITE_TEST_ACCESS');
const worker='ball46-premium-match-colors-test-20261120';
const backend='ball46-prematch-only-test-20261120';
const expectedUI='1962deed-fec4-4c17-9bd4-5aa6cd06dfa1';
const expectedBTTSBackend='ac0338f3-9e32-453e-92ef-e3c70976f874';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const ui='https://'+worker+'.mccarey-supon.workers.dev';
const backendHost='https://'+backend+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',backend,
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
function sha(x){return crypto.createHash('sha256').update(x).digest('hex')}
async function cf(path,options={}){
 const r=await fetch(root+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},
 signal:AbortSignal.timeout(50000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CLOUDFLARE_'+r.status+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
async function version(n){
 const d=await cf('/scripts/'+n+'/deployments?per_page=1');
 const id=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'VERSION_MISSING_'+n);return id;
}
async function publicJSON(path,expected){
 let err;
 for(let i=0;i<27;i++){
  try{
   const r=await fetch(ui+path,{cache:'no-store',signal:AbortSignal.timeout(22000)});
   assert(r.ok,'UI_PROXY_'+r.status+'_'+path);
   const d=await r.json();expected(d);return d;
  }catch(e){err=e;if(i<26)await new Promise(res=>setTimeout(res,1400))}
 }
 throw err;
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.equal(protectedBefore[backend],expectedBTTSBackend,'ACTIVE_BTTS_TEST_BACKEND_DRIFT_STOP');
const [sourceView,backendScreen]=await Promise.all([
 publicJSON('/__b46_prematch_data',d=>{
  assert.equal(d.testLedger.mode,'TEST_ONLY');
  assert.equal(d.bttsLedger.mode,'TEST_ONLY');
  assert.equal(d.allLedger.mode,'TEST_ONLY');
  assert(d.testLedger.rows.length>=76,'PREEXISTING_1X2_HISTORY_MISSING');
  assert.equal(d.allLedger.stats.total,d.testLedger.stats.total+d.bttsLedger.stats.total);
 }),
 fetch(backendHost+'/btts-preview-data?page=1&filter=ALL',{cache:'no-store',
  signal:AbortSignal.timeout(25000)}).then(async r=>{assert(r.ok,'READ_ONLY_BTTS_BACKEND_'+r.status);return r.json()})
]);
assert.equal(backendScreen.mode,'READ_ONLY_BTTS_SHADOW');
assert(backendScreen.totals.historyReady>=40,'BTTS_HISTORY_READY_DRIFT_STOP');
assert.equal(backendScreen.published,0,'BTTS_BACKEND_PUBLICATION_UNEXPECTED');
assert.equal(await version(worker),expectedUI,'TEST_UI_ACTIVE_VERSION_DRIFT_STOP');
const active=await cf('/workers/'+worker+'/versions/'+expectedUI+'?include=modules');
assert.equal(active.main_module,'worker.js');
assert.equal(active.modules.length,1,'FRONTEND_MODULES_CHANGED');
const oldModule=active.modules[0];
assert(oldModule.name==='worker.js'&&oldModule.content_base64,'FRONTEND_MAIN_MISSING');
const source=Buffer.from(oldModule.content_base64,'base64').toString('utf8');
const clientRE=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const match=source.match(clientRE);
assert(match,'EXISTING_CLIENT_SCRIPT_NOT_FOUND');
const oldClient=JSON.parse(match[1]);
const patched=patchExistingBttsV2ReadinessUI(oldClient);
const newClientExpression='var prematchClientScript = '+JSON.stringify(patched.code)+';';
const clientOnlySource=source.replace(match[0],newClientExpression);
const route=patchBttsReadinessWorkerRoute(clientOnlySource);
const newSource=route.code;
assert.notEqual(newSource,source);
assert.equal(newSource.replace('\n  '+route.route,'').replace(newClientExpression,match[0]),
 source,'UNEXPECTED_CHANGES_OUTSIDE_EXACT_CLIENT_AND_TEST_ROUTE');
for(const [name,s] of [['btts-v2-ui-client',patched.code],['btts-v2-ui-worker',newSource]]){
 const file='/tmp/'+name+'.mjs';fs.writeFileSync(file,s);
 execFileSync(process.execPath,['--check',file],{stdio:'pipe'})
}
const bindings=(await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
for(const n of ['PREMATCH_STORE','B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER'])
 assert(bindings.includes(n),'EXISTING_BINDING_MISSING_'+n);
const testLedgerHash=sha(JSON.stringify({rows:sourceView.testLedger.rows,stats:sourceView.testLedger.stats}));
console.log('B46_BTTS_V2_UI_PREFLIGHT '+JSON.stringify({
 uiWorker:worker,currentVersion:expectedUI,backendVersion:expectedBTTSBackend,
 changedOnly:['EXISTING_PREMATCH_BTTS_CLIENT_STATUS','TEST_ONLY_READINESS_PROXY'],
 1x2Rows:sourceView.testLedger.rows.length,bttsLedgerRows:sourceView.bttsLedger.rows.length,
 upcoming:backendScreen.totals.upcoming,historyReady:backendScreen.totals.historyReady,
 probabilityReady:backendScreen.totals.modelProbabilityReady,
 waitingBet365:backendScreen.totals.quoteRequired,qualified:backendScreen.totals.qualified,
 originalCSSUnchanged:true,originalHTMLUnchanged:true,
 paidProviderCalls:0,productionWrites:0
}));
assert.equal(await version(worker),expectedUI,'TEST_UI_CONCURRENT_CHANGE_STOP');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
form.append('worker.js',new Blob([newSource],{type:'application/javascript+module'}),'worker.js');
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,installed;
for(let i=0;i<35;i++){
 after=await version(worker);
 if(after!==expectedUI){
  try{
   installed=await cf('/workers/'+worker+'/versions/'+after+'?include=modules');
   if(installed.modules?.length===1&&
    Buffer.from(installed.modules[0].content_base64,'base64').toString('utf8')===newSource)break;
  }catch{}
 }
 await new Promise(r=>setTimeout(r,1300));
}
assert(after&&after!==expectedUI,'UI_VERSION_NOT_CHANGED_AFTER_DEPLOY');
assert(installed?.modules?.length===1,'ACTIVE_UI_MODULE_VERIFICATION_FAILED');
assert.equal(Buffer.from(installed.modules[0].content_base64,'base64').toString('utf8'),newSource);
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings,
 'FRONTEND_SERVICE_BINDINGS_CHANGED');
const newPreview=await publicJSON(BTTS_READINESS_ROUTE,d=>{
 assert.equal(d.mode,'READ_ONLY_BTTS_SHADOW');
 assert(Number.isInteger(d.totals.historyReady)&&d.totals.historyReady>=40);
 assert(Number.isInteger(d.totals.modelProbabilityReady)&&d.totals.modelProbabilityReady>=0);
 assert(Number.isInteger(d.totals.quoteRequired));
 assert(Number.isInteger(d.totals.qualified));
 assert.equal(d.providerCalls,0);
 assert.equal(d.published,0);
});
for(const mode of ['btts','1x2','all','predictions']){
 const r=await fetch(ui+'/?b46pm='+mode,{cache:'no-store',signal:AbortSignal.timeout(25000)});
 assert(r.ok,'PAGE_'+mode+'_'+r.status);
 assert.equal(r.headers.get('x-b46-page-scope'),'PREMATCH_TEST_ONLY','NOT_TEST_PAGE_'+mode);
 const html=await r.text();
 assert(html.includes('prematch'),'TEST_PREMATCH_SHELL_MISSING_'+mode);
}
const afterPublic=await publicJSON('/__b46_prematch_data',d=>{
 assert.equal(d.testLedger.mode,'TEST_ONLY');
 assert.equal(d.bttsLedger.mode,'TEST_ONLY');
 assert.equal(d.allLedger.stats.total,d.testLedger.stats.total+d.bttsLedger.stats.total);
});
assert.equal(sha(JSON.stringify({rows:afterPublic.testLedger.rows,stats:afterPublic.testLedger.stats})),
 testLedgerHash,'ORIGINAL_1X2_LEDGER_CHANGED_BY_FRONTEND');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),
 protectedBefore,'PROTECTED_WORKER_CHANGED');
console.log('B46_BTTS_V2_EXISTING_TEST_UI_DEPLOY_PASS '+JSON.stringify({
 worker,oldUI:expectedUI,newUI:after,backend:expectedBTTSBackend,
 liveUrl:ui+'/?b46pm=btts',testReadinessRoute:ui+BTTS_READINESS_ROUTE,
 display:{historyReady:newPreview.totals.historyReady,upcoming:newPreview.totals.upcoming,
  probabilityReady:newPreview.totals.modelProbabilityReady,
  priceWaiting:newPreview.totals.quoteRequired,
  predictionsQualified:newPreview.totals.qualified},
 recordedBTTSPicks:afterPublic.bttsLedger.rows.length,
 original1x2Ledger:afterPublic.testLedger.rows.length,
 untouchedCSS:true,untouchedHTML:true,untouchedCards:true,
 untouched1x2:true,untouchedHCR:true,untouchedLive:true,
 totalPaidProviderCallsAdded:0,productionWrites:0,
 verdict:'PASS'
}));
