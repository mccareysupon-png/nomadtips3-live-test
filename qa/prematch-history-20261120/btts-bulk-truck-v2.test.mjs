import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init} from './history.mjs';
import {initBttsHistory,bttsHistoryCoverage} from './btts-history-private.mjs';
import {initBttsBulkV2,bulkV2State,planBulkV2,runBttsBulkV2} from './btts-bulk-truck-v2-test.mjs';
function dbFixture(){
 const sql=new DatabaseSync(':memory:');
 const db={exec:(q,...p)=>{const st=sql.prepare(q);return /^\s*(SELECT|WITH|PRAGMA)/i.test(q)?st.all(...p):(st.run(...p),[])},
   transaction:f=>{sql.exec('BEGIN');try{const result=f();sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
 init(db);initBttsHistory(db);initBttsBulkV2(db);return db;
}
const t=(h=6)=>Math.floor(Date.parse('2026-11-22T00:10:00Z')/1000)+h*3600;
const future={id:204000001,status:'scheduled',kickoff_ts:t(48),league:{id:229,name:'Italy Serie D'},
 teams:{home:{id:101,name:'Team A'},away:{id:102,name:'Team B'}}};
function finished(n,id=229){
 return {id:9000000+n,status:'finished',status_code:'full',
  kickoff_ts:Math.floor(Date.parse('2026-11-01T16:00:00Z')/1000)-n*3600,
  league:{id,name:'Italy Serie D'},teams:{home:{id:101,name:'Team A'},away:{id:200+n,name:'Team '+n}},
  goals:{home:2,away:1,half_home:1,half_away:0},corners:{home:5,away:4},
  cards:{home:{yellow:2,red:0},away:{yellow:1,red:0}}};
}
const provider=(a,rows=2)=>async path=>{a.push(path);return {ok:true,status:200,remaining:29,
 body:{success:1,data:Array.from({length:rows},(_,i)=>finished(i+1)),
  pagination:{page:Number(new URL('https://x'+path).searchParams.get('page')),has_more:true}}}};
test('no upcoming fixture means zero provider requests and no legacy HCR writes',async()=>{
 const db=dbFixture(),x=[];
 const result=await runBttsBulkV2(db,{fixtures:[],now:t(8),provider:provider(x)});
 assert.equal(result.state,'NO_UPCOMING_LEAGUES');assert.equal(x.length,0);
 assert.equal(bulkV2State(db,t(8)).providerCalls,0);
 assert.equal(Array.from(db.exec('SELECT COUNT(*) n FROM result_version'))[0].n,0);
});
test('one London slot uses exactly one paid call; raw payload permanently saved; replay refused',async()=>{
 const db=dbFixture(),x=[];
 const first=await runBttsBulkV2(db,{fixtures:[future],now:t(8),provider:provider(x)});
 assert.equal(first.state,'COMPLETED');assert.equal(first.providerCalls,1);
 assert.equal(first.received,2);assert.equal(first.added,2);
 assert.equal(x.length,1);assert.match(x[0],/\/v1\/leagues\/229\/fixtures/);
 assert.equal(bttsHistoryCoverage(db).privateFT,2);
 const r=Array.from(db.exec('SELECT payload FROM b46_btts_bulk_v2_originals'))[0];
 assert.equal(JSON.parse(r.payload).data.length,2);
 const again=await runBttsBulkV2(db,{fixtures:[future],now:t(8)+100,provider:provider(x)});
 assert.equal(again.state,'ALREADY_EXECUTED');assert.equal(again.providerCalls,0);
 assert.equal(x.length,1);assert.equal(bulkV2State(db,t(8)).providerCalls,1);
 assert.equal(Array.from(db.exec('SELECT COUNT(*) n FROM result_version'))[0].n,0);
});
test('five successive London slots cap at 5 provider requests total',async()=>{
 const db=dbFixture(),x=[];
 for(const hour of [8,12,16,20,24]){
  const r=await runBttsBulkV2(db,{fixtures:[future],now:t(hour),provider:provider(x)});
  assert.equal(r.providerCalls,1);
 }
 const state=bulkV2State(db,t(24));
 assert.equal(state.providerCalls,5);
 assert.equal(state.rounds.length,5);assert.equal(x.length,5);
 assert.deepEqual(x.map(p=>new URL('https://x'+p).searchParams.get('page')),[...'12345']);
 assert.equal(Array.from(db.exec('SELECT COUNT(*) n FROM b46_btts_bulk_v2_originals'))[0].n,5);
});
test('invalid data reserves slot once and blocks retry; no contamination',async()=>{
 const db=dbFixture(),x=[];
 const bad=async path=>{x.push(path);return {ok:true,status:200,remaining:21,
  body:{success:1,data:[{...finished(1),goals:{home:null,away:1}}],pagination:{page:1,has_more:false}}}};
 const r=await runBttsBulkV2(db,{fixtures:[future],now:t(8),provider:bad});
 assert.equal(r.state,'REVIEW_REQUIRED');assert.equal(r.providerCalls,1);
 assert.equal(bttsHistoryCoverage(db).privateFT,0);
 assert.equal((await runBttsBulkV2(db,{fixtures:[future],now:t(8),provider:bad})).providerCalls,0);
 assert.equal(x.length,1);assert.equal(bulkV2State(db,t(8)).remainingSlots,4);
});
test('HUB danger defers with zero provider calls and no reservation',async()=>{
 const db=dbFixture(),x=[];
 const r=await runBttsBulkV2(db,{fixtures:[future],now:t(8),provider:provider(x),
  hubreview:async()=>({ok:true,retryAfterSec:40})});
 assert.equal(r.state,'HUB_PRIORITY_OR_HEALTH_DEFER');
 assert.equal(x.length,0);assert.equal(bulkV2State(db,t(8)).roundsUsed,0);
});

test('BTTS staggered 08:00 London first dispatch protects old 1X2 06:00 window',async()=>{
 const db=dbFixture(),calls=[];
 for(const hour of [6,7]){
  const r=await runBttsBulkV2(db,{fixtures:[future],now:t(hour),provider:provider(calls)});
  assert.equal(r.state,'NOT_IN_BTTS_WINDOW');
  assert.equal(r.providerCalls,0);
 }
 assert.equal(calls.length,0);
 const actual=await runBttsBulkV2(db,{fixtures:[future],now:t(8),provider:provider(calls)});
 assert.equal(actual.state,'COMPLETED');
 assert.equal(calls.length,1);
});
