import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init,totals} from './history.mjs';
import {historySlot,initHistoryRounds,importHistoryRoundFromCache,historyRoundState} from './history-five-rounds.mjs';
const sec=s=>Math.floor(Date.parse(s)/1000);
function database(){
 const sql=new DatabaseSync(':memory:');
 const db={exec:(q,...a)=>{const st=sql.prepare(q);return st.columns().length?st.all(...a):st.run(...a)},transaction:f=>{sql.exec('BEGIN');try{const result=f();sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
 init(db);initHistoryRounds(db);return db;
}
function snapshot(now,num=650){
 return {ok:true,cacheOnly:true,stale:false,fetchedAt:now*1000,fixtures:Array.from({length:num},(_,i)=>({
  fixtureId:String(500001+i),league:{id:'27'},home:{id:String(300+i)},away:{id:String(3001+i)},
  kickoffUtc:new Date((now-90000-i*90)*1000).toISOString(),status:'finished',boardState:'finished',statusCode:'full',goals:{home:1,away:0}
 }))};
}
test('five distinct rounds in one London day; hard 100 rows/slot and 500 rows/day',()=>{
 const db=database();
 const times=['2026-11-21T06:00:00Z','2026-11-21T10:00:00Z','2026-11-21T14:00:00Z','2026-11-21T18:00:00Z','2026-11-21T22:00:00Z'].map(sec);
 for(let i=0;i<times.length;i++){
  const now=times[i];
  const r=importHistoryRoundFromCache(db,snapshot(now),now);
  assert.equal(r.state,'COMPLETED');assert.equal(r.current.imported,100);
  assert.equal(r.completed,i+1);assert.equal(r.imported,(i+1)*100);
  const duplicate=importHistoryRoundFromCache(db,snapshot(now+60),now+60);
  assert.equal(duplicate.state,'ALREADY_EXECUTED');assert.equal(duplicate.imported,(i+1)*100);
 }
 const extra=importHistoryRoundFromCache(db,snapshot(sec('2026-11-22T03:00:00Z')),sec('2026-11-22T03:00:00Z'));
 assert.equal(extra.state,'ALREADY_EXECUTED');
 assert.equal(historyRoundState(db,sec('2026-11-22T04:00:00Z')).imported,500);
 assert.equal(totals(db).finished,500);
 const next=sec('2026-11-22T06:00:00Z');
 const day2=importHistoryRoundFromCache(db,snapshot(next),next);
 assert.equal(day2.state,'COMPLETED');assert.equal(day2.current.imported,100);assert.equal(day2.completed,1);
 assert.equal(totals(db).finished,600);
});
test('winter and summer slot times follow Europe/London rather than static UTC',()=>{
 assert.equal(historySlot(sec('2026-11-21T05:59:00Z')).slot,5);
 assert.equal(historySlot(sec('2026-11-21T06:00:00Z')).slot,1);
 assert.equal(historySlot(sec('2026-06-21T04:59:00Z')).slot,5);
 assert.equal(historySlot(sec('2026-06-21T05:00:00Z')).slot,1);
 assert.equal(historySlot(sec('2026-06-21T09:00:00Z')).slot,2);
 assert.equal(historySlot(sec('2026-06-21T21:00:00Z')).slot,5);
});
test('fail closed on stale or noncached snapshot without consuming a slot',()=>{
 const db=database(),now=sec('2026-11-21T06:00:00Z');
 assert.equal(importHistoryRoundFromCache(db,{...snapshot(now),cacheOnly:false},now).state,'DEFERRED_CACHE_UNAVAILABLE');
 assert.equal(importHistoryRoundFromCache(db,{...snapshot(now),stale:true},now).state,'DEFERRED_CACHE_UNAVAILABLE');
 assert.equal(importHistoryRoundFromCache(db,{...snapshot(now),fetchedAt:(now-4000)*1000},now).state,'DEFERRED_CACHE_STALE');
 assert.equal(historyRoundState(db,now).completed,0);
});
test('no eligible finished matches still counts one used slot, never repeats',()=>{
 const db=database(),now=sec('2026-11-21T06:00:00Z');
 const r=importHistoryRoundFromCache(db,{...snapshot(now),fixtures:[]},now);
 assert.equal(r.state,'COMPLETED');assert.equal(r.current.imported,0);
 assert.equal(historyRoundState(db,now).completed,1);
 assert.equal(importHistoryRoundFromCache(db,snapshot(now+30),now+30).state,'ALREADY_EXECUTED');
});

test('run five complete deliveries consecutively at same 06:00 London cutoff',()=>{
 const db=database(),now=sec('2026-11-22T06:00:00Z'),s=snapshot(now,650);
 for(let roundNo=1;roundNo<=5;roundNo++){
  const v=importHistoryRoundFromCache(db,s,now,{roundNo});
  assert.equal(v.state,'COMPLETED');assert.equal(v.current.slot,roundNo);assert.equal(v.current.imported,100);
  assert.equal(v.imported,100*roundNo);
 }
 assert.equal(totals(db).finished,500);
 assert.equal(historyRoundState(db,now).completed,5);
 assert.equal(importHistoryRoundFromCache(db,s,now,{roundNo:3}).state,'ALREADY_EXECUTED');
 assert.equal(totals(db).finished,500);
 assert.throws(()=>importHistoryRoundFromCache(db,s,now,{roundNo:6}),/INVALID_HISTORY_ROUND/);
});
