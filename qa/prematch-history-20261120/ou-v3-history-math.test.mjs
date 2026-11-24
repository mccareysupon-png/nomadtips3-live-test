import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateOuHistoryV3,OU_HISTORY_V3_POLICY,OU_HISTORY_V3_ID} from './ou-v3-history-math-test.mjs';
import {estimateOu25} from './ou-math-v1-test.mjs';
const now=1800000000;
const match=(id,k,venue,gf,ga)=>({fixtureId:id,kickoff:k,venue,gf,ga,opponentId:9999});
const home=[
 match(1,now-1000,'away',1,2),match(2,now-4000,'home',2,0),
 match(3,now-9000,'away',0,1)];
const away=[
 match(4,now-1000,'home',3,1),match(5,now-5000,'away',0,2),
 match(6,now-12000,'home',1,1)];
const prior={home:1.38,away:1.15};
test('all grounds count, not venue minimum, and H2H 0 valid',()=>{
 const r=estimateOuHistoryV3(home,away,[],prior,now);
 const base=estimateOu25(home,away,prior);
 assert.equal(r.model,OU_HISTORY_V3_ID);
 assert.equal(r.state,'MODEL_READY');assert.equal(r.homeCount,3);assert.equal(r.awayCount,3);
 assert.equal(r.homeVenueMatches,1);assert.equal(r.awayVenueMatches,1);
 assert.equal(r.h2hCount,0);assert.equal(r.h2hWeight,0);
 assert.equal(r.expectedTotalGoals,base.expectedTotalGoals);
 assert.equal(OU_HISTORY_V3_POLICY.teamCompletedFTMinimum,3);
 assert.equal(estimateOuHistoryV3(home.slice(0,2),away,[],prior,now).state,'INSUFFICIENT_ALL_GROUNDS_HISTORY');
});
test('H2H counted but NEVER double-weight same recent team fixture',()=>{
 const duplicated=[{fixtureId:1,kickoff:now-1000,homeGoals:4,awayGoals:4},
 {fixtureId:4,kickoff:now-2000,homeGoals:0,awayGoals:0}];
 const model=estimateOuHistoryV3(home,away,duplicated,prior,now);
 assert.equal(model.h2hCount,2);assert.equal(model.h2hIndependentCount,0);
 assert.equal(model.h2hWeight,0);
 assert.equal(model.expectedTotalGoals,estimateOu25(home,away,prior).expectedTotalGoals);
});
test('separate historical H2H contributes bounded context, no extra minimum',()=>{
 const priorFt=[{fixtureId:100,kickoff:now-100000,homeGoals:4,awayGoals:3},
 {fixtureId:101,kickoff:now-230000,homeGoals:3,awayGoals:3},
 {fixtureId:102,kickoff:now-400000,homeGoals:5,awayGoals:0}];
 const model=estimateOuHistoryV3(home,away,priorFt,prior,now);
 assert.equal(model.h2hIndependentCount,3);
 assert(model.h2hWeight>0&&model.h2hWeight<=0.12);
 assert(Math.abs(model.expectedTotalGoals-model.baseExpectedTotalGoals)<=0.12+1e-10);
 assert(Math.abs(model.lambdaHome+model.lambdaAway-model.expectedTotalGoals)<1e-10);
 const past=[{fixtureId:103,kickoff:now-86400*3650,homeGoals:12,awayGoals:8}];
 assert(estimateOuHistoryV3(home,away,past,prior,now).h2hWeight<model.h2hWeight);
});
