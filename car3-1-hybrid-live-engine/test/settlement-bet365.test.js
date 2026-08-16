import test from 'node:test';
import assert from 'node:assert/strict';
import {settleExact,selectedAhLine} from '../worker/src/settlement-v2.js';

const settled={settledAt:'2026-08-16T03:00:00Z',market:'AH',selectedSide:'HOME',entryScore:{home:1,away:0},finalScore:{home:1,away:1},odds:2.0};

test('Bet365 live AH uses only goals after entry',()=>{
  const cases=[
    [0.50,'FULL_LOSS','LOSS'],
    [0.75,'HALF_LOSS','LOSS'],
    [1.00,'PUSH','DRAW'],
    [1.25,'HALF_WIN','WIN'],
    [1.50,'FULL_WIN','WIN']
  ];
  for(const [line,exact,group] of cases){
    const grade=settleExact({...settled,line});
    assert.equal(grade.exact,exact,`AH ${line}`);
    assert.equal(grade.group,group,`AH ${line}`);
    assert.deepEqual(grade.score,{home:0,away:1});
    assert.equal(grade.basis,'BET365_INPLAY_POST_ENTRY');
  }
});

test('user regression: HOME +1.25 at 1-1, FT 1-2 is half win',()=>{
  const grade=settleExact({...settled,entryScore:{home:1,away:1},finalScore:{home:1,away:2},line:1.25});
  assert.equal(grade.exact,'HALF_WIN');
  assert.equal(grade.group,'WIN');
  assert.equal(grade.pnlFactor,0.5);
  assert.equal(grade.netUnits,0.5);
});

test('half win at decimal 1.70 returns +0.35 net units',()=>{
  const grade=settleExact({...settled,entryScore:{home:1,away:1},finalScore:{home:1,away:2},line:1.25,odds:1.70});
  assert.equal(grade.exact,'HALF_WIN');
  assert.equal(grade.netUnits,0.35);
  assert.equal(Number((100*grade.netUnits).toFixed(2)),35);
});

test('half loss always loses half the stake',()=>{
  const grade=settleExact({...settled,line:0.75,odds:1.70});
  assert.equal(grade.exact,'HALF_LOSS');
  assert.equal(grade.netUnits,-0.5);
  assert.equal(Number((100*grade.netUnits).toFixed(2)),-50);
});

test('missing entry score never falls back to full-match AH',()=>{
  for(const entryScore of [null,{home:null,away:null},{home:'',away:''}]){
    const grade=settleExact({...settled,entryScore,line:1.25});
    assert.equal(grade.exact,'VOID');
    assert.equal(grade.group,'VOID');
    assert.equal(grade.basis,'MISSING_ENTRY_SCORE');
  }
});

test('invalid final score is void instead of being coerced to zero',()=>{
  const grade=settleExact({...settled,finalScore:{home:null,away:1},line:1.25});
  assert.equal(grade.exact,'VOID');
  assert.equal(grade.basis,'INVALID_FINAL_SCORE');
});

test('Goaloo legacy AH line is home perspective and is inverted for away selection',()=>{
  assert.equal(selectedAhLine({market:'AH',selectedSide:'HOME',line:-0.75}),-0.75);
  assert.equal(selectedAhLine({market:'AH',selectedSide:'AWAY',line:-0.75}),0.75);
  assert.equal(selectedAhLine({market:'AH',selectedSide:'AWAY',line:0.75}),-0.75);
  assert.equal(selectedAhLine({market:'AH',selectedSide:'AWAY',line:0.75,linePerspective:'SELECTED'}),0.75);
});

test('away selection settles with selected-team line perspective',()=>{
  const grade=settleExact({settledAt:'x',market:'AH',selectedSide:'AWAY',entryScore:{home:1,away:1},finalScore:{home:2,away:1},line:-1.25,odds:2.0});
  assert.equal(selectedAhLine({market:'AH',selectedSide:'AWAY',line:-1.25}),1.25);
  assert.equal(grade.exact,'HALF_WIN');
  assert.equal(grade.group,'WIN');
});

test('Bet365 Goal Line in-play keeps full-match total',()=>{
  const grade=settleExact({settledAt:'x',market:'OU',line:2.5,ouDirection:'OVER',entryScore:{home:1,away:0},finalScore:{home:2,away:1},selectedSide:'HOME',odds:1.9});
  assert.equal(grade.exact,'FULL_WIN');
  assert.equal(grade.basis,'BET365_GOAL_LINE_FULL_MATCH_TOTAL');
});

test('quarter handicap splits into two adjacent half-ball legs',()=>{
  const halfLoss=settleExact({...settled,line:0.75});
  assert.deepEqual(halfLoss.legs,[{line:0.5,outcome:'L'},{line:1,outcome:'P'}]);
  const halfWin=settleExact({...settled,line:1.25});
  assert.deepEqual(halfWin.legs,[{line:1,outcome:'P'},{line:1.5,outcome:'W'}]);
});
