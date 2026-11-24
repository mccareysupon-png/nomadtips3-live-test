import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initBttsHistory} from './btts-history-private.mjs';
import {initOuValueShadow,readOuValueShadow} from './ou-value-screener-v2-test.mjs';
import {initOuPricePickup,readOuPricePickupState} from './ou-price-pickup-v1-test.mjs';
import {upcomingWaitingFromHub,runPreMatchOuEngineV1,PREMATCH_OU_ENGINE_V1_POLICY} from './prematch-ou-engine-v1-test.mjs';

const now=1800000000,kickoff=now+7200;
function database(){
 const raw=new DatabaseSync(':memory:');
 const db={exec(sql,...args){
  if(!args.length&&!/^\s*(SELECT|WITH|PRAGMA)/i.test(sql)){raw.exec(sql);return []}
  const stmt=raw.prepare(sql);
  if(/^\s*(SELECT|WITH|PRAGMA)/i.test(sql))return stmt.all(...args);
  stmt.run(...args);return [];
 },transaction(fn){
  raw.exec('BEGIN IMMEDIATE');
  try{const val=fn();raw.exec('COMMIT');return val}
  catch(e){raw.exec('ROLLBACK');throw e}
 },close(){raw.close()}};
 initBttsHistory(db);initOuValueShadow(db);initOuPricePickup(db);
 db.exec("CREATE TABLE result_version(fixture_id INTEGER NOT NULL,league_id INTEGER NOT NULL,kickoff INTEGER NOT NULL,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,hg INTEGER NOT NULL,ag INTEGER NOT NULL,observed INTEGER NOT NULL,status TEXT NOT NULL)");
 for(let i=0;i<10;i++)for(const home of [501,502]){
  db.exec("INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)",
   9000+i+(home===501?0:100),12,now-100000+i*9000,
   home,1000+i,i%3+1,i%2,now-5000+i*90,'finished');
 }
 return db;
}
const fixture=(id=7001,status='waiting',boardState='waiting')=>({
 fixtureId:id,status,boardState,
 kickoffUtc:new Date(kickoff*1000).toISOString(),
 league:{id:12,name:'League'},
 home:{id:501,name:'Home'},away:{id:502,name:'Away'}
 // O/U candidates must NOT need 1X2 odds, and none provided.
});
const hub=(fixtures=[fixture()])=>({
 ok:true,cacheOnly:true,stale:false,fetchedAt:now*1000-2000,fixtures
});
function fm({quotes=false,miss=false}={}){
 const calls=[];
 const market=async(path,opts)=>{
  calls.push(path);
  if(path==='/board-cache'){
   return {ok:true,externalRequestsAdded:0,entries:quotes?{
    '7001':{fullOdds:{fixture_id:7001,bookmakers:[
     {slug:'pinnacle',odds:{goal_line_fixed:[
      {line:4.5,closing:{over:1.54,under:1.95}},
      {line:2.5,opening:{over:1.91,under:1.86}}]}}
    ]},fetchedAt:now*1000-1000,ageMs:1000,stale:false}
   }:{}};
  }
  if(path==='/health')return {ok:true,remainingLocalBudget:7,retryAfterSec:0,blockedUntil:null};
  if(/^\/fixture-odds\?fixtureId=[1-9]\d*$/.test(path))return {
   ok:true,fixtureId:Number(path.split('=')[1]),stale:false,cached:false,
   externalRequestsAdded:1,ageMs:1000,fetchedAt:now*1000-1000,
   fullOdds:{fixture_id:Number(path.split('=')[1]),bookmakers:[{slug:'bet365',odds:{
    goal_line_fixed:[{line:4.5,closing:{over:1.55,under:1.95}}]
   }}]}
  };
  throw Error('INVALID_MARKET_URL_'+path);
 };
 return {market,calls};
}
const healthyHub=()=>Promise.resolve({
 ok:true,stale:false,lastError:null,ageMs:1000,
 accountLimitPerMinute:40,estimatedBulkRequestsPerMinute:3,refreshMs:30000,
 retryAfterSec:0
});
test('Waiting + Upcoming both become scheduled Pre-Match candidates WITHOUT 1X2 price prerequisite',()=>{
 const feed=upcomingWaitingFromHub(hub([
  fixture(7001,'waiting','waiting'),
  fixture(7002,'upcoming','scheduled'),
  fixture(7003,'scheduled','scheduled'),
  fixture(7001,'waiting','waiting')
 ]),now);
 assert.equal(feed.status,'READY');
 assert.equal(feed.fixtures.length,3);
 assert.equal(feed.stats.missing1x2Accepted,3);
 assert.equal(feed.stats.duplicate,1);
 assert(feed.fixtures.every(x=>x.status==='scheduled'));
 assert.equal(feed.providerCalls,0);
});
test('LIVE/FT/delayed/unknown or missing identities never enter the new pre-Match Engine',()=>{
 const broken={...fixture(9000),home:{id:501},away:{id:501}};
 const feed=upcomingWaitingFromHub(hub([
  fixture(7001,'waiting','live'),
  fixture(7002,'finished','finished'),
  fixture(7003,'delayed','waiting'),
  fixture(7004,'unknown','waiting'),broken,
  fixture(7005,'scheduled','scheduled')
 ]),now);
 assert.deepEqual(feed.fixtures.map(x=>x.id),['7005']);
 assert.equal(feed.stats.liveRejected,2);
});
test('stale or failed HUB snapshot is deferred, never triggers any market query',async()=>{
 const db=database();const svc=fm();
 try{
  for(const snapshot of [{...hub(),stale:true},{...hub(),fetchedAt:now*1000-3700000}]){
   const result=await runPreMatchOuEngineV1(db,{snapshot,now,market:svc.market});
   assert.match(result.status,/DEFERRED_HUB_/);
  }
  assert.equal(svc.calls.length,0);
 }finally{db.close()}
});
test('pre-Match Engine consumes existing Full Market cached bookmaker O/U lines, one pick per fixture, even without 1X2',async()=>{
 const db=database();const svc=fm({quotes:true});
 try{
  const first=await runPreMatchOuEngineV1(db,{snapshot:hub(),now,market:svc.market});
  assert.equal(first.status,'SCREENED_PREMATCH');
  assert.equal(first.feed.missing1x2Accepted,1);
  assert.equal(first.scan.modeled,1);
  assert.equal(first.scan.pricedFixtures,1);
  assert(first.scan.prices>=2);
  assert.equal(first.locked.added,1);
  assert.equal(first.providerCalls,0);
  assert.equal(readOuValueShadow(db).length,1);
  const locked=readOuValueShadow(db)[0];
  assert.equal(locked.price>=1.40&&locked.price<=10.00,true);
  assert.equal(locked.line,4.5);
  assert.equal(locked.bookmaker,'pinnacle');
  assert(locked.ev>=0.05);
  const second=await runPreMatchOuEngineV1(db,{snapshot:hub(),now:now+30,market:svc.market});
  assert.equal(second.locked.added,0);
  assert.equal(readOuValueShadow(db).length,1);
  assert.deepEqual(svc.calls,['/board-cache','/board-cache']);
 }finally{db.close()}
});
test('missing Full Market cache never makes paid provider call by default or fakes a prediction',async()=>{
 const db=database();const svc=fm();
 try{
  const result=await runPreMatchOuEngineV1(db,{snapshot:hub(),now,market:svc.market});
  assert.equal(result.status,'SCREENED_PREMATCH');
  assert.equal(result.scan.modeled,1);
  assert.equal(result.scan.pricedFixtures,0);
  assert.equal(result.locked.added,0);
  assert.equal(result.providerCalls,0);
  assert.equal(readOuValueShadow(db).length,0);
  assert.deepEqual(svc.calls,['/board-cache']);
 }finally{db.close()}
});
test('real Full Market endpoint quote locks selection exactly once through the existing ledger and test budget',async()=>{
 const db=database();const svc=fm();
 try{
  const first=await runPreMatchOuEngineV1(db,{
   snapshot:hub(),now,market:svc.market,hubHealth:healthyHub,
   enablePaidQuoteFallback:true,clock:()=>now
  });
  assert.equal(first.priceBridge.budgetReserved,1);
  assert.equal(first.priceBridge.providerCalls,1);
  assert.equal(first.priceBridge.state,'PRICE_LOCKED');
  assert.equal(first.scan.pricedFixtures,1);
  assert(first.scan.prices>0);
  assert.equal(first.locked.added,1);
  assert.equal(readOuValueShadow(db).length,1);
  const budget=readOuPricePickupState(db,now);
  assert.equal(budget.providerCallsToday,1);
  assert.equal(first.priceBridge.budget.remaining,3);
  const second=await runPreMatchOuEngineV1(db,{
   snapshot:hub(),now:now+60,market:svc.market,hubHealth:healthyHub,
   enablePaidQuoteFallback:true,clock:()=>now+60
  });
  assert.equal(second.priceBridge.state,'NO_MODELLED_NEW_UPCOMING');
  assert.equal(svc.calls.filter(x=>x.startsWith('/fixture-odds')).length,1);
 }finally{db.close()}
});
test('after fixture becomes LIVE the pre-match engine refuses it; old pick stays immutable',async()=>{
 const db=database();const svc=fm({quotes:true});
 try{
  const before=await runPreMatchOuEngineV1(db,{snapshot:hub(),now,market:svc.market});
  assert.equal(before.locked.added,1);
  const during=await runPreMatchOuEngineV1(db,{
   snapshot:hub([fixture(7001,'live','live')]),now:now+60,market:svc.market
  });
  assert.equal(during.status,'NO_PREMATCH_FIXTURES');
  assert.equal(during.locked.added,0);
  assert.equal(readOuValueShadow(db).length,1);
  assert.equal(svc.calls.length,1);
  assert.equal(during.liveEngineCalls,0);
 }finally{db.close()}
});
test('500 upcoming fixtures can be scanned across rounds without exceeding 350 per round',()=>{
 const all=Array.from({length:500},(_,i)=>fixture(7001+i));
 const res=upcomingWaitingFromHub(hub(all),now);
 assert.equal(res.fixtures.length,500);
 assert.equal(PREMATCH_OU_ENGINE_V1_POLICY.scanBatchLimit,350);
});


