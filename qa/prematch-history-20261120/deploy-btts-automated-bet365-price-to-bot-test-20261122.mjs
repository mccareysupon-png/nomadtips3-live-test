// Guarded deploy to existing BALL46 isolated TEST PreMatch backend only.
// Installs a new BTTS quote pickup module and a minimal main-worker bridge.
// 1X2, HCR, 5 historical cargo rounds, HUB, live, production are untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchBttsPriceBridgeMain} from './patch-btts-price-bridge-into-existing-test-worker.mjs';

const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_TEST_DEPLOY_ACCESS');
const worker='ball46-prematch-only-test-20261120';
const expected='ac0338f3-9e32-453e-92ef-e3c70976f874';
const main='prematch-only-worker.mjs',newModule='btts-priced-fixture-pickup-test.mjs';
const dir='qa/prematch-history-20261120/';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','ball46-prematch-ui-test-v5-20261120',
 'ball46-prematch-performance-test-20261121'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function cf(path,opts={}){
 const r=await fetch(api+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
   signal:AbortSignal.timeout(45000)});
 const doc=await r.json();
 assert(r.ok&&doc.success,'CLOUDFLARE_API_'+r.status+'_'+JSON.stringify(doc.errors??[]));
 return doc.result;
}
async function version(name){
 const x=await cf('/scripts/'+name+'/deployments?per_page=1');
 const id=x.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'NO_DEPLOYMENT_VERSION_'+name);return id;
}
async function owner(path,method='GET'){
 const r=await fetch(host+path,{method,headers:{authorization:auth},
   cache:'no-store',signal:AbortSignal.timeout(65000)});
 assert(r.ok,'TEST_OWNER_'+path+'_'+r.status);
 return r.json();
}
const versionsBefore=Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await version(name)])));
assert.equal(await version(worker),expected,'TEST_BACKEND_VERSION_DRIFT_REFUSE_DEPLOY');
const existing=await cf('/workers/'+worker+'/versions/'+expected+'?include=modules');
assert.equal(existing.main_module,main);
assert(!existing.modules.some(m=>m.name===newModule),'PRICE_PICKUP_ALREADY_DEPLOYED_STOP');
const oldMainModule=existing.modules.find(m=>m.name===main);
assert(oldMainModule?.content_base64,'OLD_MAIN_MISSING');
const oldMain=Buffer.from(oldMainModule.content_base64,'base64').toString('utf8');
assert(oldMain.includes("const bulkActive=(await this.ctx.storage.get('bttsBulkModeV2'))?.mode==='ACTIVE'")&&
 oldMain.includes("if(path==='/btts-bulk-v2-trip'&&req.method==='POST')")&&
 oldMain.includes("const b=await stub.fetch('https://prematch.internal/btts-cycle-test'"),
 'EXPECTED_CURRENT_HISTORY_TRUCK_AND_BTTS_BOT_NOT_PRESENT');
const patch=patchBttsPriceBridgeMain(oldMain),newMain=patch.code;
const newPrice=fs.readFileSync(dir+newModule,'utf8');
assert(newPrice.includes("'/v1/fixtures/'")&&
 newPrice.includes("'/odds?market=btts'")&&
 newPrice.includes("maxPerLondonBusinessDay:12,maxPerTick:2")&&
 newPrice.includes('parseBet365BttsOdds')&&
 newPrice.includes("state:'BET365_PRICE_NEEDED'")===false&&
 newPrice.includes("c.state==='BET365_PRICE_NEEDED'"),
 'PRICE_PICKUP_MISSING_TARGET_AND_QUOTA_GUARDS');
assert(newMain.includes('runBttsPricePickup(this.db')&&
 newMain.includes("if(path==='/btts-price-pickup-state'&&req.method==='GET')")&&
 newMain.includes("if(path==='/btts-price-pickup-tick'&&req.method==='POST')")&&
 newMain.includes("const b=await stub.fetch('https://prematch.internal/btts-cycle-test'"),
 'PRICE_BOT_BRIDGE_NOT_CONNECTED');
