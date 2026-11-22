// Phase 2+3 of user-approved four-view unified PreMatch UI, TEST ONLY.
// Only embedded PreMatch client text; backend, original global CSS,
// issued-pick ledgers, 1X2 source and all protected Workers unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import {patchPreMatchUnifiedPredictions} from './patch-prematch-unified-predictions-test-20261122.mjs';

const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'NO_TEST_CLOUDFLARE_ACCESS');
const front='ball46-premium-match-colors-test-20261120';
const backend='ball46-prematch-only-test-20261120';
const expected='af75c39d-bcfa-4877-b3b9-71568c7e2a93';
const backendExpected='ac0338f3-9e32-453e-92ef-e3c70976f874';
const cfRoot='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const frontURL='https://'+front+'.mccarey-supon.workers.dev';
const backURL='https://'+backend+'.mccarey-supon.workers.dev';
const protectedNames=[backend,'ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const owner='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(path,opts={}){
 const r=await fetch(cfRoot+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(45000)});
 const d=await r.json();assert(r.ok&&d.success,'CF_'+path+'_'+r.status+' '+JSON.stringify(d.errors??[]));return d.result;
}
async function ver(name){
 const x=await cf('/scripts/'+name+'/deployments?per_page=1');
 const v=x.deployments?.[0]?.versions?.[0]?.version_id;
 assert(v,'UNKNOWN_CLOUDFLARE_VERSION_'+name);return v;
}
async function read(url,priv=false){
 const r=await fetch(url,{headers:priv?{authorization:owner}:{},cache:'no-store',
  signal:AbortSignal.timeout(28000)});
 assert(r.ok,'TEST_READ_FAILED_'+r.status+'_'+url);return r.json();
}
const beforeVersions=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await ver(n)])));
assert.equal(beforeVersions[backend],backendExpected,'TEST_BACKEND_DRIFT');
assert.equal(await ver(front),expected,'TEST_FRONTEND_VERSION_DRIFT');
const [beforeData,statsBefore,registryBefore]=await Promise.all([
 read(frontURL+'/__b46_prematch_data'),
 read(backURL+'/prematch-stats-registry-audit-test',true),
 read(backURL+'/prematch-stats-registry-test?days=90',true)
]);
assert.equal(statsBefore.verified,true,'PREMATCH_SNAPSHOT_NOT_VALID');
assert.equal(beforeData.allLedger.stats.total,
 beforeData.testLedger.stats.total+beforeData.bttsLedger.stats.total,'PREMATCH_TOTAL_DRIFT');
assert.equal(registryBefore.markets.TOTAL.total,
 registryBefore.markets['1X2'].total+registryBefore.markets.BTTS.total,'TOTAL_LEDGER_INCONSISTENT');
assert.equal(beforeData.testLedger.rows.length,76,'1X2_LEDGER_UNEXPECTED');
const oldOneX2Hash=hash({rows:beforeData.testLedger.rows,stats:beforeData.testLedger.stats});
const active=await cf('/workers/'+front+'/versions/'+expected+'?include=modules');
assert.equal(active.main_module,'worker.js','FRONTEND_MAIN_MODULE_DRIFT');
assert.equal(active.modules?.length,1,'FRONTEND_MODULE_COUNT_DRIFT');
const original=Buffer.from(active.modules[0].content_base64,'base64').toString('utf8');
const clientExpression=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const m=original.match(clientExpression);assert(m,'EMBEDDED_PREMATCH_CLIENT_NOT_FOUND');
const oldClient=JSON.parse(m[1]);
const changed=patchPreMatchUnifiedPredictions(oldClient);
const newExpression='var prematchClientScript = '+JSON.stringify(changed.code)+';';
const next=original.replace(m[0],newExpression);
assert.notEqual(original,next);
assert.equal(next.replace(newExpression,m[0]),original,'UNEXPECTED_GLOBAL_UI_SOURCE_CHANGE');
assert(next.includes('u.pathname === "/__b46_pm_btts_candidates"'));
assert(next.includes('u.pathname === "/__b46_pm_btts_readiness"'));
for(const [label,s] of [['client',changed.code],['worker',next]]){
 const p='/tmp/b46-four-view-performance-'+label+'.mjs';
 fs.writeFileSync(p,s);execFileSync(process.execPath,['--check',p],{stdio:'pipe'});
}
const oldSettings=await cf('/scripts/'+front+'/settings');
const bindings=oldSettings.bindings.map(x=>x.name).sort();
assert(bindings.includes('PREMATCH_STORE')&&bindings.includes('B46_PRODUCTION_READ')&&
 bindings.includes('PREMATCH_PERF_RECEIVER'),'FRONTEND_BINDINGS_MISSING');
