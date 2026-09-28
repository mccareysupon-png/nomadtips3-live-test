import test from 'node:test';
import assert from 'node:assert/strict';
import {refereeDecisionTest} from '../src/index-fiveusd-test.js';

const at=7_000_000;
const make=(sourceId,position,bookmaker,homeOdds)=>({
  sourceId,position,bookmaker,bookmakerSlug:bookmaker.toLowerCase(),
  status:'AH READY',bookmakerVerified:true,line:-0.5,homeOdds,awayOdds:Number((3-homeOdds).toFixed(2)),
  sourceUpdatedAt:null,observedAt:at,lastSeenAt:at,lastChangedAt:at,
  priceFingerprint:`-0.5|${homeOdds}|${Number((3-homeOdds).toFixed(2))}`,
  timestampKind:'adapter_observed_at',voteEligible:false,
});
const config={maximumPriceAgeSeconds:90,allowedLinesMode:'ANY',allowedSelectionLines:[],oddsMinimum:1.5,oddsMaximumEnabled:false,oddsMaximum:null};

test('test authority enables real voting and signal authority after consensus',()=>{
  const snapshot={referees:[
    make('source5',5,'1xBet',1.88),make('source6',6,'Bet365',1.89),make('source9',9,'Macauslot',1.90),
    make('source10',10,'Crown',1.91),make('source14',14,'Easybets',1.92),make('source15',15,'Vcbet',1.93),
    make('source16',16,'Interwetten',1.94),make('source18',18,'12Bet',1.95),make('source21',21,'18Bet',1.96),
    make('source25',25,'Pinnacle',1.97),
  ]};
  const decision=refereeDecisionTest(snapshot,config,'home',at);
  assert.equal(decision.ok,true);
  assert.equal(decision.status,'CONSENSUS TEST');
  assert.equal(decision.total,10);
  assert.equal(decision.eligibleCount,10);
  assert.equal(decision.consensusCount,10);
  assert.equal(decision.consensusBookmakers.includes('Pinnacle'),true);
  assert.equal(decision.votingEnabled,true);
  assert.equal(decision.signalAuthority,true);
  assert.equal(decision.testOnly,true);
  assert.equal(decision.sourceUpdatedAt,null);
});

test('test authority still fails closed when 10-book data has no eligible quote',()=>{
  const snapshot={referees:[{...make('source5',5,'1xBet',1.88),status:'AH UNAVAILABLE'}]};
  const decision=refereeDecisionTest(snapshot,config,'home',at);
  assert.equal(decision.ok,false);
  assert.equal(decision.votingEnabled,false);
  assert.equal(decision.signalAuthority,false);
});
