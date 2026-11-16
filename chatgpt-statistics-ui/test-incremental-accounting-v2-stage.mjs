import assert from 'node:assert/strict';
import {seedFromLatestVerified,applyLedgerTransition,displaySnapshot} from './incremental-accounting-v2-stage.mjs';
import {buildVerifiedGraph} from './chart-series-stage.mjs';
const at=ms=>Date.parse(ms);
const rows=[
 {id:'s1',market:'ft_1x2',status:'SETTLED',result:'WIN',odds:2,createdAt:at('2026-11-14T05:00:00Z'),settledAt:at('2026-11-14T06:00:00Z')},
 {id:'s2',market:'ft_ah',status:'SETTLED',result:'LOSS',odds:1.90,createdAt:at('2026-11-14T08:00:00Z'),settledAt:at('2026-11-14T09:00:00Z')},
 {id:'p1',market:'ft_ah',status:'PENDING',result:'LIVE',createdAt:at('2026-11-15T01:00:00Z')}
];
const first={ok:true,ledgerTotal:3,total:2,pending:1,unresolved:0,win:1,loss:1,push:0,halfWin:0,halfLoss:0,rows,hasMore:false,nextCursor:null,snapshotSavedAt:at('2026-11-15T02:00:00Z')};
const initial=seedFromLatestVerified(first);
assert.equal(initial.bootstrapLedgerCount,3);
assert.equal(initial.historicalRowsRetained,0);
assert(!Object.hasOwn(initial,'rows'));
assert.equal(initial.summary.net,0);
assert.equal(initial.series.units.length,1);
const update={...rows[2],status:'SETTLED',result:'HALF_WIN',odds:3,settledAt:at('2026-11-15T04:00:00Z')};
const {mode,state}=applyLedgerTransition(initial,rows[2],update,{at:at('2026-11-15T04:05:00Z')});
assert.equal(mode,'POSTED_NEW_SETTLEMENT');
assert.equal(state.stats.pending,0);
assert.equal(state.stats.halfWin,1);
assert.equal(state.stats.ledgerTotal,3);
assert.equal(state.stats.total,3);
assert.equal(state.summary.net,1);
assert.equal(state.summary.stake,3);
assert.equal(state.summary.maxDD,1);
assert.equal(state.series.units.length,2);
assert.equal(state.summary.settledDays,2);
assert.equal(state.series.units[1].value,1);
assert.equal(state.series.roi.at(-1).value,1/3*100);
assert.equal(state.series.rate.at(-1).value,1.5/3*100);
const native=buildVerifiedGraph([...rows.slice(0,2),update],at('2026-11-15T04:05:00Z')).result;
for(const key of ['net','stake','roi','maxDD','peak','bestRun','wins','losses','pushes','avgOdds','settledDays'])
 assert(Math.abs(state.summary[key]-native.summary[key])<1e-8,'NATIVE_PARITY_'+key);
for(const key of ['units','roi','rate'])assert.deepEqual(state.series[key],native.series[key],
 'INCREMENTAL_DAY_GRAPH_PARITY_'+key);
const dup=applyLedgerTransition(state,update,update);
assert.equal(dup.mode,'ALREADY_APPLIED');
assert.strictEqual(dup.state,state);
const reopen=applyLedgerTransition(state,update,{...update,status:'PENDING',result:'PENDING'});
assert.equal(reopen.mode,'HISTORICAL_CORRECTION_NEEDS_TARGETED_DAY_REBUILD');
assert.strictEqual(reopen.state,state);
const correction=applyLedgerTransition(state,update,{...update,result:'LOSS'});
assert.equal(correction.mode,'HISTORICAL_CORRECTION_NEEDS_TARGETED_DAY_REBUILD');
const earlier=applyLedgerTransition(state,null,{id:'q',status:'SETTLED',result:'WIN',odds:2,settledAt:at('2026-11-14T14:00:00Z')});
assert.equal(earlier.mode,'OUT_OF_ORDER_SETTLEMENT_NEEDS_TARGETED_DAY_REBUILD');
assert.throws(()=>seedFromLatestVerified({...first,win:2}),/SEED_COUNT_MISMATCH_win/);
const view=displaySnapshot(state);
assert.equal(view.total,3);
assert.equal(view.summary.net,1);
assert(!('rows' in view));
const nonSettled=applyLedgerTransition(initial,null,{id:'p2',status:'PENDING',result:'PENDING'});
assert.equal(nonSettled.mode,'NON_SETTLED_COUNTER_UPDATE');
assert.equal(nonSettled.state.stats.pending,2);
assert.equal(nonSettled.state.stats.ledgerTotal,4);
assert.equal(nonSettled.state.summary.net,0);
// Additional settlements must use only yesterday's finished balance, never
// read the original old match details again. Compare to native source as QA.
let running=state;
const added=[];
const cases=[['LOSS',1.87],['PUSH',2.1],['WIN',1.95],['HALF_LOSS',2],['HALF_WIN',2.5],['WIN',null]];
for(let i=0;i<cases.length;i++){
 const [result,odds]=cases[i];
 const row={id:'f'+i,status:'SETTLED',result,odds,market:'ft_over',
  settledAt:at('2026-11-16T01:00:00Z')+i*60000,createdAt:at('2026-11-15T06:00:00Z')};
 const out=applyLedgerTransition(running,null,row);
 assert.equal(out.mode,'POSTED_NEW_SETTLEMENT');
 running=out.state;added.push(row);
 const graph=buildVerifiedGraph([...rows.slice(0,2),update,...added],Date.now()).result;
 for(const k of ['net','stake','roi','maxDD','peak','bestRun','wins','losses','pushes','avgOdds','settledDays']){
  const actual=running.summary[k],expect=graph.summary[k];
  assert.equal(actual===null,expect===null,k+' NULL');
  if(actual!==null)assert(Math.abs(actual-expect)<1e-8,k+'_AFTER_'+i);
 }
 for(const k of ['units','roi','rate'])assert.deepEqual(running.series[k],graph.series[k],k+'_AFTER_'+i);
}
assert.equal(running.historicalRowsRetained,0);
assert(!('rows' in displaySnapshot(running)));
console.log('B46_INCREMENTAL_ACCOUNTING_V2=PASS',{settlementScenarios:cases.length,
 ledgerPagesPerNewSettlement:0,oldMatchRowsRetained:0,correctionSafeStop:true,
 stageOnly:true,productionWrites:0});
