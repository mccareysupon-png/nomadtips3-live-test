import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoalOddsXml} from '../worker/src/upgrade.js';

test('parse Goaloo goal50.xml current odds and HK prices',()=>{
  const xml="<?xml version='1.0'?><c><match><m>3018359,17535243,0,1.20,0.63,156460524,3.03,3.24,2.21,20216243,2.25,0.83,0.90,1,0,0,0,3,3,3,,,,</m></match></c>";
  const row=parseGoalOddsXml(xml,50).get('3018359');
  assert.equal(row.providerCompanyId,50);
  assert.equal(row.providerName,'1xBet');
  assert.equal(row.oneXtwo.home,3.03);
  assert.equal(row.oneXtwo.draw,3.24);
  assert.equal(row.oneXtwo.away,2.21);
  assert.equal(row.asianHandicap.line,0);
  assert.equal(row.asianHandicap.home,2.20);
  assert.equal(row.asianHandicap.away,1.63);
  assert.equal(row.overUnder.line,2.25);
  assert.equal(row.overUnder.over,1.83);
  assert.equal(row.overUnder.under,1.90);
});
