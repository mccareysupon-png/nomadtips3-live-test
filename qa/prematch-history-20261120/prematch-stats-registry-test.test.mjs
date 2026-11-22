import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init,ingest} from './history.mjs';
import {initPickLedger,recordPicks,settlePicks} from './test-pick-ledger.mjs';
import {initBttsPickLedger,recordBttsPicks,settleBttsPicks} from './btts-pick-ledger-test.mjs';
import {initPreMarketStatsRegistry,syncPreMarketStatsRegistry,readPreMarketStatsRegistry,auditPreMarketStatsRegistry} from './prematch-stats-registry-test.mjs';
const time=s=>Date.parse(s)/1000;
const initial=time('2026-11-22T11:00:00Z'),kickoff=time('2026-11-22T15:00:00Z'),finishedAt=time('2026-11-22T18:00:00Z');
function db(){
 const sql=new DatabaseSync(':memory:');
 const x={exec:(q,...p)=>{const stmt=sql.prepare(q);
   return /^\s*(SELECT|WITH|PRAGMA)/i.test(q)?stmt.all(...p):(stmt.run(...p),[])},
  transaction:fn=>{sql.exec('BEGIN');try{const result=fn();sql.exec('COMMIT');return result}
   catch(e){sql.exec('ROLLBACK');throw e}}};
 init(x);initPickLedger(x);initBttsPickLedger(x);initPreMarketStatsRegistry(x);
 return x;
}
const pick1x2=(fixtureId=111)=>({id:fixtureId,homeId:11,awayId:22,home:'Home',away:'Away',
 kickoff,selectedAt:initial,observed:initial-100,pick:'HOME_WIN',price:2.5,
 probability:.6,edge:.1,ev:.5,tier:'both_min3',history:[10,10],model:'market-anchored-1x2-v1'});
const pickBtts=(fixtureId=111)=>({id:fixtureId,homeId:11,awayId:22,leagueId:9,leagueName:'Bangkok League',
 home:'Home',away:'Away',kickoff,pickedAt:initial,observed:initial-100,pick:'BTTS_YES',
 price:1.85,probability:.75,edge:.08,ev:.38,homeCount:10,awayCount:10,
 model:'btts-ultra-history10-shadow-v1',source:'STORED_BET365'});
const result=(hg=2,ag=1)=>({id:111,league:{id:9},
 teams:{home:{id:11},away:{id:22}},kickoff_ts:kickoff,status:'finished',
 status_code:'full',goals:{home:hg,away:ag}});
