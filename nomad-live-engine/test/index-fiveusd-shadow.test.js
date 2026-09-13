import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyCycleDue,nextNativeAlarmAt,refereeFreshnessView,refereeDecisionShadow} from '../src/index-fiveusd-shadow.js';

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

test('candidate decision shadow selects 5USD consensus but cannot authorize a signal',()=>{
  const at=3_000_000;
  const make=(sourceId,position,bookmaker,homeOdds)=>({
    sourceId,position,bookmaker,bookmakerSlug:bookmaker.toLowerCase(),
    status:'AH READY',bookmakerVerified:true,line:-0.5,homeOdds,awayOdds:Number((3-homeOdds).toFixed(2)),
    sourceUpdatedAt:null,observedAt:at,lastSeenAt:at,lastChangedAt:at,
    priceFingerprint:`-0.5|${homeOdds}|${Number((3-homeOdds).toFixed(2))}`,
    timestampKind:'adapter_observed_at',voteEligible:false,
  });
  const snapshot={referees:[
    make('source5',5,'1xBet',1.88),
    make('source6',6,'Bet365',1.90),
    make('source9',9,'Macauslot',1.92),
  ]};
  const decision=refereeDecisionShadow(snapshot,{
    maximumPriceAgeSeconds:90,allowedLinesMode:'ANY',allowedSelectionLines:[],
    oddsMinimum:1.5,oddsMaximumEnabled:false,oddsMaximum:null,
  },'home',at);
  assert.equal(decision.ok,true);
  assert.equal(decision.line,-0.5);
  assert.equal(decision.odds,1.90);
  assert.equal(decision.selectedBookmaker,'Bet365');
  assert.equal(decision.consensusCount,3);
  assert.equal(decision.freshnessBasis,'OBSERVED');
  assert.equal(decision.sourceUpdatedAt,null);
  assert.equal(decision.votingEnabled,false);
  assert.equal(decision.signalAuthority,false);
});

test('candidate decision shadow fails closed when no referee is eligible',()=>{
  const at=4_000_000;
  const snapshot={referees:[{
    sourceId:'source5',position:5,bookmaker:'1xBet',bookmakerSlug:'1xbet',
    status:'AH UNAVAILABLE',bookmakerVerified:true,line:null,homeOdds:null,awayOdds:null,
    sourceUpdatedAt:null,observedAt:at,lastSeenAt:at,lastChangedAt:null,
    priceFingerprint:null,timestampKind:'adapter_observed_at',voteEligible:false,
  }]};
  const decision=refereeDecisionShadow(snapshot,{maximumPriceAgeSeconds:90,oddsMinimum:1.5},'home',at);
  assert.equal(decision.ok,false);
  assert.equal(decision.reason,'NO_ELIGIBLE_REFEREE');
  assert.equal(decision.signalAuthority,false);
});
