// Deploy exactly one changed main and one added independent BTTS module,
// only into existing Pre-Match TEST Worker. NO direct 5USD provider calls.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_TEST_DEPLOY_CREDENTIALS');
const worker='ball46-prematch-only-test-20261120';
const beforeExpected='249475a0-12ca-4373-9bae-4e83dd564f10';
const previousCommit='9dbae9d6c6c72148ad12e35807c137a3ff886972';
const main='prematch-only-worker.mjs',newModule='btts-ultra-shadow.mjs';
const dir='qa/prematch-history-20261120/';
const names=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120','ball46-prematch-performance-test-20261121'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(url,opts={}){
 const r=await fetch(url,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CLOUDFLARE_'+r.status+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
async function version(name){
 const result=await cf(root+'/scripts/'+name+'/deployments?per_page=1');
 const v=result.deployments?.[0]?.versions?.[0]?.version_id;
 assert(v,'VERSION_MISSING_'+name);return v;
}
async function owner(path){
 const r=await fetch(host+path,{headers:{authorization:auth},cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert(r.ok,'TEST_ROUTE_'+path+'_'+r.status);
 return r.json();
}
const protectedBefore=Object.fromEntries(await Promise.all(names.map(async n=>[n,await version(n)])));
const before=await version(worker);assert.equal(before,beforeExpected,'ACTIVE_PREMATCH_TEST_WORKER_DRIFT_STOP');
const active=await cf(root+'/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(active.main_module,main);
assert(active.modules?.length>=16);
assert(!active.modules.some(x=>x.name===newModule),'BTTS_MODULE_ALREADY_EXISTS');
const oldMain=active.modules.find(x=>x.name===main);
assert(oldMain?.content_base64);
const previousSource=execFileSync('git',['show',previousCommit+':'+dir+main],{encoding:'utf8'});
assert.equal(Buffer.from(oldMain.content_base64,'base64').toString('utf8'),previousSource,'ACTIVE_MAIN_SOURCE_DRIFT');
const beforeHash=Object.fromEntries(active.modules.map(x=>[x.name,crypto.createHash('sha256').update(Buffer.from(x.content_base64,'base64')).digest('hex')]));
const settings=await cf(root+'/scripts/'+worker+'/settings');
const bindings=settings.bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'TEST_BINDINGS_UNEXPECTED');
const [hcr,cargo,health,league,ledger]=await Promise.all([
 owner('/history-cargo-registry?detail=0'),owner('/history-cargo-full'),
 owner('/health'),owner('/league-name-audit'),owner('/test-ledger')
]);
assert.equal(hcr.registry.code,'HCR-V1');
assert.equal(cargo.registry,'HISTORY-CARGO-FULL-V1');
assert.equal(league.code,'PREMATCH_LEAGUE_ID_CATALOG_V1');
assert.equal(health.providerCalls,0);
const nextMain=fs.readFileSync(dir+main,'utf8'),nextBtts=fs.readFileSync(dir+newModule,'utf8');
for(const x of [main,newModule])execFileSync(process.execPath,['--check',dir+x]);
assert(nextMain.includes("path==='/btts-shadow'")&&nextMain.includes("path==='/btts-quote-import-test'")&&
 nextBtts.includes('historyPerTeam:10')&&nextBtts.includes('source:\'BET365_ONLY\''),
 'MISSING_BTTS_TEST_GATES');
assert.equal(await version(worker),before,'CONCURRENT_PREMATCH_DEPLOY_ABORT');
console.log('B46_BTTS_ULTRA_PREFLIGHT '+JSON.stringify({worker,before,historyFT:hcr.inventory.finishedFixtures,
 locked1x2Rows:ledger.rows.length,leagueRegistryCount:league.catalogLeagues,providerCalls:0,productionWrites:0}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const bytes=m.name===main?nextMain:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([bytes],{type:'application/javascript+module'}),m.name);
}
form.append(newModule,new Blob([nextBtts],{type:'application/javascript+module'}),newModule);
await cf(root+'/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after=null,latest;
for(let i=0;i<30;i++){
 after=await version(worker);
 latest=await cf(root+'/workers/'+worker+'/versions/'+after+'?include=modules');
 const newMain=latest.modules?.find(x=>x.name===main),btts=latest.modules?.find(x=>x.name===newModule);
 if(after!==before&&newMain?.content_base64&&btts?.content_base64&&
 Buffer.from(newMain.content_base64,'base64').toString('utf8')===nextMain&&
 Buffer.from(btts.content_base64,'base64').toString('utf8')===nextBtts)break;
 await new Promise(resolve=>setTimeout(resolve,1200));
}
assert.notEqual(after,before,'NO_TEST_NEW_VERSION');
assert.equal(latest.modules.length,active.modules.length+1,'BTTS_MODULE_COUNT_MISMATCH');
for(const mod of active.modules){
 if(mod.name===main)continue;
 const newer=latest.modules.find(x=>x.name===mod.name);
 assert(newer?.content_base64,'OTHER_MODULE_MISSING_'+mod.name);
 const sha=crypto.createHash('sha256').update(Buffer.from(newer.content_base64,'base64')).digest('hex');
 assert.equal(sha,beforeHash[mod.name],'OTHER_MODULE_CHANGED_'+mod.name);
}
let status;
for(let i=0;i<30;i++){
 try{status=await owner('/btts-shadow');assert.equal(status.mode,'READ_ONLY_BTTS_SHADOW');break}
 catch(e){if(i===29)throw e;await new Promise(resolve=>setTimeout(resolve,1500))}
}
assert.equal(status.policy.historyPerTeam,10);
assert.equal(status.policy.source,'BET365_ONLY');
assert.equal(status.published,0);
assert.equal(status.providerCalls,0);
const [newHcr,newCargo,newLeague,newHealth,newSettings]=await Promise.all([
 owner('/history-cargo-registry?detail=0'),owner('/history-cargo-full'),
 owner('/league-name-audit'),owner('/health'),cf(root+'/scripts/'+worker+'/settings')
]);
assert.equal(newHcr.registry.code,'HCR-V1');assert.equal(newCargo.registry,'HISTORY-CARGO-FULL-V1');
assert.equal(newLeague.code,'PREMATCH_LEAGUE_ID_CATALOG_V1');
assert(newHcr.inventory.finishedFixtures>=hcr.inventory.finishedFixtures);
assert.deepEqual(newSettings.bindings.map(x=>x.name).sort(),bindings);
assert.deepEqual(Object.fromEntries(await Promise.all(names.map(async n=>[n,await version(n)]))),protectedBefore,'PROTECTED_VERSION_CHANGED');
console.log('B46_BTTS_ULTRA_TEST_DEPLOY_VERIFIED '+JSON.stringify({
 worker,before,after,added:newModule,modified:main,untouchedModules:active.modules.length-1,
 historyFT:newHcr.inventory.finishedFixtures,locked1x2Rows:ledger.rows.length,
 leagueNames:newLeague.named,leagueCatalog:newLeague.catalogLeagues,
 btts:status.totals,bttsQuotes:status.storedBet365QuoteRecords,bttsCandidates:status.candidates.length,
 bttsQualified:status.decisions.length,providerCallsAdded:0,published:0,productionWrites:0,
 unchanged1X2:true,HCRUnchanged:true,protectedWorkersUnchanged:true
}));
