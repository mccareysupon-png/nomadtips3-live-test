import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initOu,OU_MODEL} from './ou-math-v1-test.mjs';
import {initOuPricePickup} from './ou-price-pickup-v1-test.mjs';
import {captureAndIssueOu,issueOuAtSelection,quoteFromFullMarketReply,
 lockedOuPriceEvidence} from './ou-instant-full-market-issue-v1-test.mjs';
import {londonAccountingWindow} from './london-cutoff.mjs';
const now=1800000000,kickoff=now+7200;
function db(){
 const conn=new DatabaseSync(':memory:');
 const d={exec(q,...v){
  if(!v.length&&!/^\s*(SELECT|WITH|PRAGMA)/i.test(q)){conn.exec(q);return []}
  const s=conn.prepare(q);
  if(/^\s*(SELECT|WITH|PRAGMA)/i.test(q))return s.all(...v);
  s.run(...v);return [];
 },transaction(fn){
  conn.exec('BEGIN IMMEDIATE');
  try{const v=fn();conn.exec('COMMIT');return v}
  catch(e){conn.exec('ROLLBACK');throw e}
 },close(){conn.close()}};
 initOu(d);initOuPricePickup(d);return d;
}
function row(fixture_id=3007){
 return {fixture_id,home_id:501,away_id:502,league_id:3,
  league_name:'Sample League',home:'Home',away:'Away',kickoff,
  picked_at:now,observed:now,market:'O/U',pick:'UNDER_2.5',
  line:2.5,probability:0.72,overProbability:0.28,lambdaHome:1.1,
  lambdaAway:0.9,expectedTotalGoals:2,home_count:10,away_count:10,
  status:'PENDING',price:null,model:OU_MODEL}
}
const screen=(...p)=>({qualified:p,counts:{checked:p.length,qualified:p.length}});
function odds(fixtureId=3007){
 return {fixture_id:fixtureId,bookmakers:[{name:'Bet 365',slug:'bet365',
  odds:{goal_line_fixed:[{line:2.5,opening:{over:1.84,under:2.02},
   closing:{over:1.91,under:1.89}}]}}]};
}
const entry=id=>({fullOdds:odds(id),fetchedAt:now*1000-12000,ageMs:12000,stale:false});
const hub={ok:true,stale:false,lastError:null,ageMs:5000,retryAfterSec:0,
 accountLimitPerMinute:40,estimatedBulkRequestsPerMinute:6,refreshMs:10000,
 bulkSpeedV3Ready:true,bulkSpeedV3:{quotaObserved:true,
 accelerationAvailable:true,configuredSeconds:10}};
