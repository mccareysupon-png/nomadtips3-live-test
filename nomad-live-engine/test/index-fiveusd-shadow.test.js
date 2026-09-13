import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyCycleDue,nextNativeAlarmAt} from '../src/index-fiveusd-shadow.js';

test('native wrapper preserves legacy detector cadence independently of 3s fast lane',()=>{
  const at=1_000_000;
  assert.equal(legacyCycleDue({lastCycle:at-54_000},{cycleEveryMs:55_000},at),false);
  assert.equal(legacyCycleDue({lastCycle:at-55_000},{cycleEveryMs:55_000},at),true);
  assert.equal(legacyCycleDue({lastCycle:null},{cycleEveryMs:55_000},at),true);
});

test('native alarm targets a 3 second cycle without scheduling in the past',()=>{
  const started=10_000;
  assert.equal(nextNativeAlarmAt(started,10_500),13_000);
  assert.equal(nextNativeAlarmAt(started,15_000),15_250);
});
