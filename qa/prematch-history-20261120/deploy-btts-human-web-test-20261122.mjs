// Deploy only BTTS human UI into isolated PreMatch TEST, no production writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_DEPLOY_CREDENTIALS');
const worker='ball46-prematch-only-test-20261120';
const expected='e8631bb6-a6c2-4315-8e2a-7db7ba195305';
const baseline='a3be586fc3f24632d45e946df7ebf67358a88eec';
const folder='qa/prematch-history-20261120/';
const modified=['prematch-only-worker.mjs','btts-ultra-shadow.mjs'];
const added='btts-human-web.mjs';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120','ball46-prematch-performance-test-20261121'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(url,options={}){
 const resp=await fetch(url,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(45000)});
 const json=await resp.json();assert(resp.ok&&json.success,'CF_'+resp.status+'_'+JSON.stringify(json.errors||[]));return json.result;
}
async function version(name){
 const d=await cf(root+'/scripts/'+name+'/deployments?per_page=1');
 const id=d.deployments?.[0]?.versions?.[0]?.version_id;assert(id,'NO_VERSION_'+name);return id;
}
async function owner(path){
 const r=await fetch(host+path,{headers:{authorization:auth},cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert(r.ok,'TEST_ADMIN_'+path+'_'+r.status);return r.json();
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
const before=await version(worker);assert.equal(before,expected,'TEST_WORKER_VERSION_CHANGED_ABORT');
const current=await cf(root+'/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(current.main_module,'prematch-only-worker.mjs');
assert(current.modules?.length>=17,'TEST_MODULES_MISSING');
assert(!current.modules.some(x=>x.name===added),'UI_MODULE_ALREADY_EXISTS');
const settings=await cf(root+'/scripts/'+worker+'/settings');
const bindings=settings.bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'BINDINGS_DRIFT');
const oldHash={};
for(const m of current.modules){
 assert(m.name.endsWith('.mjs')&&m.content_base64,'UNEXPECTED_TEST_MODULE');
 oldHash[m.name]=crypto.createHash('sha256').update(Buffer.from(m.content_base64,'base64')).digest('hex');
}
for(const name of modified){
 const actual=current.modules.find(x=>x.name===name);
 const expectedSource=execFileSync('git',['show',baseline+':'+folder+name],{encoding:'utf8'});
 assert.equal(Buffer.from(actual.content_base64,'base64').toString('utf8'),expectedSource,'ACTIVE_CODE_DRIFT_'+name);
}
for(const name of [...modified,added])execFileSync(process.execPath,['--check',folder+name],{stdio:'pipe'});
const next=Object.fromEntries([...modified,added].map(name=>[name,fs.readFileSync(folder+name,'utf8')]));
assert(next['prematch-only-worker.mjs'].includes("p==='/btts'")&&
 next['prematch-only-worker.mjs'].includes("path==='/btts-preview-data'")&&
 next[added].includes('Search team, league or fixture ID')&&
 next['btts-ultra-shadow.mjs'].includes('preview={page:'),
 'VISIBLE_TEST_UI_NOT_PRESENT');
const [beforeHcr,beforeFull,beforeLedger,beforeBtts,beforeLeague]=await Promise.all([
 owner('/history-cargo-registry?detail=0'),owner('/history-cargo-full'),
 owner('/test-ledger'),owner('/btts-shadow'),owner('/league-name-audit')
]);
assert.equal(beforeHcr.registry.code,'HCR-V1');assert.equal(beforeFull.registry,'HISTORY-CARGO-FULL-V1');
assert.equal(beforeBtts.mode,'READ_ONLY_BTTS_SHADOW');assert.equal(beforeLeague.code,'PREMATCH_LEAGUE_ID_CATALOG_V1');
const ledgerStats=JSON.stringify(beforeLedger.stats);
const ledgerRows=JSON.stringify(beforeLedger.rows);
assert.equal(await version(worker),before,'CONCURRENT_TEST_DEPLOY_ABORT');
console.log('B46_BTTS_HUMAN_UI_PREPARE '+JSON.stringify({worker,before,existingFixtures:beforeBtts.totals.upcoming,locked1x2Rows:beforeLedger.rows.length,hcrFT:beforeHcr.inventory.finishedFixtures,providerCalls:0,productionWrites:0}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:current.main_module,compatibility_date:current.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(current.compatibility_flags?.length?{compatibility_flags:current.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of current.modules){
 const bytes=modified.includes(m.name)?next[m.name]:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([bytes],{type:'application/javascript+module'}),m.name);
}
form.append(added,new Blob([next[added]],{type:'application/javascript+module'}),added);
await cf(root+'/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,latest;
for(let i=0;i<25;i++){
 after=await version(worker);
 latest=await cf(root+'/workers/'+worker+'/versions/'+after+'?include=modules');
 if(after!==before&&[...modified,added].every(name=>{
  const m=latest.modules?.find(x=>x.name===name);
  return m?.content_base64&&Buffer.from(m.content_base64,'base64').toString('utf8')===next[name];
 }))break;
 await new Promise(r=>setTimeout(r,1000));
}
assert.notEqual(after,before,'NO_NEW_UI_DEPLOYMENT');
assert.equal(latest.modules.length,current.modules.length+1,'UNEXPECTED_MODULE_COUNT');
for(const m of current.modules){
 if(modified.includes(m.name))continue;
 const v=latest.modules.find(x=>x.name===m.name);
 assert(v?.content_base64,'UNTOUCHED_MODULE_LOST_'+m.name);
 assert.equal(crypto.createHash('sha256').update(Buffer.from(v.content_base64,'base64')).digest('hex'),oldHash[m.name],'OTHER_MODULE_CHANGED_'+m.name);
}
const afterBindings=(await cf(root+'/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(afterBindings,bindings);
const [afterHcr,afterFull,afterLedger,afterLeague]=await Promise.all([
 owner('/history-cargo-registry?detail=0'),owner('/history-cargo-full'),
 owner('/test-ledger'),owner('/league-name-audit')
]);
assert.equal(afterHcr.registry.code,'HCR-V1');assert.equal(afterFull.registry,'HISTORY-CARGO-FULL-V1');
assert(afterHcr.inventory.finishedFixtures>=beforeHcr.inventory.finishedFixtures);
assert.equal(JSON.stringify(afterLedger.rows),ledgerRows,'1X2_LEDGER_ROWS_MODIFIED');
assert.equal(JSON.stringify(afterLedger.stats),ledgerStats,'1X2_LEDGER_STATS_MODIFIED');
assert.equal(afterLeague.code,'PREMATCH_LEAGUE_ID_CATALOG_V1');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),protectedBefore,'PROTECTED_WORKER_CHANGED');
console.log('B46_BTTS_HUMAN_UI_DEPLOYED '+JSON.stringify({worker,before,after,
 publicPage:host+'/btts',changedModules:modified,addedModule:added,
 unchangedModules:current.modules.length-modified.length,ledgerRows:afterLedger.rows.length,
 archivedFT:afterHcr.inventory.finishedFixtures,published:0,
 providerCallsAdded:0,productionWrites:0,protectedWorkersUnchanged:true}));
