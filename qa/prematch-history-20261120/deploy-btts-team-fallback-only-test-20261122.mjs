// BALL46 existing PreMatch Worker TEST ONLY.
// Change only BTTS private history module + its owner-only import route.
// NEVER change frontend/UI, 1X2, HCR, LIVE, statistics, HUB or Production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_CREDENTIALS_MISSING');
const worker='ball46-prematch-only-test-20261120';
const expectedVersion='3b15d254-dfec-4a94-9c83-9c7a7fe7dabd';
const baseline='2e8a6f99c97953cd24bb3aecd9ce11679dd346d1';
const updated=['btts-history-private.mjs','prematch-only-worker.mjs'];
const dir='qa/prematch-history-20261120/';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','ball46-prematch-ui-test-v5-20261120'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(p,options={}){
 const r=await fetch(root+p,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(40000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+r.status+'_'+JSON.stringify(j.errors||[]));return j.result;
}
async function version(name){
 const j=await cf('/scripts/'+name+'/deployments?per_page=1');
 const v=j.deployments?.[0]?.versions?.[0]?.version_id;assert(v,'NO_VERSION_'+name);return v;
}
async function owner(p){
 const r=await fetch(host+p,{headers:{authorization:auth},cache:'no-store',signal:AbortSignal.timeout(18000)});
 assert(r.ok,'TEST_OWNER_'+p+'_'+r.status);return r.json();
}
const protectedVersions=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
const before=await version(worker);assert.equal(before,expectedVersion,'ACTIVE_TEST_DRIFT_ABORT');
const active=await cf('/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(active.main_module,'prematch-only-worker.mjs');
assert(active.modules?.length>=19,'TEST_ACTIVE_MODULES_MISSING');
const settings=await cf('/scripts/'+worker+'/settings');
const bindingNames=settings.bindings.map(x=>x.name).sort();
assert.deepEqual(bindingNames,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'BINDINGS_CHANGED');
const oldHashes={};
for(const m of active.modules){
 assert(m.content_base64&&m.name.endsWith('.mjs'),'UNKNOWN_MODULE_FORMAT');
 oldHashes[m.name]=crypto.createHash('sha256').update(Buffer.from(m.content_base64,'base64')).digest('hex');
}
for(const name of updated){
 const old=active.modules.find(x=>x.name===name);
 assert(old?.content_base64,'ACTIVE_MODULE_NOT_FOUND_'+name);
 const expected=execFileSync('git',['show',baseline+':'+dir+name],{encoding:'utf8'});
 assert.equal(Buffer.from(old.content_base64,'base64').toString('utf8'),expected,'ACTIVE_SOURCE_CONFLICT_'+name);
 execFileSync(process.execPath,['--check',dir+name],{stdio:'pipe'});
}
const next=Object.fromEntries(updated.map(n=>[n,fs.readFileSync(dir+n,'utf8')]));
assert(next['prematch-only-worker.mjs'].includes("path==='/btts-team-fallback-test'")&&
 next['btts-history-private.mjs'].includes('importBttsTeamFallback')&&
 next['prematch-only-worker.mjs'].includes("path==='/btts-history-private-test'"),
 'FALLBACK_IMPORT_MISSING');
const [ledger,HCR,history,btts]=await Promise.all([
 owner('/test-ledger'),owner('/history-cargo-registry?detail=0'),
 owner('/btts-history-private-test'),owner('/btts-shadow')]);
assert.equal(ledger.rows.length,75);assert.equal(HCR.registry.code,'HCR-V1');
assert.equal(history.mode,'BTTS_PRIVATE_HISTORY_TEST');
assert.equal(btts.mode,'READ_ONLY_BTTS_SHADOW');
const ledgerHash=crypto.createHash('sha256').update(JSON.stringify({rows:ledger.rows,stats:ledger.stats})).digest('hex');
assert.equal(await version(worker),before,'CONCURRENT_DEPLOY_ABORT');
console.log('B46_BTTS_TEAM_FALLBACK_PREFLIGHT '+JSON.stringify({
 before,updated,privateFT:history.archive.privateFT,oneX2Rows:ledger.rows.length,
 HCRFT:HCR.inventory.finishedFixtures,providerCalls:0,productionWrites:0
}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindingNames.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const code=updated.includes(m.name)?next[m.name]:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([code],{type:'application/javascript+module'}),m.name);
}
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,v;
for(let i=0;i<22;i++){
 after=await version(worker);
 try{v=await cf('/workers/'+worker+'/versions/'+after+'?include=modules');}catch(e){await new Promise(r=>setTimeout(r,1200));continue}
 if(after!==before&&updated.every(n=>{
  const m=v.modules?.find(x=>x.name===n);
  return !!m?.content_base64&&Buffer.from(m.content_base64,'base64').toString('utf8')===next[n];
 }))break;
 await new Promise(r=>setTimeout(r,1200));
}
assert.notEqual(after,before,'NO_TEST_DEPLOYMENT');
assert.equal(v.modules.length,active.modules.length,'MODULE_COUNT_CHANGED');
for(const m of active.modules){
 if(updated.includes(m.name))continue;
 const item=v.modules.find(x=>x.name===m.name);
 assert(item?.content_base64,'OTHER_MODULE_REMOVED_'+m.name);
 assert.equal(crypto.createHash('sha256').update(Buffer.from(item.content_base64,'base64')).digest('hex'),oldHashes[m.name],'UNRELATED_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindingNames);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),protectedVersions,'PROTECTED_WORKER_CHANGED');
console.log('B46_BTTS_TEAM_FALLBACK_ONLY_DEPLOYED '+JSON.stringify({
 before,after,changedOnly:updated,unchangedModules:active.modules.length-updated.length,
 oneX2Unchanged:true,HCRUnchanged:true,UIUnchanged:true,LiveUnchanged:true,
 providerCallsAdded:0,productionWrites:0
}));
