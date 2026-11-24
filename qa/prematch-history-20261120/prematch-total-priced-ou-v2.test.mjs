import test from 'node:test';
import assert from 'node:assert/strict';
import {combinePrematchTotalSnapshots,appendPricedOuToPrematchAll} from './prematch-total-priced-ou-v2-test.mjs';
const day='2026-11-23',window={businessDay:day,begin:1795413600,end:1795500000};
const base={total:110,pending:48,win:32,loss:30,push:0,units:22.511,updatedAt:12};
const bt={total:0,pending:0,win:0,loss:0,push:0,units:0};
const ou={total:1,pending:0,win:0,loss:1,push:0,units:-1};
const registry={
 code:'B46_PREMATCH_STATS_REGISTRY_V1',rangeDays:90,
 markets:{'1X2':base,BTTS:bt,TOTAL:base},
 dailyBooks:{TOTAL:{window,selected:{total:19,pending:null},
  settled:{total:11,win:5,loss:6,push:0,draw:0,units:1.617}},
  '1X2':{window},BTTS:{window}},
 dailySeries:{TOTAL:[
  {date:'2026-11-21',selected:67,settled:14,win:8,loss:6,draw:0,netUnits:5.46,cumulativeUnits:10.16},
  {date:'2026-11-22',selected:16,settled:33,win:16,loss:17,draw:0,netUnits:10.734,cumulativeUnits:20.894},
  {date:'2026-11-23',selected:19,settled:11,win:5,loss:6,draw:0,netUnits:1.617,cumulativeUnits:22.511}
 ],'1X2':[],BTTS:[]}
};
const settlement={stats:ou,
 dailyBook:{window,selected:{total:1},settled:{total:1,win:0,loss:1,push:0,units:-1}},
 dailySeries:[{date:day,selected:1,settled:1,win:0,loss:1,draw:0,netUnits:-1,cumulativeUnits:-1}]};
test('110 originals plus one real OU LOSS is 111 with accurate WinRate and P/L',()=>{
 const result=combinePrematchTotalSnapshots(registry,settlement);
 assert.equal(result.markets.TOTAL.total,111);
 assert.equal(result.markets.TOTAL.pending,48);
 assert.equal(result.markets.TOTAL.win,32);
 assert.equal(result.markets.TOTAL.loss,31);
 assert.equal(result.markets.TOTAL.settled,63);
 assert.equal(result.markets.TOTAL.units,21.511);
 assert(Math.abs(result.markets.TOTAL.winRate-32/63*100)<1e-10);
 assert.equal(result.dailyBooks.TOTAL.selected.total,20);
 assert.equal(result.dailyBooks.TOTAL.settled.total,12);
 assert.equal(result.dailyBooks.TOTAL.settled.loss,7);
 assert.equal(result.dailyBooks.TOTAL.settled.units,.617);
 const last=result.dailySeries.TOTAL.at(-1);
 assert.equal(last.date,day);
 assert.equal(last.netUnits,.617);
 assert.equal(last.cumulativeUnits,21.511);
 assert.equal(last.loss,7);
 assert.equal(registry.markets.TOTAL.total,110);
 assert.equal(settlement.stats.total,1);
 assert.equal(result.providerCalls,0);
});
test('OU and 1X2 on the same fixture are two distinct priced predictions',()=>{
 const a={fixture_id:204906152,market:'1X2',picked_at:100,kickoff:300,status:'WIN'};
 const o={...a,market:'O/U',status:'LOSS',pick:'UNDER_2.5',units:-1};
 const total={total:2,pending:0,win:1,loss:1,push:0};
 const result=appendPricedOuToPrematchAll({mode:'TEST_ONLY',rows:[a]},[o],total);
 assert.equal(result.rows.length,2);
 assert.equal(result.rows.filter(x=>x.fixture_id===204906152).length,2);
 assert.equal(result.rows.filter(x=>x.market==='O/U').length,1);
 assert.equal(appendPricedOuToPrematchAll(result,[o],total).rows.length,2);
});
test('PENDING O/U adds a selection but never affects WinRate or units',()=>{
 const p={...settlement,stats:{total:1,pending:1,win:0,loss:0,push:0,units:null},
  dailyBook:{window,selected:{total:1},settled:{total:0,win:0,loss:0,push:0,units:null}},dailySeries:[]};
 const r=combinePrematchTotalSnapshots(registry,p);
 assert.equal(r.markets.TOTAL.pending,49);
 assert.equal(r.markets.TOTAL.winRate,base.win/(base.win+base.loss)*100);
 assert.equal(r.markets.TOTAL.units,base.units);
});
test('PUSH excluded from denominator and half-loss uses stored units',()=>{
 const p={...settlement,stats:{total:2,pending:0,win:0,loss:1,push:1,units:-.5},
  dailyBook:{window,selected:{total:2},settled:{total:2,win:0,loss:1,push:1,units:-.5}}};
 const r=combinePrematchTotalSnapshots(registry,p);
 assert.equal(r.markets.TOTAL.push,1);
 assert.equal(r.markets.TOTAL.units,22.011);
 assert.equal(r.markets.TOTAL.winRate,32/63*100);
});
test('refuse inconsistent totals rather than silently corrupt 1X2 and BTTS',()=>{
 const bad={...registry,markets:{...registry.markets,TOTAL:{...base,total:999}}};
 assert.throws(()=>combinePrematchTotalSnapshots(bad,settlement),/BAD_PREMATCH_SNAPSHOT|ORIGINAL_PREMATCH_TOTAL_MISMATCH/);
});
