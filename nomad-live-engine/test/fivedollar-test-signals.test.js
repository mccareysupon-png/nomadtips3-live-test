import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,CONFIG_SCHEMA_VERSION,engineConfig} from '../src/config.js';
import {buildFiveUsdAuthorityMatch,lockFiveUsdTestSignals} from '../src/fivedollar-test-signals.js';

const at=5_000_000;
const envelope={schemaVersion:CONFIG_SCHEMA_VERSION,version:9,updatedAt:at-1000,appliesFromCycle:12};
const config=engineConfig(DEFAULT_CONFIG);
const candidate={
  fixtureId:'201234567',league:'Test League',home:'Home FC',away:'Away FC',minute:61,
  score:{home:0,away:1},stats:{attacks:{home:55,away:42}},rolling:{available:true},
  hunger:{passed:true},evidence:{required:true,passed:true},side:'home',detectionPassed:true,
  decisionShadow:{
    ok:true,votingEnabled:true,signalAuthority:true,side:'home',line:-0.5,odds:1.91,
    homeLine:-0.5,homeOdds:1.91,awayOdds:1.99,selectedSourceId:'source6',selectedBookmaker:'Bet365',
    total:10,eligibleCount:8,consensusCount:6,consensusMedianOdds:1.90,
    consensusBookmakers:['1xBet','Bet365','Macauslot','Crown','12Bet','Pinnacle'],observedAt:at,
  },
};

test('isolated test authority builds a 5USD market without fabricating source timestamp',()=>{
  const match=buildFiveUsdAuthorityMatch(candidate,candidate.decisionShadow);
  assert.equal(match.id,'201234567');
  assert.equal(match.state,'SIGNAL');
  assert.equal(match.selectionLine,-0.5);
  assert.equal(match.selectionOdds,1.91);
  assert.equal(match.market.bookmaker,'Bet365');
  assert.equal(match.market.sourceUpdatedAt,null);
  assert.equal(match.market.freshnessBasis,'OBSERVED');
});

test('isolated test authority locks one real test signal per match and preserves 10-book evidence',()=>{
  const first=lockFiveUsdTestSignals([], [candidate], envelope, config, at);
  assert.equal(first.newlyLocked.length,1);
  assert.equal(first.signals.length,1);
  const signal=first.signals[0];
  assert.equal(signal.testOnly,true);
  assert.equal(signal.authorityMode,'ISOLATED_TEST');
  assert.equal(signal.matchId,'201234567');
  assert.equal(signal.line,-0.5);
  assert.equal(signal.odds,1.91);
  assert.equal(signal.bookmaker,'Bet365');
  assert.equal(signal.oddsSource,'5DollarFootballAPI · 10 Book Referee');
  assert.equal(signal.sourceUpdatedAt,null);
  assert.equal(signal.refereeConsensus.total,10);
  assert.equal(signal.refereeConsensus.consensusCount,6);
  assert.equal(signal.refereeConsensus.bookmakers.includes('Pinnacle'),true);
  assert.equal(signal.configSnapshot.version,9);

  const second=lockFiveUsdTestSignals(first.signals,[candidate],envelope,config,at+3000);
  assert.equal(second.newlyLocked.length,0);
  assert.equal(second.signals.length,1);
});

test('no consensus authority means no test signal',()=>{
  const blocked={...candidate,decisionShadow:{...candidate.decisionShadow,signalAuthority:false,votingEnabled:false}};
  const result=lockFiveUsdTestSignals([], [blocked], envelope, config, at);
  assert.equal(result.newlyLocked.length,0);
  assert.equal(result.signals.length,0);
});
