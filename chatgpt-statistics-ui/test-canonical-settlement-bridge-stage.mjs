import assert from 'node:assert/strict';
import {postCanonicalTransition} from './canonical-settlement-bridge-stage.mjs';

const base={
 schema:2,historicalRowsRetained:0,updatedAt:0,
 stats:{ledgerTotal:0,total:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0},
 summary:{rows:0,wins:0,losses:0,pushes:0,priced:0,stake:0,net:0,peak:0,maxDD:0,bestRun:0,roi:null,avgOdds:null,settledDays:0},
 series:{units:[],roi:[],rate:[]},
 _finance:{oddsSum:0,oddsCount:0,firstDay:null,lastSettledAt:0,lastAppliedId:null,trough:0}
};
let stored={revision:0,balance:base,appliedEventIds:[]};
const adapter={
 async load(){return structuredClone(stored)},
 async compareAndSwap(rev,next){if(rev!==stored.revision)return false;stored=structuredClone(next);return true}
};
const pending={id:'s1',status:'PENDING',odds:1.9,createdAt:'2026-11-17T01:00:00Z'};
const win={...pending,status:'SETTLED',result:'WIN',settledAt:'2026-11-17T01:30:00Z'};
const post=(eventId,oldRow,newRow)=>postCanonicalTransition(adapter,{committed:true,eventId,oldRow,newRow});
assert.equal((await post('event-1',null,pending)).mode,'NON_SETTLED_COUNTER_UPDATE');
assert.equal(stored.balance.stats.pending,1);
assert.equal((await post('event-2',pending,win)).mode,'POSTED_NEW_SETTLEMENT');
assert.equal(stored.balance.stats.pending,0);
assert.equal(stored.balance.stats.win,1);
assert.ok(Math.abs(stored.balance.summary.net-.9)<1e-10);
assert.equal((await post('event-2',pending,win)).mode,'ALREADY_APPLIED');
assert.equal(stored.balance.stats.win,1);
const second={id:'s2',status:'SETTLED',result:'LOSS',odds:1.8,createdAt:'2026-11-17T02:00:00Z',settledAt:'2026-11-17T02:30:00Z'};
assert.equal((await post('event-3',null,second)).mode,'POSTED_NEW_SETTLEMENT');
assert.ok(Math.abs(stored.balance.summary.net+.1)<1e-10);
assert.equal(stored.balance.stats.total,2);
assert.equal(stored.balance.historicalRowsRetained,0);
const correction={...win,odds:2.0};
assert.equal((await post('event-4',win,correction)).mode,'HISTORICAL_CORRECTION_NEEDS_TARGETED_DAY_REBUILD');
assert.equal(stored.balance.stats.total,2);
assert.equal(stored.appliedEventIds.includes('event-4'),false);
console.log('B46_STAGING_CANONICAL_BRIDGE_TEST=PASS');
