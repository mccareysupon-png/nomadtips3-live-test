// BALL46 2026-11-22: deploy existing BTTS criterion update ONLY to isolated PreMatch TEST Worker.
// Preserve Durable Object and all prior ledgers/snapshots. Re-screen real stored fixtures once.
// No 5USD calls, no 1X2/HCR/Live/Production changes and no invented fixtures/prices.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_TEST_CREDENTIALS');
const worker='ball46-prematch-only-test-20261120';
const expectedPriorVersion='81f20185-f2dc-4c37-a5f7-9453ed37acf8';
const referenceCommit='7cf43f505bbfb713b1afd08e1e860b0df44c97bc';
const dir='qa/prematch-history-20261120/';
const changed=['evaluate-btts-signal.mjs','btts-ultra-shadow.mjs',
 'btts-pick-ledger-test.mjs','btts-human-web.mjs','prematch-only-worker.mjs'];
const protectedWorkers=['ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120',
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
const cfRoot='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const ownerAuth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function cf(url,init={}){
 const resp=await fetch(cfRoot+url,{...init,headers:{authorization:'Bearer '+token,...init.headers},signal:AbortSignal.timeout(45000)});
 const data=await resp.json();
 assert(resp.ok&&data.success,'CF_REQUEST_FAILED_'+resp.status+'_'+JSON.stringify(data.errors||[]));
 return data.result;
}
async function activeVersion(name){
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const v=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(v,'NO_ACTIVE_VERSION_'+name);return v;
}
async function owner(path,method='GET'){
 const resp=await fetch(host+path,{method,headers:{authorization:ownerAuth},cache:'no-store',signal:AbortSignal.timeout(24000)});
 const body=await resp.text();
 assert(resp.ok,'TEST_OWNER_'+path+'_HTTP_'+resp.status+'_'+body.slice(0,120));
 return JSON.parse(body);
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedWorkers.map(async w=>[w,await activeVersion(w)])));
const before=await activeVersion(worker);
assert.equal(before,expectedPriorVersion,'TEST_WORKER_ACTIVE_VERSION_DRIFT_NO_DEPLOY');
const old=await cf('/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(old.main_module,'prematch-only-worker.mjs');
assert(old.modules.length>=20,'TEST_WORKER_MODULES_MISSING');
const bindings=(await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'TEST_BINDINGS_CHANGED');
const baseHashes={};
for(const m of old.modules){
 assert(m.content_base64&&m.name.endsWith('.mjs'),'UNKNOWN_MODULE_SHAPE');
 const data=Buffer.from(m.content_base64,'base64');
 baseHashes[m.name]=hash(data);
 if(changed.includes(m.name)){
  const baseline=execFileSync('git',['show',referenceCommit+':'+dir+m.name],{encoding:'utf8'});
  assert.equal(data.toString('utf8'),baseline,'UNRELATED_ACTIVE_CHANGES_'+m.name);
 }
}
for(const n of changed)assert(old.modules.some(m=>m.name===n),'MISSING_REQUIRED_MODULE_'+n);
assert(old.modules.some(m=>m.name==='prematch-stats-registry-test.mjs'),'REGISTRY_MISSING');
const next=Object.fromEntries(changed.map(n=>[n,fs.readFileSync(dir+n,'utf8')]));
for(const n of changed){
 execFileSync(process.execPath,['--check',dir+n],{stdio:'pipe'});
 assert(next[n].length>100,'SUSPICIOUSLY_EMPTY_'+n);
}
const filter=next['evaluate-btts-signal.mjs'], ultra=next['btts-ultra-shadow.mjs'],ledgerCode=next['btts-pick-ledger-test.mjs'];
assert(filter.includes('minHistory:3')&&filter.includes('minPrice:1.5,maxPrice:10')&&
 filter.includes('minEdge:0.05,minEV:0.05,minProbability:0.60'),'BTTS_CRITERIA_DRIFT');
assert(ultra.includes('minHistory:3')&&ultra.includes('home.length>=BTTS_ULTRA_TEST_POLICY.minHistory')&&
 ultra.includes('minHistory:BTTS_ULTRA_TEST_POLICY.minHistory')&&ultra.includes('publish:false,providerRequests:0'),'ULTRA_GATE_DRIFT');
assert(ledgerCode.includes('homeCount:row.homeHistory,awayCount:row.awayHistory')&&
 ledgerCode.includes('p.homeCount>=BTTS_ULTRA_TEST_POLICY.minHistory'),'LEDGER_GATE_DRIFT');
const [oneBefore,bttsBefore,registryBefore,hcrBefore,shadowBefore]=await Promise.all([
 owner('/test-ledger'),owner('/btts-history-private-test'),
 owner('/prematch-stats-registry-test?days=90'),owner('/history-cargo-registry?detail=0'),
 owner('/btts-shadow')
]);
assert(oneBefore.mode==='TEST_ONLY');
assert(registryBefore.code==='B46_PREMATCH_STATS_REGISTRY_V1');
assert(hcrBefore.registry.code==='HCR-V1');
assert(shadowBefore.policy.historyPerTeam===10);
const before1x2Hash=hash(JSON.stringify({rows:oneBefore.rows,stats:oneBefore.stats}));
const beforeHcrCount=hcrBefore.inventory.finishedFixtures;
const summary=x=>Object.fromEntries(['upcoming','historyReady','historyIncomplete','modelProbabilityReady',
 'quoteRequired','notOffered','availableQuote','qualified','staleQuotes'].map(k=>[k,x?.totals?.[k]??null]));
console.log('B46_BTTS_3TO10_BEFORE '+JSON.stringify({
 worker,version:before,oneX2:oneBefore.rows.length,privateFT:bttsBefore.archive.privateFT,
 hcrFT:beforeHcrCount,registeredBTTS:registryBefore.markets.BTTS.total,
 shadow:summary(shadowBefore),providerCalls:0,productionWrites:0
}));
assert.equal(await activeVersion(worker),before,'CONCURRENT_WORKER_UPDATE_STOP');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:old.main_module,compatibility_date:old.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(old.compatibility_flags?.length?{compatibility_flags:old.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of old.modules){
 const content=changed.includes(m.name)?next[m.name]:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([content],{type:'application/javascript+module'}),m.name);
}
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,active,match=false;
for(let i=0;i<35;i++){
 after=await activeVersion(worker);
 try{active=await cf('/workers/'+worker+'/versions/'+after+'?include=modules');}
 catch(e){if(i===34)throw e;await new Promise(r=>setTimeout(r,1500));continue;}
 match=after!==before&&changed.every(n=>{
  const mod=active.modules.find(m=>m.name===n);
  return mod?.content_base64&&Buffer.from(mod.content_base64,'base64').toString('utf8')===next[n];
 });
 if(match)break;
 await new Promise(r=>setTimeout(r,1200));
}
assert(match,'DEPLOY_NOT_VERIFIED');
assert.equal(active.modules.length,old.modules.length,'UNEXPECTED_MODULE_COUNT');
for(const mod of old.modules){
 if(changed.includes(mod.name))continue;
 const newMod=active.modules.find(x=>x.name===mod.name);
 assert(newMod?.content_base64,'UNRELATED_MODULE_MISSING_'+mod.name);
 assert.equal(hash(Buffer.from(newMod.content_base64,'base64')),baseHashes[mod.name],'UNRELATED_MODULE_CHANGED_'+mod.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async w=>[w,await activeVersion(w)]))),protectedBefore,
 'PROTECTED_WORKER_VERSION_CHANGED');