test('full market PRE-EXISTING cache captured at selection and price+pick LOCKED in one tx, no paid calls',async()=>{
 const d=db();try{
  const s=screen(row());let calls=[];
  const out=await captureAndIssueOu(d,{screening:s,now,hubHealth:async()=>hub,
   market:async(path)=>{calls.push(path);
    assert.equal(path,'/board-cache');
    return {ok:true,entries:{'3007':entry(3007)},externalRequestsAdded:0}
   }});
  assert.equal(out.recorded.added,1);
  assert.equal(out.recorded.lockedPrices,1);
  assert.equal(out.providerCalls,0);
  assert.deepEqual(calls,['/board-cache']);
  const ledger=d.exec('SELECT price,picked_at FROM b46_ou_pick_v1_test');
  assert.equal(ledger[0].price,1.89);
  assert.equal(ledger[0].picked_at,now);
  const ev=lockedOuPriceEvidence(d)[0];
  assert.equal(ev.price_under,1.89);
  assert.equal(ev.price_over,1.91);
  assert.equal(ev.source,'FULL_MARKET_BET365_GOAL_LINE_FIXED_CLOSING');
  assert.equal(ev.observed_at,now-12);
  const second=await captureAndIssueOu(d,{screening:s,now,hubHealth:async()=>hub,
    market:async()=>{throw Error('NO_PRICE_LOOKUP_FOR_ALREADY_ISSUED')}});
  assert.equal(second.recorded.added,0);
  assert.equal(second.recorded.duplicate,1);
  assert.equal(lockedOuPriceEvidence(d)[0].price,1.89);
  assert.equal(d.exec('SELECT COUNT(*) AS n FROM b46_ou_verified_quote_v1_test')[0].n,1);
 }finally{d.close()}
});
test('missing fresh cache AND unavailable paid provider means issue exactly once without a made-up price, no later repricing',async()=>{
 const d=db();try{
  const s=screen(row());const result=await captureAndIssueOu(d,{screening:s,now,
   hubHealth:async()=>({...hub,stale:true}),
   market:async(p)=>p==='/board-cache'?{ok:true,entries:{},externalRequestsAdded:0}:
    p==='/health'?{ok:true,retryAfterSec:0,remainingLocalBudget:6}:
    (()=>{throw Error('UNEXPECTED_PAID_PROVIDER_REQUEST')})()
  });
  assert.equal(result.recorded.added,1);
  assert.equal(result.recorded.lockedPrices,0);
  assert.equal(result.recorded.missingPrices,1);
  assert.equal(result.providerCalls,0);
  assert.equal(result.paidAttemptState,'SHARED_PROVIDER_HEALTH_DEFER');
  assert.equal(lockedOuPriceEvidence(d)[0].price,null);
  const changed=await captureAndIssueOu(d,{screening:s,now,
   hubHealth:async()=>hub,
   market:async(p)=>p==='/board-cache'?{ok:true,entries:{'3007':entry(3007)},externalRequestsAdded:0}:
    (()=>{throw Error('UNEXPECTED_NETWORK')})()
  });
  assert.equal(changed.recorded.added,0);
  assert.equal(lockedOuPriceEvidence(d)[0].price,null);
 }finally{d.close()}
});
test('cache miss invokes ONLY one guarded Full Market fixture-odds request BEFORE issue, original price stays unchanged',async()=>{
 const d=db();try{
  const s=screen(row());let paid=0;
  const out=await captureAndIssueOu(d,{screening:s,now,hubHealth:async()=>hub,market:async path=>{
    if(path==='/board-cache')return {ok:true,entries:{},externalRequestsAdded:0};
    if(path==='/health')return {ok:true,retryAfterSec:0,remainingLocalBudget:5,blockedUntil:null};
    if(path==='/fixture-odds?fixtureId=3007'){
      paid++;
      return {ok:true,fixtureId:'3007',fullOdds:odds(),
       fetchedAt:now*1000+4000,ageMs:0,stale:false,cached:false,
       externalRequestsAdded:1};
    }
    throw Error('UNEXPECTED_PATH_'+path)
  }});
  assert.equal(paid,1);assert.equal(out.providerCalls,1);
  assert.equal(out.paidAttemptState,'PRICE_CAPTURED_AT_SELECTION');
  assert.equal(out.recorded.lockedPrices,1);
  assert.equal(lockedOuPriceEvidence(d)[0].price,1.89);
  assert.equal(d.exec('SELECT COUNT(*) AS n FROM b46_ou_price_request_v1_test')[0].n,1);
  assert.equal(d.exec('SELECT state FROM b46_ou_price_request_v1_test')[0].state,'PRICE_CAPTURED_AT_SELECTION');
 }finally{d.close()}
});
test('exact fixture mismatch, stale older than 120s, and in-play-only cannot become pre-match payout',()=>{
 const p=row();
 const normal={ok:true,fixtureId:p.fixture_id,fullOdds:odds(),fetchedAt:now*1000-12000,ageMs:12000,
  cached:true,stale:false};
 assert.equal(quoteFromFullMarketReply({...normal,fixtureId:3008},p,now),null);
 assert.equal(quoteFromFullMarketReply({...normal,ageMs:250000,fetchedAt:now*1000-250000},p,now),null);
 assert.equal(quoteFromFullMarketReply({...normal,fullOdds:odds(3008)},p,now),null);
 assert.equal(quoteFromFullMarketReply({...normal,fullOdds:{fixture_id:3007,bookmakers:[{
  slug:'bet365',odds:{goal_line_fixed:[{line:2.5,
  inplay:{over:1.6,under:2.2}}]}}]}},p,now),null);
 assert.equal(quoteFromFullMarketReply({...normal,fullOdds:{fixture_id:3007,bookmakers:[{
  slug:'bet365',odds:{goal_line:{closing:{line:2.75,over:1.86,under:1.97}}}}]}},p,now),null);
});
test('daily cost cap shares existing O/U price-request ledger, no other provider calls',async()=>{
 const d=db();try{
  const day=londonAccountingWindow(now).businessDay;
  d.exec("INSERT INTO b46_ou_price_request_v1_test(fixture_id,business_day,requested_at,state,provider_calls) VALUES(?,?,?,?,1)",
   2000,day,now-300,'PRICE_NOT_OFFERED');
  const out=await captureAndIssueOu(d,{screening:screen(row()),now,hubHealth:async()=>hub,
   market:async p=>p==='/board-cache'?{ok:true,externalRequestsAdded:0,entries:{}}:
   (()=>{throw Error('DAILY_CAP_NO_EXTRA_REQUEST')})()
  });
  assert.equal(out.providerCalls,0);
  assert.equal(out.paidAttemptState,'DAILY_CAP');
  assert.equal(out.recorded.added,1);
  assert.equal(lockedOuPriceEvidence(d)[0].price,null);
  assert.equal(d.exec('SELECT COUNT(*) AS n FROM b46_ou_price_request_v1_test')[0].n,1);
 }finally{d.close()}
});
