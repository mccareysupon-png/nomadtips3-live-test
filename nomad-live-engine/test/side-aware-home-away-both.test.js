import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {assessSideMarket,buildRollingAnalysis,evaluate} from '../src/detector.js';
import {settleAsian} from '../src/settlement.js';

const stats=(attackHome,attackAway,dangerHome,dangerAway,sotHome=0,sotAway=0,offHome=0,offAway=0,cornerHome=0,cornerAway=0)=>({
  attacks:{home:attackHome,away:attackAway},
  dangerousAttack:{home:dangerHome,away:dangerAway},
  shotsOn:{home:sotHome,away:sotAway},
  shotsOff:{home:offHome,away:offAway},
  corners:{home:cornerHome,away:cornerAway},
});
const snapshot=(minute,value)=>({minute,observedAt:minute*60000,stats:value});
const market={status:'AH READY',line:-0.5,homeOdds:1.80,awayOdds:2.00,sourceUpdatedAt:55*60000};

test('HOME default keeps the established line and HOME odds',()=>{
  const snapshots=[
    snapshot(45,stats(10,10,5,5)),
    snapshot(50,stats(15,12,7,6)),
    snapshot(55,stats(25,13,13,6,1,0)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  const decision=evaluate({minute:55,score:{home:0,away:0},rolling},DEFAULT_CONFIG,market,55*60000);
  assert.equal(decision.side,'home');
  assert.equal(decision.selectionLine,-0.5);
  assert.equal(decision.selectionOdds,1.80);
  assert.equal(rolling.passedCount,rolling.sides.home.passedCount,'legacy HOME alias must remain intact');
});

test('AWAY uses the mirrored AH line and AWAY odds under the same rules',()=>{
  const config={...DEFAULT_CONFIG,targetSideMode:'AWAY'};
  const snapshots=[
    snapshot(45,stats(10,10,5,5)),
    snapshot(50,stats(11,15,5,7)),
    snapshot(55,stats(12,27,5,14,0,1)),
  ];
  const rolling=buildRollingAnalysis(snapshots,config);
  const decision=evaluate({minute:55,score:{home:0,away:0},rolling},config,market,55*60000);
  assert.equal(decision.side,'away');
  assert.equal(decision.selectionLine,+0.5);
  assert.equal(decision.selectionOdds,2.00);
  assert.equal(decision.marketCheck.passed,true);
});

test('Selected AH lines and odds are checked against the selected side',()=>{
  const config={...DEFAULT_CONFIG,targetSideMode:'AWAY',allowedLinesMode:'SELECTED',allowedSelectionLines:[+0.5],oddsMinimum:1.90};
  const away=assessSideMarket(market,config,55*60000,'away');
  const home=assessSideMarket(market,config,55*60000,'home');
  assert.equal(away.passed,true);
  assert.equal(away.line,+0.5);
  assert.equal(away.selectionOdds,2.00);
  assert.equal(home.passed,false);
});

test('BOTH evaluates both sides and can select AWAY when AWAY is the qualifying side',()=>{
  const config={...DEFAULT_CONFIG,targetSideMode:'BOTH'};
  const snapshots=[
    snapshot(45,stats(10,10,5,5)),
    snapshot(50,stats(11,15,5,7)),
    snapshot(55,stats(12,27,5,14,0,1)),
  ];
  const rolling=buildRollingAnalysis(snapshots,config);
  const decision=evaluate({minute:55,score:{home:0,away:0},rolling},config,market,55*60000);
  assert.equal(decision.side,'away');
  assert.equal(decision.sideMode,'BOTH');
  assert.ok(decision.sideCandidates.home);
  assert.ok(decision.sideCandidates.away);
});

test('settlement already settles an AWAY live AH signal from the AWAY perspective',()=>{
  const signal={selection:'away',line:+0.5,odds:2.00,entryScore:{home:0,away:0}};
  const settled=settleAsian(signal,{home:1,away:1});
  assert.equal(settled.result,'WIN');
  assert.equal(settled.profit,1);
  assert.deepEqual(settled.postEntryScore,{home:1,away:1});
});
