import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initOuValueShadow} from './ou-value-screener-v2-test.mjs';
import {initOuV2Settlement,settleOuV2FromExistingResults,readOuV2SettlementState,
 syncOuV2SettlementSnapshot} from './ou-v2-settlement-test.mjs';
const now=1795450000, fixtureId=204906152;
function database(){
 const raw=new DatabaseSync(':memory:');
 const db={exec(sql,...args){
  if(!args.length&&!/^\s*(SELECT|WITH|PRAGMA)/i.test(sql)){raw.exec(sql);return [];}
  const stmt=raw.prepare(sql);
  if(/^\s*(SELECT|WITH|PRAGMA)/i.test(sql))return stmt.all(...args);
  stmt.run(...args);return [];
 },transaction(fn){
  raw.exec('BEGIN IMMEDIATE');
  try{const v=fn();raw.exec('COMMIT');return v;}
  catch(e){raw.exec('ROLLBACK');throw e;}
 },close(){raw.close()}};
 initOuValueShadow(db);
 db.exec("CREATE TABLE result_version(fixture_id INTEGER NOT NULL,observed INTEGER NOT NULL,league_id INTEGER NOT NULL,kickoff INTEGER NOT NULL,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,hg INTEGER NOT NULL,ag INTEGER NOT NULL,status TEXT NOT NULL)");
 return db;
}
function insert(db,{id=fixtureId,line=2.5,side='UNDER',price=2.8}={}){
 db.exec("INSERT INTO b46_ou_value_v2_shadow_test(fixture_id,home_id,away_id,kickoff,picked_at,pick,line,price,bookmaker,source,source_observed_at,model,lambda_home,lambda_away,expected_goals,ev,home_history,away_history,history_confidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
 id,501,502,now-500,now-4100,side,line,price,'ladbrokes','FULL_MARKET_CACHE_GOAL_LINE_CLOSING',now-4100,'ou-poisson-shrinkage-value-all-markets-v2-test',1.2,0.8,2,0.38,1,0,'LOW_SAMPLE');
}
function hub({id=fixtureId,hg=1,ag=1,status='finished',boardState='finished',statusCode='full',homeId=501,awayId=502}={}){
 return {ok:true,cacheOnly:true,stale:false,fetchedAt:now*1000-3000,fixtures:[{
  fixtureId:id,status,boardState,statusCode,
  kickoffUtc:new Date((now-500)*1000).toISOString(),home:{id:homeId},away:{id:awayId},
  goals:{home:hg,away:ag}
 }]};
}
test('Asian UNDER 2.5 real FT settles once, keeps original locked price and creates snapshot',()=>{
 const db=database();
 try{
  insert(db);const before=readOuV2SettlementState(db,now);
  assert.equal(before.stats.total,0);
  const a=settleOuV2FromExistingResults(db,{now,snapshot:hub()});
  assert.equal(a.settled,1);assert.equal(a.fromHub,1);
  const s=readOuV2SettlementState(db,now);
  assert.equal(s.stats.total,1);assert.equal(s.stats.pending,0);assert.equal(s.stats.win,1);
  assert.equal(s.stats.units,1.8);
  assert.equal(s.settlements[fixtureId].kind,'FULL_WIN');
  assert.equal(db.exec("SELECT price FROM b46_ou_value_v2_shadow_test WHERE fixture_id=?",fixtureId)[0].price,2.8);
  const b=settleOuV2FromExistingResults(db,{now:now+30,snapshot:hub({hg:2,ag:3})});
  assert.equal(b.settled,0);assert.equal(b.snapshotChanges,0);
  assert.equal(readOuV2SettlementState(db,now+30).stats.units,1.8);
 }finally{db.close()}
});
test('Asian quarter lines produce exact HALF WIN and HALF LOSS; counted in win or loss once',()=>{
 for(const [line,side,hg,ag,kind,units,status] of [
  [2.25,'UNDER',1,1,'HALF_WIN',.9,'WIN'],
  [2.75,'OVER',1,2,'HALF_WIN',.9,'WIN'],
  [2.25,'OVER',1,1,'HALF_LOSS',-.5,'LOSS'],
  [2.75,'UNDER',1,2,'HALF_LOSS',-.5,'LOSS'],
  [2.5,'UNDER',2,1,'FULL_LOSS',-1,'LOSS'],
  [2,'UNDER',1,1,'PUSH',0,'PUSH']
 ]){
  const db=database();try{
   insert(db,{line,side});
   assert.equal(settleOuV2FromExistingResults(db,{now,snapshot:hub({hg,ag})}).settled,1);
   const state=readOuV2SettlementState(db,now);
   assert.equal(state.settlements[fixtureId].kind,kind);
   assert.equal(state.settlements[fixtureId].status,status);
   assert(Math.abs(state.settlements[fixtureId].units-units)<1e-8);
  }finally{db.close()}
 }
});
test('No verified fulltime, wrong identity and live event cannot settle',()=>{
 const db=database();try{
  insert(db);
  for(const data of [hub({status:'live'}),hub({boardState:'live'}),hub({statusCode:'1h'}),hub({homeId:999})])
   assert.equal(settleOuV2FromExistingResults(db,{now,snapshot:data}).settled,0);
  assert.equal(readOuV2SettlementState(db,now).stats.pending,1);
 }finally{db.close()}
});
test('Archived verified FT settles with zero live provider calls',()=>{
 const db=database();try{
  insert(db);
  db.exec("INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)",fixtureId,now-40,12,now-500,501,502,2,1,'finished');
  const out=settleOuV2FromExistingResults(db,{now});
  assert.equal(out.fromArchive,1);assert.equal(out.providerCalls,0);
  assert.equal(readOuV2SettlementState(db,now).stats.loss,1);
 }finally{db.close()}
});
test('Pending ledger gets one incremental event and repeated snapshot sync is idempotent',()=>{
 const db=database();try{
  insert(db);initOuV2Settlement(db);
  const a=syncOuV2SettlementSnapshot(db,now),b=syncOuV2SettlementSnapshot(db,now+10);
  assert.equal(a.changed,1);assert.equal(b.changed,0);
  assert.equal(readOuV2SettlementState(db,now).stats.pending,1);
  assert.equal(readOuV2SettlementState(db,now).stats.total,1);
 }finally{db.close()}
});
