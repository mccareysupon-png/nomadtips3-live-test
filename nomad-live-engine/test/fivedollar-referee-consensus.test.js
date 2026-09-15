import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFiveUsdRefereeVotes,selectFiveUsdRefereeConsensus} from '../src/fivedollar-referee-consensus.js';

const at=1_000_000;
const quote=(sourceId,position,bookmaker,line,homeOdds,awayOdds,overrides={})=>({
  sourceId,position,bookmaker,bookmakerSlug:String(bookmaker).toLowerCase(),
  status:'AH READY',bookmakerVerified:true,line,homeOdds,awayOdds,
  sourceUpdatedAt:null,observedAt:at,lastSeenAt:at,lastChangedAt:at,
  priceFingerprint:`${line}|${homeOdds}|${awayOdds}`,
  timestampKind:'adapter_observed_at',freshnessBasis:'OBSERVED',
  voteEligible:false,shadowOnly:true,
  ...overrides,
});
const config={
  maximumPriceAgeSeconds:90,
  allowedLinesMode:'ANY',allowedSelectionLines:[],
  oddsMinimum:1.50,oddsMaximumEnabled:false,oddsMaximum:null,
};

test('shadow consensus simulates 5USD votes while keeping signal authority disabled',()=>{
  const rows=[
    quote('source5',5,'1xBet',-0.5,1.88,2.02),
    quote('source6',6,'Bet365',-0.5,1.90,2.00),
    quote('source9',9,'Macauslot',-0.5,1.92,1.98),
    quote('source10',10,'Crown',-0.25,1.87,2.03),
    quote('source14',14,'Easybets',-0.25,1.89,2.01),
  ];
  const decision=selectFiveUsdRefereeConsensus(rows,config,'home',at);
  assert.equal(decision.ok,true);
  assert.equal(decision.status,'CONSENSUS SHADOW');
  assert.equal(decision.line,-0.5);
  assert.equal(decision.consensusCount,3);
  assert.equal(decision.consensusMedianOdds,1.9);
  assert.equal(decision.selectedBookmaker,'Bet365');
  assert.equal(decision.votingEnabled,false);
  assert.equal(decision.signalAuthority,false);
  assert.equal(decision.sourceUpdatedAt,null);
  assert.equal(decision.freshnessBasis,'OBSERVED');
});

test('source25 Pinnacle is observed but remains policy non-voter during initial gate',()=>{
  const rows=[
    quote('source5',5,'1xBet',-0.5,1.90,2.00),
    quote('source25',25,'Pinnacle',-0.25,1.99,1.91),
  ];
  const votes=buildFiveUsdRefereeVotes(rows,config,'home',at);
  const pinnacle=votes.find(row=>row.sourceId==='source25');
  assert.equal(pinnacle.eligible,false);
  assert.equal(pinnacle.reason,'POLICY_NON_VOTER');
  assert.equal(pinnacle.adapterVoteEligible,false);
  assert.equal(pinnacle.simulatedVoteEligible,false);
  const decision=selectFiveUsdRefereeConsensus(rows,config,'home',at);
  assert.equal(decision.line,-0.5);
  assert.deepEqual(decision.consensusBookmakers,['1xBet']);
});

test('isolated test authority can admit source25 so all 10 configured bookmakers may vote',()=>{
  const rows=[
    quote('source5',5,'1xBet',-0.5,1.88,2.02),
    quote('source6',6,'Bet365',-0.5,1.89,2.01),
    quote('source9',9,'Macauslot',-0.5,1.90,2.00),
    quote('source10',10,'Crown',-0.5,1.91,1.99),
    quote('source14',14,'Easybets',-0.5,1.92,1.98),
    quote('source15',15,'Vcbet',-0.5,1.93,1.97),
    quote('source16',16,'Interwetten',-0.5,1.94,1.96),
    quote('source18',18,'12Bet',-0.5,1.95,1.95),
    quote('source21',21,'18Bet',-0.5,1.96,1.94),
    quote('source25',25,'Pinnacle',-0.5,1.97,1.93),
  ];
  const votes=buildFiveUsdRefereeVotes(rows,config,'home',at,{includeSource25:true});
  assert.equal(votes.length,10);
  assert.equal(votes.filter(row=>row.eligible).length,10);
  assert.equal(votes.find(row=>row.sourceId==='source25').eligible,true);
  const decision=selectFiveUsdRefereeConsensus(rows,config,'home',at,{includeSource25:true});
  assert.equal(decision.ok,true);
  assert.equal(decision.total,10);
  assert.equal(decision.eligibleCount,10);
  assert.equal(decision.consensusCount,10);
  assert.equal(decision.consensusBookmakers.includes('Pinnacle'),true);
});

test('AWAY candidate mirrors HOME AH line and uses AWAY odds without swapping bookmaker identity',()=>{
  const rows=[
    quote('source5',5,'1xBet',-0.5,1.88,2.02),
    quote('source6',6,'Bet365',-0.5,1.90,2.00),
  ];
  const decision=selectFiveUsdRefereeConsensus(rows,config,'away',at);
  assert.equal(decision.ok,true);
  assert.equal(decision.side,'away');
  assert.equal(decision.line,0.5);
  assert.equal(decision.homeLine,-0.5);
  assert.equal(decision.odds,2.02);
  assert.equal(decision.selectedBookmaker,'1xBet');
});

test('stale quote cannot vote even when bookmaker and line are otherwise valid',()=>{
  const stale=quote('source5',5,'1xBet',-0.5,1.90,2.00,{lastSeenAt:at-91_000,lastChangedAt:at-91_000});
  const fresh=quote('source6',6,'Bet365',-0.25,1.91,1.99);
  const votes=buildFiveUsdRefereeVotes([stale,fresh],config,'home',at);
  assert.equal(votes.find(row=>row.sourceId==='source5').reason,'QUOTE_STALE');
  const decision=selectFiveUsdRefereeConsensus([stale,fresh],config,'home',at);
  assert.equal(decision.line,-0.25);
  assert.equal(decision.consensusBookmakers[0],'Bet365');
});

test('Settings-selected AH lines and odds boundaries filter referee votes',()=>{
  const selectedConfig={...config,allowedLinesMode:'SELECTED',allowedSelectionLines:[-0.25],oddsMinimum:1.80,oddsMaximumEnabled:true,oddsMaximum:2.00};
  const rows=[
    quote('source5',5,'1xBet',-0.5,1.90,2.00),
    quote('source6',6,'Bet365',-0.25,1.79,2.01),
    quote('source9',9,'Macauslot',-0.25,1.91,1.99),
  ];
  const votes=buildFiveUsdRefereeVotes(rows,selectedConfig,'home',at);
  assert.equal(votes.find(row=>row.sourceId==='source5').reason,'AH_LINE_FAIL');
  assert.equal(votes.find(row=>row.sourceId==='source6').reason,'AH_ODDS_MIN_FAIL');
  assert.equal(votes.find(row=>row.sourceId==='source9').eligible,true);
  const decision=selectFiveUsdRefereeConsensus(rows,selectedConfig,'home',at);
  assert.equal(decision.line,-0.25);
  assert.equal(decision.odds,1.91);
});

test('no READY fresh verified referee fails closed with no consensus',()=>{
  const rows=[quote('source5',5,'1xBet',-0.5,1.90,2.00,{status:'AH UNAVAILABLE'})];
  const decision=selectFiveUsdRefereeConsensus(rows,config,'home',at);
  assert.equal(decision.ok,false);
  assert.equal(decision.reason,'NO_ELIGIBLE_REFEREE');
  assert.equal(decision.signalAuthority,false);
});
