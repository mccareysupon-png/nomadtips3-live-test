// TEST-only: remove BTTS unqualified Screening candidate cards from
// the existing Pre-Match Statistics BTTS view. Use only bttsLedger rows.
// No backend, 1X2, 5USD calls or production modifications.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchBttsQualifiedCardsOnly} from './patch-btts-qualified-only-cards-ui-test-20261122.mjs';

const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_CF_CREDENTIALS');
const front='ball46-premium-match-colors-test-20261120';
const backend='ball46-prematch-only-test-20261120';
const expected='31a820f7-12cd-4ed9-9c9c-bee59894b9ef';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const frontURL='https://'+front+'.mccarey-supon.workers.dev';
const protectedWorkers=[backend,'ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','ball46-prematch-ui-test-v5-20261120',
 'ball46-prematch-performance-test-20261121'];
async function cf(path,opts={}){
 const r=await fetch(api+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
    signal:AbortSignal.timeout(45000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_'+r.status+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
async function ver(name){
 const r=await cf('/scripts/'+name+'/deployments?per_page=1');
 const version=r.deployments?.[0]?.versions?.[0]?.version_id;
 assert(version,'MISSING_VERSION_'+name);
 return version;
}
async function get(url){
 const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert(r.ok,'LIVE_READ_'+url+'_'+r.status);
 return r.json();
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedWorkers.map(async w=>[w,await ver(w)])));
assert.equal(await ver(front),expected,'FRONTEND_TEST_VERSION_DRIFT_ABORT');
const dataBefore=await get(frontURL+'/__b46_prematch_data');
assert.equal(dataBefore.bttsLedger.mode,'TEST_ONLY','BTTS_LEDGER_NOT_ISOLATED');
assert.equal(dataBefore.testLedger.mode,'TEST_ONLY','1X2_LEDGER_NOT_ISOLATED');
assert.equal(dataBefore.allLedger.stats.total,
 dataBefore.bttsLedger.stats.total+dataBefore.testLedger.stats.total,'PREMATCH_LEDGER_SUM_INCONSISTENT');
const original=await cf('/workers/'+front+'/versions/'+expected+'?include=modules');
assert.equal(original.main_module,'worker.js','WRONG_UI_MAIN_MODULE');
assert.equal(original.modules.length,1,'UI_MODULE_DRIFT');
const src=Buffer.from(original.modules[0].content_base64,'base64').toString('utf8');
const regex=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const hit=src.match(regex);
assert(hit,'EMBEDDED_PREMATCH_CLIENT_NOT_FOUND');
const oldClient=JSON.parse(hit[1]);
const patched=patchBttsQualifiedCardsOnly(oldClient);
assert(patched.old1X2AndPredictionsRowsUnchanged&&patched.onlyRecordedQualifiedBttsCards);
const expr='var prematchClientScript = '+JSON.stringify(patched.code)+';';
const afterBody=src.replace(hit[0],expr);
assert.equal(afterBody.replace(expr,hit[0]),src,'OTHER_UI_SOURCE_CHANGED');
assert(afterBody.includes('u.pathname === "/__b46_pm_btts_candidates"'),
 'EXISTING_READONLY_DIAGNOSTICS_ROUTE_LOST');
for(const [name,text] of [['client',patched.code],['worker',afterBody]]){
 const namePath='/tmp/b46-qualified-only-'+name+'.mjs';
 fs.writeFileSync(namePath,text);
 execFileSync(process.execPath,['--check',namePath],{stdio:'pipe'});
}
const settings=await cf('/scripts/'+front+'/settings');
const bindings=settings.bindings.map(x=>x.name).sort();
for(const needed of ['PREMATCH_STORE','B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER'])
 assert(bindings.includes(needed),'MISSING_UI_BINDING_'+needed);
console.log('B46_BTTS_QUALIFIED_ONLY_PREFLIGHT '+JSON.stringify({
 front,version:expected,screeningCardInsertionRemoved:true,
 activeCardsSource:'BTTS_ISSUED_LEDGER_ONLY',
 bttsIssuedPicks:dataBefore.bttsLedger.rows.length,
 oneX2IssuedPicks:dataBefore.testLedger.rows.length,
 noModelOddsThresholdChanges:true,protectedBefore,
 newProviderCalls:0,productionWrites:0
}));
assert.equal(await ver(front),expected,'CONCURRENT_UI_DEPLOY_ABORT');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:original.main_module,compatibility_date:original.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(original.compatibility_flags?.length?{compatibility_flags:original.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
form.append('worker.js',new Blob([afterBody],{type:'application/javascript+module'}),'worker.js');
await cf('/scripts/'+front+'?bindings_inherit=strict',{method:'PUT',body:form});
let activeVersion=null,active=null;
for(let i=0;i<37;i++){
 activeVersion=await ver(front);
 if(activeVersion!==expected){
  try{
   active=await cf('/workers/'+front+'/versions/'+activeVersion+'?include=modules');
   if(active.modules?.length===1&&
     Buffer.from(active.modules[0].content_base64,'base64').toString('utf8')===afterBody)break;
  }catch{}
 }
 await new Promise(r=>setTimeout(r,1200));
}
assert(activeVersion&&activeVersion!==expected&&active?.modules?.length===1,
 'NEW_QUALIFIED_ONLY_UI_VERSION_NOT_CONFIRMED');
assert.equal(Buffer.from(active.modules[0].content_base64,'base64').toString('utf8'),
 afterBody,'NEW_TEST_UI_SOURCE_DIFFERS');
assert.deepEqual((await cf('/scripts/'+front+'/settings')).bindings.map(x=>x.name).sort(),
 bindings,'CF_BINDINGS_CHANGED');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async w=>[w,await ver(w)]))),
 protectedBefore,'PROTECTED_WORKER_CHANGED');
const dataAfter=await get(frontURL+'/__b46_prematch_data');
assert.equal(dataAfter.bttsLedger.mode,'TEST_ONLY');
assert.equal(dataAfter.allLedger.stats.total,
 dataAfter.bttsLedger.stats.total+dataAfter.testLedger.stats.total);
console.log('B46_BTTS_QUALIFIED_ONLY_DEPLOY_PASS '+JSON.stringify({
 front,from:expected,to:activeVersion,
 bttsIssuedPicks:dataAfter.bttsLedger.rows.length,
 noUnqualifiedScreeningCards:true,
 actualBTTSCardSource:'bttsLedger.rows',
 displaysIfNoQualifiedPicks:'No qualified BTTS predictions yet.',
 backendUntouched:true,oneX2SourceUntouched:true,productionWrites:0,newProviderCalls:0
}));
