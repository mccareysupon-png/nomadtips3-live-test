import test from 'node:test';
import assert from 'node:assert/strict';
import {ingestTestPreview,validateTestPreview} from './test-ledger-import.mjs';
import {receiverGraph,validReceiverGraph} from './performance-core.mjs';

const fixture=()=>{
 const odds=[3.6,2.2,2.9,2.5,2.4,2.4,2.5,2.62];
 const status=['WIN','WIN','WIN','LOSS','PENDING','PENDING','PENDING','PENDING'];
 const rows=odds.map((price,i)=>({
  fixture_id:1000+i,picked_at:1795189472,pick:['DRAW','HOME','AWAY'][i%3],
  price,status:status[i],
  settled_at:i<4?1795221432+i*60:null,
  units:i<3?Number((price-1).toFixed(2)):i===3?-1:null
 }));
 return {dailyBook:{providerCalls:0,window:{timezone:'Europe/London',cutoffLocal:'06:00'}},
  testLedger:{mode:'TEST_ONLY',stats:{total:8,pending:4,win:3,loss:1,units:4.7},rows}};
};
test('Test preview 8 selections settle 4 with correct immutable P/L and zero provider calls',()=>{
 const source=fixture(),original=structuredClone(source);
 const res=ingestTestPreview(null,source);
 assert.deepEqual(source,original,'must not mutate source TEST ledger');
 assert.equal(res.changed,true);assert.equal(res.selected,8);assert.equal(res.settled,4);
 const s=res.state.snapshot;
 assert.equal(s.picks,8);assert.equal(s.pending,4);assert.equal(s.settled,4);
 assert.equal(s.win,3);assert.equal(s.loss,1);assert.equal(s.netUnits,4.7);
 assert.equal(s.stakedUnits,4);
 assert.equal(s.oddsCount,8);
 assert.equal(s.oddsSum,21.12);
 const g=receiverGraph(s,{market:'1X2',variant:'all',filter:'all',range:'all'});
 assert.equal(g.summary.rows,4);assert.equal(g.summary.net,4.7);assert.equal(g.summary.stake,4);
 assert.equal(g.summary.roi,117.5);assert.equal(g.summary.wins,3);
 assert.equal(g.summary.avgOdds,2.8); // (3.6+2.2+2.9+2.5) / 4
 assert.equal(g.summary.maxDD,null,'do not invent per-event drawdown');
 assert(validReceiverGraph(g,{market:'1X2',variant:'all',filter:'all',range:'all'}));
 assert.equal(g.series.units.length,1,'one actual London day is one real point');
});
test('Repeated cron payload never increments a selection or a result twice',()=>{
 const source=fixture(),one=ingestTestPreview(null,source),again=ingestTestPreview(one.state,source);
 assert.equal(again.changed,false);assert.equal(again.selected,0);assert.equal(again.settled,0);
 assert.equal(again.state.snapshot.lastSequence,one.state.snapshot.lastSequence);
 assert.deepEqual(again.state.snapshot,one.state.snapshot);
});
test('Later real settlement of a previous PENDING pick updates only its selected day and later closings',()=>{
 const source=fixture(),first=ingestTestPreview(null,source);
 const next=fixture();
 next.testLedger.rows[4].status='WIN';next.testLedger.rows[4].settled_at=1795300000;
 next.testLedger.rows[4].units=1.4;
 const after=ingestTestPreview(first.state,next);
 assert.equal(after.selected,0);assert.equal(after.settled,1);
 assert.equal(after.state.snapshot.picks,8);assert.equal(after.state.snapshot.settled,5);
 assert.equal(after.state.snapshot.pending,3);assert.equal(after.state.snapshot.netUnits,6.1);
 assert(after.state.snapshot.daily.length>=2);
 const replay=ingestTestPreview(after.state,next);
 assert.equal(replay.changed,false);
});
test('Price change, contradictory settlement and duplicate source row are rejected',()=>{
 const source=fixture(),first=ingestTestPreview(null,source);
 const priceChanged=fixture();priceChanged.testLedger.rows[0].price=5;
 assert.throws(()=>ingestTestPreview(first.state,priceChanged),/LOCKED_SELECTION_CHANGED/);
 const revised=fixture();revised.testLedger.rows[0].status='LOSS';revised.testLedger.rows[0].units=-1;
 assert.throws(()=>ingestTestPreview(first.state,revised),/SETTLEMENT_REVISION_CONFLICT/);
 const duplicate=fixture();duplicate.testLedger.rows.push({...duplicate.testLedger.rows[0]});
 assert.throws(()=>validateTestPreview(duplicate).length&&ingestTestPreview(null,duplicate),/DUPLICATE_SOURCE_SELECTION/);
});
test('Fail closed if PREMATCH_STORE is not TEST_ONLY or reports provider calls',()=>{
 const live=fixture();live.testLedger.mode='PRODUCTION';
 assert.throws(()=>ingestTestPreview(null,live),/SOURCE_NOT_TEST_ONLY/);
 const api=fixture();api.dailyBook.providerCalls=1;
 assert.throws(()=>ingestTestPreview(null,api),/PROVIDER_CALLS_MUST_BE_ZERO/);
});
