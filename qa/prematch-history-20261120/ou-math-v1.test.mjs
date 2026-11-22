import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateOu25,poissonOver25,OU_POLICY} from './ou-math-v1-test.mjs';
import {patchOuMain} from './patch-ou-math-v1-main-test.mjs';
import {readFileSync} from 'node:fs';
const result=(gf,ga,venue='home')=>({gf,ga,venue});
test('Poisson 2.5 is exact, bounded and monotonic',()=>{
 assert(Math.abs(poissonOver25(2)-(.3233235838169365))<1e-10);
 assert(poissonOver25(1)<poissonOver25(2));
 assert(poissonOver25(2)<poissonOver25(3));
 assert.throws(()=>poissonOver25(0),/INVALID/);
});
test('high scoring histories prefer Over, lower scoring histories prefer Under',()=>{
 const over=estimateOu25(Array.from({length:10},()=>result(4,3)),Array.from({length:10},()=>result(3,4,'away')));
 const under=estimateOu25(Array.from({length:10},()=>result(0,0)),Array.from({length:10},()=>result(0,0,'away')));
 assert.equal(over.pick,'OVER_2.5');assert(over.probability>.5);
 assert.equal(under.pick,'UNDER_2.5');assert(under.probability>.5);
 assert.equal(over.price,null);assert.equal(under.ev,null);
 assert.equal(OU_POLICY.providerCalls,0);
});
test('use every available stored match without requiring 3 or 10 per team',()=>{
 const cases=[
  [[result(3,0)],[]],
  [[],[result(0,3,'away')]],
  [[result(3,0)],[result(0,3,'away')]],
  [[result(2,1),result(0,0)],[result(1,2,'away')]],
  [Array.from({length:10},()=>result(2,1)),[result(1,2,'away')]]
 ];
 for(const [h,a] of cases){
  const p=estimateOu25(h,a);
  assert.notEqual(p.state,'INSUFFICIENT_HISTORY');
  assert.equal(p.homeCount,h.length);
  assert.equal(p.awayCount,a.length);
  assert(Number.isFinite(p.probability)&&p.probability>=.5&&p.probability<=1);
  assert(Number.isFinite(p.expectedTotalGoals)&&p.expectedTotalGoals>0);
  assert.equal(p.price,null);
  assert.equal(p.ev,null);
  assert.equal(p.calibrated,false);
 }
 assert.equal(OU_POLICY.minHistory,0);
 assert.equal(OU_POLICY.minCombinedHistory,1);
 assert.equal(OU_POLICY.minProbability,.64);
});
test('no match history on either team must not issue a data-free prediction',()=>{
 assert.equal(estimateOu25([],[]).state,'INSUFFICIENT_HISTORY');
});
test('current TEST backend patch preserves original 1X2 and BTTS routines',()=>{
 const main=readFileSync(new URL('./prematch-only-worker.mjs',import.meta.url),'utf8');
 const patch=patchOuMain(main);
 assert(patch.code.includes("path==='/ou-cycle-test'"));
 assert(patch.code.includes("path==='/ou-backtest-test'"));
 assert(patch.code.includes('const bttsIssued=await this.recordQualifiedBtts(now,fixtures);'));
 assert(patch.code.includes('recordPicks(this.db,picksFromBot(report,fixtures,now),now);'));
 assert.equal(patch.providerCallsAdded,0);
 assert.equal(patch.oneX2ModelChanged,false);
});
