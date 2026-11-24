import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initBttsHistory} from './btts-history-private.mjs';
import {initOuTargetHistoryFT} from './ou-target-history-ft-v1-test.mjs';
import {twoPriorOver25,evaluateThirdGameUnder25,auditTwoOverThenUnder25,TWO_OVER_THEN_UNDER_POLICY} from './ou-two-over-then-under25-test.mjs';
const now=1800000000;
const r=(gf,ga)=>({gf,ga});
test('exact condition: latest two matches both Over2.5 triggers Under2.5 next; no price',()=>{
 assert.equal(twoPriorOver25([r(2,1),r(1,2)]),true);
 assert.equal(twoPriorOver25([r(3,0),r(4,2)]),true);
 assert.equal(twoPriorOver25([r(2,0),r(4,2)]),false);
 assert.equal(twoPriorOver25([r(2,2)]),false);
 assert.equal(twoPriorOver25([r(2,2),r(0,0),r(3,3)]),false);
 assert.equal(twoPriorOver25([r(1,2),r(2,2),r(0,0)]),true);
 const either=evaluateThirdGameUnder25([r(2,1),r(1,2)],[r(0,0),r(1,1)]);
 assert.equal(either.eligible,true);assert.equal(either.selectedSide,'UNDER');
 assert.equal(either.targetLine,2.5);assert.equal(either.homeTwoOvers,true);
 assert.equal(evaluateThirdGameUnder25([r(1,1),r(2,1)],[r(0,0),r(1,1)]).eligible,false);
 assert.equal(TWO_OVER_THEN_UNDER_POLICY.ledgerWrites,0);
});
test('read verified last two FT per team, accept any team streak; no rewrites or paid requests',()=>{
 const db0=new DatabaseSync(':memory:');
 const db={exec(q,...args){
  if(!args.length&&!/^\s*(SELECT|WITH|PRAGMA)/i.test(q)){db0.exec(q);return []}
  const s=db0.prepare(q);
  if(/^\s*(SELECT|WITH|PRAGMA)/i.test(q))return s.all(...args);
  s.run(...args);return [];
 }};
 try{
  initBttsHistory(db);initOuTargetHistoryFT(db);
  db.exec("CREATE TABLE result_version(fixture_id INTEGER NOT NULL,league_id INTEGER NOT NULL,kickoff INTEGER NOT NULL,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,hg INTEGER NOT NULL,ag INTEGER NOT NULL,observed INTEGER NOT NULL,status TEXT NOT NULL)");
  for(const [id,team,g1,g2,age] of [[101,11,2,2,10000],[102,11,1,2,20000],[103,22,0,1,10000],[104,22,0,0,20000],[105,33,2,1,10000],[106,33,1,2,20000]])
   db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',id,1,now-age,team,100+id,g1,g2,now-age+100,'finished');
  const fixture=(id,home,away)=>({id,teams:{home:{id:home,name:'Team '+home},away:{id:away,name:'Team '+away}},league:{id:1},kickoff_ts:now+3600,status:'scheduled'});
  const res=auditTwoOverThenUnder25(db,[fixture(501,11,22),fixture(502,22,33),fixture(503,22,23),fixture(504,11,33),{...fixture(505,11,33),status:'live'}],now);
  assert.equal(res.stats.validUpcoming,4);
  assert.equal(res.stats.matchHistoryEither,3);
  assert.equal(res.stats.matchHistoryHome,2);
  assert.equal(res.stats.matchHistoryAway,2);
  assert.equal(res.stats.matchHistoryBoth,1);
  assert.deepEqual(res.candidates.map(x=>x.fixtureId),[501,502,504]);
  assert.equal(res.candidates[0].line,2.5);
  assert.equal(res.candidates[0].side,'UNDER');
  assert.equal(res.stats.providerCalls,0);
  assert.equal(res.stats.picksWritten,0);
 }finally{db0.close()}
});