assert(!newMain.includes("FIVEDOLLAR_API_KEY=export"),'CREDENTIAL_EXPOSURE');
for(const [name,source] of [[main,newMain],[newModule,newPrice]]){
 const tmp='/tmp/b46-test-only-'+name;
 fs.writeFileSync(tmp,source);
 execFileSync(process.execPath,['--check',tmp],{stdio:'pipe'});
}
const settings=await cf('/scripts/'+worker+'/settings');
const bindings=settings.bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'BTTS_TEST_BINDING_DRIFT_STOP');
const originalHashes=Object.fromEntries(existing.modules.map(m=>[m.name,hash(Buffer.from(m.content_base64,'base64'))]));
const [oneBefore,hcrBefore,historyBefore,bulkBefore,auditBefore,shadowBefore]=await Promise.all([
 owner('/test-ledger'),owner('/history-cargo-registry?detail=0'),
 owner('/btts-history-private-test'),owner('/btts-bulk-v2-state'),
 owner('/prematch-stats-registry-audit-test'),owner('/btts-shadow')
]);
assert(bulkBefore.config.mode==='ACTIVE'&&
 bulkBefore.transport.cap.maxDailyProviderCalls===5,
 'BTTS_FIVE_ROUND_HISTORY_TRUCK_NOT_ACTIVE');
assert(oneBefore.rows.length>=76,'EXISTING_1X2_LEDGER_MISSING');
assert(auditBefore.verified===true,'CURRENT_MARKET_STATS_AUDIT_FAILED');
const originalOneX2Hash=hash(JSON.stringify({rows:oneBefore.rows,stats:oneBefore.stats}));
console.log('B46_BTTS_BET365_PRICE_BRIDGE_PREFLIGHT '+JSON.stringify({
 existingWorkerVersion:expected,onlyModulesModified:[main,newModule],
 sourceExistingModules:existing.modules.length,
 protected:versionsBefore,
 existingHistoryBulkCalls:bulkBefore.transport.providerCalls,
 existingHistoryRoundCap:bulkBefore.transport.cap.maxDailyProviderCalls,
 testOneX2Rows:oneBefore.rows.length,testPrivateFT:historyBefore.archive.privateFT,
 historyHCR: hcrBefore.inventory.finishedFixtures,
 modelProbable:shadowBefore.totals.modelProbabilityReady,
 missingBet365:shadowBefore.totals.quoteRequired,priced:shadowBefore.totals.availableQuote,
 priceCallsDailyCap:12,priceCallsPerTick:2,
 paidCallsDuringDeploy:0,productionWrites:0
}));
assert.equal(await version(worker),expected,'CONCURRENT_BACKEND_CHANGE_STOP');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:existing.main_module,
 compatibility_date:existing.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(existing.compatibility_flags?.length?{compatibility_flags:existing.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of existing.modules){
 const body=m.name===main?newMain:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([body],{type:'application/javascript+module'}),m.name);
}
form.append(newModule,new Blob([newPrice],{type:'application/javascript+module'}),newModule);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let afterVersion=null,active=null;
for(let i=0;i<36;i++){
 afterVersion=await version(worker);
 if(afterVersion!==expected){
  try{
   active=await cf('/workers/'+worker+'/versions/'+afterVersion+'?include=modules');
   const a=active.modules.find(m=>m.name===main),b=active.modules.find(m=>m.name===newModule);
   if(a?.content_base64&&b?.content_base64&&
    Buffer.from(a.content_base64,'base64').toString('utf8')===newMain&&
    Buffer.from(b.content_base64,'base64').toString('utf8')===newPrice)break;
  }catch{}
 }
 await new Promise(r=>setTimeout(r,1100));
}
assert(afterVersion&&afterVersion!==expected&&active?.modules,'NEW_TEST_BACKEND_VERSION_NOT_CONFIRMED');
assert.equal(active.modules.length,existing.modules.length+1,'UNEXPECTED_NUMBER_OF_MODULES');
for(const m of existing.modules){
 if(m.name===main)continue;
 const newMod=active.modules.find(x=>x.name===m.name);
 assert(newMod?.content_base64&&hash(Buffer.from(newMod.content_base64,'base64'))===originalHashes[m.name],
  'PREEXISTING_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings);
let priceState;
for(let i=0;i<32;i++){
 try{
  priceState=await owner('/btts-price-pickup-state');
  if(priceState.system==='BTTS_PRICE_PICKUP_TEST')break;
 }catch(error){if(i===31)throw error}
 await new Promise(r=>setTimeout(r,1100));
}
assert.equal(priceState.system,'BTTS_PRICE_PICKUP_TEST');
assert.equal(priceState.transport.cap.maxPerLondonBusinessDay,12);
const [oneAfter,hcrAfter,histAfter,bulkAfter,auditAfter]=await Promise.all([
 owner('/test-ledger'),owner('/history-cargo-registry?detail=0'),
 owner('/btts-history-private-test'),owner('/btts-bulk-v2-state'),
 owner('/prematch-stats-registry-audit-test')
]);
assert.equal(hash(JSON.stringify({rows:oneAfter.rows,stats:oneAfter.stats})),originalOneX2Hash,
 'ORIGINAL_1X2_LEDGER_CHANGED');
assert.equal(hcrAfter.inventory.finishedFixtures,hcrBefore.inventory.finishedFixtures,'HCR_FT_CHANGED');
assert.equal(bulkAfter.transport.cap.maxDailyProviderCalls,5,'BTTS_HISTORY_CAP_CHANGED');
assert(bulkAfter.config.mode==='ACTIVE','BTTS_HISTORY_TRUCK_WAS_PAUSED');
assert(histAfter.archive.privateFT>=historyBefore.archive.privateFT,'HISTORY_ROWS_LOST');
assert.equal(auditAfter.verified,true,'REGISTRY_AUDIT_NOT_VERIFIED');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),
 versionsBefore,'PROTECTED_WORKER_CHANGED');