test('registry creates three empty market snapshots, without touching either source',()=>{
 const d=db(),r=readPreMarketStatsRegistry(d,initial);
 assert.equal(r.registryEvents,0);
 assert.deepEqual(Object.keys(r.markets),['1X2','BTTS','TOTAL']);
 assert.equal(r.markets.TOTAL.total,0);
 assert.equal(r.markets.BTTS.winRate,null);
 assert.equal(r.fullLedgerRecalculationOnRead,false);
 assert.equal(auditPreMarketStatsRegistry(d).verified,true);
});
test('one fixture may create two independent market events and one Total, without double counting',()=>{
 const d=db();
 assert.equal(recordPicks(d,[pick1x2()],initial).added,1);
 assert.equal(recordBttsPicks(d,[pickBtts()],initial).added,1);
 const first=syncPreMarketStatsRegistry(d,initial+50);
 assert.equal(first.newEvents,2);
 assert.equal(first.byMarket.BTTS.newEvents,1);
 assert.equal(first.byMarket['1X2'].newEvents,1);
 const snap=readPreMarketStatsRegistry(d,initial+50);
 assert.equal(snap.markets['1X2'].total,1);
 assert.equal(snap.markets.BTTS.total,1);
 assert.equal(snap.markets.TOTAL.total,2);
 assert.equal(snap.markets.TOTAL.pending,2);
 assert.equal(snap.dailyBooks.TOTAL.selected.total,2);
 assert.equal(snap.dailyBooks.TOTAL.settled.total,0);
 assert.equal(syncPreMarketStatsRegistry(d,initial+60).processed,0);
 assert.equal(readPreMarketStatsRegistry(d,initial+60).registryEvents,2);
 assert.equal(auditPreMarketStatsRegistry(d).verified,true);
});
test('confirmed FT settles BOTH and updates winrate, P/L, daily snapshots exactly once',()=>{
 const d=db();
 recordPicks(d,[pick1x2()],initial);
 recordBttsPicks(d,[pickBtts()],initial);
 syncPreMarketStatsRegistry(d,initial+50);
 ingest(d,[result()],finishedAt);
 assert.equal(settlePicks(d,finishedAt+100),1);
 assert.equal(settleBttsPicks(d,finishedAt+100),1);
 const report=syncPreMarketStatsRegistry(d,finishedAt+200);
 assert.equal(report.settlements,2);
 const snap=readPreMarketStatsRegistry(d,finishedAt+200);
 assert.equal(snap.markets.BTTS.win,1);
 assert.equal(snap.markets.TOTAL.pending,0);
 assert.equal(snap.markets.TOTAL.winRate,100);
 assert.ok(Math.abs(snap.markets.TOTAL.units-2.35)<1e-9);
 assert.equal(snap.dailyBooks.BTTS.settled.total,1);
 assert.equal(snap.dailyBooks.TOTAL.settled.total,2);
 assert.equal(snap.dailySeries.BTTS.at(-1).win,1);
 assert.equal(syncPreMarketStatsRegistry(d,finishedAt+300).processed,0);
 assert.equal(auditPreMarketStatsRegistry(d).verified,true);
});
test('a corrected result reverses previous snapshot then applies replacement without duplicate',()=>{
 const d=db();
 recordPicks(d,[pick1x2()],initial);
 recordBttsPicks(d,[pickBtts()],initial);
 syncPreMarketStatsRegistry(d,initial+10);
 ingest(d,[result()],finishedAt);
 settlePicks(d,finishedAt+100);settleBttsPicks(d,finishedAt+100);
 syncPreMarketStatsRegistry(d,finishedAt+200);
 // Simulate an authorized settlement correction at the BTTS ledger source.
 d.exec("UPDATE test_pick_btts SET status='LOSS',units=-1 WHERE fixture_id=?",111);
 const changed=syncPreMarketStatsRegistry(d,finishedAt+300);
 assert.equal(changed.revisions,1);
 const snap=readPreMarketStatsRegistry(d,finishedAt+300);
 assert.equal(snap.markets.BTTS.loss,1);
 assert.equal(snap.markets.BTTS.win,0);
 assert.equal(snap.markets['1X2'].win,1);
 assert.equal(snap.markets.TOTAL.win,1);
 assert.equal(snap.markets.TOTAL.loss,1);
 assert.equal(snap.markets.TOTAL.winRate,50);
 assert.ok(Math.abs(snap.markets.TOTAL.units-.5)<1e-9);
 assert.equal(snap.registryEvents,2);
 assert.equal(snap.revisions,3); // 2 initial settlements + 1 correction
 assert.equal(syncPreMarketStatsRegistry(d,finishedAt+400).processed,0);
 assert.equal(auditPreMarketStatsRegistry(d).verified,true);
});
test('London 06:00 cutoff: selection on previous accounting day, settlement on next',()=>{
 const d=db(),p=pickBtts();
 p.pickedAt=time('2026-11-22T04:50:00Z');
 p.observed=p.pickedAt-10;
 p.kickoff=time('2026-11-22T08:00:00Z');
 assert.equal(recordBttsPicks(d,[p],time('2026-11-22T05:00:00Z')).added,1);
 syncPreMarketStatsRegistry(d,time('2026-11-22T05:10:00Z'));
 const later=time('2026-11-22T10:00:00Z');
 d.exec("UPDATE test_pick_btts SET status='WIN',settled_at=?,units=? WHERE fixture_id=?",later,.85,111);
 syncPreMarketStatsRegistry(d,later+10);
 const before=readPreMarketStatsRegistry(d,time('2026-11-22T05:40:00Z'));
 assert.equal(before.dailyBooks.BTTS.selected.total,1);
 assert.equal(before.dailyBooks.BTTS.settled.total,0);
 const after=readPreMarketStatsRegistry(d,later+20);
 assert.equal(after.dailyBooks.BTTS.selected.total,0);
 assert.equal(after.dailyBooks.BTTS.settled.total,1);
 assert.notEqual(before.window.businessDay,after.window.businessDay);
 assert.equal(after.markets.BTTS.winRate,100);
});
test('graph 30D / 90D reads snapshots, not full source ledgers',()=>{
 const original=db(),p=pickBtts();
 recordBttsPicks(original,[p],initial);
 syncPreMarketStatsRegistry(original,initial+20);
 const blocked={exec:(query,...args)=>{
  if(/test_pick_1x2|test_pick_btts/i.test(query))throw Error('HISTORY_SCAN_FORBIDDEN_ON_READ');
  return original.exec(query,...args);
 }};
 assert.equal(readPreMarketStatsRegistry(blocked,initial+40,{rangeDays:30}).markets.BTTS.total,1);
 assert.equal(readPreMarketStatsRegistry(blocked,initial+40,{rangeDays:90}).rangeDays,90);
 assert.throws(()=>readPreMarketStatsRegistry(original,initial,{rangeDays:120}),/INVALID_STATS_RANGE/);
});
test('invalid source result rolls back entire registry transaction',()=>{
 const d=db();
 recordBttsPicks(d,[pickBtts()],initial);
 syncPreMarketStatsRegistry(d,initial+10);
 d.exec("UPDATE test_pick_btts SET status='WIN',settled_at=?,units=? WHERE fixture_id=?",finishedAt,-3,111);
 assert.throws(()=>syncPreMarketStatsRegistry(d,finishedAt+100),/INVALID_RESULT_UNITS/);
 assert.equal(readPreMarketStatsRegistry(d,finishedAt+100).markets.BTTS.pending,1);
 assert.equal(readPreMarketStatsRegistry(d,finishedAt+100).registryEvents,1);
});
