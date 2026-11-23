import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPricedOuV2Ui} from './patch-priced-ou-into-existing-prematch-ui-test-20261123.mjs';
import {evaluateAsianOu} from './ou-value-screener-v2-test.mjs';
import {londonAccountingWindow} from './london-cutoff.mjs';
const now=1795438300,dayForTime=t=>londonAccountingWindow(t).businessDay;
const row={
 fixture_id:204906152,home_id:501,away_id:502,
 kickoff:now+2400,picked_at:now-60,pick:'UNDER',
 line:2.5,price:2.8,bookmaker:'ladbrokes',
 source:'FULL_MARKET_CACHE_GOAL_LINE_CLOSING',
 source_observed_at:now-60,model:'ou-poisson-shrinkage-value-all-markets-v2-test',
 ev:0.3864339303067372,expected_goals:2.01,lambda_home:1.1,lambda_away:0.91,
 home_history:1,away_history:0,history_confidence:'LOW_SAMPLE'
};
const view=(rows=[row],identities={'204906152':{
 home:'Neftchi Fargona',away:'Al Hilal Riyadh',
 leagueName:'AFC Champions League Elite',leagueId:100
}},settlementState=null)=>projectPricedOuV2Ui({shadowRows:rows,identities,now,
 window:londonAccountingWindow(now),dayForTime,evaluate:evaluateAsianOu,settlementState});
test('real fixed O/U quote maps exactly to EXISTING TEST UI ledger with actual market identity and bookmaker',()=>{
 const v=view();
 assert.equal(v.ouLedger.mode,'TEST_ONLY');
 assert.equal(v.ouLedger.rows.length,1);
 const r=v.ouLedger.rows[0];
 assert.equal(r.fixture_id,204906152);
 assert.equal(r.pick,'UNDER_2.5');
 assert.equal(r.line,2.5);
 assert.equal(r.price,2.8);
 assert.equal(r.ev,row.ev);
 assert.equal(r.bookmaker,'ladbrokes');
 assert.equal(r.home,'Neftchi Fargona');
 assert.equal(r.away,'Al Hilal Riyadh');
 assert.equal(r.market,'O/U');
 assert.equal(r.status,'PENDING');
 assert.equal(r.historyConfidence,'LOW_SAMPLE');
 assert(r.probability>0&&r.probability<1);
 assert.equal(r.quoteTimestampUnverified,true);
 assert.equal(v.ouLedger.stats.total,1);
 assert.equal(v.ouDailyBook.selected.total,1);
 assert.equal(v.ouDailyBook.settled.total,0);
 assert.equal(v.ouLedger.modelOnly,false);
 assert.equal(v.providerCalls,0);
});
test('duplicate fixture never appears twice, prevents unified UI grouping collision',()=>{
 const v=view([row,{...row,price:3.0}]);
 assert.equal(v.ouLedger.rows.length,1);
 assert.equal(v.ouLedger.rows[0].price,2.8);
});
test('NO PRICE, fake provider, wrong EV, postkickoff and stale captured evidence never render a fake prediction',()=>{
 const bad=[
 {...row,price:null},{...row,price:1.5},{...row,ev:0.01},
 {...row,source:'MODEL_ONLY'},
 {...row,picked_at:row.kickoff+2},
 {...row,source_observed_at:now-500},
 {...row,line:2.3},
 {...row,pick:'UNKNOWN'}
 ];
 for(const x of bad)assert.equal(view([x]).ouLedger.rows.length,0,'invalid '+JSON.stringify(x));
});
test('no team name in source means visibly unavailable identity, never fabricate names',()=>{
 const v=view([row],{});
 assert.equal(v.ouLedger.rows[0].home,'Team #501');
 assert.equal(v.ouLedger.rows[0].away,'Team #502');
});
test('pending rows count independently from original 1X2/BTTS and do not falsely claim settled ROI',()=>{
 const v=view([row]);
 assert.equal(v.ouLedger.stats.pending,1);
 assert.equal(v.ouLedger.stats.settled,0);
 assert.equal(v.ouLedger.stats.winRate,null);
 assert.equal(v.ouLedger.stats.units,null);
 assert.equal(v.ouDailySeries.length,1);
 assert.equal(v.ouDailySeries[0].selected,1);
 assert.equal(v.ouDailySeries[0].settled,0);
});
test('all quarter/half/full Asian O/U lines support same existing UI pick text',()=>{
 for(const line of [2,2.25,2.5,2.75,3,3.5,4.25]){
  const v=view([{...row,line}]);
  assert.equal(v.ouLedger.rows[0].pick,'UNDER_'+line);
 }
});

test('priced O/U V2 UI reflects only persisted verified settlement state, not ad hoc FT calculation',()=>{
 const persisted={
  settlements:{'204906152':{status:'WIN',kind:'FULL_WIN',hg:1,ag:1,
   units:1.8,settled_at:row.kickoff+600}},
  stats:{total:1,pending:0,win:1,loss:0,push:0,draw:0,settled:1,
   winRate:100,units:1.8,pricedSettled:1,pricedPending:0},
  dailyBook:{source:'PERSISTED_OU_V2_TEST',selected:{total:1},
   settled:{total:1,win:1,loss:0,units:1.8}},
  dailySeries:[{date:'2026-11-23',selected:1,settled:1,netUnits:1.8}]
 };
 const output=view([row],undefined,persisted);
 const record=output.ouLedger.rows[0];
 assert.equal(record.status,'WIN');
 assert.equal(record.hg,1);
 assert.equal(record.ag,1);
 assert.equal(record.units,1.8);
 assert.equal(record.settlementKind,'FULL_WIN');
 assert.equal(output.ouLedger.stats.pending,0);
 assert.equal(output.ouLedger.stats.win,1);
 assert.equal(output.ouDailyBook.settled.units,1.8);
 assert.equal(output.ouDailySeries[0].netUnits,1.8);
});