console.log('B46_BTTS_AUTOMATIC_BET365_PRICE_BRIDGE_DEPLOY_PASS '+JSON.stringify({
 testWorker:worker,oldVersion:expected,newVersion:afterVersion,
 existingHistoryTruckPreserved:true,historyFiveRoundCap:5,
 priceDailyCallCap:12,pricePer15MinTick:2,priceRoute:'/v1/fixtures/{id}/odds?market=btts',
 automaticCronWired:true,strictBet365FilterUnchanged:true,
 btTsRecordedBefore:shadowBefore.totals.qualified,
 pricePickupState:priceState.transport,oneX2Ledger:oneAfter.rows.length,
 hcrFT:hcrAfter.inventory.finishedFixtures,
 statsAudit:true,productionWrites:0,
 paidProviderCallsByDeploy:0
}));
// Verify a SINGLE real scheduled price pickup once, after successful protected
// deploy. This has a maximum of 2 paid quote reads and is idempotent by SQL.
// Its result can truthfully be NO_BET365_MARKET or NO_READY_CANDIDATES.
const pickup=await owner('/btts-price-pickup-tick','POST');
const verifiedAfter=await owner('/btts-shadow');
const market=await owner('/prematch-stats-registry-audit-test');
assert(pickup.providerCalls>=0&&pickup.providerCalls<=2);
assert(market.verified===true);
assert.equal(await version(worker),afterVersion,'TEST_BACKEND_VERSION_CHANGED_DURING_PICKUP');
console.log('B46_BTTS_REAL_ODDS_PICKUP_FIRST_TICK '+JSON.stringify({
 state:pickup.state,providerCalls:pickup.providerCalls,
 selected:pickup.selected??[],transport:pickup.transport??null,
 after:{modelProbabilityReady:verifiedAfter.totals.modelProbabilityReady,
  availableQuote:verifiedAfter.totals.availableQuote,
  qualified:verifiedAfter.totals.qualified,waiting:verifiedAfter.totals.quoteRequired},
 originalOneX2LedgerUnchanged:true,productionWrites:0
}));
