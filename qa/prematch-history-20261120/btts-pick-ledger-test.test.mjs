import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init,ingest} from './history.mjs';
import {initBttsHistory,importBttsTeamFallback} from './btts-history-private.mjs';
import {initPickLedger,recordPicks,ledger} from './test-pick-ledger.mjs';
import {evaluateBttsUltra} from './btts-ultra-shadow.mjs';
import {initBttsPickLedger,bttsPicksFromScreen,recordBttsPicks,settleBttsPicks,bttsPickLedger,combinedPrematchLedgers,marketDailyBooks,bttsDailySeries} from './btts-pick-ledger-test.mjs';
function db(){
 const sql=new DatabaseSync(':memory:');
 const x={exec:(q,...p)=>{const s=sql.prepare(q);return /^\s*(SELECT|WITH|PRAGMA)/i.test(q)?s.all(...p):(s.run(...p),[])},
  transaction:f=>{sql.exec('BEGIN');try{const x=f();sql.exec('COMMIT');return x}catch(e){sql.exec('ROLLBACK');throw e}}};
 init(x);initPickLedger(x);initBttsHistory(x);initBttsPickLedger(x);return x;
}
const bttsFixture=(id=999)=>({id:String(id),status:'scheduled',kickoff_ts:1200,league:{id:5,name:'Bangkok League'},
 teams:{home:{id:11,name:'Home'},away:{id:22,name:'Away'}},
 storedBet365:{bookmaker:'bet365',observed:500,prices:{BTTS_YES:1.85,BTTS_NO:2.1}}});
const finished=(i,h,a,kickoff=300)=>({id:i,league:{id:5},
 teams:{home:{id:h},away:{id:a}},kickoff_ts:kickoff,
 status:'finished',status_code:'full',goals:{home:2,away:1}});
