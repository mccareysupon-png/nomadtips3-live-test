import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeOneXtwo,gradeTotals,settleRecord,summarize} from '../src/index.js';

test('1X2 settlement follows full-time result',()=>{
  assert.equal(gradeOneXtwo('HOME',2,1),'WIN');
  assert.equal(gradeOneXtwo('DRAW',1,1),'WIN');
  assert.equal(gradeOneXtwo('AWAY',2,1),'LOSS');
});

test('O/U integer line can PUSH',()=>{
  assert.equal(gradeTotals('OVER',3,2,1),'PUSH');
  assert.equal(gradeTotals('UNDER',3,2,1),'PUSH');
  assert.equal(gradeTotals('OVER',2.5,2,1),'WIN');
  assert.equal(gradeTotals('UNDER',2.5,2,1),'LOSS');
});

test('summary excludes PUSH from win-rate denominator',()=>{
  const base={
    id:'342:1',matchId:'1',fixtureId:'10',lockedAt:1,league:'L',home:'A',away:'B',minute:60,entryScore:{home:0,away:0},
    prediction:{oneXtwo:{pick:'HOME',odds:2},totals:{pick:'OVER',line:3,odds:2}},
  };
  const winPush=settleRecord(base,{home:2,away:1},'FT',2);
  const summary=summarize([winPush]);
  assert.equal(summary.wins,1);
  assert.equal(summary.pushes,1);
  assert.equal(summary.losses,0);
  assert.equal(summary.winRate,100);
});
