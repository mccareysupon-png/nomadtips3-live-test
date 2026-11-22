// TEST ONLY: replace the O/U math module, keep all other backend modules byte-for-byte.
// Do not mutate production, odds, HCR, 1X2/BTTS, shared statistics or Cloudflare schedules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_TEST_ACCESS');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const name='ball46-prematch-only-test-20261120';
const expected='3f094cf2-8746-41ab-a540-e5e58b28b920';
const file='ou-math-v1-test.mjs';
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
const host='https://'+name+'.mccarey-supon.workers.dev';
const ownerKey=crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(50000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_ERROR_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]));return j.result;
}
async function version(n){
 const d=await cf('/scripts/'+n+'/deployments?per_page=1');
 const v=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(v,'WORKER_VERSION_MISSING_'+n);return v;
}
async function owner(path,method='GET'){
 const r=await fetch(host+path,{method,headers:{authorization:'Bearer '+ownerKey},cache:'no-store',signal:AbortSignal.timeout(60000)});
 assert(r.ok,'OU_OWNER_'+path+'_'+r.status);return r.json();
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
assert.equal(await version(name),expected,'BACKEND_TEST_DRIFT_FAIL_CLOSED');
const active=await cf('/workers/'+name+'/versions/'+expected+'?include=modules');
assert.equal(active.main_module,'prematch-only-worker.mjs');
assert.equal(active.modules.length,24,'UNEXPECTED_TEST_MODULE_COUNT');
const main=active.modules.find(x=>x.name===active.main_module);
assert(main?.content_base64,'MAIN_NOT_PRESENT');
const mainSource=Buffer.from(main.content_base64,'base64').toString('utf8');
assert(mainSource.includes("path==='/ou-cycle-test'")&&mainSource.includes("path==='/ou-backtest-test'")&&
 mainSource.includes('const trial=screenOu(this.db,fixtures,now,350)'),'OU_CYCLE_NOT_INSTALLED');
const previous=active.modules.find(x=>x.name===file);
assert(previous?.content_base64,'CURRENT_OU_MODEL_NOT_FOUND');
const old=Buffer.from(previous.content_base64,'base64').toString('utf8');
assert(old.includes("minHistory:3,maxHistory:10")&&old.includes("home.length<3||away.length<3")&&
 old.includes("OU_MODEL='ou-poisson-shrinkage-2p5-v1'"),'EXPECTED_OLD_THRESHOLD_MISSING');
const next=fs.readFileSync('qa/prematch-history-20261120/'+file,'utf8');
execFileSync(process.execPath,['--check','qa/prematch-history-20261120/'+file],{stdio:'pipe'});
assert(next.includes("minHistory:0,minCombinedHistory:1,maxHistory:10")&&
 next.includes("home.length+away.length<OU_POLICY.minCombinedHistory")&&
 next.includes("hh.length+aa.length<OU_POLICY.minCombinedHistory")&&
 next.includes("p.home_count+p.away_count<OU_POLICY.minCombinedHistory")&&
 next.includes("OU_MODEL='ou-poisson-shrinkage-2p5-v1p1-available-history'")&&
 next.includes("minProbability:.64"),'ANY_HISTORY_GUARDS_MISSING');
const settings=await cf('/scripts/'+name+'/settings');
const bindings=settings.bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'WORKER_BINDINGS_DRIFT');
const hashes=Object.fromEntries(active.modules.map(m=>[m.name,digest(Buffer.from(m.content_base64,'base64'))]));
const [ledgerBefore,registryBefore,ouBefore,backBefore]=await Promise.all([
 owner('/test-ledger'),owner('/prematch-stats-registry-audit-test'),owner('/ou-state-test'),
 owner('/ou-backtest-test?limit=750')
]);
assert.equal(ledgerBefore.mode,'TEST_ONLY');
assert.equal(registryBefore.verified,true,'STATISTICS_REGISTRY_INVALID_PRE_DEPLOY');
assert.equal(ouBefore.policy.minCombinedHistory??undefined,undefined,'OU_ALREADY_ANY_HISTORY');
const ledgerHash=digest(JSON.stringify({rows:ledgerBefore.rows,stats:ledgerBefore.stats}));
console.log('B46_OU_ANY_HISTORY_PREFLIGHT '+JSON.stringify({before:expected,originalOU:ouBefore.stats,
 originalBacktest:backBefore.stats,ledger1x2Rows:ledgerBefore.rows.length,providerCalls:0}));
