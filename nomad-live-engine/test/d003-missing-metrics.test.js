import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {buildRollingAnalysis,evaluate} from '../src/detector.js';

const OBSERVED_AT=55*60000;
const readyMarket=()=>({
  status:'AH READY',line:-0.5,homeOdds:1.80,awayOdds:1.95,sourceUpdatedAt:OBSERVED_AT,
});
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

function strongPressure({sot50=10,sot55=11,corner50=4,corner55=4}={}){
  return [
    snapshot(45,values(40,40,20,20,10,2,8,3,4,2)),
    snapshot(50,values(45,45,22,22,sot50,2,8,3,corner50,2)),
    snapshot(55,values(55,48,28,23,sot55,2,8,3,corner55,2)),
  ];
}

test('D-003: missing baseline Attack cannot be invented as zero pressure',()=>{
  const snapshots=[
    snapshot(45,values(null,40,20,20,10,2)),
    snapshot(50,values(45,45,22,22,10,2)),
    snapshot(55,values(55,48,28,23,11,2)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,false);
  assert.equal(rolling.reason,'incomplete_pressure_metrics');
});

test('D-003: missing current Dangerous Attack makes rolling pressure unavailable',()=>{
  const snapshots=[
    snapshot(45,values(40,40,20,20,10,2)),
    snapshot(50,values(45,45,22,22,10,2)),
    snapshot(55,values(55,48,null,23,11,2)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,false);
  assert.equal(rolling.reason,'incomplete_pressure_metrics');
});

test('D-003: missing SOT baseline never creates a fake HOME SOT event',()=>{
  const snapshots=strongPressure({sot50:null,sot55:1});
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,true);
  assert.equal(rolling.recent.delta.shotsOn.home,null);
  const decision=evaluate({minute:55,score:{home:0,away:0},stats:snapshots.at(-1).stats,rolling},DEFAULT_CONFIG,readyMarket(),OBSERVED_AT);
  assert.equal(decision.evidence.checks.sot,false);
  assert.equal(decision.evidence.passed,false);
  assert.equal(decision.state,'WATCHING');
});

test('D-003: missing SOT does not suppress a real Corner event in ANY mode',()=>{
  const snapshots=strongPressure({sot50:null,sot55:1,corner50:4,corner55:5});
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,true);
  assert.equal(rolling.recent.delta.shotsOn.home,null);
  assert.equal(rolling.recent.delta.corners.home,1);
  const decision=evaluate({minute:55,score:{home:0,away:0},stats:snapshots.at(-1).stats,rolling},DEFAULT_CONFIG,readyMarket(),OBSERVED_AT);
  assert.equal(decision.evidence.checks.sot,false);
  assert.equal(decision.evidence.checks.corner,true);
  assert.equal(decision.evidence.passed,true);
  assert.equal(decision.state,'SIGNAL');
});

test('D-003 regression: genuine zero remains numeric zero and 0 to 1 remains a real delta',()=>{
  const snapshots=[
    snapshot(45,values(0,0,0,0,0,0)),
    snapshot(50,values(0,0,0,0,0,0)),
    snapshot(55,values(1,0,0,0,1,0)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,true);
  assert.equal(rolling.previous.delta.attacks.home,0);
  assert.equal(rolling.recent.delta.attacks.home,1);
  assert.equal(rolling.recent.delta.shotsOn.home,1);
});

test('D-003 regression: cumulative counters moving backwards still fail closed',()=>{
  const snapshots=[
    snapshot(45,values(40,40,20,20,10,2)),
    snapshot(50,values(45,45,22,22,10,2)),
    snapshot(55,values(44,48,28,23,8,2)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,false);
  assert.equal(rolling.reason,'incomplete_pressure_metrics');
});

test('D-003: booleans and objects are not cumulative metric numbers',()=>{
  for(const invalid of [true,false,[],[1],{value:1}]){
    const snapshots=[
      snapshot(45,values(40,40,20,20,10,2)),
      snapshot(50,values(invalid,45,22,22,10,2)),
      snapshot(55,values(55,48,28,23,11,2)),
    ];
    const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
    assert.equal(rolling.available,false,`invalid=${JSON.stringify(invalid)}`);
    assert.equal(rolling.reason,'incomplete_pressure_metrics',`invalid=${JSON.stringify(invalid)}`);
  }
});
