import test from 'node:test';
import assert from 'node:assert/strict';
import {combineOuOverview} from './b46-ou-overview-aggregate-test-v1.mjs';
const legacy={stats:{total:5,pending:0,win:0,loss:5,push:0,settled:5,units:-5},
 rows:[2.8,3.4,1.975,6,4.5].map(price=>({price,status:'LOSS'}))};
const book={window:{businessDay:'2026-11-24',begin:1795500000,end:1795586400},
 selected:{total:3},settled:{total:4,win:0,loss:4,push:0,units:-4}};
const baseSeries=[{date:'2026-11-23',selected:2,settled:1,win:0,loss:1,netUnits:-1,stakedUnits:1,cumulativeUnits:-1},
 {date:'2026-11-24',selected:3,settled:4,win:0,loss:4,netUnits:-4,stakedUnits:4,cumulativeUnits:-5}];
const forms=[
 {formula:'A02',selection:'ALL',totalPredictions:8,pending:0,win:5,loss:3,profitLoss:3.14,averageOdds:2.4612},
 {formula:'A03',selection:'ALL',totalPredictions:5,pending:0,win:3,loss:2,profitLoss:1.94,averageOdds:2.648},
 {formula:'A04',selection:'ALL',totalPredictions:4,pending:0,win:3,loss:1,profitLoss:2.94,averageOdds:2.61},
 {formula:'A05',selection:'ALL',totalPredictions:2,pending:0,win:2,loss:0,profitLoss:2.95,averageOdds:2.475}
];
const data={code:'B46_ADAPTIVE_OU_RESEARCH_V1',formulas:forms,daily:forms.map(f=>({
 formula_id:f.formula,business_day:'2026-11-24',selected:f.totalPredictions,
 settled:f.totalPredictions,win:f.win,loss:f.loss,net_units:f.profitLoss})),records:[]};
test('all-time O/U + every Adaptive formula snapshots correctly sums wins, units and ROI',()=>{
 const out=combineOuOverview(legacy,baseSeries,book,data);
 assert.equal(out.formulaCount,4);
 assert.deepEqual([out.total.total,out.total.win,out.total.loss,out.total.settled],[24,13,11,24]);
 assert.equal(out.total.winRate,54.16666667);
 assert.equal(out.total.units,5.97);
 assert.equal(out.total.roi,24.875);
 assert.equal(out.daily.at(-1).cumulativeUnits,5.97);
 assert.equal(out.daily.at(-1).win,13);
 assert.equal(out.today.win,13);
 assert.equal(out.today.loss,10);
 assert.equal(out.today.units,6.97);
});
test('formula selections OVER and UNDER never double-count beyond ALL totals',()=>{
 const j={...data,formulas:[...forms,{...forms[0],selection:'OVER'}]};
 const out=combineOuOverview(legacy,baseSeries,book,j);
 assert.deepEqual(out.total,combineOuOverview(legacy,baseSeries,book,data).total);
});
test('additional formulas are INCLUDED automatically, never silently filter to first four',()=>{
 const f={formula:'E10',selection:'ALL',totalPredictions:3,pending:1,win:2,loss:0,profitLoss:1.85,averageOdds:1.925};
 const d={...data,formulas:[...forms,f],daily:[...data.daily,{formula_id:'E10',business_day:'2026-11-24',selected:3,settled:2,win:2,loss:0,net_units:1.85}]};
 const out=combineOuOverview(legacy,baseSeries,book,d);
 assert.equal(out.formulaCount,5);assert.equal(out.total.total,27);
 assert.equal(out.total.win,15);assert.equal(out.total.pending,1);
 assert.equal(out.total.units,7.82);
 assert.equal(out.daily.at(-1).cumulativeUnits,7.82);
});
test('invalid aggregate snapshots are rejected rather than inventing zero',()=>{
 assert.throws(()=>combineOuOverview(null,baseSeries,book,data),/UNAVAILABLE/);
 assert.throws(()=>combineOuOverview(legacy,baseSeries,book,{...data,formulas:[...forms,forms[0]]}),/INVALID/);
 assert.throws(()=>combineOuOverview(legacy,baseSeries,book,{...data,formulas:[{...forms[0],win:12}]}),/INVALID_A02/);
});
