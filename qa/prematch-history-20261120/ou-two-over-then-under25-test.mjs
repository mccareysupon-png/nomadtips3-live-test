// BALL46 user-defined hypothesis, isolated TEST: after the previous TWO
// finished matches of EITHER team both had >=3 total goals, flag the NEXT
// scheduled fixture as UNDER 2.5 candidate. Observation only, never price
// substitution and never an automatic/warranted prediction.
import {ouTargetLastMatches} from './ou-target-history-ft-v1-test.mjs';
const goodId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
export const TWO_OVER_THEN_UNDER_POLICY=Object.freeze({
 priorMatches:2,priorTotalAtLeast:3,candidate:'UNDER',line:2.5,
 teamMatchMode:'EITHER_TEAM',
 evidence:'LAST_TWO_AVAILABLE_VERIFIED_FINISHED_MATCHES',
 minimumOtherTeamHistory:0,priceRequiredForHistoryAudit:false,
 upstreamCalls:0,ledgerWrites:0,productionWrites:0,
 confidence:'UNVALIDATED_USER_HYPOTHESIS',testOnly:true
});
export function twoPriorOver25(rows){
 return Array.isArray(rows)&&rows.length>=2&&rows.slice(0,2).every(r=>
  Number.isSafeInteger(r?.gf)&&r.gf>=0&&
  Number.isSafeInteger(r?.ga)&&r.ga>=0&&r.gf+r.ga>=3);
}
export function evaluateThirdGameUnder25(homeRecent,awayRecent){
 const home=twoPriorOver25(homeRecent);
 const away=twoPriorOver25(awayRecent);
 return {eligible:home||away,homeTwoOvers:home,awayTwoOvers:away,
  bothTeams:home&&away,selectedSide:home||away?'UNDER':null,
  targetLine:home||away?2.5:null};
}
export function auditTwoOverThenUnder25(db,fixtures,now){
 if(!db||!Array.isArray(fixtures)||!Number.isSafeInteger(now))
  throw Error('INVALID_TWO_OVER_TEST_INPUT');
 const seen=new Set(),candidates=[];
 const stats={feed:fixtures.length,validUpcoming:0,invalid:0,
  matchHistoryEither:0,matchHistoryHome:0,matchHistoryAway:0,
  matchHistoryBoth:0,missingEitherTeamTwoHistory:0,
  providerCalls:0,oddsRequests:0,picksWritten:0};
 for(const f of fixtures){
  const id=Number(f?.id),homeId=Number(f?.teams?.home?.id),
   awayId=Number(f?.teams?.away?.id),kickoff=f?.kickoff_ts;
  if(!goodId(id)||!goodId(homeId)||!goodId(awayId)||
   homeId===awayId||seen.has(id)||f?.status!=='scheduled'||
   !Number.isSafeInteger(kickoff)||kickoff<=now+300||kickoff>now+14*86400){
   stats.invalid++;continue;
  }
  seen.add(id);stats.validUpcoming++;
  const h=ouTargetLastMatches(db,homeId,kickoff,now,2);
  const a=ouTargetLastMatches(db,awayId,kickoff,now,2);
  if(h.length<2||a.length<2)stats.missingEitherTeamTwoHistory++;
  const state=evaluateThirdGameUnder25(h,a);
  if(!state.eligible)continue;
  stats.matchHistoryEither++;
  if(state.homeTwoOvers)stats.matchHistoryHome++;
  if(state.awayTwoOvers)stats.matchHistoryAway++;
  if(state.bothTeams)stats.matchHistoryBoth++;
  candidates.push({
   fixtureId:id,home:String(f.teams.home.name??homeId).slice(0,120),
   away:String(f.teams.away.name??awayId).slice(0,120),
   kickoff,side:'UNDER',line:2.5,
   homeTwoOvers:state.homeTwoOvers,awayTwoOvers:state.awayTwoOvers,
   homeLastTwo:h.map(x=>({ft:x.gf+'-'+x.ga,total:x.gf+x.ga})),
   awayLastTwo:a.map(x=>({ft:x.gf+'-'+x.ga,total:x.gf+x.ga})),
   flags:['UNVALIDATED_TREND_RULE','PRICE_NOT_CHECKED']
  });
 }
 return {code:'B46_TWO_OVER_STREAK_THEN_UNDER25_TEST_AUDIT',
  checkedAtUTC:new Date(now*1000).toISOString(),policy:TWO_OVER_THEN_UNDER_POLICY,
  stats,candidates};
}
