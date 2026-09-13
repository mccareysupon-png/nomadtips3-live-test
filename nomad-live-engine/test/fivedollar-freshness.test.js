import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFiveUsdQuoteFreshness,summarizeFiveUsdFreshness} from '../src/fivedollar-freshness.js';

const at=1_000_000;
const ready=(overrides={})=>({
  status:'AH READY',bookmakerVerified:true,line:-0.5,homeOdds:1.91,awayOdds:1.99,
  sourceUpdatedAt:null,observedAt:at-2_000,lastSeenAt:at-2_000,lastChangedAt:at-2_000,
  priceFingerprint:'-0.5|1.91|1.99',timestampKind:'adapter_observed_at',freshnessBasis:'OBSERVED',
  ...overrides,
});

test('observed-only 5USD quote is fresh without pretending to have bookmaker-native time',()=>{
  const result=assessFiveUsdQuoteFreshness(ready(),{at,maxAgeMs:90_000});
  assert.equal(result.eligible,true);
  assert.equal(result.freshnessBasis,'OBSERVED');
  assert.equal(result.sourceUpdatedAt,null);
  assert.equal(result.ageMs,2_000);
});

test('adapter observedAt may never be copied into sourceUpdatedAt',()=>{
  const result=assessFiveUsdQuoteFreshness(ready({sourceUpdatedAt:at-2_000}),{at});
  assert.equal(result.eligible,false);
  assert.equal(result.reason,'FABRICATED_SOURCE_TIMESTAMP');
});

test('a future provider-native timestamp is accepted only when explicitly declared and sane',()=>{
  const good=assessFiveUsdQuoteFreshness(ready({sourceUpdatedAt:at-1_000,timestampKind:'provider_native'}),{at});
  assert.equal(good.eligible,true);
  assert.equal(good.freshnessBasis,'PROVIDER_NATIVE');
  const bad=assessFiveUsdQuoteFreshness(ready({sourceUpdatedAt:at+10_000,timestampKind:'provider_native'}),{at});
  assert.equal(bad.eligible,false);
  assert.equal(bad.reason,'FRESHNESS_TIME_IN_FUTURE');
});

test('observed freshness expires at the configured boundary',()=>{
  assert.equal(assessFiveUsdQuoteFreshness(ready({lastSeenAt:at-90_000}),{at,maxAgeMs:90_000}).eligible,true);
  const stale=assessFiveUsdQuoteFreshness(ready({lastSeenAt:at-90_001}),{at,maxAgeMs:90_000});
  assert.equal(stale.eligible,false);
  assert.equal(stale.reason,'QUOTE_STALE');
});

test('missing/invalid AH never becomes fresh just because it was observed recently',()=>{
  const unavailable=assessFiveUsdQuoteFreshness(ready({status:'AH UNAVAILABLE'}),{at});
  assert.equal(unavailable.eligible,false);
  assert.equal(unavailable.reason,'QUOTE_NOT_READY');
});

test('fingerprint and change chronology are required for an eligible observed quote',()=>{
  assert.equal(assessFiveUsdQuoteFreshness(ready({priceFingerprint:null}),{at}).reason,'PRICE_FINGERPRINT_MISSING');
  assert.equal(assessFiveUsdQuoteFreshness(ready({lastChangedAt:at+10_000}),{at}).reason,'LAST_CHANGED_AFTER_LAST_SEEN');
});

test('freshness summary is independent from voting authority',()=>{
  const summary=summarizeFiveUsdFreshness([
    ready({sourceId:'source5',voteEligible:false}),
    ready({sourceId:'source6',lastSeenAt:at-100_000,voteEligible:false}),
  ],{at,maxAgeMs:90_000});
  assert.equal(summary.total,2);
  assert.equal(summary.fresh,1);
  assert.equal(summary.stale,1);
  assert.equal(summary.rows.every(row=>row.voteEligible===false),true);
});
