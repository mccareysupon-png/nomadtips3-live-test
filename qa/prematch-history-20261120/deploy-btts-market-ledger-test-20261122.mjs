// Deploy ONLY isolated BTTS pick issuance/statistics to already-running
// BALL46 PreMatch TEST DO. Keep UI, Live, 1X2, HCR, HUB, receiver, prod unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CF_TEST_SECRET');
const worker='ball46-prematch-only-test-20261120';
const expectedVersion='cee0e535-c220-4a5e-9ebe-6600698e4c47';
const baseline='d04290c7f4a7328fe88c247aa2f192a116a3b2ed';
const modified=['prematch-only-worker.mjs','btts-ultra-shadow.mjs'];
const added='btts-pick-ledger-test.mjs';
const dir='qa/prematch-history-20261120/';
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','ball46-prematch-ui-test-v5-20261120',
 'ball46-prematch-performance-test-20261121'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers',host='https://'+worker+'.mccarey-supon.workers.dev';
const authorization='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(path,options={}){
 const r=await fetch(root+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+r.status+'_'+JSON.stringify(j.errors||[]));return j.result;
}
async function version(name){
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const v=d.deployments?.[0]?.versions?.[0]?.version_id;assert(v,'NO_ACTIVE_VERSION_'+name);return v;
}
async function owner(path,method='GET'){
 const r=await fetch(host+path,{method,headers:{authorization},cache:'no-store',signal:AbortSignal.timeout(24000)});
 assert(r.ok,'OWNER_'+path+'_'+r.status);return r.json();
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
const before=await version(worker);assert.equal(before,expectedVersion,'ACTIVE_TEST_VERSION_DRIFT_STOP');
const old=await cf('/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(old.main_module,'prematch-only-worker.mjs');
assert.equal(old.modules.length,19,'EXPECTED_19_PREMATCH_MODULES');
assert(!old.modules.some(m=>m.name===added),'BTTS_LEDGER_ALREADY_PRESENT');
const bindings=(await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'BINDINGS_DRIFT');
const original={};
for(const m of old.modules){
 assert(m.content_base64&&m.name.endsWith('.mjs'),'UNEXPECTED_MODULE');
 original[m.name]=crypto.createHash('sha256').update(Buffer.from(m.content_base64,'base64')).digest('hex');
}
for(const name of modified){
 const m=old.modules.find(x=>x.name===name);
 assert(m,'EXPECTED_ACTIVE_MODULE_'+name);
 const baselineFile=execFileSync('git',['show',baseline+':'+dir+name],{encoding:'utf8'});
 assert.equal(Buffer.from(m.content_base64,'base64').toString('utf8'),baselineFile,'ACTIVE_CODE_DRIFT_'+name);
}
const next=Object.fromEntries([...modified,added].map(n=>[n,fs.readFileSync(dir+n,'utf8')]));
for(const n of [...modified,added])execFileSync(process.execPath,['--check',dir+n],{stdio:'pipe'});
assert(next['prematch-only-worker.mjs'].includes('bttsPickLedger')&&
 next['prematch-only-worker.mjs'].includes('recordQualifiedBtts')&&
 next[added].includes('test_pick_btts'),'BTTS_ISSUANCE_MISSING');
const [ledger,HCR,history,btts]=await Promise.all([
 owner('/test-ledger'),owner('/history-cargo-registry?detail=0'),
 owner('/btts-history-private-test'),owner('/btts-shadow')]);
assert.equal(ledger.rows.length,75);assert.equal(ledger.mode,'TEST_ONLY');
assert.equal(HCR.registry.code,'HCR-V1');
assert.equal(history.archive.privateFT,20,'ISOLATED_BTTS_HISTORY_DRIFT');
assert.equal(btts.providerCalls,0);
const ledgerSnapshot=JSON.stringify({rows:ledger.rows,stats:ledger.stats});
console.log('B46_BTTS_ISSUANCE_PREFLIGHT '+JSON.stringify({worker,before,modules:old.modules.length,
 oneX2Rows:ledger.rows.length,privateHistoryFT:history.archive.privateFT,
 HCRFT:HCR.inventory.finishedFixtures,providerCalls:0,productionWrites:0}));
assert.equal(await version(worker),before,'CONCURRENT_TEST_VERSION_CHANGE');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:old.main_module,compatibility_date:old.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(old.compatibility_flags?.length?{compatibility_flags:old.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of old.modules){
 form.append(m.name,new Blob([modified.includes(m.name)?next[m.name]:Buffer.from(m.content_base64,'base64')],{type:'application/javascript+module'}),m.name);
}
form.append(added,new Blob([next[added]],{type:'application/javascript+module'}),added);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,active;
for(let i=0;i<30;i++){
 after=await version(worker);
 try{active=await cf('/workers/'+worker+'/versions/'+after+'?include=modules')}catch(e){await new Promise(r=>setTimeout(r,1500));continue}
 if(after!==before&&[...modified,added].every(n=>{
  const m=active.modules.find(x=>x.name===n);
  return !!m?.content_base64&&Buffer.from(m.content_base64,'base64').toString('utf8')===next[n];
 }))break;
 await new Promise(r=>setTimeout(r,1100));
}
assert.notEqual(after,before,'DEPLOYED_TEST_WORKER_VERSION_UNCHANGED');
assert.equal(active.modules.length,old.modules.length+1,'UNEXPECTED_MODULE_COUNT');
for(const m of old.modules){
 if(modified.includes(m.name))continue;
 const candidate=active.modules.find(x=>x.name===m.name);
 assert(candidate?.content_base64,'OTHER_MODULE_MISSING_'+m.name);
 const h=crypto.createHash('sha256').update(Buffer.from(candidate.content_base64,'base64')).digest('hex');
 assert.equal(h,original[m.name],'UNRELATED_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)]))),protectedBefore,'PROTECTED_WORKER_CHANGED');
console.log('B46_BTTS_ISSUANCE_TEST_DEPLOYED '+JSON.stringify({worker,before,after,
 changedOnly:modified,addedModule:added,unaffectedModules:old.modules.length-modified.length,
 protectedWorkersUnchanged:true,oneX2Unchanged:true,HCRUnchanged:true,uiUnchanged:true,
 providerCallsAdded:0,productionWrites:0}));
