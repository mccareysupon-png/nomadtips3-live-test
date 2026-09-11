import test from 'node:test';
import assert from 'node:assert/strict';
import {goalsNeededForFullOverWin,fullWinGoalLimitOk} from '../src/index.js';

test('score 3-1 accepts O4.25 and O4.5 with one-goal full-win limit',()=>{
  assert.equal(goalsNeededForFullOverWin(4.25,[3,1]),1);
  assert.equal(goalsNeededForFullOverWin(4.5,[3,1]),1);
  assert.equal(fullWinGoalLimitOk(4.25,[3,1],1),true);
  assert.equal(fullWinGoalLimitOk(4.5,[3,1],1),true);
});

test('score 3-1 rejects O4.75 with one-goal limit because one more is only half-win',()=>{
  assert.equal(goalsNeededForFullOverWin(4.75,[3,1]),2);
  assert.equal(fullWinGoalLimitOk(4.75,[3,1],1),false);
  assert.equal(fullWinGoalLimitOk(4.75,[3,1],2),true);
});

test('quarter-line full-win math and unlimited mode remain deterministic',()=>{
  assert.equal(goalsNeededForFullOverWin(5.0,[3,1]),2);
  assert.equal(goalsNeededForFullOverWin(5.25,[3,1]),2);
  assert.equal(goalsNeededForFullOverWin(5.75,[3,1]),3);
  assert.equal(fullWinGoalLimitOk(9.75,[3,1],999),true);
  assert.equal(fullWinGoalLimitOk(4.5,null,1),false);
});
