import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSnapshot,publishGate} from './prepare-snapshot.mjs';
const board={fixtures:[{fixtureId:'900',home:{id:'1'},away:{id:'2'},kickoffUtc:'2026-10-25T10:00:00Z'}],generatedAt:'2026-10-25T00:00:00Z'};
test('reject missing source records, no false ready state',()=>{
 const x=prepareSnapshot({board,finished:[],revision:'board-1'});
 assert.equal(x.quality.fixtures,1);assert.equal(x.quality.coverage,0);
 assert.throws(()=>publishGate(x),/INSUFFICIENT_FT_COVERAGE/);
});
test('reject no board fixtures even when coverage math is 0',()=>{
 const x=prepareSnapshot({board:{fixtures:[]},finished:[],revision:'board-1'});
 assert.throws(()=>publishGate(x,{minimumCoverage:0}),/NO_FIXTURES/);
});
test('reject missing board revision to avoid mixing snapshots',()=>{
 assert.throws(()=>prepareSnapshot({board,finished:[],revision:''}),/MISSING_AUTHORITATIVE_INPUT/);
});
