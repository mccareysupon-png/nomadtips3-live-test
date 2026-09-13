import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {appendNativeFixtureHistory,buildNativeCandidateShadow} from '../src/fivedollar-candidate-shadow.js';

const stats=(attacks,dangerousAttack,shotsOn,shotsOff,corners)=>({
  attacks:{home:attacks[0],away:attacks[1]},
  dangerousAttack:{home:dangerousAttack[0],away:dangerousAttack[1]},
  shotsOn:{home:shotsOn[0],away:shotsOn[1]},
  shotsOff:{home:shotsOff[0],away:shotsOff[1]},
  corners:{home:corners[0],away:corners[1]},
  possession:{home:60,away:40},
});

const fixture=(minute,values,extra={})=>({
  fixtureId:'501',boardState:'live',minute,
  league:{name:'Test League'},home:{name:'Home FC'},away:{name:'Away FC'},score:{home:0,away:0},stats:values,...extra,
});

test('same-minute sample replaces previous point instead of bloating history',()=>{
  let history=[];
  history=appendNativeFixtureHistory(history,fixture(55,stats([20,10],[10,5],[1,0],[1,0],[1,0])),1000);
  history=appendNativeFixtureHistory(history,fixture(55,stats([22,10],[11,5],[2,0],[1,0],[1,0])),2000);
  assert.equal(history.length,1);
  assert.equal(history[0].observedAt,2000);
  assert.equal(history[0].stats.attacks.home,22);
});

test('5USD-only history can produce a detector candidate without any legacy feed',()=>{
  const historyByFixture={
    '501':[
      {observedAt:1,minute:45,stats:stats([10,10],[5,5],[0,0],[0,0],[0,0])},
      {observedAt:2,minute:50,stats:stats([15,15],[8,8],[0,0],[0,0],[0,0])},
    ],
  };
  const current=fixture(55,stats([30,18],[16,9],[2,0],[1,0],[1,0]));
  const result=buildNativeCandidateShadow([current],historyByFixture,{...DEFAULT_CONFIG},3000);
  assert.equal(result.summary.live,1);
  assert.equal(result.summary.candidates,1);
  assert.equal(result.candidates[0].fixtureId,'501');
  assert.equal(result.candidates[0].detectionPassed,true);
  assert.equal(result.candidates[0].state,'NEAR SIGNAL');
  assert.equal(result.candidates[0].rollingAvailable,true);
});

test('terminal fixtures are excluded from native candidate shadow',()=>{
  const ended=fixture(90,stats([50,50],[20,20],[3,3],[3,3],[3,3]),{boardState:'terminal'});
  const result=buildNativeCandidateShadow([ended],{},DEFAULT_CONFIG,4000);
  assert.equal(result.summary.live,0);
  assert.equal(result.summary.candidates,0);
  assert.deepEqual(result.rows,[]);
});
