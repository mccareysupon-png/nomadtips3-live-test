import {assessHomeMarket} from './detector.js';

export const PRICE_SOURCE_REGISTRY=Object.freeze([
  Object.freeze({id:'source1',position:1,source:'Odds-API.io'}),
  Object.freeze({id:'source2',position:2,source:'The Odds API'}),
  Object.freeze({id:'source3',position:3,source:'API-Football'}),
  // SOURCE 5 id is retained for historical locked-signal compatibility; live production now uses Nowgoal 1xBet.
  Object.freeze({id:'source5',position:5,source:'Nowgoal'}),
  // SOURCE 6 is the Bet365 peer read from the same Nowgoal session/feed family as SOURCE 5.
  Object.freeze({id:'source6',position:6,source:'Nowgoal'}),
  // SOURCE 7 is M88 / Mansion88 company 17 from the same Nowgoal live AH session.
  Object.freeze({id:'source7',position:7,source:'Nowgoal'}),
  // SOURCE 8 is visible for observation only. It must never participate in price selection or fallback decisions.
  Object.freeze({id:'source8',position:8,source:'5DollarFootballAPI',selectable:false,shadowOnly:true}),
  Object.freeze({id:'source4',position:4,source:'TotalCorner'}),
]);

const FRESHNESS_NEAR_MS=5000;
// SOURCE 8 exposes the adapter observation timestamp, not Bet365's upstream odds-update timestamp.
// Never allow that observation time to win a cross-source freshness race.
const freshnessComparable=item=>item?.id!=='source8'&&(item?.id!=='source5'||item?.market?.source==='Nowgoal');

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
  const nowgoal=marketsBySource.get('source5')||null;
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
    // Fail closed when a provider cannot identify the bookmaker behind its AH price.
    // This prevents API-Football's anonymous aggregate line from acting as the live AH price judge.
    const requiresVerifiedBookmaker=market?.bookmakerVerified===false;
    const assessment=requiresVerifiedBookmaker
      ?{...assessed,status:'AH INVALID',passed:false,reason:'bookmaker_not_supplied'}
      :assessed;
    return {
      ...definition,enabled:true,status:displayStatus(market,assessment),reason:assessment.reason||market?.reason||null,
      bookmaker:market?.bookmaker||null,line:assessment.line??market?.line??null,
      odds:assessment.homeOdds??market?.homeOdds??null,awayOdds:assessment.awayOdds??market?.awayOdds??null,
      sourceUpdatedAt:market?.sourceUpdatedAt??null,priceAgeSeconds:assessment.ageSeconds??null,
      assessment,market,
    };
  });
}

export function selectPriceSource(sources=[],freshnessNearMs=FRESHNESS_NEAR_MS){
  const valid=sources.filter(item=>item.selectable!==false&&item.status==='PASS'&&item.market&&Number.isFinite(Number(item.sourceUpdatedAt)));
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

export function selectPriceSourceWithFallback(sources=[],fallbackId='source4'){
  const primary=sources.filter(item=>item.id!==fallbackId);
  const selectedPrimary=selectPriceSource(primary);
  if(selectedPrimary) return selectedPrimary;
  return sources.find(item=>item.id===fallbackId&&item.status==='PASS'&&item.market)||null;
}

export function publicPriceSourceSnapshot(snapshot){
  if(!snapshot) return null;
  const {assessment,market,...publicSnapshot}=snapshot;
  return publicSnapshot;
}
