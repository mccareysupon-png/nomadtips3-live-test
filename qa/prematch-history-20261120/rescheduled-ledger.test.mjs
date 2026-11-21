import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initPickLedger,recordPicks,settlePicks,ledger} from './test-pick-ledger.mjs';
const oldKickoff=1795262400,now=1795279999;
function makeDB(){
 const sqlite=new DatabaseSync(':memory:');
 const db={exec(sql,...args){
  const statement=sqlite.prepare(sql);
  return /^\s*(SELECT|WITH)\b/i.test(sql)?statement.all(...args):statement.run(...args);
 },transaction(fn){
  sqlite.exec('BEGIN');
  try{const out=fn();sqlite.exec('COMMIT');return out}
  catch(e){sqlite.exec('ROLLBACK');throw e}
 }};
 initPickLedger(db);
 db.exec('CREATE TABLE result_version (fixture_id INTEGER NOT NULL, observed INTEGER NOT NULL, league_id INTEGER NOT NULL, kickoff INTEGER NOT NULL,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,status TEXT NOT NULL,hg INTEGER,ag INTEGER)');
 const pick={id:204786977,homeId:11,awayId:22,home:'Alpha',away:'Beta',kickoff:oldKickoff,selectedAt:oldKickoff-3600,observed:oldKickoff-3700,pick:'HOME_WIN',price:2,probability:.6,edge:.1,ev:.2,tier:'both_min3',history:[3,3],model:'market-anchored-1x2-v1'};
 assert.equal(recordPicks(db,[pick],now).added,1);
 return {db,pick}
}
function final(db,kickoff,{home=11,away=22,hg=2,ag=1,status='finished',observed=now-60}={}){
 db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',204786977,observed,121,kickoff,home,away,status,hg,ag);
}
test('revised later kickoff settles only verified full-time on same fixture/team IDs',()=>{
 const {db}=makeDB();final(db,oldKickoff+7200);
 assert.equal(settlePicks(db,now),1);
 const p=ledger(db).rows[0];
 assert.equal(p.kickoff,oldKickoff,'immutable selection time must not change');
 assert.equal(p.status,'WIN');assert.equal(p.hg,2);assert.equal(p.ag,1);
 assert.equal(settlePicks(db,now),0,'idempotent');
});
test('revised earlier kickoff before a locked selection cannot be settled',()=>{
 const {db,pick}=makeDB();final(db,pick.selectedAt-10);
 assert.equal(settlePicks(db,now),0);assert.equal(ledger(db).rows[0].status,'PENDING');
});
test('a result with mismatched teams cannot settle',()=>{
 const {db}=makeDB();final(db,oldKickoff+3600,{away:23});
 assert.equal(settlePicks(db,now),0);
});
test('abandoned/incomplete status never settles',()=>{
 const {db}=makeDB();final(db,oldKickoff+3600,{status:'abandoned'});
 assert.equal(settlePicks(db,now),0);
});
test('no settlement before revised scheduled kickoff',()=>{
 const {db}=makeDB();final(db,now+300,{observed:now-60});
 assert.equal(settlePicks(db,now),0);
});
