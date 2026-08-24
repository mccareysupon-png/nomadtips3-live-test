import {assessHomeMarket} from './detector.js';
import {NOWGOAL_BOOKMAKERS} from './nowgoal.js';

export const PRICE_SOURCE_REGISTRY=Object.freeze([
  Object.freeze({id:'source1',position:1,source:'Odds-API.io'}),
  Object.freeze({id:'source2',position:2,source:'The Odds API'}),
  Object.freeze({id:'source3',position:3,source:'API-Football'}),
  ...NOWGOAL_BOOKMAKERS.map(item=>Object.freeze({id:item.sourceId,position:item.position,source:'Nowgoal'})),
  // SOURCE 8 is intentionally absent: retired 5Dollar experiment.
  // SOURCE 26 reuses the same TotalCorner response as SOURCE 4; it never adds another HTTP request.
  Object.freeze({id:'source26',position:26,source:'TotalCorner',bookmaker:'Pinnacle'}),
  Object.freeze({id:'source4',position:4,source:'TotalCorner'}),
]);

const FRESHNESS_NEAR_MS=5000;
const freshnessComparable=item=>item?.id!=='source5'||item?.market?.source==='Nowgoal';
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const nowgoalDefinitionBySource=new Map(NOWGOAL_BOOKMAKERS.map(item=>[item.sourceId,item]));

function displayStatus(market,assessment){
  if(assessment.passed) return 'PASS';
  if(assessment.status==='AH STALE') return 'STALE';
  if(['AH INVALID','AH LINE FAIL','AH ODDS FAIL'].includes(assessment.status)) return 'FAIL';
  if(!market||['ODDS NOT MATCHED','ODDS NOT READY','AH UNAVAILABLE'].includes(market.status)) return 'UNAVAILABLE';
  return 'WAIT';
}

function peerMarket(definition,marketsBySource){
  const direct=marketsBySource.get(definition.id)||null;
  if(direct) return direct;
  if(definition.id==='source26'){
    const totalCorner=marketsBySource.get('source4')||null;
    return totalCorner?.totalCornerPeers?.source26||null;
  }
  if(definition.source!=='Nowgoal'||definition.id==='source5') return null;
  const nowgoal=marketsBySource.get('source5')||null;
  const peer=nowgoal?.nowgoalPeers?.[definition.id]||null;
  if(peer) return peer;
  // Preserve the 3.41 peer properties used by existing signals/tests.
  if(definition.id==='source6') return nowgoal?.nowgoalBet365Peer||null;
  if(definition.id==='source7') return nowgoal?.nowgoalM88Peer||null;
  return null;
}

export function buildPriceSourceSnapshots(marketsBySource,config,observedAt=Date.now()){
  return PRICE_SOURCE_REGISTRY
    .filter(definition=>!(definition.id==='source5'&&marketsBySource.get(definition.id)?.reason==='source_removed'))
    .map(definition=>{
    const market=peerMarket(definition,marketsBySource);
    const assessed=assessHomeMarket(market,config,observedAt);
    // Fail closed whenever the provider cannot identify the bookmaker behind its AH price.
    const requiresVerifiedBookmaker=market?.bookmakerVerified===false;
    const assessment=requiresVerifiedBookmaker
      ?{...assessed,status:'AH INVALID',passed:false,reason:'bookmaker_not_supplied'}
      :assessed;
    const nowgoalDefinition=nowgoalDefinitionBySource.get(definition.id)||null;
    return {
      ...definition,enabled:true,status:displayStatus(market,assessment),reason:assessment.reason||market?.reason||null,
      bookmaker:market?.bookmaker||nowgoalDefinition?.bookmaker||definition.bookmaker||null,line:assessment.line??market?.line??null,
      odds:assessment.homeOdds??market?.homeOdds??null,awayOdds:assessment.awayOdds??market?.awayOdds??null,
      sourceUpdatedAt:market?.sourceUpdatedAt??null,priceAgeSeconds:assessment.ageSeconds??null,
      assessment,market,
    };
  });
}

