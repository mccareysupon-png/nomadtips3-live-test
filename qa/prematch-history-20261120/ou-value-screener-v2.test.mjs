import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initBttsHistory} from './btts-history-private.mjs';
import {initOuTargetHistoryFT} from './ou-target-history-ft-v1-test.mjs';
import {goalDistribution,topExactScores,splitAsianLine,profitForOuResult,
 evaluateAsianOu,extractFullMarketOuOffers,chooseBestOuValue,
 buildOuValueModels,screenOuValueV2,recordOuValueShadow,readOuValueShadow,
 OU_VALUE_V2_POLICY} from './ou-value-screener-v2-test.mjs';

const now=1800000000,kickoff=now+7200;
function database(){
 const raw=new DatabaseSync(':memory:');
 const db={exec(q,...args){
  if(!args.length&&!/^\s*(SELECT|WITH|PRAGMA)/i.test(q)){raw.exec(q);return []}
  const stmt=raw.prepare(q);
  if(/^\s*(SELECT|WITH|PRAGMA)/i.test(q))return stmt.all(...args);
  stmt.run(...args);return [];
 },transaction(fn){
  raw.exec('BEGIN IMMEDIATE');
  try{const value=fn();raw.exec('COMMIT');return value}
  catch(err){raw.exec('ROLLBACK');throw err}
 },close(){raw.close()}};
 initBttsHistory(db);initOuTargetHistoryFT(db);
 db.exec("CREATE TABLE result_version(fixture_id INTEGER NOT NULL,league_id INTEGER NOT NULL,kickoff INTEGER NOT NULL,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,hg INTEGER NOT NULL,ag INTEGER NOT NULL,observed INTEGER NOT NULL,status TEXT NOT NULL)");
 for(let i=0;i<8;i++){
  const fixtureId=9000+i,home=i%2?501:502,away=1000+i;
  db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',
   fixtureId,12,now-100000+i*7000,home,away,i%3+1,i%2,now-6500+i*90,'finished');
 }
 return db;
}
function model(lambda=3){
 return {fixtureId:7001,homeId:501,awayId:502,home:'Home',away:'Away',
  leagueId:12,leagueName:'Test',kickoff,lambdaHome:lambda*.55,
  lambdaAway:lambda*.45,expectedTotalGoals:lambda,
  homeHistory:8,awayHistory:9,leagueHistory:20,
  historyConfidence:'NORMAL'};
}
function offer(line,price,side='OVER',bookmaker='bet365'){
 const over=side==='OVER'?price:1.20,under=side==='UNDER'?price:1.20;
 return {fixtureId:7001,line,over,under,bookmaker,
  stage:'closing',market:'goal_line_fixed',
  source:'FULL_MARKET_CACHE_GOAL_LINE_FIXED_CLOSING',
  sourceObservedAt:now-10};
}
function entry(id,books,ageMs=5000){
 return {fullOdds:{fixture_id:id,bookmakers:books},
  fetchedAt:now*1000-ageMs,ageMs,stale:false};
}
const bk=(slug,lines)=>({slug,name:slug,odds:{goal_line_fixed:lines}});
const line=(l,opening,closing)=>({line:l,opening,closing});
test('Asian goal total is a proper normalized distribution; score probabilities are real',()=>{
 const p=goalDistribution(3);
 assert(Math.abs(p.reduce((s,x)=>s+x,0)-1)<1e-11);
 assert(Math.abs(p[3]-Math.exp(-3)*4.5)<1e-12);
 const scores=topExactScores(1.5,1.5);
 assert.equal(scores.length,5);
 assert(scores[0].probability>=scores[1].probability);
});
test('Asian 2.25 and 2.75 split half stakes, push, half win and half loss exactly',()=>{
 assert.deepEqual(splitAsianLine(2.25),[2,2.5]);
 assert.deepEqual(splitAsianLine(2.75),[2.5,3]);
 assert.deepEqual(splitAsianLine(3),[3]);
 assert.equal(profitForOuResult(2,2.25,'OVER',1.9),-.5);
 assert(Math.abs(profitForOuResult(2,2.25,'UNDER',1.9)-.45)<1e-12);
 assert(Math.abs(profitForOuResult(3,2.75,'OVER',2.05)-.525)<1e-12);
 assert.equal(profitForOuResult(3,2.75,'UNDER',1.9),-.5);
 assert.equal(profitForOuResult(3,3,'OVER',1.9),0);
 assert.equal(profitForOuResult(3,3,'UNDER',1.9),0);
 assert(Math.abs(profitForOuResult(4,3.5,'OVER',1.9)-.9)<1e-12);
});
test('all TEN earlier hypothetical situations, exact Asian EV, price >1.50 and EV >=5%',()=>{
 const cases=[
  [3,3.5,'UNDER',1.65,6.79,true],
  [3,2.5,'OVER',1.90,9.59,true],
  [3,4.5,'UNDER',1.55,26.37,true],
  [3,1.5,'OVER',1.55,24.13,true],
  [3,3.5,'UNDER',1.50,-2.92,false],
  [3,2.5,'OVER',1.60,-7.71,false],
  [2,2.5,'UNDER',1.75,18.42,true],
  [4,3.5,'OVER',1.85,4.81,false],
  [3,2.75,'OVER',2.05,6.48,true],
  [3,3,'UNDER',1.90,2.81,false]
 ];
 let passed=0;
 for(const [mu,l,s,price,wantedEV,shouldPass] of cases){
  const e=evaluateAsianOu(mu,l,s,price);
  assert(Math.abs(e.ev*100-wantedEV)<.02,
   'EV mismatch '+JSON.stringify({mu,l,s,price,ev:e.ev*100,wantedEV}));
  const selected=chooseBestOuValue(model(mu),[offer(l,price,s)],now).selected;
  assert.equal(Boolean(selected),shouldPass,'selection mismatch '+JSON.stringify({mu,l,s,price}));
  if(selected){passed++;assert.equal(selected.side,s);assert.equal(selected.line,l)}
 }
 assert.equal(passed,6);
});
test('compare EVERY side, line and bookmaker, pick ONLY the largest positive EV once',()=>{
 const candidate=model(3),offers=[
  offer(3.5,1.65,'UNDER','bet365'),
  offer(2.5,1.90,'OVER','pinnacle'),
  offer(4.5,1.55,'UNDER','williamhill'),
  offer(2.75,2.05,'OVER','bet365'),
  offer(2.5,1.3,'UNDER','bwin'),
  offer(2.25,1.48,'OVER','bet365')
 ];
 const r=chooseBestOuValue(candidate,offers,now);
 assert.equal(r.selected.side,'UNDER');
 assert.equal(r.selected.line,4.5);
 assert.equal(r.selected.price,1.55);
 assert.equal(r.selected.bookmaker,'williamhill');
 assert.equal(r.selected.topScores.length,5);
 assert(r.passed>1);
});
test('read real-style Full Market 19-bookmaker structure and all distinct quarter/half/full lines',()=>{
 const odds=entry(7001,[
  bk('bet365',[
   line(2.25,{over:1.9,under:1.9},{over:1.95,under:1.85}),
   line(3.5,{over:2.15,under:1.61},{over:2.30,under:1.54}),
   line(4.5,{over:3.3,under:1.4},null)
  ]),
  {slug:'pinnacle',odds:{goal_line:{opening:{line:2.75,over:1.85,under:2.05},
   closing:{line:3.0,over:1.77,under:2.13}}}},
  bk('unknownbookmaker',[line(5.5,{over:2.11,under:1.7},{over:2.01,under:1.79})])
 ]);
 const r=extractFullMarketOuOffers(odds,7001,now,kickoff);
 assert.equal(r.status,'PRICED');
 assert.deepEqual(r.offers.map(x=>[x.bookmaker,x.line,x.stage]).sort((a,b)=>a[1]-b[1]),[
  ['bet365',2.25,'closing'],['pinnacle',2.75,'opening'],
  ['pinnacle',3,'closing'],['bet365',3.5,'closing'],['bet365',4.5,'opening']]);
});
test('never treat goals line marker as side odds, never accept in-play or wrong fixture',()=>{
 const bad=entry(7001,[{
  slug:'bet365',odds:{goal_line:{opening:2.5,closing:2.75,
   inplay:{line:2.5,over:1.9,under:1.9}}}
 }]);
 assert.equal(extractFullMarketOuOffers(bad,7001,now,kickoff).offers.length,0);
 assert.equal(extractFullMarketOuOffers(entry(7002,[bk('bet365',[
  line(2.5,{over:1.9,under:1.95},{over:2.01,under:1.84})])]),
  7001,now,kickoff).offers.length,0);
 const stale=entry(7001,[bk('bet365',[line(3.5,{over:2,under:1.6},null)])],121000);
 assert.equal(extractFullMarketOuOffers(stale,7001,now,kickoff).offers.length,0);
 const dup=entry(7001,[bk('bet365',[
  line(3.5,{over:2.1,under:1.8},null),
  line(3.5,{over:2.2,under:1.75},null)])]);
 assert.equal(extractFullMarketOuOffers(dup,7001,now,kickoff).offers.length,0);
});
test('full integrated history screen does not silently force 2.5 or probability >=64%',async()=>{
 const d=database();
 try{
  const fs=[{id:7001,status:'scheduled',kickoff_ts:kickoff,
   league:{id:12,name:'League'},teams:{home:{id:501,name:'Alpha'},away:{id:502,name:'Beta'}}}];
  const preview=buildOuValueModels(d,fs,now);
  assert.equal(preview.models.length,1);
  assert.equal(OU_VALUE_V2_POLICY.minHistoryPerTeam,3);
  assert.equal(OU_VALUE_V2_POLICY.minCombinedHistory,6);
  const m=preview.models[0];
  assert.equal(m.h2hCount,0);
  assert.equal(m.h2hWeight,0);
  assert.equal(m.homeHistory,4);
  assert.equal(m.awayHistory,4);
  assert(m.expectedTotalGoals>0);
  let seenPath=null;
  const r=await screenOuValueV2(d,{fixtures:fs,now,market:async(path,opt)=>{
   seenPath=path;assert.equal(opt.method,'POST');
   assert.deepEqual(opt.body.fixtureIds,['7001']);
   return {ok:true,externalRequestsAdded:0,
    entries:{'7001':entry(7001,[bk('bet365',[
     line(4.5,{over:4.4,under:1.95},{over:4.5,under:1.95})])])}};
  }});
  assert.equal(seenPath,'/board-cache');assert.equal(r.providerCalls,0);
  assert.equal(r.checked,1);assert.equal(r.modeled,1);
  assert.equal(r.pricedFixtures,1);assert.equal(r.qualified,1);
  assert.equal(r.selected.length,1);assert.equal(r.selected[0].line,4.5);
  assert.equal(r.selected[0].side,'UNDER');assert(r.selected[0].ev>=.05);
  const recorded=recordOuValueShadow(d,r.selected,now);
  assert.equal(recorded.added,1);
  const first=readOuValueShadow(d)[0];
  assert.equal(first.line,4.5);assert.equal(first.price,1.95);
  assert.equal(first.pick,'UNDER');
  const oldPrice=first.price,oldTime=first.picked_at;
  const r2=recordOuValueShadow(d,[{...r.selected[0],price:2.1}],now);
  assert.equal(r2.added,0);assert.equal(r2.duplicate,1);
  const latest=readOuValueShadow(d)[0];
  assert.equal(latest.price,oldPrice);assert.equal(latest.picked_at,oldTime);
 }finally{d.close()}
});
test('missing full market price never produces a prediction or fake EV',async()=>{
 const d=database();
 try{
  const fixture={id:7001,status:'scheduled',kickoff_ts:kickoff,
   league:{id:12},teams:{home:{id:501},away:{id:502}}};
  const r=await screenOuValueV2(d,{fixtures:[fixture],now,market:async()=>({
   ok:true,externalRequestsAdded:0,entries:{}})});
  assert.equal(r.modeled,1);assert.equal(r.qualified,0);
  assert.equal(r.selected.length,0);assert.equal(r.providerCalls,0);
  assert.equal(recordOuValueShadow(d,r.selected,now).added,0);
 }finally{d.close()}
});
test('strict >1.50 and >=+5% precisely, not unrelated 64% fixed probability gate',()=>{
 assert.equal(OU_VALUE_V2_POLICY.minimumPriceExclusive,1.5);
 assert.equal(OU_VALUE_V2_POLICY.minimumEV,.05);
 assert.equal(OU_VALUE_V2_POLICY.legacyOuV1Unchanged,true);
 assert.equal(OU_VALUE_V2_POLICY.providerCalls,0);
});

test('O/U V2 only screens upcoming fixtures with three FINISHED games per team, not combined history',()=>{
 const d=database();
 try{
  const fixture={id:7001,status:'scheduled',kickoff_ts:kickoff,league:{id:12},
   teams:{home:{id:501,name:'Alpha'},away:{id:502,name:'Beta'}}};
  assert.equal(buildOuValueModels(d,[fixture],now).models.length,1);
  d.exec('DELETE FROM result_version WHERE fixture_id IN (9000,9002,9004)');
  const missing=buildOuValueModels(d,[fixture],now);
  assert.equal(missing.models.length,0);
  assert.equal(missing.counts.insufficientHistory,1);
  assert.equal(buildOuValueModels(d,[{...fixture,status:'live'}],now).models.length,0);
  assert.equal(buildOuValueModels(d,[{...fixture,kickoff_ts:now-50}],now).models.length,0);
 }finally{d.close()}
});
