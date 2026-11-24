import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init,totals} from './history.mjs';
import {initBttsHistory} from './btts-history-private.mjs';
import {initHistoryRounds,importHistoryRoundFromCache,historyRoundState} from './history-five-rounds.mjs';
import {historyCargoReport,writeHistoryCargoManifest} from './history-cargo-registry.mjs';
const sec=x=>Math.floor(Date.parse(x)/1000);
function database(){
 const sqlite=new DatabaseSync(':memory:');
 const db={exec:(q,...a)=>{
  const st=sqlite.prepare(q);
  return st.columns().length?st.all(...a):st.run(...a);
 },transaction:fn=>{
  sqlite.exec('BEGIN');try{const out=fn();sqlite.exec('COMMIT');return out}
  catch(e){sqlite.exec('ROLLBACK');throw e}
 }};
 init(db);initBttsHistory(db);initHistoryRounds(db);
 return db;
}
const now=sec('2026-11-23T06:00:30Z');
function snapshot(count,at=now){
 return {ok:true,cacheOnly:true,stale:false,fetchedAt:at*1000,
  fixtures:Array.from({length:count},(_,i)=>({
   fixtureId:String(700000+i),league:{id:String(i%2?222:121)},
   home:{id:String(i+1)},away:{id:String(i+2)},kickoffUtc:new Date((at-3600-i*90)*1000).toISOString(),
   status:'finished',boardState:'finished',statusCode:'full',goals:{home:i%4,away:i%2}
  }))};
}
test('HCR records one immutable manifest for a completed import round and joins canonical archive data',()=>{
 const db=database();const round=importHistoryRoundFromCache(db,snapshot(3),now,{roundNo:1});
 assert.equal(round.state,'COMPLETED');assert.equal(round.imported,3);
 const report=historyCargoReport(db,now,{day:'2026-11-23'});
 assert.equal(report.registry.code,'HCR-V1');assert.equal(report.registry.providerCalls,0);
 assert.equal(report.scope.trackedRounds,1);assert.equal(report.scope.legacyUntrackedRounds,0);
 assert.deepEqual(report.rounds[0].fixtureIds,[700000,700001,700002]);
 assert.equal(report.rounds[0].items.length,3);assert.equal(report.rounds[0].items[0].leagueId,121);
 assert.equal(report.rounds[0].items[1].leagueId,222);
 assert.equal(totals(db).finished,3);
 assert.equal(importHistoryRoundFromCache(db,snapshot(3),now,{roundNo:1}).state,'ALREADY_EXECUTED');
 assert.equal(historyCargoReport(db,now,{day:'2026-11-23'}).scope.trackedRounds,1);
});
test('empty import is recorded once with an empty, explicitly tracked manifest',()=>{
 const db=database();const r=importHistoryRoundFromCache(db,snapshot(0),now,{roundNo:3});
 assert.equal(r.state,'COMPLETED');
 const doc=historyCargoReport(db,now,{day:'2026-11-23'});
 assert.equal(doc.rounds[0].roundNo,3);assert.equal(doc.rounds[0].manifestStatus,'TRACKED');
 assert.deepEqual(doc.rounds[0].fixtureIds,[]);assert.equal(doc.rounds[0].imported,0);
});
test('historical pre-HCR rounds are labeled LEGACY_UNTRACKED, never fabricate IDs',()=>{
 const db=database();
 db.exec("INSERT INTO prematch_history_rounds VALUES(?,?,?,?,?,?,?,?)",'2026-11-22',1,now-86400,'NORMAL_HUB_CACHED_FINISHED','COMPLETED',100,100,0);
 const doc=historyCargoReport(db,now,{day:'2026-11-22'});
 assert.equal(doc.scope.legacyUntrackedRounds,1);assert.equal(doc.rounds[0].fixtureIds,null);
 assert.match(doc.rounds[0].note,/cannot be attributed/);
});
test('reject invalid manifest and preserve original existing manifest',()=>{
 const db=database();importHistoryRoundFromCache(db,snapshot(2),now,{roundNo:1});
 assert.throws(()=>writeHistoryCargoManifest(db,{businessDay:'2026-11-23',roundNo:2,now,selected:[{id:1},{id:1}],imported:2}),/DUPLICATE/);
 assert.throws(()=>writeHistoryCargoManifest(db,{businessDay:'2026-11-23',roundNo:6,now,selected:[],imported:0}),/INVALID/);
 assert.throws(()=>writeHistoryCargoManifest(db,{businessDay:'2026-11-23',roundNo:1,now,selected:[{id:1}],imported:1}),/DUPLICATE_MANIFEST/);
 assert.equal(historyCargoReport(db,now,{day:'2026-11-23'}).rounds[0].imported,2);
});
test('3-game supply planner uses Upcoming and Waiting teams and no provider calls',()=>{
 const db=database();importHistoryRoundFromCache(db,snapshot(5),now,{roundNo:1});
 const upcoming=[
  {id:'800011',status:'scheduled',kickoff_ts:now+3600,teams:{home:{id:1,name:'Alpha'},away:{id:2,name:'Beta'}}},
  {id:'800022',status:'waiting',kickoff_ts:now+7200,teams:{home:{id:999,name:'Missing history'},away:{id:1000,name:'No archive'}}},
  {id:'800033',status:'scheduled',kickoff_ts:now-7200,teams:{home:{id:1},away:{id:2}}}
 ];
 const doc=historyCargoReport(db,now,{day:'2026-11-23',includeItems:false,upcoming});
 assert.equal(doc.supplyPlanning.targetHistoryPerTeam,3);
 assert.equal(doc.supplyPlanning.historySource,'DEDUPED_1X2_AND_BTTS_FINISHED_FT_ASOF');
 assert.equal(doc.supplyPlanning.upcomingFixtures,2);
 assert.equal(doc.supplyPlanning.readyFixtures,0);
 assert.equal(doc.supplyPlanning.incompleteFixtures,2);
 assert.equal(doc.supplyPlanning.highestPriority[0].fixtureId,800022);
 assert.equal(doc.supplyPlanning.highestPriority[0].totalTeamMatchGaps,6);
 assert.equal(doc.supplyPlanning.uniqueTeams,4);
 assert.equal(doc.supplyPlanning.uniqueTeamsNeedingHistory,4);
 assert(doc.supplyPlanning.deduplicatedTeamMatchGaps<doc.supplyPlanning.aggregateTeamMatchGaps+1);
 assert.equal(doc.supplyPlanning.upcomingLeagueIdsMissing,2);
 assert.equal(doc.registry.providerCalls,0);
 assert.equal(doc.rounds[0].items,undefined);
 assert.match(doc.supplyPlanning.warning,/NOT distinct missing matches/);
});
test('fail-closed corrupted manifest state and reject malformed day filters',()=>{
 const db=database();importHistoryRoundFromCache(db,snapshot(2),now,{roundNo:1});
 db.exec('UPDATE prematch_history_cargo_manifest SET imported=1 WHERE business_day=? AND round_no=?','2026-11-23',1);
 const d=historyCargoReport(db,now,{day:'2026-11-23'});
 assert.equal(d.rounds[0].manifestStatus,'REVIEW_REQUIRED');
 assert.throws(()=>historyCargoReport(db,now,{day:'2026-99-99'}),/HCR_INVALID_REPORT_QUERY/);
});

