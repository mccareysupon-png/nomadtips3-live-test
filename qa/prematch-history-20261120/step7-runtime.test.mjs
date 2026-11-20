import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init,ingest,DAY} from './history.mjs';
import {initBackfill} from './backfill.mjs';
import {initJohn,prepareCatalog} from './john-sync.mjs';
import {approvedHistoryTransport,seedFromSnapshot,upcomingCoverage} from './step7-runtime.mjs';
import {fixture,base} from './sample.mjs';
const now=base+100*DAY;
test('runtime uses only private binding and authenticates; returns denied without fallback',async()=>{
 let called=0;const key='test-only-history-secret-1234567890';
 const env={HISTORY_BRIDGE_SECRET:key,SOURCE_HUB:{fetch:async(url,req)=>{called++;assert.equal(url,'https://hub.internal/__private/provider/v1');assert.equal(req.headers.authorization,'Bearer '+key);assert.equal(JSON.parse(req.body).kind,'history');return Response.json({state:'deferred_budget',reason:'HISTORY_DISABLED'})}}};
 assert.equal(approvedHistoryTransport({}),null);assert.equal((await approvedHistoryTransport(env)('/v1/leagues')).reason,'HISTORY_DISABLED');assert.equal(called,1);
});
test('runtime coverage reports both teams separately and does not seed without credential',async()=>{
 const sql=new DatabaseSync(':memory:');
 const db={exec:(q,...a)=>{const s=sql.prepare(q);return /^\s*SELECT/i.test(q)?s.all(...a):(s.run(...a),[])},transaction:f=>{sql.exec('BEGIN');try{const r=f();sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 try{init(db);initBackfill(db);initJohn(db);prepareCatalog(db,'setup1',now-180*DAY);
 const fixtures=[{fixtureId:900,league:{id:123},home:{id:1},away:{id:2},kickoffAt:(now+3600)*1000,status:'scheduled',boardState:'scheduled'}];
 const snapshot={ok:true,cacheOnly:true,externalRequestsAdded:0,stale:false,ageMs:100,fixtures};
 ingest(db,Array.from({length:10},(_,i)=>fixture(100+i,now-(i+1)*DAY,1,3,1,1)),now);
 const res=await seedFromSnapshot(db,{},snapshot,now);assert.equal(res.state,'BLOCKED_NO_AUTHORIZED_CONNECTION');assert.equal(res.requests,0);assert.equal(res.matches[0].homeMatches,10);assert.equal(res.matches[0].awayMatches,0);assert.equal(res.eligible,0);assert.equal(upcomingCoverage(db,fixtures,now).teamsWith10,1);
 }finally{sql.close()}
});