test('existing O/U V1 quota + three new V2 quotes share exact 4/day cap; no paid quote repeat',async()=>{
 const db=database(),svc=fm();
 try{
  const oldDay=readOuPricePickupState(db,now).day;
  db.exec("INSERT INTO b46_ou_price_request_v1_test(fixture_id,business_day,requested_at,state,provider_calls) VALUES(?,?,?,'LEGACY_V1_RESERVED',1)",9978,oldDay,now-3600);
  const snapshots=[7001,7002,7003,7004].map(id=>hub([fixture(id)]));
  const reports=[];
  for(let i=0;i<4;i++)reports.push(await runPreMatchOuEngineV1(db,{
   snapshot:snapshots[i],now:now+i*15,market:svc.market,hubHealth:healthyHub,
   enablePaidQuoteFallback:true,clock:()=>now+i*15
  }));
  assert.deepEqual(reports.slice(0,3).map(x=>x.priceBridge.state),['PRICE_LOCKED','PRICE_LOCKED','PRICE_LOCKED']);
  assert.equal(reports[3].priceBridge.state,'TEST_SHARED_OU_DAILY_CAP');
  assert.equal(svc.calls.filter(x=>x.startsWith('/fixture-odds')).length,3);
  assert.equal(readOuValueShadow(db).length,3);
  assert.equal(readOuPricePickupState(db,now).providerCallsToday,4);
  assert.equal(reports[2].priceBridge.budget.remaining,0);
 }finally{db.close()}
});
test('not-ready HUB or FULL MARKET halts paid pickup with no reservation and no invented O/U',async()=>{
 for(const [hubstatus,marketStatus] of [
  [{...await healthyHub(),stale:true},null],
  [await healthyHub(),{ok:true,retryAfterSec:300,remainingLocalBudget:1,blockedUntil:null}]
 ]){
  const db=database(),svc=fm();
  const market=async(path,options)=>path==='/health'&&marketStatus?marketStatus:svc.market(path,options);
  try{
   const result=await runPreMatchOuEngineV1(db,{
    snapshot:hub(),now,market,hubHealth:()=>Promise.resolve(hubstatus),
    enablePaidQuoteFallback:true,clock:()=>now
   });
   assert.equal(result.priceBridge.state,'FULLMARKET_OR_HUB_QUOTA_UNVERIFIED');
   assert.equal(result.locked.added,0);
   assert.equal(readOuPricePickupState(db,now).providerCallsToday,0);
   assert.equal(svc.calls.filter(x=>x.startsWith('/fixture-odds')).length,0);
  }finally{db.close()}
 }
});
test('priced Full Market with no positive EV records market prices but no fake prediction or price retry',async()=>{
 const db=database(),svc=fm();let quoteCalls=0;
 const market=async(path,opts)=>{
  const result=await svc.market(path,opts);
  if(path.startsWith('/fixture-odds')){
   quoteCalls++;
   result.fullOdds.bookmakers=[{slug:'bet365',odds:{
    goal_line_fixed:[{line:4.5,closing:{over:1.01,under:1.01}}]}}];
  }
  return result;
 };
 try{
  const first=await runPreMatchOuEngineV1(db,{
   snapshot:hub(),now,market,hubHealth:healthyHub,
   enablePaidQuoteFallback:true,clock:()=>now
  });
  assert.equal(first.priceBridge.state,'PRICE_RECEIVED_NO_VALUE');
  assert(first.scan.prices>0);
  assert.equal(first.locked.added,0);
  assert.equal(readOuValueShadow(db).length,0);
  const second=await runPreMatchOuEngineV1(db,{
   snapshot:hub(),now:now+60,market,hubHealth:healthyHub,
   enablePaidQuoteFallback:true,clock:()=>now+60
  });
  assert.equal(second.priceBridge.state,'NO_MODELLED_NEW_UPCOMING');
  assert.equal(quoteCalls,1);
 }finally{db.close()}
});
test('Full Market wrong fixture ID is recorded NO PRICE, never locks prediction or retries',async()=>{
 const db=database(),svc=fm();
 const market=async(path,opts)=>{
  const result=await svc.market(path,opts);
  if(path.startsWith('/fixture-odds'))result.fixtureId=999999;
  return result;
 };
 try{
  const first=await runPreMatchOuEngineV1(db,{
   snapshot:hub(),now,market,hubHealth:healthyHub,
   enablePaidQuoteFallback:true,clock:()=>now
  });
  assert.equal(first.priceBridge.state,'FULLMARKET_RESPONSE_MISMATCH');
  assert.equal(first.locked.added,0);
  assert.equal(readOuValueShadow(db).length,0);
  assert.equal(readOuPricePickupState(db,now).providerCallsToday,1);
  const second=await runPreMatchOuEngineV1(db,{
   snapshot:hub(),now:now+30,market,hubHealth:healthyHub,
   enablePaidQuoteFallback:true,clock:()=>now+30
  });
  assert.equal(second.priceBridge.state,'NO_MODELLED_NEW_UPCOMING');
  assert.equal(svc.calls.filter(x=>x.startsWith('/fixture-odds')).length,1);
 }finally{db.close()}
});

test('Pre-Match O/U price gate is inclusive 1.40 through 10.00; quota and EV stay unchanged',()=>{
 assert.equal(PREMATCH_OU_ENGINE_V1_POLICY.minPriceInclusive,1.40);
 assert.equal(PREMATCH_OU_ENGINE_V1_POLICY.maxPriceInclusive,10.00);
 assert.equal(PREMATCH_OU_ENGINE_V1_POLICY.minEV,.05);
 assert.equal(PREMATCH_OU_ENGINE_V1_POLICY.maxSharedOuRequestsPerLondonDay,4);
});
