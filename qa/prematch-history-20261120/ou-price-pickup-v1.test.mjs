import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {initOu} from './ou-math-v1-test.mjs';
import {patchOuPricedFtSettlement} from './patch-ou-priced-ft-settlement-test.mjs';
import {initOuPricePickup,selectOuPriceCandidate,inspectOuPickupHealth,
 runOuPricePickup,readOuPricePickupState} from './ou-price-pickup-v1-test.mjs';
const now=1800000000,after=now+7200;
const h={ok:true,stale:false,lastError:null,ageMs:15000,retryAfterSec:0,
 accountLimitPerMinute:40,estimatedBulkRequestsPerMinute:3,refreshMs:30000};
const tick=()=>now+10;
function db(){
 const conn=new DatabaseSync(':memory:');
 const driver={
  exec(q,...values){
   if(!values.length&&!/^\s*(SELECT|WITH|PRAGMA)/i.test(q)){
    conn.exec(q);return [];
   }
   const statement=conn.prepare(q);
   if(/^\s*(SELECT|WITH|PRAGMA)/i.test(q))return statement.all(...values);
   statement.run(...values);return [];
  },
  transaction(fn){
   conn.exec('BEGIN IMMEDIATE');
   try{const value=fn();conn.exec('COMMIT');return value}
   catch(error){conn.exec('ROLLBACK');throw error}
  },
  close(){conn.close()}
 };
 initOu(driver);initOuPricePickup(driver);return driver;
}
function put(d,id=3007,pick='UNDER_2.5',kickoff=after){
 d.exec("INSERT INTO b46_ou_pick_v1_test(fixture_id,home_id,away_id,league_id,league_name,home,away,kickoff,picked_at,observed,pick,line,probability,over_probability,lambda_home,lambda_away,expected_total,home_count,away_count,model) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  id,501,502,3,'Test League','Home','Away',kickoff,now-3600,now-3600,pick,2.5,.70,.30,1,1,2,1,0,'ou-poisson-shrinkage-2p5-v1p1-available-history');
}
const fixtures=(id=3007,kickoff=after)=>[{id,status:'scheduled',kickoff_ts:kickoff,
 teams:{home:{id:501},away:{id:502}}}];
const offer=(id=3007,priceOver=1.88,priceUnder=1.92)=>({
 ok:true,status:200,remaining:32,
 body:{success:1,data:{fixture_id:id,bookmakers:[{name:'Bet 365',slug:'bet365',
 odds:{goal_line_fixed:[{line:2.5,closing:{over:priceOver,under:priceUnder}}]}}]}}
});
test('one confirmed price imported, exact same pre-match fixture and selected side; next tick zero calls',async()=>{
 const d=db();try{
  put(d);let calls=0;
  const args={fixtures:fixtures(),now,feedAt:now-100,hubreview:async()=>h,
   provider:async path=>{calls++;assert.equal(path,'/v1/fixtures/3007/odds?market=goalline_fixed');return offer()},clock:tick};
  const first=await runOuPricePickup(d,args);
  assert.equal(first.state,'PRICED_IMPORTED');assert.equal(first.providerCalls,1);
  assert.equal(first.priced.selectedPrice,1.92);
  assert.equal(d.exec("SELECT price FROM b46_ou_pick_v1_test WHERE fixture_id=?",3007)[0].price,1.92);
  const quote=d.exec("SELECT * FROM b46_ou_verified_quote_v1_test WHERE fixture_id=?",3007)[0];
  assert.equal(quote.line,2.5);assert.equal(quote.price_over,1.88);
  assert.equal(quote.price_under,1.92);assert.equal(quote.observed_at,now+10);
  const twice=await runOuPricePickup(d,args);
  assert.equal(twice.providerCalls,0);assert.equal(twice.state,'DAILY_QUOTE_CAP');
  assert.equal(calls,1);
  const st=readOuPricePickupState(d,now);
  assert.equal(st.providerCallsToday,1);assert.equal(st.pricedImported,1);
  assert.equal(st.lifetimeRequests,1);
 }finally{d.close()}
});
test('no issuance if stale HUB, fresh fixture missing or old feed',async()=>{
 const d=db();try{
  put(d);
  const args={fixtures:fixtures(),now,feedAt:now-50,provider:async()=>{throw Error('UNEXPECTED_UPSTREAM')},clock:tick};
  assert.equal((await runOuPricePickup(d,{...args,hubreview:async()=>({...h,stale:true})})).state,'HUB_NOT_HEALTHY_OR_STALE');
  assert.equal((await runOuPricePickup(d,{...args,hubreview:async()=>({...h,accountLimitPerMinute:null})})).state,'UNVERIFIED_SHARED_CAPACITY');
  assert.equal((await runOuPricePickup(d,{...args,hubreview:async()=>h,feedAt:now-7200})).state,'FRESH_SCHEDULED_FEED_REQUIRED');
  assert.equal((await runOuPricePickup(d,{...args,hubreview:async()=>h,fixtures:fixtures(3008)})).state,'NO_NEW_QUALIFIED_UNPRICED_FIXTURE');
  assert.equal(readOuPricePickupState(d,now).providerCallsToday,0);
 }finally{d.close()}
});
test('withdrawn 2.5 quote never becomes price, request always spends once',async()=>{
 const d=db();try{
  put(d);let called=0;
  const r=await runOuPricePickup(d,{fixtures:fixtures(),now,feedAt:now,hubreview:async()=>h,
   provider:async()=>{called++;return {ok:true,body:{data:{fixture_id:3007,bookmakers:[{slug:'bet365',
     odds:{goal_line_fixed:[{line:2.5,closing:null}]}}]}}}},clock:tick});
  assert.equal(r.state,'PRICE_WITHDRAWN');assert.equal(r.providerCalls,1);
  assert.equal(d.exec("SELECT price FROM b46_ou_pick_v1_test WHERE fixture_id=?",3007)[0].price,null);
  assert.equal(d.exec("SELECT COUNT(*) AS n FROM b46_ou_verified_quote_v1_test")[0].n,0);
  const again=await runOuPricePickup(d,{fixtures:fixtures(),now,feedAt:now,hubreview:async()=>h,provider:async()=>{called++;return offer()},clock:tick});
  assert.equal(again.providerCalls,0);assert.equal(called,1);
 }finally{d.close()}
});
test('fixture identity mismatch blocks requesting odds, even when selection probability qualifies',()=>{
 const d=db();try{
  put(d);assert.equal(selectOuPriceCandidate(d,fixtures(3007,after)?.map(f=>({...f,teams:{home:{id:501},away:{id:999}}})),now),null);
 }finally{d.close()}
});
test('timeout and HTTP error are counted as requests, never retried',async()=>{
 const d=db();try{
  put(d);let attempts=0;
  const a={fixtures:fixtures(),now,feedAt:now,hubreview:async()=>h,
   provider:async()=>{attempts++;throw Error('TIMEOUT')},clock:tick};
  assert.equal((await runOuPricePickup(d,a)).state,'ERROR_NO_RETRY');
  assert.equal((await runOuPricePickup(d,a)).providerCalls,0);
  assert.equal(attempts,1);
 }finally{d.close()}
});
test('paid O/U FT patch keeps formula and independent ledgers unchanged',()=>{
 const original=readFileSync(new URL('./ou-math-v1-test.mjs',import.meta.url),'utf8');
 const modified=patchOuPricedFtSettlement(original);
 assert(modified.code.includes("const units=priced?(won?Number(p.price)-1:-1):null;"));
 assert(modified.code.includes('roi:priced>0?100*Number(s.units)/priced:null'));
 assert(modified.code.includes('units=units+?'));
 assert(modified.code.includes('minCombinedHistory:1'));
 assert.equal(modified.modelFormulaUnchanged,true);
 assert.equal(modified.oldUnpricedPicksRemainUnpriced,true);
});
test('HUB health acceptance needs measurable, conservative live headroom',()=>{
 assert.equal(inspectOuPickupHealth(h).allowed,true);
 const fast={...h,refreshMs:10000,estimatedBulkRequestsPerMinute:6,
  bulkSpeedV3Ready:true,bulkSpeedV3:{quotaObserved:true,accelerationAvailable:true,configuredSeconds:10}};
 assert.equal(inspectOuPickupHealth(fast).allowed,true);
 assert.equal(inspectOuPickupHealth({...fast,bulkSpeedV3:{...fast.bulkSpeedV3,quotaObserved:false}}).allowed,false);
 assert.equal(inspectOuPickupHealth({...fast,bulkSpeedV3:{...fast.bulkSpeedV3,accelerationAvailable:false}}).allowed,false);
 assert.equal(inspectOuPickupHealth({...fast,bulkSpeedV3Ready:false}).allowed,false);
 for(const bad of [{...h,estimatedBulkRequestsPerMinute:12},{...h,refreshMs:6000},
   {...h,ageMs:1000000},{...h,retryAfterSec:60},{...h,lastError:'429'}]){
  assert.equal(inspectOuPickupHealth(bad).allowed,false);
 }
});
