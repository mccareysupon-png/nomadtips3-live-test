import test from 'node:test';
import assert from 'node:assert/strict';
import {captureOnlyNewPending,newSignalCaptureKey} from '../src/new-signal-capture.mjs';
const start='2026-10-18T10:00:00Z';
const plus='2026-10-18T10:12:00Z';
const old={id:'old-signal',fixtureId:'5usd-old',status:'PENDING',
  market:'ft_ah',period:'FT',createdAt:'2026-10-18T08:00:00Z'};
const fresh={id:'new-signal',fixtureId:'5usd-new',status:'PENDING',
  market:'ft_over',period:'FT',createdAt:'2026-10-18T10:01:00Z',
  selection:'OVER',line:1.5,lockedOdds:1.95,entryMinute:64};
function storage(){
 const map=new Map(),d={
  get:async k=>map.get(k),
  put:async(k,v)=>{map.set(k,v)},
  transaction:async fn=>fn(d)};
 return{...d,map};
}
test('first complete Ledger V2 snapshot quarantines all old PENDING, no routing',async()=>{
 const s=storage(),v=await captureOnlyNewPending(s,[old],{at:start});
 assert.equal(v.state,'OLD_PENDING_QUARANTINED');
 assert.equal(v.legacyPendingCount,1);
 assert.deepEqual(v.selectedRows,[]);
 assert.equal(v.ledgerWrites,0);
});
test('new signal is snapshotted with original market, entry odds, and minute',async()=>{
 const s=storage();await captureOnlyNewPending(s,[old],{at:start});
 const v=await captureOnlyNewPending(s,[old,fresh],{at:plus});
 assert.equal(v.newPendingCount,1);
 assert.equal(v.excludedLegacy,1);
 const record=await s.get(newSignalCaptureKey('new-signal'));
 assert.equal(record.fixtureId,'5usd-new');
 assert.equal(record.market,'ft_over');
 assert.equal(record.selection,'OVER');
 assert.equal(record.line,1.5);
 assert.equal(record.lockedOdds,1.95);
 assert.equal(record.entryMinute,64);
 assert.equal(record.source,'AUTHORITATIVE_LEDGER_V2');
});
test('repeated polling never duplicates an already captured signal',async()=>{
 const s=storage();await captureOnlyNewPending(s,[old],{at:start});
 await captureOnlyNewPending(s,[fresh],{at:plus});
 const before=await s.get(newSignalCaptureKey('new-signal'));
 const repeat=await captureOnlyNewPending(s,[fresh],{at:'2026-10-18T10:18:00Z'});
 assert.equal(repeat.capturedThisRun,0);
 assert.equal(repeat.previouslyCaptured,1);
 assert.deepEqual(await s.get(newSignalCaptureKey('new-signal')),before);
});
test('old archival rows appearing late remain excluded',async()=>{
 const s=storage();await captureOnlyNewPending(s,[],{at:start});
 const v=await captureOnlyNewPending(s,[old],{at:plus});
 assert.equal(v.excludedLegacy,1);
 assert.equal(v.newPendingCount,0);
});
test('numeric Unix timestamp works and first baseline is not reset',async()=>{
 const s=storage();await captureOnlyNewPending(s,[],{at:start});
 const n={...fresh,createdAt:Date.parse(fresh.createdAt)};
 const v=await captureOnlyNewPending(s,[n],{at:plus});
 assert.equal(v.newPendingCount,1);
 assert.equal(v.baselineAt,start);
});
test('invalid Ledger snapshot cannot establish baseline',async()=>{
 const s=storage();
 const r=await captureOnlyNewPending(s,null,{at:start});
 assert.equal(r.ok,false);assert.equal(s.map.size,0);
});
