import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSummaryRow} from '../src/statistics.js';
import {profitUnitsForGrade} from '../src/settlement.js';

test('quarter-line result grades keep half-win and half-loss P/L',()=>{
  assert.equal(profitUnitsForGrade('WIN',1.90),0.9);
  assert.equal(profitUnitsForGrade('HALF_WIN',1.90),0.45);
  assert.equal(profitUnitsForGrade('PUSH',1.90),0);
  assert.equal(profitUnitsForGrade('HALF_LOSS',1.90),-0.5);
  assert.equal(profitUnitsForGrade('LOSS',1.90),-1);
});

test('statistics summary exposes six result buckets and unit ROI',()=>{
  const out=normalizeSummaryRow({total:10,settled:8,pending:2,win:3,half_win:1,push:1,half_loss:1,loss:2,void_count:0,avg_odds:1.8764,pl_units:1.35});
  assert.deepEqual(out.resultCounts,{WIN:3,HALF_WIN:1,PUSH:1,HALF_LOSS:1,LOSS:2,VOID:0});
  assert.equal(out.avgOdds,1.876);
  assert.equal(out.roiPct,16.88);
  assert.equal(out.winRatePct,60);
});