test('HCR counts existing private finished history from target teams and deduplicates',()=>{
 const db=database();
 const kickoff=now+3600;
 for(let i=0;i<3;i++){
  const fixtureId=920001+i,ts=now-100000+i*3600;
  db.exec('INSERT INTO btts_history_private_test(fixture_id,league_id,kickoff,home_id,away_id,hg,ag,observed,season) VALUES(?,?,?,?,?,?,?,?,?)',
   fixtureId,121,ts,555,1000+i,1+i%2,0,now-1000,'2026');
 }
 const upcoming=[{id:950001,status:'upcoming',kickoff_ts:kickoff,
  teams:{home:{id:555,name:'Three FT'},away:{id:888,name:'No FT'}}}];
 const report=historyCargoReport(db,now,{upcoming,includeItems:false});
 assert.equal(report.supplyPlanning.upcomingFixtures,1);
 assert.equal(report.supplyPlanning.readyFixtures,0);
 assert.equal(report.supplyPlanning.highestPriority[0].home.historyMatches,3);
 assert.equal(report.supplyPlanning.highestPriority[0].home.missingTo3,0);
 assert.equal(report.supplyPlanning.highestPriority[0].away.missingTo3,3);
 assert.equal(report.supplyPlanning.deduplicatedTeamMatchGaps,3);
 assert.equal(report.registry.providerCalls,0);
});
