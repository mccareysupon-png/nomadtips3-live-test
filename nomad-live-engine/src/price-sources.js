import {assessHomeMarket} from './detector.js';

export const PRICE_SOURCE_REGISTRY=Object.freeze([
  Object.freeze({id:'source1',position:1,source:'Odds-API.io'}),
  Object.freeze({id:'source2',position:2,source:'The Odds API'}),
]);

const FRESHNESS_NEAR_MS=5000;

function displayStatus(market,assessment){
  if(assessment.passed) return 'PASS';
  if(assessment.status==='AH STALE') return 'STALE';
  if(['AH INVALID','AH LINE FAIL','AH ODDS FAIL'].includes(assessment.status)) return 'FAIL';
  if(!market||['ODDS NOT MATCHED','ODDS NOT READY','AH UNAVAILABLE'].includes(market.status)) return 'UNAVAILABLE';
  return 'WAIT';
}

export function buildPriceSourceSnapshots(marketsBySource,config,observedAt=Date.now()){
  return PRICE_SOURCE_REGISTRY.map(definition=>{
    const market=marketsBySource.get(definition.id)||null;
    const assessment=assessHomeMarket(market,config,observedAt);
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
  const valid=sources.filter(item=>item.status==='PASS'&&item.market&&Number.isFinite(Number(item.sourceUpdatedAt)));
  if(!valid.length) return null;
  return valid.reduce((selected,candidate)=>{
    const selectedUpdated=Number(selected.sourceUpdatedAt),candidateUpdated=Number(candidate.sourceUpdatedAt);
    const freshnessDifference=Math.abs(candidateUpdated-selectedUpdated);
    if(freshnessDifference>freshnessNearMs) return candidateUpdated>selectedUpdated?candidate:selected;
    const selectedOdds=Number(selected.odds),candidateOdds=Number(candidate.odds);
    const sameLine=Math.abs(Number(candidate.line)-Number(selected.line))<1e-9;
    if(sameLine&&candidateOdds!==selectedOdds) return candidateOdds>selectedOdds?candidate:selected;
    if(candidateUpdated!==selectedUpdated) return candidateUpdated>selectedUpdated?candidate:selected;
    return candidate.position<selected.position?candidate:selected;
  });
}

export function publicPriceSourceSnapshot(snapshot){
  if(!snapshot) return null;
  const {assessment,market,...publicSnapshot}=snapshot;
  return publicSnapshot;
}
