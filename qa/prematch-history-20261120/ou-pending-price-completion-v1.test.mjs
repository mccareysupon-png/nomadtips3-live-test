import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initOu,OU_MODEL} from './ou-math-v1-test.mjs';
import {initOuPricePickup} from './ou-price-pickup-v1-test.mjs';
import {pendingUnpricedOuCandidates,quoteForUnpricedPending,completePendingOuFromCachedMarket,pendingOuQuoteEvidence} from './ou-pending-price-completion-v1-test.mjs';
const now=1800000000;
function db(){
 const conn=new DatabaseSync(':memory:');
 const d={exec(q,...p){
  if(!p.length&&!/^\s*(SELECT|WITH|PRAGMA)/i.test(q)){conn.exec(q);return []}
  const s=conn.prepare(q);
  if(/^\s*(SELECT|WITH|PRAGMA)/i.test(q))return s.all(...p);
  s.run(...p);return [];
 },transaction(fn){conn.exec('BEGIN IMMEDIATE');
  try{const r=fn();conn.exec('COMMIT');return r}
  catch(e){conn.exec('ROLLBACK');throw e}
 },close(){conn.close()}};
 initOu(d);initOuPricePickup(d);return d;
}
function put(d,fixtureId,status='PENDING',kickoff=now+7200,price=null){
 d.exec("INSERT INTO b46_ou_pick_v1_test(fixture_id,home_id,away_id,league_id,league_name,home,away,kickoff,picked_at,observed,pick,line,probability,over_probability,lambda_home,lambda_away,expected_total,home_count,away_count,model,status,price) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
 fixtureId,501,502,8,'Test League','Home','Away',kickoff,now-3600,now-3600,
 'UNDER_2.5',2.5,0.7,0.3,1.1,1.2,2.3,9,10,OU_MODEL,status,price);
}
const book=(slug='bet365',opening={over:1.82,under:2.02},closing={over:1.91,under:1.89})=>
 ({name:slug,slug,odds:{goal_line_fixed:[{line:2.5,opening,closing}]}});
