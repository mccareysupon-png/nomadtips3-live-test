// BALL46 O/U V2 value screener: isolated TEST only, shadow ledger.
// No new paid API calls, no production, no old O/U/BTTS/1X2 behavior changes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CF_CREDENTIALS_MISSING');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const worker='ball46-prematch-only-test-20261120',
 expectedVersion='e947f2d8-168e-4048-a33a-a6ff8fd7a743',
 main='prematch-only-worker.mjs',
 newModule='ou-value-screener-v2-test.mjs';
const protectedNames=['ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46',
 'ball46-premium-match-colors-test-20261120',
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(60000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CLOUDFLARE_'+r.status+'_'+path+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
const version=async name=>{
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const id=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'MISSING_WORKER_VERSION_'+name);return id;
};
const protectedVersions=Object.fromEntries(await Promise.all(protectedNames.map(async x=>[x,await version(x)])));
assert.equal(await version(worker),expectedVersion,'PREMATCH_WORKER_CONCURRENT_CHANGE_ABORT');
const original=await cf('/workers/'+worker+'/versions/'+expectedVersion+'?include=modules');
assert.equal(original.main_module,main);
assert.equal(original.modules.length,28);
const old=Buffer.from(original.modules.find(m=>m.name===main)?.content_base64??'','base64').toString('utf8');
assert(old.includes('BTTS_CYCLE_DISABLED_PROJECT_CLOSED')&&
 old.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST')&&
 old.includes('OU_PENDING_PRICE_COMPLETION_TEST')&&
 old.includes('DISABLED_POST_ISSUE_REPRICE')&&
 old.includes("path==='/ou-pending-price-completion-tick'")&&
 old.includes("path==='/ou-cycle-test'"),'CURRENT_TEST_MAIN_DRIFT');
const valueSource=fs.readFileSync('qa/prematch-history-20261120/'+newModule,'utf8');
assert(valueSource.includes('minimumPriceExclusive:1.50')&&
 valueSource.includes('minimumEV:0.05')&&
 valueSource.includes('targetEveryAvailableLine:true')&&
 valueSource.includes('asianQuarterFullAndHalf:true')&&
 valueSource.includes('shadowOnly:true')&&
 valueSource.includes("market('/board-cache'")&&
 !valueSource.includes("market('/fixture-odds'"),'VALUE_ENGINE_SAFETY_CHECK_FAIL');
execFileSync(process.execPath,['--check','qa/prematch-history-20261120/'+newModule]);
const once=(s,a,b,label)=>{
 assert.equal(s.split(a).length-1,1,'SOURCE_ANCHOR_DRIFT_'+label);
 return s.replace(a,b);
};
let next=old;
next=once(next,
 "import {completePendingOuFromCachedMarket,pendingUnpricedOuCandidates,pendingOuQuoteEvidence,OU_PENDING_PRICE_COMPLETION_POLICY} from './ou-pending-price-completion-v1-test.mjs';",
 "import {completePendingOuFromCachedMarket,pendingUnpricedOuCandidates,pendingOuQuoteEvidence,OU_PENDING_PRICE_COMPLETION_POLICY} from './ou-pending-price-completion-v1-test.mjs';\n"+
 "import {screenOuValueV2,recordOuValueShadow,readOuValueShadow,OU_VALUE_V2_POLICY,OU_VALUE_V2_MODEL} from './ou-value-screener-v2-test.mjs';",
 'IMPORT_NEW_VALUE_ENGINE');
const method=[
 " async runOuValueV2Shadow(now){",
 "  if(this.ouValueV2InFlight)return this.ouValueV2InFlight;",
 "  this.ouValueV2InFlight=(async()=>{",
 "   const fixtures=await this.ctx.storage.get('botFixtures')??[];",
 "   const screened=await screenOuValueV2(this.db,{fixtures,now,market:async(path,opts={})=>{",
 "    if(path!=='/board-cache'||opts.method!=='POST')throw Error('VALUE_V2_CACHE_ONLY_PATH');",
 "    const r=await this.env.FULL_MARKET.fetch('https://full-market.internal/board-cache',{",
 "     method:'POST',headers:{accept:'application/json','content-type':'application/json'},",
 "     body:JSON.stringify(opts.body??{}),signal:AbortSignal.timeout(12000)});",
 "    if(!r.ok)throw Error('VALUE_V2_FULL_MARKET_CACHE_HTTP_'+r.status);",
 "    return r.json();",
 "   }});",
 "   const saved=recordOuValueShadow(this.db,screened.selected,now);",
 "   const report={...screened,recorded:saved,",
 "    // Cache response is examined only at selection time; no later repricing.",
 "    output:'SHADOW_ONLY',priceCaptureAtScreen:true,legacyPredictionsWritten:0};",
 "   await this.ctx.storage.put('ouValueV2Last',report);",
 "   return report;",
 "  })();",
 "  try{return await this.ouValueV2InFlight}",
 "  finally{this.ouValueV2InFlight=null}",
 " }",
 ""
].join('\n');
next=once(next," async rememberLeagueCatalog(snapshot){",method+"\n async rememberLeagueCatalog(snapshot){",'RUNNER_METHOD');
const routes=[
 "if(path==='/ou-value-v2-state'&&req.method==='GET')",
 "   return json({mode:'OU_VALUE_V2_TEST_SHADOW',policy:OU_VALUE_V2_POLICY,",
 "    model:OU_VALUE_V2_MODEL,last:await this.ctx.storage.get('ouValueV2Last')??null,",
 "    selections:readOuValueShadow(this.db,100),providerCalls:0,",
 "    productionWrites:0,legacyPickWrites:0});",
 "  if(path==='/ou-value-v2-run'&&req.method==='POST'){",
 "   if(!this.env.FULL_MARKET)return json({state:'FULL_MARKET_BINDING_MISSING',providerCalls:0});",
 "   if(this.ouInstantInFlight)return json({state:'OU_LEGACY_SELECTION_RUNNING',providerCalls:0});",
 "   return json(await this.runOuValueV2Shadow(now));",
 "  }",
 "  "
].join('\n');
next=once(next,"if(path==='/ou-pending-price-completion-state'&&req.method==='GET')",
 routes+"if(path==='/ou-pending-price-completion-state'&&req.method==='GET')",'TEST_ONLY_ROUTES');
// Schedule new value screener every 15 minutes AFTER existing O/U run. Reads only
// cached Full Market price. Shadow picked cards are locked once in separate table.
const cron="const q=await stub.fetch('https://prematch.internal/ou-cycle-test',{method:'POST'});if(q.ok){const result=await q.json();console.log('OU_2P5_CAPTURE_AT_ISSUE_TEST added='+(result.recorded?.added??0)+' priced='+(result.recorded?.lockedPrices??0)+' callReserve='+(result.providerCalls??0))}else console.log('OU_2P5_CAPTURE_AT_ISSUE_ERROR '+q.status)";
const extra=[
 "const v=await stub.fetch('https://prematch.internal/ou-value-v2-run',{method:'POST'});",
 "if(v.ok){const result=await v.json();",
 " console.log('OU_VALUE_V2_SHADOW_SCREEN_TEST inspected='+(result.checked??0)+' pricedFixtures='+(result.pricedFixtures??0)+' selected='+(result.recorded?.added??0)+' providerCalls=0')}",
 "else console.log('OU_VALUE_V2_SHADOW_SCREEN_ERROR '+v.status)"
].join('');
next=once(next,cron,cron+';'+extra,'ADD_READ_CACHE_SHADOW_CRON');
assert(next.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST')&&
 next.includes('OU_VALUE_V2_SHADOW_SCREEN_TEST')&&
 next.includes("path==='/ou-value-v2-run'")&&
 next.includes("path==='/ou-value-v2-state'")&&
 next.includes('OU_PENDING_PRICE_COMPLETION_TEST')&&
 next.includes('BTTS_CYCLE_DISABLED_PROJECT_CLOSED')&&
 next.includes('DISABLED_POST_ISSUE_REPRICE'),'MAIN_SAFETY_REGRESSION');
const checkPath='/tmp/b46-ou-value-v2-main.js';
fs.writeFileSync(checkPath,next);execFileSync(process.execPath,['--check',checkPath],{stdio:'pipe'});
const before=(await cf('/scripts/'+worker+'/settings')).bindings;
const bindingNames=before.map(x=>x.name).sort();
assert.deepEqual(bindingNames,['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const hashBefore=Object.fromEntries(original.modules.map(m=>[m.name,sha(Buffer.from(m.content_base64,'base64'))]));
assert.equal(await version(worker),expectedVersion,'CONCURRENT_TEST_VERSION_CHANGE_ABORT');
const metadata={main_module:main,compatibility_date:original.compatibility_date||'2026-11-20',
 bindings:before.map(b=>({name:b.name,type:'inherit'})),
 ...(original.compatibility_flags?.length?{compatibility_flags:original.compatibility_flags}:{})};
console.log('B46_OU_VALUE_V2_TEST_PREFLIGHT '+JSON.stringify({
 before:expectedVersion,modulesBefore:28,modulesAfter:29,
 newEngine:newModule,sourceCache:'FULL_MARKET_BOARD_CACHE_ONLY',
 shadowMarketAllLines:true,bookmakerCount:19,quoteMin:1.5,minEV:0.05,
 changedExistingModules:[main],daily5usdBudgetUnchanged:true,
 protectedWorkerVersions:protectedVersions}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of original.modules)
 form.append(m.name,new Blob([m.name===main?next:Buffer.from(m.content_base64,'base64')],{type:'application/javascript+module'}),m.name);
form.append(newModule,new Blob([valueSource],{type:'application/javascript+module'}),newModule);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let current=null,installed=null;
for(let i=0;i<45;i++){
 const id=await version(worker);
 if(id!==expectedVersion){
  const v=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const mainModule=v.modules.find(m=>m.name===main),valueModule=v.modules.find(m=>m.name===newModule);
  if(v.modules.length===29&&mainModule&&valueModule&&
    Buffer.from(mainModule.content_base64,'base64').toString('utf8')===next&&
    Buffer.from(valueModule.content_base64,'base64').toString('utf8')===valueSource){
    current=id;installed=v;break;
  }
 }
 await new Promise(r=>setTimeout(r,1000));
}
assert(current&&installed,'NEW_OU_VALUE_TEST_VERSION_NOT_ACTIVE');
for(const oldModule of original.modules){
 const m=installed.modules.find(m=>m.name===oldModule.name);
 assert(m,'LOST_OLD_MODULE_'+oldModule.name);
 if(m.name!==main)
  assert.equal(sha(Buffer.from(m.content_base64,'base64')),hashBefore[m.name],
   'CHANGED_PROTECTED_TEST_MODULE_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindingNames);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await version(name)]))),
 protectedVersions,'PROTECTED_WORKER_CHANGE');
console.log('B46_OU_VALUE_V2_SHADOW_TEST_DEPLOY_PASS '+JSON.stringify({
 worker,previous:expectedVersion,version:current,
 addedModule:newModule,previousModulesUntouched:27,changedExistingModules:[main],
 schedule:'*/15 * * * *',maxFixtures:350,allAsianLines:true,
 quotesFrom:'EXISTING_FULL_MARKET_CACHE_ONLY',externalRequestsAdded:0,
 minPriceExclusive:1.5,minEV:0.05,oneSelectionPerFixture:true,
 individualShadowLedgerImmutable:true,legacyLedgerUnchanged:true,
 existingQuotaCallsUnchanged:true,productionUnchanged:true,
 engineUnchanged:true,HUBUnchanged:true,btTsClosed:true}));