console.log('B46_PREMATCH_UNIFIED_ISSUED_STAGE4_PREFLIGHT '+JSON.stringify({
 originalUI:expected,backend:backendExpected,
 previousMarkets:registryBefore.markets,statsAudit:true,
 clientChangeBytes:changed.code.length-oldClient.length,
 groupedIssuance:true,native1X2MirrorPreserved:changed.native1X2MirrorPreserved,
 historicalRowsBTTS:beforeData.bttsLedger.rows.length,
 oldOneX2Rows:beforeData.testLedger.rows.length,
 protectedWorkers:protectedNames,providerCallsAdded:0,productionWrites:0}));
assert.equal(await ver(front),expected,'TEST_FRONTEND_CHANGED_DURING_PREFLIGHT');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
form.append('worker.js',new Blob([next],{type:'application/javascript+module'}),'worker.js');
await cf('/scripts/'+front+'?bindings_inherit=strict',{method:'PUT',body:form});
let after=null,installed=null;
for(let i=0;i<35;i++){
 after=await ver(front);
 if(after!==expected){
  try{installed=await cf('/workers/'+front+'/versions/'+after+'?include=modules');
   if(installed.modules?.length===1&&
    Buffer.from(installed.modules[0].content_base64,'base64').toString('utf8')===next)break;
  }catch{}
 }
 await new Promise(res=>setTimeout(res,1100));
}
assert(after&&after!==expected,'NEW_UNIFIED_STATS_VERSION_NOT_ACTIVE');
assert.equal(Buffer.from(installed?.modules?.[0]?.content_base64??'', 'base64').toString('utf8'),
 next,'ACTIVE_UNIFIED_STATS_DIFFERENCE');
assert.deepEqual((await cf('/scripts/'+front+'/settings')).bindings.map(x=>x.name).sort(),bindings,
 'FRONTEND_SETTINGS_CHANGED');
const [afterData,statsAfter,registryAfter]=await Promise.all([
 read(frontURL+'/__b46_prematch_data'),
 read(backURL+'/prematch-stats-registry-audit-test',true),
 read(backURL+'/prematch-stats-registry-test?days=90',true)
]);
assert.equal(hash({rows:afterData.testLedger.rows,stats:afterData.testLedger.stats}),oldOneX2Hash,
 '1X2_LEDGER_MUTATED_BY_UI');
assert.equal(statsAfter.verified,true,'POSTDEPLOY_STATS_INVALID');
assert.deepEqual(registryAfter.markets,registryBefore.markets,
 'CURRENT_MARKET_SNAPSHOT_CHANGED_BY_FRONTEND');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await ver(n)]))),
 beforeVersions,'BACKEND_OR_PROTECTED_WORKER_CHANGED');
console.log('B46_PREMATCH_UNIFIED_ISSUED_STAGE4_DEPLOY_PASS '+JSON.stringify({
 oldUI:expected,newUI:after,
 scope:'TEST_ONLY_PREMATCH_ISSUED_MARKET_GROUPING',
 markets:registryAfter.markets,statsAudit:true,
 original1X2Rows:afterData.testLedger.rows.length,
 originalCSSUntouched:true,originalBackendUntouched:true,
 onlyClientChanges:true,native1X2MirrorPreserved:true,
 marketIdentity:'(market,fixture_id)',newProviderCalls:0,productionWrites:0
}));
