// Restore metadata-only endpoint in isolated Pre-Match TEST. Guard active module
// versions, frozen prediction ledger, other Workers and API quota. No provider call.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_DEPLOY_CREDENTIALS');
const worker='ball46-prematch-only-test-20261120';
const previousVersion='26d1046f-2ce5-453b-b6c7-6cec93db1868';
const baseline='8247d6df293929ba41cb41210e56d244b8bdf604';
const changed=['league-name-cache.mjs','prematch-only-worker.mjs'];
const dir='qa/prematch-history-20261120/';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120','ball46-prematch-performance-test-20261121'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const owner='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(url,opts={}){
 const r=await fetch(url,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_FAILED_'+r.status+'_'+JSON.stringify(j.errors||[]));return j.result;
}
async function version(name){
 const j=await cf(root+'/scripts/'+name+'/deployments?per_page=1');
 return j.deployments?.[0]?.versions?.[0]?.version_id;
}
async function get(path){
 const r=await fetch(host+path,{headers:{authorization:owner},cache:'no-store',signal:AbortSignal.timeout(16000)});
 assert(r.ok,'TEST_ADMIN_'+path+'_'+r.status);return r.json();
}
const before=await version(worker);assert.equal(before,previousVersion,'TEST_ACTIVE_DRIFT_ABORT');
const guarded=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
const current=await cf(root+'/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(current.main_module,'prematch-only-worker.mjs');
assert(current.modules?.length===16,'MODULE_COUNT_DRIFT');
const prior={};
for(const m of current.modules){
 assert(m.content_base64,'MODULE_MISSING_BYTES_'+m.name);
 prior[m.name]=crypto.createHash('sha256').update(Buffer.from(m.content_base64,'base64')).digest('hex');
}
const next=Object.fromEntries(changed.map(name=>[name,fs.readFileSync(dir+name,'utf8')]));
for(const name of changed){
 const existing=current.modules.find(m=>m.name===name);
 assert(existing,'MISSING_ACTIVE_'+name);
 const expected=execFileSync('git',['show',baseline+':'+dir+name],{encoding:'utf8'});
 assert.equal(Buffer.from(existing.content_base64,'base64').toString('utf8'),expected,'ACTIVE_CODE_DRIFT_'+name);
 execFileSync(process.execPath,['--check',dir+name],{stdio:'pipe'});
}
assert(next['prematch-only-worker.mjs'].includes("path==='/league-restore'")&&next['league-name-cache.mjs'].includes('restoreLeagueNamesFromOriginalRows'),'RESTORE_MISSING');
const settings=await cf(root+'/scripts/'+worker+'/settings');
const names=settings.bindings.map(x=>x.name).sort();
assert.deepEqual(names,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE']);
const health=await get('/health'),hcr=await get('/history-cargo-registry?detail=0'),cargo=await get('/history-cargo-full');
const ledger=await get('/test-ledger');
assert.equal(hcr.registry.code,'HCR-V1');
assert.equal(cargo.registry,'HISTORY-CARGO-FULL-V1');
assert.equal(health.providerCalls,0);
const ledgerFingerprint=crypto.createHash('sha256').update(JSON.stringify(ledger.rows)).digest('hex');
assert.equal(await version(worker),before,'CONCURRENT_TEST_DEPLOY_ABORT');
console.log('LEAGUE_RESTORE_PREPARE '+JSON.stringify({worker,before,changed,ledgerRows:ledger.rows.length,ft:hcr.inventory.finishedFixtures,providerCalls:0}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:current.main_module,
 compatibility_date:current.compatibility_date||'2026-11-20',
 bindings:names.map(name=>({name,type:'inherit'})),
 ...(current.compatibility_flags?.length?{compatibility_flags:current.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of current.modules){
 const bytes=changed.includes(m.name)?next[m.name]:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([bytes],{type:'application/javascript+module'}),m.name);
}
await cf(root+'/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,active;
for(let i=0;i<30;i++){
 after=await version(worker);
 active=await cf(root+'/workers/'+worker+'/versions/'+after+'?include=modules');
 if(after!==before&&changed.every(name=>{
  const mod=active.modules.find(x=>x.name===name);
  return !!mod?.content_base64&&Buffer.from(mod.content_base64,'base64').toString('utf8')===next[name];
 }))break;
 await new Promise(r=>setTimeout(r,1000));
}
assert.notEqual(after,before,'TEST_VERSION_UNCHANGED');
assert.equal(active.modules.length,current.modules.length);
for(const mod of current.modules){
 if(changed.includes(mod.name))continue;
 const found=active.modules.find(m=>m.name===mod.name);
 assert(found?.content_base64,'OTHER_MODULE_MISSING_'+mod.name);
 const hash=crypto.createHash('sha256').update(Buffer.from(found.content_base64,'base64')).digest('hex');
 assert.equal(hash,prior[mod.name],'OTHER_MODULE_CHANGED_'+mod.name);
}
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),guarded,'PROTECTED_WORKER_CHANGED');
const settingsAfter=await cf(root+'/scripts/'+worker+'/settings');
assert.deepEqual(settingsAfter.bindings.map(x=>x.name).sort(),names);
const newLedger=await get('/test-ledger'),newHCR=await get('/history-cargo-registry?detail=0');
assert.equal(crypto.createHash('sha256').update(JSON.stringify(newLedger.rows)).digest('hex'),ledgerFingerprint,'PICK_LEDGER_CHANGED');
assert(newHCR.inventory.finishedFixtures>=hcr.inventory.finishedFixtures,'FT_ARCHIVE_SHRANK');
assert.equal(newHCR.registry.code,'HCR-V1');
console.log('LEAGUE_RESTORE_DEPLOYED_VERSION '+JSON.stringify({worker,before,after,
 modified:changed,untouchedModules:current.modules.length-changed.length,
 ledgerRows:newLedger.rows.length,finishedFT:newHCR.inventory.finishedFixtures,
 originalLedgerUnchanged:true,providerCallsAdded:0,protectedWorkersUnchanged:true}));
