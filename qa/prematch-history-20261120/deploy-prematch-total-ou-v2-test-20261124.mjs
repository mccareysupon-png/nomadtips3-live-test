// BALL46 TEST: connect settled O/U V2 to real PreMatch TOTAL statistics and All page.
// Adds only read-time composition of three persisted market snapshots.
// Preserves original per-market registries, ledgers, provider calls and production.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchPrematchTotalOuClient} from './patch-prematch-total-ou-client-test.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_CREDENTIALS');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const backend='ball46-prematch-only-test-20261120';
const front='ball46-premium-match-colors-test-20261120';
const moduleName='prematch-total-priced-ou-v2-test.mjs';
const newModule=fs.readFileSync('qa/prematch-history-20261120/'+moduleName,'utf8');
const immutableNames=['ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46',
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(50000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,240));
 return j.result;
}
async function version(name){
 const x=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments?.[0]?.versions?.[0]?.version_id;
 assert(x,'VERSION_MISSING_'+name);return x;
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function readWorker(name){
 const id=await version(name);
 const versionData=await cf('/workers/'+name+'/versions/'+id+'?include=modules');
 const settings=await cf('/scripts/'+name+'/settings');
 assert(versionData?.main_module&&versionData?.modules?.every(x=>x.content_base64));
 const contents=Object.fromEntries(versionData.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString('utf8')]));
 return {name,id,versionData,settings,contents};
}
async function uploadWorker(before,files,expectedVersion){
 assert.equal(await version(before.name),expectedVersion,'TEST_WORKER_CONCURRENT_UPDATE_'+before.name);
 const m=before.versionData;
 const meta={main_module:m.main_module,compatibility_date:m.compatibility_date||'2026-11-20',
  bindings:before.settings.bindings.map(b=>({name:b.name,type:'inherit'})),
  ...(m.compatibility_flags?.length?{compatibility_flags:m.compatibility_flags}:{})};
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
 for(const [name,body] of Object.entries(files))
  form.append(name,new Blob([body],{type:'application/javascript+module'}),name);
 await cf('/scripts/'+before.name+'?bindings_inherit=strict',{method:'PUT',body:form});
 let deployed=null,newId=null;
 for(let i=0;i<45;i++){
  const candidate=await version(before.name);
  if(candidate!==expectedVersion){
   const v=await cf('/workers/'+before.name+'/versions/'+candidate+'?include=modules');
   const texts=Object.fromEntries(v.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString('utf8')]));
   if(Object.keys(texts).length===Object.keys(files).length&&
    Object.keys(files).every(k=>texts[k]===files[k])){newId=candidate;deployed=texts;break}
  }
  await new Promise(resolve=>setTimeout(resolve,850));
 }
 assert(newId&&deployed,'CLOUDFLARE_DEPLOY_NOT_VERIFIED_'+before.name);
 assert.deepEqual((await cf('/scripts/'+before.name+'/settings')).bindings.map(b=>b.name).sort(),
  before.settings.bindings.map(b=>b.name).sort(),'BINDINGS_CHANGED');
 return {version:newId,sha:sha(files[m.main_module])};
}
const protectedVersions=Object.fromEntries(await Promise.all(immutableNames.map(async n=>[n,await version(n)])));
const [beforeBack,beforeFront]=await Promise.all([readWorker(backend),readWorker(front)]);
assert.deepEqual(beforeBack.settings.bindings.map(b=>b.name).sort(),
 ['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
assert.deepEqual(beforeFront.settings.bindings.map(b=>b.name).sort(),
 ['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
assert(!beforeBack.contents[moduleName],'OU_TOTAL_COMPOSITION_ALREADY_PRESENT');
let backendCode=beforeBack.contents[beforeBack.versionData.main_module];
assert(backendCode.includes("settlementState:readOuV2SettlementState(this.db,now)")&&
 backendCode.includes("status:validSettled?settled.status:'PENDING'")&&
 backendCode.includes('B46_LEGACY_OU_CRON_ISSUER_DISABLED_PRESERVE_PICKS_AND_FT_SETTLEMENT'),
 'OU_V2_SETTLEMENT_OR_SINGLE_ISSUER_INCOMPLETE');
function replaceOnce(source,from,to,label){
 const count=source.split(from).length-1;
 assert.equal(count,1,'BACKEND_ANCHOR_'+label+'_'+count);
 return source.replace(from,to);
}
backendCode="import {combinePrematchTotalSnapshots,appendPricedOuToPrematchAll} from './"+
 moduleName+"';\n"+backendCode;
backendCode=replaceOnce(backendCode,
 "  const registry=readPreMarketStatsRegistry(this.db,now);",
 "  const registry=combinePrematchTotalSnapshots(readPreMarketStatsRegistry(this.db,now),readOuV2SettlementState(this.db,now));",
 'COMBINE_THREE_MARKETS');
backendCode=replaceOnce(backendCode,
 "   settlementState:readOuV2SettlementState(this.db,now)\n  });",
 "   settlementState:readOuV2SettlementState(this.db,now)\n  });\n"+
 "  const allCombinedWithOu=appendPricedOuToPrematchAll(allLedgerNow,pricedV2Ui.ouLedger.rows,registry.markets.TOTAL);",
 'APPEND_IMMUTABLE_PRICED_PICKS');
backendCode=replaceOnce(backendCode,
 "allLedger:allLedgerNow,ouLedger:pricedV2Ui.ouLedger",
 "allLedger:allCombinedWithOu,ouLedger:pricedV2Ui.ouLedger",
 'ALL_LEDGER_RESULTS');
backendCode=replaceOnce(backendCode,
 "   return json(readPreMarketStatsRegistry(this.db,now,{rangeDays:days}));",
 "   return json(combinePrematchTotalSnapshots(readPreMarketStatsRegistry(this.db,now,{rangeDays:days}),readOuV2SettlementState(this.db,now)));",
 'TOTAL_REGISTRY_OWNER_ROUTE');
assert(backendCode.includes('marketDailyBooks:dailyMarkets')&&
 backendCode.includes('allDailySeries:registry.dailySeries.TOTAL')&&
 backendCode.includes('B46_HUB_BULK_REFRESH_GUARD_V1')&&
 backendCode.includes("enablePaidQuoteFallback:true")&&
 backendCode.includes("event.cron!=='*/15 * * * *'"));
fs.writeFileSync('/tmp/b46-prematch-three-market-backend.mjs',backendCode);
execFileSync(process.execPath,['--check','/tmp/b46-prematch-three-market-backend.mjs']);

const oldFrontend=beforeFront.contents[beforeFront.versionData.main_module];
const rx=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const match=oldFrontend.match(rx);
assert(match,'FRONTEND_PREMATCH_CLIENT_NOT_FOUND');
const originalClient=JSON.parse(match[1]);
const patchedClient=patchPrematchTotalOuClient(originalClient);
const afterFrontend=oldFrontend.replace(match[0],
 'var prematchClientScript = '+JSON.stringify(patchedClient.code)+';');
assert(afterFrontend!==oldFrontend &&
 afterFrontend.replace('var prematchClientScript = '+JSON.stringify(patchedClient.code)+';',match[0])===oldFrontend,
 'FRONTEND_UNEXPECTED_OUTSIDE_CHANGES');
fs.writeFileSync('/tmp/b46-prematch-total-ou-client.js',patchedClient.code);
fs.writeFileSync('/tmp/b46-prematch-total-ou-front.js',afterFrontend);
for(const f of ['/tmp/b46-prematch-total-ou-client.js','/tmp/b46-prematch-total-ou-front.js'])
 execFileSync(process.execPath,['--check',f]);

const owner={authorization:'Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex')};
const backendHost='https://'+backend+'.mccarey-supon.workers.dev';
const frontHost='https://'+front+'.mccarey-supon.workers.dev';
async function get(url,headers={}){
 const r=await fetch(url,{headers,cache:'no-store',signal:AbortSignal.timeout(35000)});
 assert.equal(r.status,200,'PREMATCH_GET_FAIL_'+url+'_'+r.status);
 return r.json();
}
const [base,oldRegistry,ou]=await Promise.all([
 get(backendHost+'/preview-data',owner),
 get(backendHost+'/prematch-stats-registry-test?days=90',owner),
 get(backendHost+'/ou-v2-settlement-state',owner)
]);
assert(oldRegistry.markets.TOTAL.total===oldRegistry.markets['1X2'].total+oldRegistry.markets.BTTS.total);
assert(base.allLedger.stats.total===oldRegistry.markets.TOTAL.total);
assert(ou.stats.total>0&&ou.stats.total===base.ouLedger.stats.total,'NO_REAL_OU_SOURCE_TO_WIRE');
assert(ou.settlements['204906152']?.status==='LOSS'&&ou.settlements['204906152'].units===-1,
 'ACTUAL_2_2_LOSS_MISSING');
assert.equal(await version(backend),beforeBack.id,'BACKEND_CHANGED_BEFORE_DEPLOY');
assert.equal(await version(front),beforeFront.id,'FRONTEND_CHANGED_BEFORE_DEPLOY');
console.log('B46_PREMATCH_TOTAL_OU_PREFLIGHT '+JSON.stringify({
 backendVersion:beforeBack.id,frontendVersion:beforeFront.id,
 legacyTotal:oldRegistry.markets.TOTAL,ouSnapshot:ou.stats,
 expectedTotal:oldRegistry.markets.TOTAL.total+ou.stats.total,
 old1x2:base.testLedger.rows.length,
 testedRealOuLossFixture:204906152,
 modifiesOnlyTestWorkers:true,providerCalls:0,productionWrites:0}));

const backFiles={...beforeBack.contents,[beforeBack.versionData.main_module]:backendCode,[moduleName]:newModule};
const frontFiles={...beforeFront.contents,[beforeFront.versionData.main_module]:afterFrontend};
let appliedBack=null,appliedFront=null;
try{
 appliedBack=await uploadWorker(beforeBack,backFiles,beforeBack.id);
 const direct=await get(backendHost+'/preview-data',owner);
 const reg=await get(backendHost+'/prematch-stats-registry-test?days=90',owner);
 assert.equal(direct.allLedger.stats.total,reg.markets.TOTAL.total,'BACKEND_TOTAL_MISMATCH');
 assert.equal(direct.allLedger.stats.total,direct.testLedger.stats.total+
  direct.bttsLedger.stats.total+direct.ouLedger.stats.total,'MARKET_TOTAL_MISMATCH');
 assert.equal(direct.allLedger.stats.win,direct.testLedger.stats.win+
  direct.bttsLedger.stats.win+direct.ouLedger.stats.win);
 assert.equal(direct.allLedger.stats.loss,direct.testLedger.stats.loss+
  direct.bttsLedger.stats.loss+direct.ouLedger.stats.loss);
 assert.equal(direct.allLedger.stats.units,
  Math.round((direct.testLedger.stats.units+direct.bttsLedger.stats.units+direct.ouLedger.stats.units)*1e8)/1e8);
 assert(direct.allLedger.rows.some(r=>Number(r.fixture_id)===204906152&&
  r.market==='O/U'&&r.status==='LOSS'&&r.units===-1),'OU_FT_NOT_IN_ALL_LEDGER');
 assert.equal(direct.marketDailyBooks.all.settled.units,
  reg.dailyBooks.TOTAL.settled.units,'TODAY_TOTAL_UNITS');
 assert.deepEqual(direct.allDailySeries,reg.dailySeries.TOTAL,'GRAPH_SERIES_NOT_BACKEND_SNAPSHOT');
 appliedFront=await uploadWorker(beforeFront,frontFiles,beforeFront.id);
 const visible=await get(frontHost+'/__b46_prematch_data');
 assert.deepEqual(visible.allLedger.stats,direct.allLedger.stats,'FRONTEND_TOTAL_WRONG');
 assert(visible.allLedger.rows.some(r=>Number(r.fixture_id)===204906152&&
  r.market==='O/U'&&r.status==='LOSS'&&r.units===-1),'FRONTEND_OMITS_OU_LOSS');
 assert.equal(visible.marketDailyBooks.all.settled.units,direct.marketDailyBooks.all.settled.units);
 assert.deepEqual(visible.allDailySeries,direct.allDailySeries);
 const page=await fetch(frontHost+'/?b46pm=all',{cache:'no-store',signal:AbortSignal.timeout(22000)});
 assert(page.ok&&(await page.text()).length>1500,'ALL_STATISTICS_PAGE_DOWN');
 const immutableAfter=Object.fromEntries(await Promise.all(immutableNames.map(async name=>[name,await version(name)])));
 assert.deepEqual(immutableAfter,protectedVersions,'PROTECTED_WORKER_CHANGED');
 console.log('B46_PREMATCH_TOTAL_OU_REAL_END_TO_END_PASS '+JSON.stringify({
  backend:{old:beforeBack.id,new:appliedBack.version},
  frontend:{old:beforeFront.id,new:appliedFront.version},
  all:direct.allLedger.stats,oneX2:direct.testLedger.stats,
  btts:direct.bttsLedger.stats,ou:direct.ouLedger.stats,
  todayAll:direct.marketDailyBooks.all,
  lastAllGraph:direct.allDailySeries.at(-1),
  realOuSample:visible.allLedger.rows.find(r=>Number(r.fixture_id)===204906152&&r.market==='O/U'),
  hasNoDoubleOU:visible.allLedger.rows.filter(r=>r.market==='O/U'&&Number(r.fixture_id)===204906152).length===1,
  totalIncludesOU:true,routeAllUsesActualAggregate:true,
  snapshotSourceNotRawRecalculation:true,selectedBusinessDay:'Europe/London 06:00',
  productionAndLiveUnchanged:true,providerCallsDuringDeploy:0}));
}catch(err){
 console.log('B46_PREMATCH_TOTAL_OU_DEPLOY_FAIL '+String(err?.stack??err).slice(0,1000));
 const recovery=[];
 for(const [obj,applied] of [[beforeFront,appliedFront],[beforeBack,appliedBack]]){
  if(!applied)continue;
  try{
   if(await version(obj.name)!==applied.version)throw Error('VERSION_DRIFT_NO_ROLLBACK');
   const restored=await uploadWorker(obj,obj.contents,applied.version);
   recovery.push({name:obj.name,restored:restored.version});
  }catch(e){recovery.push({name:obj.name,error:String(e?.message??e)});}
 }
 console.log('B46_PREMATCH_TOTAL_OU_ROLLBACK '+JSON.stringify(recovery));
 throw err;
}