export function selectPriceSource(sources=[],freshnessNearMs=FRESHNESS_NEAR_MS){
  const valid=sources.filter(item=>item.status==='PASS'&&item.market&&Number.isFinite(Number(item.sourceUpdatedAt)));
  if(!valid.length) return null;
  return valid.reduce((selected,candidate)=>{
    const selectedUpdated=Number(selected.sourceUpdatedAt),candidateUpdated=Number(candidate.sourceUpdatedAt);
    const comparableFreshness=freshnessComparable(selected)&&freshnessComparable(candidate);
    const freshnessDifference=Math.abs(candidateUpdated-selectedUpdated);
    if(comparableFreshness&&freshnessDifference>freshnessNearMs) return candidateUpdated>selectedUpdated?candidate:selected;
    const selectedOdds=Number(selected.odds),candidateOdds=Number(candidate.odds);
    const sameLine=Math.abs(Number(candidate.line)-Number(selected.line))<1e-9;
    if(sameLine&&candidateOdds!==selectedOdds) return candidateOdds>selectedOdds?candidate:selected;
    if(comparableFreshness&&candidateUpdated!==selectedUpdated) return candidateUpdated>selectedUpdated?candidate:selected;
    return candidate.position<selected.position?candidate:selected;
  });
}

function median(values=[]){
  const sorted=values.filter(finite).map(Number).sort((a,b)=>a-b);
  if(!sorted.length) return null;
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

function consensusEligible(item){
  // Source 5 historically carried other providers. Only a real Nowgoal market may vote.
  if(item?.market?.source!=='Nowgoal'||item?.market?.status!=='AH READY') return false;
  if(!finite(item.line)||!finite(item.odds)||!finite(item.sourceUpdatedAt)) return false;
  return !['AH STALE','AH LINE FAIL','AH INVALID'].includes(item.assessment?.status);
}

export function selectNowgoalConsensus(sources=[]){
  const candidates=sources.filter(consensusEligible);
  if(!candidates.length) return null;
  const groups=new Map();
  for(const item of candidates){
    const key=String(Number(item.line));
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(item);
  }
  const ranked=[...groups.values()].sort((left,right)=>{
    if(right.length!==left.length) return right.length-left.length;
    const rightFresh=Math.max(...right.map(item=>Number(item.sourceUpdatedAt)));
    const leftFresh=Math.max(...left.map(item=>Number(item.sourceUpdatedAt)));
    if(rightFresh!==leftFresh) return rightFresh-leftFresh;
    return Math.min(...left.map(item=>item.position))-Math.min(...right.map(item=>item.position));
  });
  const consensus=ranked[0];
  const actionable=consensus.filter(item=>item.status==='PASS');
  if(!actionable.length) return null;
  const medianOdds=median(consensus.map(item=>item.odds));
  const selected=[...actionable].sort((left,right)=>{
    const leftDistance=Math.abs(Number(left.odds)-medianOdds),rightDistance=Math.abs(Number(right.odds)-medianOdds);
    if(leftDistance!==rightDistance) return leftDistance-rightDistance;
    if(Number(right.sourceUpdatedAt)!==Number(left.sourceUpdatedAt)) return Number(right.sourceUpdatedAt)-Number(left.sourceUpdatedAt);
    return left.position-right.position;
  })[0];
  return {
    ...selected,
    consensusCount:consensus.length,
    consensusLine:Number(selected.line),
    consensusMedianOdds:Number(medianOdds.toFixed(4)),
    consensusBookmakers:consensus.map(item=>item.bookmaker).filter(Boolean),
  };
}

export function selectPriceSourceWithFallback(sources=[],fallbackId='source4'){
  const fallbackIds=new Set([fallbackId,'source26']);
  const primary=sources.filter(item=>!fallbackIds.has(item.id));
  // 3.41 policy: Nowgoal is the main judge. Choose the modal valid HOME AH line,
  // then lock a real bookmaker quote closest to the median on that line.
  const nowgoalSelected=selectNowgoalConsensus(primary);
  if(nowgoalSelected) return nowgoalSelected;
  // Existing non-Nowgoal market records remain live supplements, including historical source5 compatibility.
  const legacySelected=selectPriceSource(primary.filter(item=>item?.market?.source!=='Nowgoal'));
  if(legacySelected) return legacySelected;
  // TotalCorner remains last-resort fallback. Bet365 and Pinnacle may compete only inside that fallback tier.
  return selectPriceSource(sources.filter(item=>fallbackIds.has(item.id)));
}

export function publicPriceSourceSnapshot(snapshot){
  if(!snapshot) return null;
  const {assessment,market,...publicSnapshot}=snapshot;
  return publicSnapshot;
}
