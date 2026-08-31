import assert from 'node:assert/strict';
import { splitQuarterLine, settleAsianHandicap, settleTotal, oneXtwoOutcome } from '../src/settle.js';
import { backtest } from '../tools/backtest.mjs';

assert.deepEqual(splitQuarterLine(-0.25),[-0.5,0]);
assert.deepEqual(splitQuarterLine(2.75),[2.5,3]);
assert.equal(settleAsianHandicap(1,1,-0.25).label,'HALF_LOSS');
assert.equal(settleAsianHandicap(2,1,-0.25).label,'WIN');
assert.equal(settleTotal(2,1,2.75,'OVER').label,'HALF_WIN');
assert.equal(oneXtwoOutcome(1,1),'DRAW');

const report=backtest([{
  homeGoals:2,awayGoals:0,
  main:{ah:{line:-0.5},totals:{line:2.5}},
  consensus:{ah:{side:'HOME',strength:'STRONG'},oneXtwo:{side:'HOME',strength:'STRONG'},totals:{side:'OVER',strength:'STRONG'}}
}]);
assert.equal(report.samples,1);
assert.equal(report.ah.hitRate,100);
assert.equal(report.oneXtwo.hitRate,100);
assert.equal(report.totals.hitRate,0);
console.log('market settlement/backtest tests: ok');
