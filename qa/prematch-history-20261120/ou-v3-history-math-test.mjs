// BALL46 O/U V3 historical context: 3 completed FT per team from ALL grounds.
// Existing venue-aware Poisson/shrinkage is the base. H2H is optional, never a
// gate, and is only weighted when a historic FT is not already in either team's
// most-recent rolling 10. No double-weighting a shared game. TEST only.
import {estimateOu25} from './ou-math-v1-test.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
export const OU_HISTORY_V3_ID='ou-poisson-shrinkage-venue-h2h-dedup-v3-test';
export const OU_HISTORY_V3_POLICY=Object.freeze({
 teamCompletedFTMinimum:3,
 sampleScope:'ALL_HOME_AND_AWAY_RESULTS_COMBINED_PER_TEAM',
 maxTeamMatches:10,
 h2hMinimum:0,
 h2hMaximumCount:null,
 h2hSupplementMaxRecent:12,
 h2hMaximumWeight:0.12,
 h2hHalfLifeDays:540,
 h2hMaximumGoalDelta:1.0,
 venueIsOptional:true,
 h2hOverlapExcluded:true,
 providerCalls:0,productionWrites:0,
 noProbabilityCalibrationClaim:true
});
export function estimateOuHistoryV3(homeHistory,awayHistory,h2hHistory,league,now){
 if(!Array.isArray(homeHistory)||!Array.isArray(awayHistory)||
  !Array.isArray(h2hHistory)||!Number.isSafeInteger(now)||now<=0)
  throw Error('INVALID_OU_V3_INPUT');
 if(homeHistory.length<OU_HISTORY_V3_POLICY.teamCompletedFTMinimum||
    awayHistory.length<OU_HISTORY_V3_POLICY.teamCompletedFTMinimum)
  return {state:'INSUFFICIENT_ALL_GROUNDS_HISTORY',homeCount:homeHistory.length,awayCount:awayHistory.length};
 const base=estimateOu25(homeHistory,awayHistory,league);
 if(!finite(base?.lambdaHome)||!finite(base?.lambdaAway)||!finite(base?.expectedTotalGoals))
  return {state:'INVALID_BASE_POISSON'};
 const alreadyCounted=new Set([...homeHistory,...awayHistory].map(x=>String(x.fixtureId)));
 const independent=h2hHistory.filter(x=>!alreadyCounted.has(String(x.fixtureId))&&
   Number.isSafeInteger(x.kickoff)&&x.kickoff<now&&
   finite(x.homeGoals)&&finite(x.awayGoals)&&x.homeGoals>=0&&x.awayGoals>=0);
 const recent=independent.slice(0,OU_HISTORY_V3_POLICY.h2hSupplementMaxRecent);
 let totalEffective=0,totalGoalEvidence=0;
 for(const match of recent){
  const days=Math.max(0,(now-match.kickoff)/86400);
  const weight=2**(-days/OU_HISTORY_V3_POLICY.h2hHalfLifeDays);
  totalEffective+=weight;
  totalGoalEvidence+=weight*(match.homeGoals+match.awayGoals);
 }
 const bonusWeight=totalEffective>0?
  Math.min(OU_HISTORY_V3_POLICY.h2hMaximumWeight,
   OU_HISTORY_V3_POLICY.h2hMaximumWeight*totalEffective/(4+totalEffective)):0;
 const h2hMean=totalEffective>0?totalGoalEvidence/totalEffective:null;
 const limitedDelta=totalEffective>0?
  clamp(h2hMean-base.expectedTotalGoals,
   -OU_HISTORY_V3_POLICY.h2hMaximumGoalDelta,OU_HISTORY_V3_POLICY.h2hMaximumGoalDelta):0;
 const expectedTotalGoals=base.expectedTotalGoals+limitedDelta*bonusWeight;
 const scale=expectedTotalGoals/base.expectedTotalGoals;
 return {state:'MODEL_READY',model:OU_HISTORY_V3_ID,
  lambdaHome:base.lambdaHome*scale,lambdaAway:base.lambdaAway*scale,
  expectedTotalGoals,baseExpectedTotalGoals:base.expectedTotalGoals,
  homeCount:homeHistory.length,awayCount:awayHistory.length,
  homeVenueMatches:homeHistory.filter(x=>x.venue==='home').length,
  awayVenueMatches:awayHistory.filter(x=>x.venue==='away').length,
  h2hCount:h2hHistory.length,h2hIndependentCount:independent.length,
  h2hEffectiveSample:totalEffective,h2hMeanGoals:h2hMean,
  h2hWeight:bonusWeight,overlapExcluded:h2hHistory.length-independent.length,
  allGroundsMinimumMet:true,noIndependentEdgeClaim:true};
}
