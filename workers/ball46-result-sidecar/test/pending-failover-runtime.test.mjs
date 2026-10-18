import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshPendingGoalooRoutes,markGoalooRouteDone,routeStorageKey}
 from '../src/pending-failover-runtime.mjs';
function storage(){
 const map=new Map();
 const store={map,get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),
  list:async({prefix})=>new Map([...map].filter(([k])=>k.startsWith(prefix)))};
 store.transaction=async cb=>cb(store);
 return store;
}
const row=(status='PENDING',createdAt='2026-10-18T10:00:00Z')=>
 ({id:'sig-1',fixtureId:'5usd-1',market:'FT_OVER',period:'FT',status,
   createdAt,result:status==='SETTLED'?'WIN':null});
const page=(rows)=>({ok:true,statisticsSource:'LEDGER_V2_ONLY',
 statisticsLedgerVersion:'signal-ledger-v2-longterm',rows,pending:rows.filter(x=>x.status==='PENDING').length,
 ledgerTotal:rows.length,nextCursor:null});
const engine=(data)=>({fetch:async(url,options)=>{
 assert.equal(options.method,'GET');assert.match(url,/\/statistics\?cursor=/);
 return{ok:true,json:async()=>page(data())};
}});
async function startFresh(storage){
 const r=await refreshPendingGoalooRoutes(storage,engine(()=>[]),{at:'2026-10-18T09:59:00Z'});
 assert.equal(r.ok,true);assert.equal(r.intakeState,'OLD_PENDING_QUARANTINED');
}
test('persistent 10-min failover starts after PENDING passes ten minutes',async()=>{
 const s=storage(),e=engine(()=>[row()]);
 await startFresh(s);
 const r=await refreshPendingGoalooRoutes(s,e,{at:'2026-10-18T10:11:00Z'});
 assert.equal(r.ok,true);assert.equal(r.eligibleIds[0],'5usd-1');
 assert.equal(s.map.get(routeStorageKey('5usd-1')).state,'GOALOO');
 const repeat=await refreshPendingGoalooRoutes(s,e,{at:'2026-10-18T10:16:00Z'});
 assert.deepEqual(repeat.eligibleIds,['5usd-1']);
 assert.equal(repeat.routedThisPoll,0);
});
test('eligible route never starts at nine minutes',async()=>{
 const s=storage(),e=engine(()=>[row()]);
 await startFresh(s);
 const r=await refreshPendingGoalooRoutes(s,e,{at:'2026-10-18T10:09:00Z'});
 assert.deepEqual(r.eligibleIds,[]);assert.equal(s.map.get(routeStorageKey('5usd-1')).state,'PRIMARY');
});
test('native settlement immediately tombstones route forever',async()=>{
 const s=storage();let state='PENDING';
 await startFresh(s);
 const e=engine(()=>[row(state)]);
 await refreshPendingGoalooRoutes(s,e,{at:'2026-10-18T10:11:00Z'});
 state='SETTLED';
 const stopped=await refreshPendingGoalooRoutes(s,e,{at:'2026-10-18T10:16:00Z'});
 assert.deepEqual(stopped.eligibleIds,[]);
 assert.equal(stopped.completedByPrimary,1);
 assert.equal(s.map.get(routeStorageKey('5usd-1')).state,'DONE');
 state='PENDING'; // even a stale Ledger page cannot revive DONE
 const future=await refreshPendingGoalooRoutes(s,e,{at:'2026-10-18T10:21:00Z'});
 assert.deepEqual(future.eligibleIds,[]);
});
test('Goaloo native settlement readback marks DONE once and no retries',async()=>{
 const s=storage();let state='PENDING';
 await startFresh(s);
 const e=engine(()=>[row(state)]);
 await refreshPendingGoalooRoutes(s,e,{at:'2026-10-18T10:11:00Z'});
 state='SETTLED';
 const done=await markGoalooRouteDone(s,e,{fixtureId:'5usd-1',
  signalIds:['sig-1'],at:'2026-10-18T10:16:00Z'});
 assert.equal(done.ok,true);assert.equal(done.state,'DONE_NEVER_POLL_GOALOO_AGAIN');
 const again=await markGoalooRouteDone(s,e,{fixtureId:'5usd-1',
  signalIds:['sig-1'],at:'2026-10-18T10:20:00Z'});
 assert.equal(again.state,'DONE_ALREADY');
});
test('a still-pending fixture is never falsely terminal',async()=>{
 const s=storage(),e=engine(()=>[row()]);
 await startFresh(s);
 await refreshPendingGoalooRoutes(s,e,{at:'2026-10-18T10:11:00Z'});
 const r=await markGoalooRouteDone(s,e,{fixtureId:'5usd-1',signalIds:['sig-1'],
  at:'2026-10-18T10:16:00Z'});
 assert.equal(r.ok,false);
 assert.equal(s.map.get(routeStorageKey('5usd-1')).state,'GOALOO');
});

test('old Ledger-only PENDING gets quarantined, only new Signal can use Goaloo',async()=>{
 const s=storage(),old={...row(),createdAt:'2026-10-18T08:10:00Z'};
 const first=await refreshPendingGoalooRoutes(s,engine(()=>[old]),{at:'2026-10-18T10:00:00Z'});
 assert.equal(first.ok,true);assert.equal(first.intakeState,'OLD_PENDING_QUARANTINED');
 assert.deepEqual(first.eligibleIds,[]);
 const next={...row(),id:'new-signal-2',fixtureId:'5usd-new',
  createdAt:'2026-10-18T10:01:00Z',lockedOdds:1.95,selection:'OVER',line:1.5};
 const later=await refreshPendingGoalooRoutes(s,engine(()=>[old,next]),{
  at:'2026-10-18T10:12:00Z'});
 assert.deepEqual(later.eligibleIds,['5usd-new']);
 assert.equal(later.excludedLegacy,1);
 assert.equal(later.newCapturedThisRun,1);
 assert.equal(s.map.has(routeStorageKey('5usd-1')),false);
});
