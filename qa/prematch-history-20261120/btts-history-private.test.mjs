import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init,ingest,lastMatches} from './history.mjs';
import {initBttsHistory,importBttsFinished,bttsLastMatches,bttsHistoryCoverage,candidateBttsLeagues} from './btts-history-private.mjs';
import {evaluateBttsUltra} from './btts-ultra-shadow.mjs';
function makeDb(){
 const sql=new DatabaseSync(':memory:');
 const db={exec:(q,...p)=>{const stm=sql.prepare(q);return /^\s*(SELECT|WITH|PRAGMA)/i.test(q)?stm.all(...p):(stm.run(...p),[])},
  transaction:f=>{sql.exec('BEGIN');try{const x=f();sql.exec('COMMIT');return x}catch(e){sql.exec('ROLLBACK');throw e}}};
 init(db);initBttsHistory(db);return db;
}
function result(i,home,away,lg=77){
 return {id:10000+i,league:{id:lg},teams:{home:{id:home},away:{id:away}},kickoff_ts:200+i,
  status:'finished',status_code:'full',goals:{home:2,away:1}};
}
test('Ultras season score pages are isolated from shared FT and 1X2 data',()=>{
 const db=makeDb(),items=Array.from({length:25},(_,i)=>result(i,i<12?11:22,2000+i));
 const before=Array.from(db.exec('SELECT COUNT(*) n FROM result_version'))[0].n;
 const r=importBttsFinished(db,items,300,{leagueId:77,season:'2026'});
 assert.equal(r.added,25);
 assert.equal(Array.from(db.exec('SELECT COUNT(*) n FROM result_version'))[0].n,before);
 assert.equal(bttsHistoryCoverage(db).privateFT,25);
 assert.equal(bttsLastMatches(db,11,500,350).length,10);
 assert.equal(bttsLastMatches(db,22,500,350).length,10);
 assert.equal(lastMatches(db,11,500,350).length,0);
});
test('ten real historical games permit only an independent BTTS test calculation',()=>{
 const db=makeDb();
 const rows=[...Array.from({length:12},(_,i)=>result(i,11,2000+i)),...Array.from({length:12},(_,i)=>result(40+i,22,3000+i))];
 importBttsFinished(db,rows,500,{leagueId:77,season:'2026'});
 const future=[{id:999999,status:'scheduled',kickoff_ts:900,league:{id:77,name:'Sample League'},
  teams:{home:{id:11,name:'Home'},away:{id:22,name:'Away'}}}];
 const before=Array.from(db.exec('SELECT COUNT(*) n FROM result_version'))[0].n;
 const r=evaluateBttsUltra(db,future,600);
 assert.equal(r.totals.historyReady,1);
 assert.equal(r.totals.modelProbabilityReady,1);
 assert.equal(r.totals.quoteRequired,1);
 assert.equal(r.totals.qualified,0);
 assert.equal(r.providerCalls,0);assert.equal(r.published,0);
 assert.equal(Array.from(db.exec('SELECT COUNT(*) n FROM result_version'))[0].n,before);
});
test('deduplicate latest shared FT and private BTTS row for same fixture',()=>{
 const db=makeDb();
 const a=result(1,11,22);
 ingest(db,[a],300);
 importBttsFinished(db,[a],300,{leagueId:77,season:'2026'});
 assert.equal(bttsLastMatches(db,11,900,350).length,1);
 const wrongFix={...a,goals:{home:1,away:0}};
 const update=importBttsFinished(db,[wrongFix],310,{leagueId:77,season:'2026'});
 assert.equal(update.corrected,1);
 assert.equal(bttsLastMatches(db,11,900,350).length,1);
 assert.equal(bttsLastMatches(db,11,900,350)[0].btts,false);
 // The old shared result stays immutable. BTTS private did not overwrite it.
 assert.equal(lastMatches(db,11,900,350)[0].btts,true);
});
test('no future information leaks into BTTS analysis',()=>{
 const db=makeDb();
 importBttsFinished(db,[result(1,11,22)],300,{leagueId:77,season:'2026'});
 assert.equal(bttsLastMatches(db,11,900,299).length,0);
 assert.equal(bttsLastMatches(db,11,200,900).length,0);
});
test('invalid mix of seasons, league, unfinished or future rows is rejected atomically',()=>{
 const db=makeDb();
 for(const bad of [{...result(2,11,22),league:{id:78}},{...result(2,11,22),goals:{home:null,away:1}},
  {...result(2,11,22),status:'scheduled'},{...result(2,11,22),kickoff_ts:399}]){
  assert.throws(()=>importBttsFinished(db,[result(1,11,22),bad],350,{leagueId:77,season:'2026'}),/INVALID_OR_MIXED/);
 }
 assert.equal(bttsHistoryCoverage(db).privateFT,0);
});
test('idempotent re-import and no duplicate fixtures in a page',()=>{
 const db=makeDb(),item=result(1,11,22);
 assert.equal(importBttsFinished(db,[item],300,{leagueId:77,season:'2026'}).added,1);
 assert.equal(importBttsFinished(db,[item],310,{leagueId:77,season:'2026'}).duplicates,1);
 assert.throws(()=>importBttsFinished(db,[item,item],320,{leagueId:77,season:'2026'}),/INVALID_OR_MIXED/);
});
test('league candidates use real fixture IDs only, ranked by upcoming count',()=>{
 const fi=[1,2,3].map(i=>({id:i,status:'scheduled',league:{id:i<3?77:66,name:i<3?'League A':'League B'},teams:{home:{id:i+10},away:{id:i+20}}}));
 const r=candidateBttsLeagues(fi);
 assert.equal(r[0].leagueId,77);assert.equal(r[0].upcoming,2);
});
