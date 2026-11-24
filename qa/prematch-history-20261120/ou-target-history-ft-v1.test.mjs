import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initBttsHistory} from './btts-history-private.mjs';
import {initOuTargetHistoryFT,importOuTargetHistoryFT,ouTargetLastMatches,
 ouTargetLeagueAsOf,ouTargetHistoryCoverage,ouTargetH2HMatches} from './ou-target-history-ft-v1-test.mjs';
function db(){
 const sql=new DatabaseSync(':memory:');
 const d={exec:(q,...x)=>{const s=sql.prepare(q);return s.columns().length?s.all(...x):(s.run(...x),[])},
  transaction:fn=>{sql.exec('BEGIN');try{const x=fn();sql.exec('COMMIT');return x}
   catch(e){sql.exec('ROLLBACK');throw e}},close:()=>sql.close()};
 initBttsHistory(d);
 d.exec("CREATE TABLE result_version(fixture_id INTEGER,league_id INTEGER,kickoff INTEGER,home_id INTEGER,away_id INTEGER,hg INTEGER,ag INTEGER,observed INTEGER,status TEXT)");
 initOuTargetHistoryFT(d);
 return d;
}
const NOW=1800000000;
const finished=(id,home,away,kickoff=NOW-100000,league=12)=>({
 id,league:{id:league},teams:{home:{id:home},away:{id:away}},
 kickoff_ts:kickoff,status:'finished',status_code:'full',goals:{home:2,away:1}});
test('O/U-only finished import serves both team history and league prior without BTTS mutations',()=>{
 const d=db();
 const f=[finished(8001,111,222,NOW-30000),finished(8002,111,333,NOW-20000),finished(8003,111,444,NOW-10000)];
 const result=importOuTargetHistoryFT(d,f,NOW,{leagueId:12});
 assert.equal(result.added,3);
 assert.equal(ouTargetHistoryCoverage(d).ft,3);
 assert.equal(ouTargetLastMatches(d,111,NOW+3600,NOW,10).length,3);
 assert.equal(ouTargetLastMatches(d,222,NOW+3600,NOW,10).length,1);
 assert.equal(ouTargetLeagueAsOf(d,12,NOW+3600,NOW).length,3);
 assert.equal(d.exec('SELECT COUNT(*) AS n FROM btts_history_private_test')[0].n,0);
 assert.equal(d.exec('SELECT COUNT(*) AS n FROM result_version')[0].n,0);
 assert.equal(importOuTargetHistoryFT(d,f,NOW+1,{leagueId:12}).unchanged,3);
 d.close();
});
test('enforce verified FT, correct target, as-of, and no cross-market double count',()=>{
 const d=db();
 assert.throws(()=>importOuTargetHistoryFT(d,[finished(1,1,2,NOW-5000,33)],NOW,{leagueId:12}),/INVALID_FT_OR_TARGET/);
 assert.throws(()=>importOuTargetHistoryFT(d,[{...finished(1,1,2),status:'live'}],NOW,{teamId:1}),/INVALID_FT_OR_TARGET/);
 assert.throws(()=>importOuTargetHistoryFT(d,[finished(1,1,2,NOW+100)],NOW,{teamId:1}),/INVALID_FT_OR_TARGET/);
 assert.equal(importOuTargetHistoryFT(d,[finished(8001,1,2)],NOW,{teamId:1}).added,1);
 d.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',8001,12,NOW-100000,1,2,2,1,NOW-1,'finished');
 assert.equal(ouTargetLastMatches(d,1,NOW+500,NOW,10).length,1);
 assert.equal(ouTargetLeagueAsOf(d,12,NOW+500,NOW).length,1);
 assert.equal(ouTargetLastMatches(d,1,NOW+100,NOW-200000,10).length,0);
 d.close();
});

test('H2H combines reverse orientations across source tables, deduplicates, rejects future FT',()=>{
 const d=db();
 const first={...finished(9101,111,222,NOW-30000),goals:{home:2,away:0}};
 const reverse={...finished(9102,222,111,NOW-20000),goals:{home:3,away:1}};
 const future=finished(9103,111,222,NOW+30000);
 assert.equal(importOuTargetHistoryFT(d,[first,reverse],NOW,{leagueId:12}).added,2);
 d.exec("INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)",9102,12,NOW-20000,222,111,3,1,NOW-1000,'finished');
 assert.deepEqual(ouTargetH2HMatches(d,111,222,NOW+3600,NOW).map(x=>[x.fixtureId,x.homeGoals,x.awayGoals]),
  [[9102,1,3],[9101,2,0]]);
 assert.equal(ouTargetH2HMatches(d,111,333,NOW+3600,NOW).length,0);
 assert.equal(ouTargetH2HMatches(d,111,222,NOW-25000,NOW-26000).length,1);
 assert.throws(()=>importOuTargetHistoryFT(d,[future],NOW,{leagueId:12}),/INVALID_FT_OR_TARGET/);
 d.close();
});
