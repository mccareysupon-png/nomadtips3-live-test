import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initBttsHistory} from './btts-history-private.mjs';
import {initOuTargetHistoryFT} from './ou-target-history-ft-v1-test.mjs';
import {twoMatchDirection,reverseStreak,screenStreakReversal,initStreakLedger,
 issueStreakPicks,settleStreakPicks,readStreakStats,runStreakReversal,
 STREAK_REVERSAL_POLICY} from './ou-streak-reversal-v1-test.mjs';
const now=1800000000;
const score=(gf,ga)=>({gf,ga});
function prepare(){
 const raw=new DatabaseSync(':memory:');
 const db={exec(q,...args){
  if(!args.length&&!/^\s*(SELECT|WITH|PRAGMA)/i.test(q)){raw.exec(q);return []}
  const st=raw.prepare(q);
  if(/^\s*(SELECT|WITH|PRAGMA)/i.test(q))return st.all(...args);
  st.run(...args);return [];
 },transaction(fn){raw.exec('BEGIN IMMEDIATE');try{
  const x=fn();raw.exec('COMMIT');return x;
 }catch(e){raw.exec('ROLLBACK');throw e}}};
 initBttsHistory(db);initOuTargetHistoryFT(db);
 db.exec("CREATE TABLE result_version(fixture_id INTEGER NOT NULL,league_id INTEGER NOT NULL,kickoff INTEGER NOT NULL,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,hg INTEGER NOT NULL,ag INTEGER NOT NULL,observed INTEGER NOT NULL,status TEXT NOT NULL)");
 function add(id,home,goals,away=9000+id,kick=now-id*100){
  db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',
   id,1,kick,home,away,goals[0],goals[1],kick+100,'finished');
 }
 // Home team 11 has 2 consecutive high-scoring games.
 add(101,11,[2,2]);add(102,11,[1,2]);
 // Team 22 and 44 have 2 consecutive <=2 goals.
 add(103,22,[1,0]);add(104,22,[0,2]);
 add(105,44,[1,1]);add(106,44,[0,0]);
 // Team 55 also has high-scoring games.
 add(107,55,[3,1]);add(108,55,[2,1]);
 const fixture=(id,h,a)=>({id,teams:{home:{id:h,name:'Home '+h},away:{id:a,name:'Away '+a}},
  kickoff_ts:now+3600,status:'scheduled'});
 const fixtures=[
  fixture(501,11,33),fixture(502,22,33),fixture(503,11,22),
  fixture(504,22,44),fixture(505,11,55),fixture(506,33,66),
  {...fixture(507,11,33),status:'live'}];
 return {db,raw,fixtures,add};
}
test('both directions, no auto pick for mixed results and opposing team streaks',()=>{
 assert.equal(twoMatchDirection([score(2,1),score(0,3)]),'OVER');
 assert.equal(twoMatchDirection([score(1,0),score(2,0)]),'UNDER');
 assert.equal(twoMatchDirection([score(2,2),score(0,0)]),null);
 assert.equal(twoMatchDirection([score(2,2)]),null);
 assert.equal(reverseStreak([score(2,1),score(3,0)],[]).pick,'UNDER');
 assert.equal(reverseStreak([score(0,0),score(1,1)],[]).pick,'OVER');
 const clash=reverseStreak([score(2,1),score(2,2)],[score(0,0),score(1,1)]);
 assert.equal(clash.conflict,true);assert.equal(clash.pick,null);
 assert.equal(reverseStreak([score(2,1),score(1,2)],[score(3,0),score(3,3)]).pick,'UNDER');
 assert.equal(STREAK_REVERSAL_POLICY.line,2.5);
 assert.equal(STREAK_REVERSAL_POLICY.combineWithOtherStats,false);
});
test('separate persistent ledger, exact 4 candidates from two opposite rules, conflict skips, settled independently',()=>{
 const {db,raw,fixtures,add}=prepare();
 try{
  const screened=screenStreakReversal(db,fixtures,now);
  assert.equal(screened.counts.validUpcoming,6);
  assert.equal(screened.counts.underCandidates,2);
  assert.equal(screened.counts.overCandidates,2);
  assert.equal(screened.counts.conflicts,1);
  assert.deepEqual(screened.candidates.map(x=>[x.fixtureId,x.pick]),[[501,'UNDER'],[502,'OVER'],[504,'OVER'],[505,'UNDER']]);
  assert.equal(screened.conflicts[0].fixtureId,503);
  const first=runStreakReversal(db,fixtures,now);
  assert.equal(first.issued.added,4);
  assert.equal(first.stats.stats.total,4);
  assert.equal(first.stats.stats.pending,4);
  assert.equal(first.stats.stats.winRate,null);
  assert.equal(first.stats.stats.overPicks,2);
  assert.equal(first.stats.stats.underPicks,2);
  assert.equal(first.stats.today.selected,4);
  assert.equal(first.providerCalls,0);
  const again=runStreakReversal(db,fixtures,now+15);
  assert.equal(again.issued.added,0);
  assert.equal(again.issued.duplicate,4);
  assert.equal(again.stats.stats.total,4);
  // Verified full-time outcomes from the existing FT archive; no price or market calls.
  for(const [fid,h,a,hg,ag] of [
   [501,11,33,1,1],[502,22,33,3,1],
   [504,22,44,0,1],[505,11,55,2,2]]){
   db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',
    fid,1,now+3600,h,a,hg,ag,now+4800,'finished');
  }
  const settled=settleStreakPicks(db,now+5000);
  assert.equal(settled.settled,4);
  assert.equal(settled.win,2);
  assert.equal(settled.loss,2);
  const stats=readStreakStats(db,now+5000);
  assert.deepEqual({total:stats.stats.total,pending:stats.stats.pending,win:stats.stats.win,loss:stats.stats.loss,rate:stats.stats.winRate},
   {total:4,pending:0,win:2,loss:2,rate:50});
  assert.equal(stats.stats.overPicks,2);
  assert.equal(stats.stats.underPicks,2);
  assert.equal(stats.neverCombinedWith1X2BtssOu,true);
  assert.equal(stats.hasPricedPL,false);
  assert.equal(stats.records.length,4);
  assert(stats.records.every(p=>p.result_source==='FT_ARCHIVE'));
  assert.equal(settleStreakPicks(db,now+5200).settled,0);
  assert.equal(readStreakStats(db,now+5200).stats.win,2);
  const tables=raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'b46_ou_streak_reversal_v1_%'").all();
  assert.equal(tables.length,3);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='b46_ou_v2_snapshot_test'").get().n,0);
 }finally{raw.close()}
});
test('both low score and high score regimes are historical *hypotheses*, not model certainty',()=>{
 assert.equal(STREAK_REVERSAL_POLICY.requireBookmakerPrice,false);
 assert.equal(STREAK_REVERSAL_POLICY.profitLossWithoutPrice,false);
 assert.equal(STREAK_REVERSAL_POLICY.providerCalls,0);
 assert.equal(STREAK_REVERSAL_POLICY.productionWrites,0);
});
