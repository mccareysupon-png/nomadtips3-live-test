import test from 'node:test';
import assert from 'node:assert/strict';
import {settleAsian} from '../src/settlement.js';

const homeSignal=(line,odds,entryScore)=>({selection:'home',line,odds,entryScore});

test('live AH 0.00: entry 2-3 and final 2-3 is PUSH because no goals were scored after entry',()=>{
  const settled=settleAsian(homeSignal(0,1.53,{home:2,away:3}),{home:2,away:3});
  assert.equal(settled.result,'PUSH');
  assert.equal(settled.profit,0);
  assert.deepEqual(settled.postEntryScore,{home:0,away:0});
  assert.equal(settled.settlementScope,'LIVE_POST_ENTRY');
});

test('live AH +0.25: entry 1-1 and final 1-1 is HALF WIN',()=>{
  const settled=settleAsian(homeSignal(.25,1.30,{home:1,away:1}),{home:1,away:1});
  assert.equal(settled.result,'HALF WIN');
  assert.equal(settled.profit,.15);
  assert.deepEqual(settled.legs,['PUSH','WIN']);
});

test('live AH +0.25: entry 1-1 and final 1-2 is LOSS',()=>{
  const settled=settleAsian(homeSignal(.25,1.30,{home:1,away:1}),{home:1,away:2});
  assert.equal(settled.result,'LOSS');
  assert.equal(settled.profit,-1);
  assert.deepEqual(settled.postEntryScore,{home:0,away:1});
});

test('live AH 0.00: entry 2-3 and final 3-3 is WIN because HOME wins the post-entry period 1-0',()=>{
  const settled=settleAsian(homeSignal(0,1.53,{home:2,away:3}),{home:3,away:3});
  assert.equal(settled.result,'WIN');
  assert.equal(settled.profit,.53);
  assert.deepEqual(settled.postEntryScore,{home:1,away:0});
});

test('live AH -0.25: no goals after entry is HALF LOSS',()=>{
  const settled=settleAsian(homeSignal(-.25,1.90,{home:0,away:2}),{home:0,away:2});
  assert.equal(settled.result,'HALF LOSS');
  assert.equal(settled.profit,-.5);
  assert.deepEqual(settled.legs,['LOSS','PUSH']);
});

test('legacy call without entryScore retains full-match fallback for non-live unit tests',()=>{
  const settled=settleAsian({selection:'home',line:-.25,odds:1.9},{home:1,away:1});
  assert.equal(settled.result,'HALF LOSS');
  assert.equal(settled.settlementScope,'FULL_MATCH_FALLBACK');
});
