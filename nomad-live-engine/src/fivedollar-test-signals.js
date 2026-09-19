import {canLockSignal,createLockedSignal} from './index.js';

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));

export function buildFiveUsdAuthorityMatch(candidate,decision){
  const side=String(candidate?.side||decision?.side||'home').toLowerCase()==='away'?'away':'home';
  return {
    id:String(candidate?.fixtureId||''),
    fixtureId:String(candidate?.fixtureId||''),
    league:candidate?.league??null,
    home:candidate?.home??null,
    away:candidate?.away??null,
    minute:Number.isFinite(Number(candidate?.minute))?Number(candidate.minute):null,
    score:clone(candidate?.score||{home:null,away:null}),
    stats:clone(candidate?.stats||{}),
    rolling:clone(candidate?.rolling||{}),
    hunger:clone(candidate?.hunger),
    evidence:clone(candidate?.evidence),
    side,
    selectionLine:Number.isFinite(Number(decision?.line))?Number(decision.line):null,
    selectionOdds:Number.isFinite(Number(decision?.odds))?Number(decision.odds):null,
    state:'SIGNAL',
    freshness:{sourceStale:false,sourceUpdatedAt:null,freshnessBasis:'OBSERVED'},
    market:{
      status:'AH READY',
      market:'FULL MATCH LIVE AH',
      source:'5DollarFootballAPI · 10 Book Referee',
      bookmaker:decision?.selectedBookmaker??null,
      line:Number.isFinite(Number(decision?.homeLine))?Number(decision.homeLine):null,
      homeOdds:Number.isFinite(Number(decision?.homeOdds))?Number(decision.homeOdds):null,
      awayOdds:Number.isFinite(Number(decision?.awayOdds))?Number(decision.awayOdds):null,
      sourceUpdatedAt:null,
      observedAt:decision?.observedAt??null,
      freshnessBasis:'OBSERVED',
    },
    selectedPrice:{id:decision?.selectedSourceId??null},
  };
}

export function lockFiveUsdTestSignals(existingSignals=[],candidateRows=[],activeEnvelope,config,lockedAt=Date.now()){
  const signals=Array.isArray(existingSignals)?existingSignals.map(clone):[];
  const newlyLocked=[];
  for(const candidate of Array.isArray(candidateRows)?candidateRows:[]){
    const decision=candidate?.decisionShadow;
    if(candidate?.detectionPassed!==true||decision?.ok!==true||decision?.signalAuthority!==true||decision?.votingEnabled!==true) continue;
    const match=buildFiveUsdAuthorityMatch(candidate,decision);
    if(!match.id||!Number.isFinite(match.selectionLine)||!Number.isFinite(match.selectionOdds)) continue;
    if(!canLockSignal(signals,match,config)) continue;
    const signal=createLockedSignal(match,activeEnvelope,config,lockedAt);
    const testSignal={
      ...signal,
      testOnly:true,
      sourceOfTruth:'5DollarFootballAPI',
      authorityMode:'ISOLATED_TEST',
      freshnessBasis:'OBSERVED',
      sourceUpdatedAt:null,
      priceAgeSeconds:null,
      refereeConsensus:{
        total:decision.total??0,
        eligibleCount:decision.eligibleCount??0,
        consensusCount:decision.consensusCount??0,
        medianOdds:decision.consensusMedianOdds??null,
        bookmakers:clone(decision.consensusBookmakers||[]),
        selectedSourceId:decision.selectedSourceId??null,
        selectedBookmaker:decision.selectedBookmaker??null,
        observedAt:decision.observedAt??lockedAt,
      },
    };
    signals.push(testSignal);
    newlyLocked.push(testSignal);
  }
  return {signals,newlyLocked};
}
