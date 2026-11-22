import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init,totals} from './history.mjs';
import {historySlot,initHistoryRounds,importHistoryRoundFromCache,historyRoundState} from './history-five-rounds.mjs';
import {historyCargoReport} from './history-cargo-registry.mjs';
import {historyFullCargoReport,FULL_CARGO_CODE} from './history-cargo-full-payload.mjs';
const sec=s=>Math.floor(Date.parse(s)/1000);
const dayNow=sec('2026-11-23T06:00:00Z');
function database(){
 const sqlite=new DatabaseSync(':memory:');
 const db={exec:(q,...a)=>{const st=sqlite.prepare(q);return st.columns().length?st.all(...a):st.run(...a)},
  transaction:fn=>{sqlite.exec('BEGIN');try{const r=fn();sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 init(db);initHistoryRounds(db);return db;
}
function snapshot(now,num,extra={}){
 return {ok:true,cacheOnly:true,stale:false,fetchedAt:now*1000,
  existingTopLevel:{source:'prior HUB cache',marketFields:['1x2','btts']},
  fixtures:Array.from({length:num},(_,i)=>({
    fixtureId:String(840000+i),league:{id:'111',name:'Original League Name',country:'France',flag:'FR'},
    home:{id:String(2500+i),name:'Home '+i,stadium:'Home ground',otherInfo:{squad:'data'}},
    away:{id:String(3500+i),name:'Away '+i},
    kickoffUtc:new Date((now-7200-i*90)*1000).toISOString(),
    status:'finished',boardState:'finished',statusCode:'full',goals:{home:2,away:1},
    providerOdds:{odds:{'1x2':{closing:{home:2.1,draw:3.3,away:4.5}}},provider_extra:'all-fields-retained'},
    stats:{corners:{home:7,away:4},yellowCards:{home:2,away:3}},
    extraA:[0,{nested:null,mixed:['x',2,false]}],
    ...extra
  }))};
}
test('one trip preserves every raw field and nested value, with original envelope metadata',()=>{
 const db=database(),raw=snapshot(dayNow,3);
 const r=importHistoryRoundFromCache(db,raw,dayNow,{roundNo:1});
 assert.equal(r.state,'COMPLETED');assert.equal(r.current.imported,3);
 const cargo=historyFullCargoReport(db,{day:'2026-11-23',roundNo:1,fixtureId:840000,includeRaw:true});
 assert.equal(cargo.registry,FULL_CARGO_CODE);
 assert.equal(cargo.source,'NORMAL_HUB_CACHED_SNAPSHOT');
 assert.equal(cargo.providerCalls,0);
 assert.equal(cargo.rounds[0].delivered,3);
 assert.equal(cargo.rounds[0].stored,3);
 assert(cargo.rounds[0].complete);
 assert.deepEqual(cargo.fixture,raw.fixtures[0]);
 assert(cargo.rounds[0].fixtureFields.includes('providerOdds'));
 assert(cargo.rounds[0].nestedFields.includes('league.name'));
 assert(cargo.rounds[0].nestedFields.includes('providerOdds.odds'));
 assert(cargo.rounds[0].headerKeys.includes('existingTopLevel'));
 assert.equal(totals(db).finished,3);
 const hcr=historyCargoReport(db,dayNow,{day:'2026-11-23'});
 assert.equal(hcr.registry.code,'HCR-V1');assert.equal(hcr.rounds[0].manifestStatus,'TRACKED');
 assert.deepEqual(hcr.rounds[0].fixtureIds,[840000,840001,840002]);
});
test('five rounds still enforce max 100 each / 500 total without dropping original fixture fields',()=>{
 const db=database(),raw=snapshot(dayNow,550);
 for(let round=1;round<=5;round++){
  const out=importHistoryRoundFromCache(db,raw,dayNow,{roundNo:round});
  assert.equal(out.state,'COMPLETED');assert.equal(out.imported,round*100);
  const cargo=historyFullCargoReport(db,{day:'2026-11-23',roundNo:round});
  assert.equal(cargo.rounds[0].stored,100);
 }
 const all=historyFullCargoReport(db,{day:'2026-11-23'});
 assert.equal(all.roundsTracked,5);assert.equal(all.fixtureRecords,500);
 assert.equal(historyRoundState(db,dayNow).imported,500);
 assert.equal(totals(db).finished,500);
 assert.equal(importHistoryRoundFromCache(db,raw,dayNow,{roundNo:1}).state,'ALREADY_EXECUTED');
 assert.throws(()=>importHistoryRoundFromCache(db,raw,dayNow,{roundNo:6}),/INVALID_HISTORY_ROUND/);
});
test('empty trips keep complete original snapshot envelope with zero item data, never trigger provider calls',()=>{
 const db=database(),raw=snapshot(dayNow,0);
 const out=importHistoryRoundFromCache(db,raw,dayNow,{roundNo:2});
 assert.equal(out.state,'COMPLETED');
 const cargo=historyFullCargoReport(db,{day:'2026-11-23',roundNo:2});
 assert.equal(cargo.rounds[0].delivered,0);
 assert.equal(cargo.rounds[0].stored,0);
 assert.equal(cargo.rounds[0].complete,true);
 assert.equal(cargo.rounds[0].headerKeys.includes('existingTopLevel'),true);
 assert.equal(cargo.providerCalls,0);
});
test('prior legacy history rounds cannot be retroactively reconstructed from absent full payload',()=>{
 const db=database();
 db.exec("INSERT INTO prematch_history_rounds VALUES(?,?,?,?,?,?,?,?)",'2026-11-22',1,dayNow-86400,'NORMAL_HUB_CACHED_FINISHED','COMPLETED',75,75,0);
 assert.equal(historyFullCargoReport(db,{day:'2026-11-22'}).roundsTracked,0);
 assert.equal(historyCargoReport(db,dayNow,{day:'2026-11-22'}).scope.legacyUntrackedRounds,1);
});
test('full details are never returned by an unfiltered/unspecified browse request',()=>{
 const db=database();importHistoryRoundFromCache(db,snapshot(dayNow,1),dayNow,{roundNo:1});
 const summary=historyFullCargoReport(db,{day:'2026-11-23'});
 assert.equal(summary.fixture,undefined);
 assert(!JSON.stringify(summary).includes('provider_extra'));
 assert.throws(()=>historyFullCargoReport(db,{includeRaw:true}),/FULL_CARGO_BAD_QUERY/);
 assert.throws(()=>historyFullCargoReport(db,{day:'2026-11-23',roundNo:6}),/FULL_CARGO_BAD_QUERY/);
 assert.equal(historyFullCargoReport(db,{day:'2026-11-23',roundNo:1,fixtureId:840000,includeRaw:false}).fixture,undefined);
});
