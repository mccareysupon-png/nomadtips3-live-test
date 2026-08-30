import {assessSideMarket,configuredSides} from './detector.js';
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
  if(assessment?.passed) return 'PASS';
  if(assessment?.status==='AH STALE') return 'STALE';
  if(['AH INVALID','AH LINE FAIL','AH ODDS FAIL'].includes(assessment?.status)) return 'FAIL';
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
  if(definition.id==='source6') return nowgoal?.nowgoalBet365Peer||null;
  if(definition.id==='source7') return nowgoal?.nowgoalM88Peer||null;
  return null;
}

function chosenAssessment(sideAssessments,sides){
  const candidates=sides.map(side=>sideAssessments[side]).filter(Boolean);
  const passing=candidates.filter(item=>item.passed);
  const pool=passing.length?passing:candidates;
  if(!pool.length) return null;
  return [...pool].sort((a,b)=>{
    if(Number(b.passed)!==Number(a.passed)) return Number(b.passed)-Number(a.passed);
    const aAge=finite(a.ageSeconds)?Number(a.ageSeconds):Infinity,bAge=finite(b.ageSeconds)?Number(b.ageSeconds):Infinity;
    if(aAge!==bAge) return aAge-bAge;
    return Number(b.selectionOdds||0)-Number(a.selectionOdds||0);
  })[0];
}

export function buildPriceSourceSnapshots(marketsBySource,config,observedAt=Date.now()){
  const sides=configuredSides(config);
  const mode=String(config?.targetSideMode||'HOME').toUpperCase();
  return PRICE_SOURCE_REGISTRY
    .filter(definition=>!(definition.id==='source5'&&marketsBySource.get(definition.id)?.reason==='source_removed'))
    .map(definition=>{
      const market=peerMarket(definition,marketsBySource);
      const sideAssessments=Object.fromEntries(['home','away'].map(side=>[side,assessSideMarket(market,config,observedAt,side)]));
      const assessed=chosenAssessment(sideAssessments,sides);
      const requiresVerifiedBookmaker=market?.bookmakerVerified===false;
      const assessment=requiresVerifiedBookmaker
        ?{...assessed,status:'AH INVALID',passed:false,reason:'bookmaker_not_supplied'}
        :assessed;
      if(requiresVerifiedBookmaker){
        for(const side of ['home','away']) sideAssessments[side]={...sideAssessments[side],status:'AH INVALID',passed:false,reason:'bookmaker_not_supplied'};
      }
      const nowgoalDefinition=nowgoalDefinitionBySource.get(definition.id)||null;
      return {
        ...definition,enabled:true,mode,side:assessment?.side||sides[0],
        status:displayStatus(market,assessment),reason:assessment?.reason||market?.reason||null,
        bookmaker:market?.bookmaker||nowgoalDefinition?.bookmaker||definition.bookmaker||null,
        line:assessment?.line??market?.line??null,
        odds:assessment?.selectionOdds??market?.homeOdds??null,
        homeOdds:assessment?.homeOdds??market?.homeOdds??null,
        awayOdds:assessment?.awayOdds??market?.awayOdds??null,
        sourceUpdatedAt:market?.sourceUpdatedAt??null,priceAgeSeconds:assessment?.ageSeconds??null,
        assessment,sideAssessments,market,
      };
    });
}

function projectSide(item,side){
  if(!item) return null;
  const assessment=item.sideAssessments?.[side]||item.assessment;
  const market=item.market;
  return {
    ...item,mode:side.toUpperCase(),side,
    status:displayStatus(market,assessment),reason:assessment?.reason||market?.reason||null,
    line:assessment?.line??null,odds:assessment?.selectionOdds??null,
    homeOdds:assessment?.homeOdds??market?.homeOdds??null,awayOdds:assessment?.awayOdds??market?.awayOdds??null,
    priceAgeSeconds:assessment?.ageSeconds??null,assessment,
  };
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
  if(item?.id==='source25') return false;
  const nowgoalJudge=item?.market?.source==='Nowgoal';
  const totalCornerPinnacle=item?.id==='source26'&&item?.bookmaker==='Pinnacle'&&/TotalCorner/i.test(String(item?.market?.source||''));
  if((!nowgoalJudge&&!totalCornerPinnacle)||item?.market?.status!=='AH READY') return false;
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

function selectSingleSide(sources=[],fallbackId='source4'){
  const nonVoterIds=new Set([fallbackId,'source25']);
  const primary=sources.filter(item=>!nonVoterIds.has(item.id));
  const judgeSelected=selectNowgoalConsensus(primary);
  if(judgeSelected) return judgeSelected;
  const legacySelected=selectPriceSource(primary.filter(item=>item?.market?.source!=='Nowgoal'&&item.id!=='source26'));
  if(legacySelected) return legacySelected;
  return null;
}

export function selectPriceSourceWithFallback(sources=[],fallbackId='source4'){
  const mode=String(sources.find(Boolean)?.mode||'HOME').toUpperCase();
  if(mode!=='BOTH') return selectSingleSide(sources,fallbackId);
  const home=selectSingleSide(sources.map(item=>projectSide(item,'home')),fallbackId);
  const away=selectSingleSide(sources.map(item=>projectSide(item,'away')),fallbackId);
  if(!home&&!away) return null;
  const preferred=!home?away:!away?home:Number(away.odds)>Number(home.odds)?away:home;
  return {
    ...preferred,mode:'BOTH',side:'both',
    market:{
      status:'AH READY',source:'SIDE-AWARE',bookmaker:null,market:'FULL MATCH LIVE AH',
      sourceUpdatedAt:Math.max(Number(home?.sourceUpdatedAt)||0,Number(away?.sourceUpdatedAt)||0)||null,
      sideMarkets:{home:home?.market||null,away:away?.market||null},
      sideSelections:{home,away},
    },
  };
}

export function publicPriceSourceSnapshot(snapshot){
  if(!snapshot) return null;
  const {assessment,market,sideAssessments,...publicSnapshot}=snapshot;
  return publicSnapshot;
}
