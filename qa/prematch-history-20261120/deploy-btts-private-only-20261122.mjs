// Existing TEST PreMatch Worker ONLY: add a private BTTS history source, keep
// UI, 1X2 formulas/picks, HCR, HUB, Live, stats and PROD byte-identical.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_CF_CREDENTIALS');
const name='ball46-prematch-only-test-20261120';
const expectedBefore='2639806c-69e0-45b1-b815-18d153a01d46';
const previousRef='b4c6fb48dcd98ad9cd0347fcd757c3a60003ca8e';
const dir='qa/prematch-history-20261120/';
const modified=['prematch-only-worker.mjs','btts-ultra-shadow.mjs'];
const added='btts-history-private.mjs';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','ball46-prematch-ui-test-v5-20261120'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+name+'.mccarey-supon.workers.dev';
const ownerAuth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+r.status+'_'+JSON.stringify(j.errors||[]));return j.result;
}
async function ver(n){
 const z=await cf('/scripts/'+n+'/deployments?per_page=1');
 const id=z.deployments?.[0]?.versions?.[0]?.version_id;assert(id,'NO_VERSION_'+n);return id;
}
async function own(p){
 const r=await fetch(host+p,{headers:{authorization:ownerAuth},cache:'no-store',signal:AbortSignal.timeout(20000)});
 assert(r.ok,'OWNER_'+p+'_'+r.status);return r.json();
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await ver(n)])));
const before=await ver(name);
assert.equal(before,expectedBefore,'ACTIVE_TEST_CHANGED_STOP');
const active=await cf('/workers/'+name+'/versions/'+before+'?include=modules');
assert.equal(active.main_module,'prematch-only-worker.mjs');
assert(active.modules?.length>=18,'EXPECTED_ISOLATED_TEST_MODULES_MISSING');
assert(!active.modules.some(x=>x.name===added),'PRIVATE_BTTS_MODULE_ALREADY_EXISTS');
const bind=(await cf('/scripts/'+name+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bind,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'BINDINGS_DRIFT');
const oldHash={};
for(const m of active.modules){
 assert(m.name.endsWith('.mjs')&&m.content_base64,'UNKNOWN_SCRIPT_FORMAT');
 oldHash[m.name]=crypto.createHash('sha256').update(Buffer.from(m.content_base64,'base64')).digest('hex');
}
for(const m of modified){
 const old=active.modules.find(x=>x.name===m);
 assert(old?.content_base64,'CURRENT_MODULE_MISSING_'+m);
 const expected=execFileSync('git',['show',previousRef+':'+dir+m],{encoding:'utf8'});
 assert.equal(Buffer.from(old.content_base64,'base64').toString('utf8'),expected,'ACTIVE_UNRELATED_DRIFT_'+m);
}
for(const m of [...modified,added])execFileSync(process.execPath,['--check',dir+m],{stdio:'pipe'});
const next=Object.fromEntries([...modified,added].map(n=>[n,fs.readFileSync(dir+n,'utf8')]));
assert(next['prematch-only-worker.mjs'].includes("path==='/btts-history-import-test'")&&
 next['btts-ultra-shadow.mjs'].includes('bttsLastMatches')&&
 next[added].includes('btts_history_private_test'),'MISSING_BTTS_PRIVATE_ONLY_CODE');
const [ledger,hcr,full,btts,league]=await Promise.all([
 own('/test-ledger'),own('/history-cargo-registry?detail=0'),own('/history-cargo-full'),
 own('/btts-shadow'),own('/league-name-audit')]);
assert.equal(ledger.mode,'TEST_ONLY');assert.equal(hcr.registry.code,'HCR-V1');
assert.equal(full.registry,'HISTORY-CARGO-FULL-V1');assert.equal(btts.mode,'READ_ONLY_BTTS_SHADOW');
const frozenLedger=JSON.stringify({rows:ledger.rows,stats:ledger.stats});
console.log('B46_BTTS_BACKEND_ONLY_PREPARE '+JSON.stringify({
 before,activeModules:active.modules.length,FT:hcr.inventory.finishedFixtures,
 1X2LedgerRows:ledger.rows.length,bttsBefore:btts.totals,providerCalls:0,productionWrites:0
}));
assert.equal(await ver(name),before,'CONCURRENT_TEST_CHANGE_ABORT');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bind.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const val=modified.includes(m.name)?next[m.name]:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([val],{type:'application/javascript+module'}),m.name);
}
form.append(added,new Blob([next[added]],{type:'application/javascript+module'}),added);
await cf('/scripts/'+name+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,v;
for(let i=0;i<30;i++){
 after=await ver(name);
 v=await cf('/workers/'+name+'/versions/'+after+'?include=modules');
 if(after!==before&&[...modified,added].every(n=>{
  const m=v.modules?.find(x=>x.name===n);
  return m?.content_base64&&Buffer.from(m.content_base64,'base64').toString('utf8')===next[n];
 }))break;
 await new Promise(resolve=>setTimeout(resolve,1100));
}
assert.notEqual(after,before,'NO_BTTS_TEST_VERSION_CHANGE');
assert.equal(v.modules.length,active.modules.length+1,'UNEXPECTED_MODULE_COUNT');
for(const m of active.modules){
 if(modified.includes(m.name))continue;
 const mm=v.modules.find(x=>x.name===m.name);
 assert(mm?.content_base64,'UNRELATED_MODULE_REMOVED_'+m.name);
 assert.equal(crypto.createHash('sha256').update(Buffer.from(mm.content_base64,'base64')).digest('hex'),oldHash[m.name],'UNRELATED_MODULE_CHANGED_'+m.name);
}
const bindAfter=(await cf('/scripts/'+name+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bindAfter,bind,'TEST_BINDINGS_CHANGED');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await ver(n)]))),protectedBefore,'PROTECTED_WORKER_CHANGED');
console.log('B46_BTTS_BACKEND_ONLY_DEPLOYED '+JSON.stringify({
 worker:name,before,after,modified,added,unchangedModules:active.modules.length-modified.length,
 protectedWorkersUnchanged:true,old1X2Rows:ledger.rows.length,oldFT:hcr.inventory.finishedFixtures,
 providerCallsAdded:0,productionWrites:0
}));
