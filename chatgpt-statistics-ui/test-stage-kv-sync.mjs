import assert from 'node:assert/strict';
import {buildSnapshot,verifyRows,signature} from './stage-kv-sync.mjs';
const a={id:'a',status:'SETTLED',result:'WIN'};
const b={id:'b',status:'SETTLED',result:'LOSS'};
const c={id:'c',status:'PENDING',result:''};
const row={ok:true,ledgerTotal:3,total:2,pending:1,unresolved:0,win:1,loss:1,push:0,halfWin:0,halfLoss:0,ledgerUpdatedAt:'v1'};
const page1={...row,rows:[a,b],nextCursor:'next',hasMore:true};
const page2={...row,rows:[c],nextCursor:null,hasMore:false};
const calls=[];
const good=await buildSnapshot(async cursor=>{calls.push(cursor||'HEAD');return cursor==='next'?page2:page1});
assert.equal(calls.length,3,'must re-read head after last page');
assert.equal(good.rows.length,3);
assert.equal(good.stale,true);assert.equal(good.hasMore,false);
assert.equal(verifyRows(row,[a,b,c]),true);
assert.equal(signature(good),signature(row));
assert.equal(signature({...row,ledgerUpdatedAt:100}),signature({...row,ledgerUpdatedAt:200}));
await assert.rejects(buildSnapshot(async cursor=>cursor?{...page2,total:3}:page1),/REVISION_CHANGED_DURING_PAGES/);
let count=0;
await assert.rejects(buildSnapshot(async cursor=>{
  count++;return count===3?{...page1,pending:2}:cursor?page2:page1;
}),/REVISION_CHANGED_AFTER_FULL_READ/);
assert.throws(()=>verifyRows(row,[a,b,b]),/MISSING_OR_DUPLICATE_ID/);
assert.throws(()=>verifyRows(row,[a,b]),/LEDGER_LENGTH_MISMATCH/);
assert.throws(()=>verifyRows({...row,win:2},[a,b,c]),/SETTLEMENT_COUNT_MISMATCH_win/);
console.log('B46_STAGING_SYNC_UNIT=PASS',{tests:7,noProductionWrites:true});


import {createCompactSummary} from './compact-summary-stage.mjs';
// A complete, reconciled Ledger may be projected to a small original-source head.
const fast=createCompactSummary(good,verifyRows);
assert.equal(fast.summary.schema,1);
assert.equal(fast.summary.total,2);
assert.equal(fast.summary.pending,1);
assert.equal(fast.summary.ledgerTotal,3);
assert(!Object.hasOwn(fast.summary,'rows'),'never serve full historical rows in head');
assert(fast.bytes<1024);
assert.throws(()=>createCompactSummary({...good,rows:[a,b]},verifyRows),/FULL_VERIFIED/);
assert.throws(()=>createCompactSummary({...good,win:2},verifyRows),/SETTLEMENT_COUNT_MISMATCH_win/);
assert.throws(()=>createCompactSummary({...good,total:2.5},verifyRows),/INVALID_total/);
const big=createCompactSummary({...good,byMarket:{AH:{note:'x'.repeat(140000)}}},verifyRows);
assert.equal(big.summary.marketDetailsDeferred,true);
assert(!Object.hasOwn(big.summary,'byMarket'));
console.log('B46_STAGING_COMPACT_HEAD=PASS',{bytes:fast.bytes,noProductionWrites:true});


import {buildVerifiedGraph,verifyChartSourceContract} from './chart-series-stage.mjs';
// Regression against the original P/L, ROI, win-credit and Bangkok-day behavior.
const fixture=[
 {id:'g1',status:'SETTLED',result:'WIN',odds:2,settledAt:'2026-11-15T01:00:00Z'},
 {id:'g2',status:'SETTLED',result:'HALF_LOSS',settledAt:'2026-11-15T02:00:00Z'},
 {id:'g3',status:'SETTLED',result:'HALF_WIN',odds:3,settledAt:'2026-11-16T04:00:00Z'},
 {id:'g4',status:'SETTLED',result:'PUSH',odds:1.8,settledAt:'2026-11-16T05:00:00Z'},
 {id:'g5',status:'SETTLED',result:'LOSS',settledAt:'2026-11-16T06:00:00Z'},
 {id:'g6',status:'PENDING',result:'',settledAt:'2026-11-16T07:00:00Z'}
];
const graph=buildVerifiedGraph(fixture,Date.parse('2026-11-16T08:00:00Z')).result;
assert.equal(graph.summary.rows,5);
assert.equal(graph.summary.wins,2);
assert.equal(graph.summary.losses,2);
assert.equal(graph.summary.pushes,1);
assert.equal(graph.summary.net,0.5);
assert.equal(graph.summary.stake,5);
assert.equal(graph.summary.priced,5);
assert.equal(graph.summary.roi,10);
assert.equal(graph.summary.maxDD,1);
assert.equal(graph.summary.avgOdds,(2+3+1.8)/3);
assert.equal(graph.series.units.length,2);
assert.equal(graph.series.units[0].value,0.5);
assert.equal(graph.series.units[1].value,0.5);
assert.equal(graph.series.roi[1].value,10);
assert.equal(graph.series.rate.at(-1).value,37.5);
assert.equal(graph.range,'all');
assert.equal(graph.market,'all');
assert(!Object.hasOwn(graph,'rows'));
const unpriced=buildVerifiedGraph([
 {id:'p',status:'SETTLED',result:'WIN',odds:null,settledAt:'2026-11-16T01:00:00Z'},
 {id:'q',status:'SETTLED',result:'LOSS',settledAt:'2026-11-16T02:00:00Z'}
],Date.parse('2026-11-16T08:00:00Z')).result;
assert.equal(unpriced.summary.rows,2);
assert.equal(unpriced.summary.stake,1);
assert.equal(unpriced.summary.net,-1);
assert.equal(unpriced.series.units.length,1);
assert.throws(()=>verifyChartSourceContract('other'),/CHART_SOURCE_MISSING/);
console.log('B46_STAGING_GRAPH_FORMULA_UNIT=PASS',{cases:22,source:'CURRENT_CHART_FORMULA',productionWrites:0});
