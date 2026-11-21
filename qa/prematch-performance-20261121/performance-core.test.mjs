import test from 'node:test';
import assert from 'node:assert/strict';
import {londonBusinessDay,emptyPerformance,applyLedgerEvent,performanceView} from './performance-core.mjs';

test('Cutoff is 06:00 Europe/London in winter and summer',()=>{
 assert.equal(londonBusinessDay('2026-11-21T05:59:59Z'),'2026-11-20');
 assert.equal(londonBusinessDay('2026-11-21T06:00:00Z'),'2026-11-21');
 assert.equal(londonBusinessDay('2026-06-01T04:59:59Z'),'2026-05-31');
 assert.equal(londonBusinessDay('2026-06-01T05:00:00Z'),'2026-06-01');
});
test('Atomic event sequence rejects gaps and duplicates, never double-counts',()=>{
 let state=emptyPerformance();
 const step=e=>{state=applyLedgerEvent(state,e).snapshot};
 step({sequence:1,action:'SELECTED',signalId:'A',pickedAt:'2026-11-20T14:00:00Z',odds:2.2});
 step({sequence:2,action:'SELECTED',signalId:'B',pickedAt:'2026-11-20T16:00:00Z',odds:2});
 step({sequence:3,action:'SELECTED',signalId:'C',pickedAt:'2026-11-20T17:00:00Z',odds:2.4});
 const duplicate=applyLedgerEvent(state,{sequence:3,action:'SELECTED',signalId:'C',pickedAt:'2026-11-20T17:00:00Z',odds:2.4});
 assert.equal(duplicate.applied,false);
 assert.equal(duplicate.snapshot.picks,3);
 assert.throws(()=>step({sequence:5,action:'SETTLED',signalId:'A',settledAt:'2026-11-20T20:00:00Z',status:'WIN',odds:2.2}),/EVENT_SEQUENCE_GAP/);
 step({sequence:4,action:'SETTLED',signalId:'A',settledAt:'2026-11-20T20:00:00Z',status:'WIN',odds:2.2,units:1.2});
 step({sequence:5,action:'SETTLED',signalId:'B',settledAt:'2026-11-20T21:00:00Z',status:'LOSS',odds:2});
 step({sequence:6,action:'SETTLED',signalId:'C',settledAt:'2026-11-21T01:00:00Z',status:'PUSH',odds:2.4});
 assert.equal(state.lastSequence,6);
 assert.equal(state.settled,3);assert.equal(state.pending,0);
 assert.equal(state.win,1);assert.equal(state.loss,1);assert.equal(state.draw,1);
 assert.equal(state.netUnits,0.2);
 assert.equal(state.daily.length,1);
 const v=performanceView(state);
 assert.equal(v.roi,6.666667);assert.equal(v.winRate,50);
 assert.equal(v.avgOdds,2.2);assert.equal(v.settledDays,1);
 assert.equal(v.maxDrawdown,0);
});
test('Daily snapshots track different days and limited windows without per-match replay',()=>{
 let state=emptyPerformance(),seq=0;
 const step=e=>{state=applyLedgerEvent(state,{sequence:++seq,...e}).snapshot};
 for(const [i,when] of ['2026-10-01T10:00:00Z','2026-10-20T10:00:00Z','2026-11-19T10:00:00Z','2026-11-21T10:00:00Z'].entries()){
  step({action:'SELECTED',signalId:String(i),pickedAt:when,odds:2});
  step({action:'SETTLED',signalId:String(i),settledAt:when,status:i===1?'LOSS':'WIN',odds:2});
 }
 assert.equal(state.daily.length,4);
 assert.deepEqual(state.daily.map(d=>d.cumulativeUnits),[1,0,1,2]);
 assert.equal(performanceView(state,'7D','2026-11-21').series.length,2);
 assert.equal(performanceView(state,'30D','2026-11-21').series.length,2);
 assert.equal(performanceView(state,'90D','2026-11-21').series.length,4);
 assert.equal(performanceView(state,'ALL').maxDrawdown,1);
 assert.equal(performanceView(state,'7D','2026-11-21').netUnits,2);
});
test('Reject price changes, inconsistent settlement units and unsupported statuses',()=>{
 let s=emptyPerformance();
 s=applyLedgerEvent(s,{sequence:1,action:'SELECTED',signalId:'S',pickedAt:'2026-11-20T11:00Z',odds:2.5}).snapshot;
 assert.throws(()=>applyLedgerEvent(s,{sequence:2,action:'SETTLED',signalId:'S',settledAt:'2026-11-20T13:00Z',odds:2.5,status:'WIN',units:2}),/UNITS_NOT_MATCHING_LOCKED_ODDS/);
 assert.throws(()=>applyLedgerEvent(s,{sequence:2,action:'SETTLED',signalId:'S',settledAt:'2026-11-20T13:00Z',odds:2.5,status:'UNKNOWN'}),/UNSUPPORTED_SETTLEMENT/);
});
test('Half W/L count as full decisions in win-rate, half returns in P/L',()=>{
 let s=emptyPerformance(),seq=0;
 const add=e=>s=applyLedgerEvent(s,{sequence:++seq,...e}).snapshot;
 for(const [i,status] of ['HALF WIN','HALF LOSS'].entries()){
  add({action:'SELECTED',signalId:String(i),odds:3,pickedAt:'2026-11-20T10:00Z'});
  add({action:'SETTLED',signalId:String(i),status,odds:3,settledAt:'2026-11-20T20:00Z'});
 }
 const v=performanceView(s);
 assert.equal(v.netUnits,0.5);assert.equal(v.winRate,50);assert.equal(v.roi,25);
});