assert.equal(await version(name),expected,'CONCURRENT_DEPLOY_STOP');
const meta={main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(n=>({name:n,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const contents=m.name===file?next:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([contents],{type:'application/javascript+module'}),m.name);
}
await cf('/scripts/'+name+'?bindings_inherit=strict',{method:'PUT',body:form});
let newVersion=null,newActive=null;
for(let i=0;i<35;i++){
 const v=await version(name);
 if(v!==expected){
  const a=await cf('/workers/'+name+'/versions/'+v+'?include=modules');
  const m=a.modules.find(x=>x.name===file);
  if(m?.content_base64&&Buffer.from(m.content_base64,'base64').toString('utf8')===next){
   newVersion=v;newActive=a;break;
  }
 }
 await new Promise(r=>setTimeout(r,1200));
}
assert(newVersion&&newActive,'DEPLOY_NOT_ACTIVE');
assert.equal(newActive.modules.length,active.modules.length);
for(const m of active.modules){
 const t=newActive.modules.find(x=>x.name===m.name);
 assert(t?.content_base64,'ORIGINAL_MODULE_MISSING_'+m.name);
 if(m.name!==file)assert.equal(digest(Buffer.from(t.content_base64,'base64')),hashes[m.name],
   'ORIGINAL_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+name+'/settings')).bindings.map(x=>x.name).sort(),bindings);
let afterState;
for(let i=0;i<20;i++){
 try{afterState=await owner('/ou-state-test');if(afterState.policy.model==='ou-poisson-shrinkage-2p5-v1p1-available-history')break}
 catch(error){if(i===19)throw error}
 await new Promise(r=>setTimeout(r,1100));
}
assert.equal(afterState?.policy?.minCombinedHistory,1,'NEW_THRESHOLD_NOT_ACTIVE');
assert.equal(afterState.policy.minHistory,0);
assert.equal(afterState.policy.minProbability,.64);
const afterBack=await owner('/ou-backtest-test?limit=750');
const first=await owner('/ou-cycle-test','POST');
assert.equal(first.providerCalls,0);
assert.equal(first.paidOddsRequested,0);
assert(first.screening.checked>=0);
const repeat=await owner('/ou-cycle-test','POST');
assert.equal(repeat.recorded.added,0,'ISSUED_DUPLICATE_PICK');
assert.equal(repeat.sync.processed,0,'SNAPSHOT_DUPLICATE');
const [ledgerAfter,registryAfter,preview]=await Promise.all([
 owner('/test-ledger'),owner('/prematch-stats-registry-audit-test'),owner('/preview-data')
]);
assert.equal(digest(JSON.stringify({rows:ledgerAfter.rows,stats:ledgerAfter.stats})),ledgerHash,'1X2_LEDGER_MUTATED');
assert.equal(registryAfter.verified,true);
assert.equal(preview.ouLedger.mode,'TEST_ONLY');
assert.equal(preview.ouLedger.stats.total,preview.ouLedger.rows.length);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)]))),protectedBefore);
console.log('B46_OU_ANY_HISTORY_TEST_PASS '+JSON.stringify({
 oldVersion:expected,newVersion,policy:afterState.policy,
 before:ouBefore.stats,after:preview.ouLedger.stats,
 oldBacktest:backBefore.stats,newBacktest:afterBack.stats,
 screening:first.screening,issued:first.recorded,repeated:repeat.recorded,
 providerCalls:0,protectedVersionsUnchanged:true,oneX2Preserved:true,
 BTTSUnchanged:true,productionWrites:0
}));
