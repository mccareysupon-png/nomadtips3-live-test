import {assessFiveUsdQuoteFreshness} from './fivedollar-freshness.js';

const finite=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value));
const EPSILON=1e-9;
const same=(a,b)=>finite(a)&&finite(b)&&Math.abs(Number(a)-Number(b))<EPSILON;

function median(values=[]){
  const sorted=values.filter(finite).map(Number).sort((a,b)=>a-b);
  if(!sorted.length) return null;
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

function sideProjection(quote,side='home'){
  const selectedSide=String(side||'home').toLowerCase()==='away'?'away':'home';
  const homeLine=finite(quote?.line)?Number(quote.line):null;
  return {
    side:selectedSide,
    line:homeLine===null?null:selectedSide==='away'?-homeLine:homeLine,
    odds:finite(selectedSide==='away'?quote?.awayOdds:quote?.homeOdds)?Number(selectedSide==='away'?quote.awayOdds:quote.homeOdds):null,
    homeLine,
    homeOdds:finite(quote?.homeOdds)?Number(quote.homeOdds):null,
    awayOdds:finite(quote?.awayOdds)?Number(quote.awayOdds):null,
  };
}

function settingsPass(projected,config={}){
  if(!finite(projected?.line)||!finite(projected?.odds)) return {passed:false,reason:'INVALID_PRICE'};
  const lineMode=String(config?.allowedLinesMode||'ANY').toUpperCase();
  if(lineMode==='SELECTED'){
    const allowed=Array.isArray(config?.allowedSelectionLines)?config.allowedSelectionLines:[];
    if(!allowed.some(line=>same(line,projected.line))) return {passed:false,reason:'AH_LINE_FAIL'};
  }
  const min=finite(config?.oddsMinimum)?Number(config.oddsMinimum):1.01;
  if(Number(projected.odds)<min) return {passed:false,reason:'AH_ODDS_MIN_FAIL'};
  if(config?.oddsMaximumEnabled===true){
    const max=finite(config?.oddsMaximum)?Number(config.oddsMaximum):null;
    if(max===null||Number(projected.odds)>max) return {passed:false,reason:'AH_ODDS_MAX_FAIL'};
  }
  return {passed:true,reason:null};
}

export function buildFiveUsdRefereeVotes(referees=[],config={},side='home',at=Date.now(),options={}){
  const maxAgeMs=(finite(config?.maximumPriceAgeSeconds)?Math.max(1,Number(config.maximumPriceAgeSeconds)):90)*1000;
  const includeSource25=options?.includeSource25===true;
  return (Array.isArray(referees)?referees:[]).map(quote=>{
    const freshness=assessFiveUsdQuoteFreshness(quote,{at,maxAgeMs});
    const projected=sideProjection(quote,side);
    const settings=settingsPass(projected,config);
    // Adapter quotes stay fail-closed by default. The isolated test authority may explicitly admit source25/Pinnacle
    // so the full 10-book panel can participate without changing production policy.
    const policyVoteEligible=includeSource25||String(quote?.sourceId||'')!=='source25';
    const eligible=quote?.status==='AH READY'&&quote?.bookmakerVerified===true&&freshness.eligible&&settings.passed&&policyVoteEligible;
    let reason=null;
    if(quote?.status!=='AH READY'||quote?.bookmakerVerified!==true) reason='QUOTE_NOT_READY';
    else if(!freshness.eligible) reason=freshness.reason;
    else if(!settings.passed) reason=settings.reason;
    else if(!policyVoteEligible) reason='POLICY_NON_VOTER';
    return {
      sourceId:quote?.sourceId??null,
      position:finite(quote?.position)?Number(quote.position):999,
      bookmaker:quote?.bookmaker??null,
      bookmakerSlug:quote?.bookmakerSlug??null,
      adapterVoteEligible:quote?.voteEligible===true,
      simulatedVoteEligible:eligible,
      eligible,
      reason,
      freshness,
      ...projected,
    };
  });
}

export function selectFiveUsdRefereeConsensus(referees=[],config={},side='home',at=Date.now(),options={}){
  const votes=buildFiveUsdRefereeVotes(referees,config,side,at,options);
  const eligible=votes.filter(row=>row.eligible);
  if(!eligible.length){
    return {
      ok:false,status:'NO CONSENSUS',reason:'NO_ELIGIBLE_REFEREE',side:String(side||'home').toLowerCase()==='away'?'away':'home',
      observedAt:at,votingEnabled:false,signalAuthority:false,total:votes.length,eligibleCount:0,votes,
    };
  }

  const groups=new Map();
  for(const vote of eligible){
    const key=String(Number(vote.line));
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(vote);
  }
  const ranked=[...groups.values()].sort((left,right)=>{
    if(right.length!==left.length) return right.length-left.length;
    const rightSeen=Math.max(...right.map(row=>Number(row.freshness?.lastSeenAt)||0));
    const leftSeen=Math.max(...left.map(row=>Number(row.freshness?.lastSeenAt)||0));
    if(rightSeen!==leftSeen) return rightSeen-leftSeen;
    return Math.min(...left.map(row=>row.position))-Math.min(...right.map(row=>row.position));
  });
  const group=ranked[0];
  const medianOdds=median(group.map(row=>row.odds));
  const selected=[...group].sort((left,right)=>{
    const leftDistance=Math.abs(Number(left.odds)-Number(medianOdds));
    const rightDistance=Math.abs(Number(right.odds)-Number(medianOdds));
    const distanceDiff=leftDistance-rightDistance;
    if(Math.abs(distanceDiff)>EPSILON) return distanceDiff;
    const seenDiff=(Number(right.freshness?.lastSeenAt)||0)-(Number(left.freshness?.lastSeenAt)||0);
    if(seenDiff!==0) return seenDiff;
    return left.position-right.position;
  })[0];

  return {
    ok:true,
    status:'CONSENSUS SHADOW',
    source:'5DollarFootballAPI',
    side:selected.side,
    line:Number(selected.line),
    odds:Number(selected.odds),
    homeLine:selected.homeLine,
    homeOdds:selected.homeOdds,
    awayOdds:selected.awayOdds,
    selectedSourceId:selected.sourceId,
    selectedBookmaker:selected.bookmaker,
    consensusCount:group.length,
    eligibleCount:eligible.length,
    total:votes.length,
    consensusMedianOdds:Number(Number(medianOdds).toFixed(4)),
    consensusBookmakers:group.map(row=>row.bookmaker).filter(Boolean),
    freshnessBasis:'OBSERVED',
    sourceUpdatedAt:null,
    observedAt:at,
    votingEnabled:false,
    signalAuthority:false,
    votes,
  };
}