const entry=(id,books=[book()],ageMs=8000)=>({
 fullOdds:{fixture_id:id,bookmakers:books},fetchedAt:now*1000-ageMs,ageMs,stale:false
});
const marketFor=map=>async(path,opts)=>{
 assert.equal(path,'/board-cache');assert.equal(opts.method,'POST');
 return {ok:true,entries:Object.fromEntries(opts.body.fixtureIds.filter(x=>map[x]).map(x=>[x,map[x]])),externalRequestsAdded:0};
};
test('existing FOUR pending unpriced are attached ONCE with real full-market price, past and WIN never changed',async()=>{
 const d=db();try{
  [3007,3008,3009,3010].forEach(id=>put(d,id));
  put(d,3011,'PENDING',now-1000);
  put(d,3012,'WIN',now-2000);
  const data=Object.fromEntries([3007,3008,3009,3010].map(id=>[id,entry(id)]));
  assert.equal(pendingUnpricedOuCandidates(d,now).length,4);
  const first=await completePendingOuFromCachedMarket(d,{now,market:marketFor(data)});
  assert.equal(first.attached,4);
  assert.equal(first.providerCalls,0);
  assert.equal(d.exec("SELECT COUNT(*) AS n FROM b46_ou_verified_quote_v1_test")[0].n,4);
  for(const id of [3007,3008,3009,3010]){
   const p=d.exec("SELECT price,pick,picked_at,status FROM b46_ou_pick_v1_test WHERE fixture_id=?",id)[0];
   assert.equal(p.price,1.89);assert.equal(p.pick,'UNDER_2.5');
   assert.equal(p.picked_at,now-3600);assert.equal(p.status,'PENDING');
  }
  assert.equal(d.exec("SELECT price FROM b46_ou_pick_v1_test WHERE fixture_id=3011")[0].price,null);
  assert.equal(d.exec("SELECT price FROM b46_ou_pick_v1_test WHERE fixture_id=3012")[0].price,null);
  const audits=pendingOuQuoteEvidence(d);
  assert.equal(audits.length,4);
  assert.equal(audits[0].source_observed_at,now-8);
  assert.equal(audits[0].picked_at,now-3600);
  assert.equal(audits[0].attached_at,now);
  assert.match(audits[0].source,/LATE_FIRST_QUOTE_BET365_GOAL_LINE_FIXED_CLOSING/);
  const later=Object.fromEntries([3007,3008,3009,3010].map(id=>[id,entry(id,[book('bet365',{over:3,under:3},{over:3.3,under:3.8})])]));
  const second=await completePendingOuFromCachedMarket(d,{now:now+4,market:marketFor(later)});
  assert.equal(second.attached,0);
  assert.equal(second.candidates,0);
  assert.equal(d.exec("SELECT COUNT(*) AS n FROM b46_ou_pending_price_completion_v1_test")[0].n,4);
  assert.equal(d.exec("SELECT price FROM b46_ou_pick_v1_test WHERE fixture_id=3007")[0].price,1.89);
 }finally{d.close()}
});
test('if Bet365 has no market, choose an authentic offered price from named second bookmaker',async()=>{
 const d=db();try{put(d,3007);
  const odds=[{slug:'bet365',odds:{goal_line_fixed:[]}},
   {slug:'pinnacle',odds:{goal_line_fixed:[{line:2.5,opening:{over:1.85,under:1.97}}]}}];
  const actual=await completePendingOuFromCachedMarket(d,{now,market:marketFor({'3007':entry(3007,odds)})});
  assert.equal(actual.attached,1);
  const p=d.exec('SELECT price FROM b46_ou_pick_v1_test')[0];assert.equal(p.price,1.97);
  const audit=pendingOuQuoteEvidence(d)[0];
  assert.equal(audit.bookmaker,'pinnacle');assert.equal(audit.stage,'opening');
  assert.match(audit.source,/PINNACLE_GOAL_LINE_FIXED_OPENING/);
 }finally{d.close()}
});
test('main 2.5 opening qualifies when closing line moved, but in-play alone does not',()=>{
 const p={fixture_id:3007,home_id:501,away_id:502,model:OU_MODEL,pick:'UNDER_2.5',
  status:'PENDING',price:null,line:2.5,picked_at:now-3600,kickoff:now+7200};
 const q=quoteForUnpricedPending(p,entry(3007,[{slug:'bet365',odds:{
  goal_line:{opening:{line:2.5,over:1.84,under:1.96},
   closing:{line:2.75,over:1.85,under:1.95},
   inplay:{line:2.5,over:1.1,under:6}}
 }}]),now);
 assert.equal(q.selectedPrice,1.96);assert.equal(q.stage,'opening');
 assert.equal(quoteForUnpricedPending(p,entry(3007,[{slug:'bet365',odds:{
  goal_line:{inplay:{line:2.5,over:1.85,under:1.95}}
 }}]),now),null);
});
test('source identity, freshness, and exact line required; no guessed O/U payout',()=>{
 const p={fixture_id:3007,home_id:501,away_id:502,model:OU_MODEL,pick:'UNDER_2.5',
  status:'PENDING',price:null,line:2.5,picked_at:now-3600,kickoff:now+7200};
 assert.equal(quoteForUnpricedPending(p,entry(3008),now),null);
 assert.equal(quoteForUnpricedPending(p,entry(3007,[{slug:'bet365',odds:{
  goal_line:{closing:2.5}}}]),now),null);
 assert.equal(quoteForUnpricedPending(p,entry(3007),now+180),null);
 assert.equal(quoteForUnpricedPending({...p,kickoff:now+100},entry(3007),now),null);
 assert.equal(quoteForUnpricedPending({...p,status:'WIN'},entry(3007),now),null);
 assert.equal(quoteForUnpricedPending({...p,price:1.80},entry(3007),now),null);
});
test('Full Market cache read failure does not call upstream or modify ledger',async()=>{
 const d=db();try{
  put(d,3007);
  const result=await completePendingOuFromCachedMarket(d,{now,market:async()=>{throw Error('CACHE_UNAVAILABLE')}});
  assert.equal(result.attached,0);assert.equal(result.failures,1);assert.equal(result.providerCalls,0);
  assert.equal(d.exec("SELECT price FROM b46_ou_pick_v1_test")[0].price,null);
 }finally{d.close()}
});
