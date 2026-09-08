import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAsianHandicap, settleRecord } from '../src/index.js';

const cases=[
  ['HOME',0,1,1,'PUSH','Home level ball draw'],
  ['AWAY',0,1,1,'PUSH','Away level ball draw'],
  ['HOME',-0.25,1,1,'HALF_LOSS','Home -0.25 draw'],
  ['AWAY',0.25,1,1,'HALF_WIN','Away +0.25 draw'],
  ['HOME',-0.5,2,1,'WIN','Home -0.50 wins by one'],
  ['AWAY',0.5,2,1,'LOSS','Away +0.50 loses by one'],
  ['HOME',-0.75,2,1,'HALF_WIN','Home -0.75 wins by one'],
  ['AWAY',0.75,2,1,'HALF_LOSS','Away +0.75 loses by one'],
  ['HOME',0.75,1,2,'HALF_LOSS','Home +0.75 loses by one'],
  ['AWAY',-0.75,1,2,'HALF_WIN','Away -0.75 wins by one'],
  ['HOME',-1,2,1,'PUSH','Home -1.00 wins by one'],
  ['AWAY',1,2,1,'PUSH','Away +1.00 loses by one'],
  ['HOME',-1.25,2,1,'HALF_LOSS','Home -1.25 wins by one'],
  ['AWAY',1.25,2,1,'HALF_WIN','Away +1.25 loses by one'],
  ['HOME',-1.5,2,1,'LOSS','Home -1.50 wins by one'],
  ['AWAY',1.5,2,1,'WIN','Away +1.50 loses by one'],
  ['HOME',1.5,1,2,'WIN','Home +1.50 loses by one'],
  ['AWAY',-1.5,1,2,'LOSS','Away -1.50 wins by one only']
];

test('Asian Handicap settlement follows selected-side world-standard perspective',()=>{
  for(const [pick,line,home,away,expected,label] of cases){
    assert.equal(gradeAsianHandicap(pick,line,home,away),expected,label);
  }
});

test('Asian Handicap quarter-line profit uses half-stake settlement',()=>{
  const halfWin=settleRecord({signals:[{market:'AH',pick:'HOME',line:-0.75,odds:1.95}]},{home:2,away:1},'FT',1000,{source:'test',sourceMatchId:'1',matchMode:'MATCH_ID'});
  assert.equal(halfWin.settlement.signals[0].result,'HALF_WIN');
  assert.equal(halfWin.settlement.signals[0].profit,0.475);

  const halfLoss=settleRecord({signals:[{market:'AH',pick:'HOME',line:-0.25,odds:1.95}]},{home:1,away:1},'FT',1000,{source:'test',sourceMatchId:'2',matchMode:'MATCH_ID'});
  assert.equal(halfLoss.settlement.signals[0].result,'HALF_LOSS');
  assert.equal(halfLoss.settlement.signals[0].profit,-0.5);

  const push=settleRecord({signals:[{market:'AH',pick:'AWAY',line:1,odds:1.91}]},{home:2,away:1},'FT',1000,{source:'test',sourceMatchId:'3',matchMode:'MATCH_ID'});
  assert.equal(push.settlement.signals[0].result,'PUSH');
  assert.equal(push.settlement.signals[0].profit,0);
});

test('Live Asian Handicap settles only score movement after LOCK',()=>{
  const noMoreGoals=settleRecord({signals:[{market:'AH',pick:'HOME',line:-0.25,odds:2.6,entryScore:{home:3,away:1}}]},{home:3,away:1},'FT',1000,{source:'test',sourceMatchId:'4',matchMode:'MATCH_ID'});
  assert.equal(noMoreGoals.settlement.signals[0].result,'HALF_LOSS','3-1 at LOCK and 3-1 FT means post-entry 0-0');

  const awayQuarter=settleRecord({signals:[{market:'AH',pick:'AWAY',line:0.25,odds:1.475,entryScore:{home:3,away:1}}]},{home:3,away:1},'FT',1000,{source:'test',sourceMatchId:'5',matchMode:'MATCH_ID'});
  assert.equal(awayQuarter.settlement.signals[0].result,'HALF_WIN','AWAY +0.25 on post-entry 0-0 is half win');

  const homeScores=settleRecord({signals:[{market:'AH',pick:'HOME',line:-0.25,odds:2.6,entryScore:{home:3,away:1}}]},{home:4,away:1},'FT',1000,{source:'test',sourceMatchId:'6',matchMode:'MATCH_ID'});
  assert.equal(homeScores.settlement.signals[0].result,'WIN','post-entry score 1-0');

  const awayScores=settleRecord({signals:[{market:'AH',pick:'HOME',line:-0.25,odds:2.6,entryScore:{home:3,away:1}}]},{home:3,away:2},'FT',1000,{source:'test',sourceMatchId:'7',matchMode:'MATCH_ID'});
  assert.equal(awayScores.settlement.signals[0].result,'LOSS','post-entry score 0-1');
});
