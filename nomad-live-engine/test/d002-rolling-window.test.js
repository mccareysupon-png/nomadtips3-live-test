import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {buildRollingAnalysis,evaluate} from '../src/detector.js';

const snapshot=(minute,stats)=>({minute,observedAt:minute*60000,stats});
const values=(
  attackHome,attackAway,dangerHome,dangerAway,
  sotHome=0,sotAway=0,shotOffHome=0,shotOffAway=0,cornerHome=0,cornerAway=0,
)=>({
  attacks:{home:attackHome,away:attackAway},
  dangerousAttack:{home:dangerHome,away:dangerAway},
  shotsOn:{home:sotHome,away:sotAway},
  shotsOff:{home:shotOffHome,away:shotOffAway},
  corners:{home:cornerHome,away:cornerAway},
});
const readyMarket=minute=>({status:'AH READY',line:-0.5,homeOdds:1.80,awayOdds:1.95,sourceUpdatedAt:minute*60000});

test('D-002 regression: exact 5+5 keeps the established pressure behavior',()=>{
  const snapshots=[
    snapshot(45,values(40,40,20,20,10,2,8,3,4,2)),
    snapshot(50,values(45,45,22,22,10,2,8,3,4,2)),
    snapshot(55,values(55,48,28,23,11,2,8,3,4,2)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,true);
  assert.deepEqual(rolling.baselines,{previousMinute:45,recentMinute:50,currentMinute:55});
  assert.deepEqual(rolling.durations,{previousMinutes:5,recentMinutes:5});
  assert.equal(rolling.previous.homePressure,9);
  assert.equal(rolling.recent.homePressure,22);
  assert.equal(rolling.rates.previous.homePressure,9/5);
  assert.equal(rolling.rates.recent.homePressure,22/5);
  assert.equal(rolling.conditions.homePressureTrend,true);
  assert.equal(rolling.conditions.matchTempoTrend,true);
});

test('D-002: unequal windows compare pressure and tempo per minute instead of raw counts',()=>{
  const snapshots=[
    snapshot(48,values(0,0,0,0,0,0)),
    snapshot(53,values(16,4,0,0,0,0)),
    snapshot(60,values(36,8,0,0,1,0)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,true);
  assert.deepEqual(rolling.baselines,{previousMinute:48,recentMinute:53,currentMinute:60});
  assert.deepEqual(rolling.durations,{previousMinutes:5,recentMinutes:7});
  assert.equal(rolling.previous.homePressure,16);
  assert.equal(rolling.recent.homePressure,20);
  assert.ok(rolling.recent.homePressure>rolling.previous.homePressure,'raw recent pressure is larger');
  assert.ok(rolling.rates.recent.homePressure<rolling.rates.previous.homePressure,'recent pressure rate is actually lower');
  assert.equal(rolling.conditions.homePressureTrend,false);
  assert.equal(rolling.conditions.matchTempoTrend,false);
  assert.equal(rolling.conditions.homePressureShare,true);
  assert.equal(rolling.passedCount,1);
});

test('D-002: previous baseline is chained from the actual recent baseline',()=>{
  const snapshots=[
    snapshot(48,values(0,0,0,0)),
    snapshot(50,values(4,1,0,0)),
    snapshot(53,values(16,4,0,0)),
    snapshot(60,values(36,8,0,0)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,true);
  assert.equal(rolling.baselines.recentMinute,53);
  assert.equal(rolling.baselines.previousMinute,48);
  assert.notEqual(rolling.baselines.previousMinute,50,'must not use current-10 when the real recent baseline is minute 53');
});

test('D-002: short configured windows never reuse or overlap the same baseline snapshot',()=>{
  for(const [window,snapshots] of [
    [1,[snapshot(52,values(10,10,5,5)),snapshot(53,values(11,10,5,5)),snapshot(55,values(13,11,6,5))]],
    [2,[snapshot(50,values(10,10,5,5)),snapshot(52,values(12,10,5,5)),snapshot(55,values(15,11,6,5))]],
  ]){
    const rolling=buildRollingAnalysis(snapshots,{...DEFAULT_CONFIG,rollingWindowMinutes:window});
    assert.equal(rolling.available,true,`window=${window}`);
    assert.ok(rolling.baselines.previousMinute<rolling.baselines.recentMinute,`window=${window}`);
    assert.ok(rolling.baselines.recentMinute<rolling.baselines.currentMinute,`window=${window}`);
    assert.ok(rolling.durations.previousMinutes>0,`window=${window}`);
    assert.ok(rolling.durations.recentMinutes>0,`window=${window}`);
  }
});

test('D-002: second-half rolling never falls back to a first-half snapshot',()=>{
  const snapshots=[
    snapshot(44,values(500,500,300,300,9,6)),
    snapshot(50,values(45,45,22,22,10,6)),
    snapshot(55,values(55,48,28,23,11,6)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,false);
  assert.equal(rolling.reason,'insufficient_snapshot_history');
});

test('D-002: HOME pressure share keeps its original percentage meaning under rate normalization',()=>{
  const snapshots=[
    snapshot(48,values(0,0,0,0)),
    snapshot(53,values(16,4,0,0)),
    snapshot(60,values(36,8,0,0)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,true);
  const rawShare=20/(20+4)*100;
  const rateShare=rolling.rates.recent.homePressure/(rolling.rates.recent.homePressure+rolling.rates.recent.awayPressure)*100;
  assert.equal(rolling.homePressureShare,rawShare);
  assert.ok(Math.abs(rolling.homePressureShare-rateShare)<1e-12);
});

test('D-002: SOT and Corner evidence remain raw event counts, not per-minute rates',()=>{
  const snapshots=[
    snapshot(48,values(0,0,0,0,0,0,0,0,0,0)),
    snapshot(53,values(16,4,0,0,0,0,0,0,4,2)),
    snapshot(60,values(36,8,0,0,1,0,0,0,5,2)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,true);
  assert.equal(rolling.recent.delta.shotsOn.home,1);
  assert.equal(rolling.recent.delta.corners.home,1);
  const decision=evaluate({minute:60,score:{home:0,away:0},stats:snapshots.at(-1).stats,rolling},DEFAULT_CONFIG,readyMarket(60),60*60000);
  assert.equal(decision.evidence.checks.sot,true);
  assert.equal(decision.evidence.checks.corner,true);
});

test('D-002: invalid rolling duration configuration fails closed',()=>{
  const snapshots=[snapshot(50,values(1,1,1,1)),snapshot(55,values(2,1,2,1))];
  const rolling=buildRollingAnalysis(snapshots,{...DEFAULT_CONFIG,rollingWindowMinutes:0});
  assert.equal(rolling.available,false);
  assert.equal(rolling.reason,'invalid_rolling_window');
});
