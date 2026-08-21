import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoalooRunOdds} from '../src/goaloo-only-main.js';

test('Goaloo runOddsData preserves HOME Asian line sign and converts live odds',()=>{
  const source='3061002!0.88,-1,0.94!2.10,3.20,3.40!0.91,2.5,0.95$';
  const row=parseGoalooRunOdds(source,50).get('3061002');
  assert.ok(row);
  assert.equal(row.providerCompanyId,50);
  assert.equal(row.providerName,'1xBet');
  assert.equal(row.asianHandicap.linePerspective,'HOME');
  assert.equal(row.asianHandicap.line,-1);
  assert.equal(row.asianHandicap.home,1.88);
  assert.equal(row.asianHandicap.away,1.94);
  assert.deepEqual(row.asianHandicap.raw,{home:0.88,line:-1,away:0.94});
});

test('Goaloo HOME receiving handicap remains positive',()=>{
  const source='99!0.90,1,0.92!1.80,3.10,4.20!0.95,2.75,0.89$';
  const row=parseGoalooRunOdds(source,50).get('99');
  assert.equal(row.asianHandicap.line,1);
  assert.equal(row.asianHandicap.home,1.90);
  assert.equal(row.asianHandicap.away,1.92);
});