let postShadow,lastError;
for(let i=0;i<25;i++){
 try{
  postShadow=await owner('/btts-shadow');
  assert.equal(postShadow.policy.minHistory,3);
  assert.equal(postShadow.policy.minProbability,.60);
  assert.equal(postShadow.policy.minEdge,.05);
  assert.equal(postShadow.policy.minEV,.05);
  assert.equal(postShadow.policy.minPrice,1.5);
  assert.equal(postShadow.policy.maxPrice,10);
  break;
 }catch(e){lastError=e;if(i<24)await new Promise(r=>setTimeout(r,1200))}
}
assert(postShadow,'NEW_BTTS_POLICY_NOT_ACTIVE_'+String(lastError));
const cycle=await owner('/btts-cycle-test','POST');
assert.equal(cycle.mode,'BTTS_ISSUANCE_TEST_ONLY');
assert.equal(cycle.published,0);
assert.equal(cycle.providerCalls,0);
assert.equal(cycle.oneX2Modified,false);
const [oneAfter,statsAfter,hcrAfter,historyAfter,afterShadow,audit]=await Promise.all([
 owner('/test-ledger'),owner('/prematch-stats-registry-test?days=90'),
 owner('/history-cargo-registry?detail=0'),owner('/btts-history-private-test'),
 owner('/btts-shadow'),owner('/prematch-stats-registry-audit-test')
]);
assert.equal(hash(JSON.stringify({rows:oneAfter.rows,stats:oneAfter.stats})),before1x2Hash,'EXISTING_1X2_CHANGED');
assert(hcrAfter.inventory.finishedFixtures>=beforeHcrCount,'HCR_FT_LOST');
assert.equal(historyAfter.archive.privateFT,bttsBefore.archive.privateFT,'PRIVATE_FT_CHANGED');
assert.equal(statsAfter.markets['1X2'].total,oneAfter.rows.length,'STATS_1X2_COUNT_MISMATCH');
assert.equal(statsAfter.markets.TOTAL.total,statsAfter.markets['1X2'].total+statsAfter.markets.BTTS.total,'TOTAL_MISMATCH');
assert.equal(audit.verified,true,'REGISTRY_LEDGER_SNAPSHOT_MISMATCH');
assert.equal(afterShadow.policy.minHistory,3);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async w=>[w,await activeVersion(w)]))),protectedBefore,
 'PROTECTED_WORKER_CHANGED_AFTER_SCREEN');
console.log('B46_BTTS_HISTORY3TO10_RESCREEN_TEST_PASS '+JSON.stringify({
 worker,versionBefore:before,versionAfter:after,policy:afterShadow.policy,
 previous:summary(shadowBefore),current:summary(afterShadow),
 screening:cycle.trial,settled:cycle.settled,
 selections:afterShadow.decisions?.map(x=>({
  fixtureId:x.fixtureId,home:x.home,away:x.away,homeHistory:x.homeHistory,
  awayHistory:x.awayHistory,signal:x.signal,oddsYes:x.oddsYes,oddsNo:x.oddsNo
 }))||[],
 ledger:{oneX2:oneAfter.rows.length,btts:statsAfter.markets.BTTS.total,
  total:statsAfter.markets.TOTAL.total},
 registryAuditVerified:audit.verified,privateFT:historyAfter.archive.privateFT,
 hcrFT:hcrAfter.inventory.finishedFixtures,duplicateSafe:true,
 providerCallsAdded:0,published:0,productionWrites:0,untouchedModules:old.modules.length-changed.length
}));