function ready(x,h=10,a=10){
 const rows1=Array.from({length:h},(_,i)=>finished(100+i,11,2000+i,201+i));
 const rows2=Array.from({length:a},(_,i)=>finished(200+i,22,3000+i,201+i));
 importBttsTeamFallback(x,rows1,600,{teamId:11});
 importBttsTeamFallback(x,rows2,600,{teamId:22});
}
function oldPick(now=700){
 return {id:999,homeId:11,awayId:22,home:'Home',away:'Away',kickoff:1200,
  selectedAt:now,observed:500,pick:'HOME_WIN',price:2.5,
  probability:.6,edge:.06,ev:.5,tier:'both_min3',history:[10,10],model:'market-anchored-1x2-v1'};
}
test('passing Bet365 BTTS history 10/10 creates exactly one immutable BTTS prediction',()=>{
 const d=db();ready(d);const f=bttsFixture(),now=700;
 const screen=evaluateBttsUltra(d,[f],now,{},1000);
 assert.equal(screen.totals.qualified,1);
 const p=bttsPicksFromScreen(screen,[f],now);
 assert.equal(p.length,1);assert.equal(p[0].pick,'BTTS_YES');
 assert.equal(p[0].observed,500);assert.equal(p[0].model,'btts-ultra-history10-shadow-v1');
 const one=recordBttsPicks(d,p,now),again=recordBttsPicks(d,p,now);
 assert.equal(one.added,1);assert.equal(again.duplicate,1);
 assert.equal(bttsPickLedger(d).stats.pending,1);
 assert.equal(bttsPickLedger(d).rows[0].market,'BTTS');
 assert.equal(bttsPickLedger(d).published,0);
});
test('BTTS picks accept 3–10 per team and persist actual home/away sample size',()=>{
 for(const [h,a] of [[3,3],[3,10],[10,3],[10,10]]){
  const d=db();ready(d,h,a);const f=bttsFixture(),now=700;
  const picks=bttsPicksFromScreen(evaluateBttsUltra(d,[f],now,{},1000),[f],now);
  assert.equal(picks.length,1);assert.equal(picks[0].homeCount,h);assert.equal(picks[0].awayCount,a);
  assert.equal(recordBttsPicks(d,picks,now).added,1);
  assert.equal(recordBttsPicks(d,picks,now).duplicate,1);
  assert.equal(bttsPickLedger(d).rows[0].home_count,h);assert.equal(bttsPickLedger(d).rows[0].away_count,a);
 }
 const d=db();ready(d,2,10);const f=bttsFixture();
 assert.equal(bttsPicksFromScreen(evaluateBttsUltra(d,[f],700,{},1000),[f],700).length,0);
});
test('combine preserves 1X2 on same fixture; two independent cards chronological and win-rate totals',()=>{
 const d=db();ready(d);const f=bttsFixture();const now=700;
 assert.equal(recordPicks(d,[oldPick()],now).added,1);
 assert.equal(recordBttsPicks(d,bttsPicksFromScreen(evaluateBttsUltra(d,[f],now,{},1000),[f],now),now).added,1);
 const oneBefore=JSON.stringify(ledger(d));
 const a=combinedPrematchLedgers(ledger(d),bttsPickLedger(d));
 assert.equal(a.rows.length,2);assert.equal(a.stats.total,2);assert.equal(a.stats.pending,2);
 assert.deepEqual(a.rows.map(x=>x.market),['1X2','BTTS']);
 assert.equal(JSON.stringify(ledger(d)),oneBefore);
 const result=finished(999,11,22,1200);
 ingest(d,[result],1400);
 assert.equal(settleBttsPicks(d,1500),1);
 assert.equal(settleBttsPicks(d,1510),0);
 const s=bttsPickLedger(d).stats;
 assert.equal(s.win,1);assert.equal(s.loss,0);assert.ok(Math.abs(s.units-.85)<1e-10);assert.equal(s.winRate,100);
 assert.equal(ledger(d).stats.pending,1); // 1X2 untouched.
 const all=combinedPrematchLedgers(ledger(d),bttsPickLedger(d));
 assert.equal(all.stats.win,1);assert.equal(all.stats.pending,1);
 assert.equal(all.stats.winRate,100);assert.ok(Math.abs(all.stats.units-.85)<1e-10);
 assert.equal(ledger(d).rows[0].status,'PENDING');
});
test('BTTS_NO wins only when at least one team scores zero, settlement requires confirmed FT',()=>{
 const d=db(),p={id:888,homeId:51,awayId:52,leagueId:5,leagueName:'League',
  home:'A',away:'B',kickoff:1200,pickedAt:700,observed:500,pick:'BTTS_NO',
  price:1.8,probability:.72,edge:.12,ev:.296,homeCount:10,awayCount:10,
  model:'btts-ultra-history10-shadow-v1',source:'STORED_BET365'};
 assert.equal(recordBttsPicks(d,[p],700).added,1);
 assert.equal(settleBttsPicks(d,1300),0);
 ingest(d,[{...finished(888,51,52,1200),goals:{home:0,away:2}}],1400);
 assert.equal(settleBttsPicks(d,1500),1);
 assert.equal(bttsPickLedger(d).stats.win,1);
 assert.ok(Math.abs(bttsPickLedger(d).stats.units-.8)<1e-10);
});
test('BTTS daily and combined books use original London 06:00 and count one pick per market',()=>{
 const d=db();ready(d);const now=700;
 recordPicks(d,[oldPick()],now);
 recordBttsPicks(d,bttsPicksFromScreen(evaluateBttsUltra(d,[bttsFixture()],now,{},1000),[bttsFixture()],now),now);
 const books=marketDailyBooks(d,700);
 assert.equal(books.oneX2.selected.total,1);
 assert.equal(books.btts.selected.total,1);
 assert.equal(books.all.selected.total,2);
 assert.equal(books.all.settled.total,0);
 assert.equal(books.all.window.timezone,'Europe/London');
 assert.deepEqual(bttsDailySeries(d,'BTTS'),[]);
});
test('reject forged BTTS evidence, odds missing, duplicate, or after kickoff',()=>{
 const d=db();const f=bttsFixture();
 assert.equal(bttsPicksFromScreen(evaluateBttsUltra(d,[f],700,{},1000),[f],700).length,0);
 const bad={id:999,homeId:11,awayId:22,leagueId:5,leagueName:'X',home:'A',away:'B',
  kickoff:1200,pickedAt:1250,observed:700,pick:'BTTS_YES',price:1.85,
  probability:.8,edge:.2,ev:.48,homeCount:10,awayCount:10,
  model:'btts-ultra-history10-shadow-v1',source:'STORED_BET365'};
 assert.equal(recordBttsPicks(d,[bad],1300).rejected,1);
 assert.equal(recordBttsPicks(d,[{...bad,pickedAt:700,source:'UNVERIFIED_BOOK'}],700).rejected,1);
 assert.equal(bttsPickLedger(d).stats.total,0);
});
