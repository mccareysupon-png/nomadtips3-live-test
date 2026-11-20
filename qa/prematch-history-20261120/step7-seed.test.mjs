import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init,coverage,totals,DAY} from './history.mjs';
import {initBackfill} from './backfill.mjs';
import {initJohn,prepareCatalog} from './john-sync.mjs';
import {step7} from './step7-seed.mjs';
import {fixture,base} from './sample.mjs';
const now=base+100*DAY;
test('step 7 catalog then complete season, 10 each, no repeat, no unapproved transport',async()=>{
 const sql=new DatabaseSync(':memory:');
 const db={exec:(q,...a)=>{const s=sql.prepare(q);return /^\s*SELECT/i.test(q)?s.all(...a):(s.run(...a),[])},transaction:f=>{sql.exec('BEGIN');try{const r=f();sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 try{init(db);initBackfill(db);initJohn(db);prepareCatalog(db,'setup1',now-180*DAY);
 const calls=[];const games=Array.from({length:12},(_,i)=>({...fixture(800+i,now-(i+1)*DAY,1,2,2,1),league:{id:123}}));
 const transport=async path=>{calls.push(path);const u=new URL(path,'https://test.invalid'),p=Number(u.searchParams.get('page'));const data=u.pathname==='/v1/leagues'?[{id:123,seasons:[{season:'26/27',current:true}]}]:p===1?games.slice(0,6):games.slice(6);return {status:200,body:{success:1,data,pagination:{page:p,has_more:u.pathname!=='/v1/leagues'&&p===1}}}};
 const run=(approved=true)=>step7(db,{now,leagueIds:[123],transport,approved});
 assert.equal((await run(false)).requests,0);assert.equal(calls.length,0);
 assert.equal((await run()).kind,'catalog');assert.equal(totals(db).fixtures,0);
 assert.equal((await run()).state,'pending');assert.equal(totals(db).fixtures,6);
 assert.equal((await run()).state,'complete');assert.equal(totals(db).fixtures,12);
 assert.equal(coverage(db,1,now+DAY,now).count,10);assert.equal(coverage(db,2,now+DAY,now).count,10);
 assert.equal((await run()).state,'SEED_COMPLETE');assert.equal(calls.length,3);
 }finally{sql.close()}
});
