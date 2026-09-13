import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyCycleDue,nextNativeAlarmAt,refereeFreshnessView} from '../src/index-fiveusd-shadow.js';

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

test('candidate referee freshness uses current Settings maximumPriceAgeSeconds',()=>{
  const at=1_000_000;
  const snapshot={referees:[{
    status:'AH READY',bookmakerVerified:true,sourceUpdatedAt:null,
    observedAt:at-20_000,lastSeenAt:at-20_000,lastChangedAt:at-20_000,
    priceFingerprint:'-0.5|1.91|1.99',timestampKind:'adapter_observed_at',
  }]};
  assert.equal(refereeFreshnessView(snapshot,{maximumPriceAgeSeconds:30},at).fresh,1);
  const strict=refereeFreshnessView(snapshot,{maximumPriceAgeSeconds:10},at);
  assert.equal(strict.fresh,0);
  assert.equal(strict.stale,1);
  assert.equal(strict.maxAgeSeconds,10);
});

test('candidate referee freshness reports OBSERVED basis without enabling voting',()=>{
  const at=2_000_000;
  const snapshot={referees:[{
    status:'AH READY',bookmakerVerified:true,sourceUpdatedAt:null,
    observedAt:at,lastSeenAt:at,lastChangedAt:at,
    priceFingerprint:'0|1.88|2.02',timestampKind:'adapter_observed_at',
    voteEligible:false,
  }]};
  const view=refereeFreshnessView(snapshot,{maximumPriceAgeSeconds:90},at);
  assert.equal(view.fresh,1);
  assert.equal(view.basisCounts.OBSERVED,1);
  assert.equal(snapshot.referees[0].voteEligible,false);
});
