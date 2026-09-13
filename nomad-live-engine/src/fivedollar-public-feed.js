const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const nameOf=value=>value&&typeof value==='object'?(value.name??value.id??null):(value??null);
const priority=state=>({'SIGNAL':0,'NEAR SIGNAL':1,'WATCHING':2,'LIVE':3}[state]??9);

function priceFromDecision(decision,side='home'){
  if(!decision?.ok) return {priceStatus:'AH WAIT',market:null,selectedPrice:null,priceSources:[]};
  const selectedSide=String(side).toLowerCase()==='away'?'away':'home';
  const line=finite(decision.line)?Number(decision.line):null;
  const odds=finite(decision.odds)?Number(decision.odds):null;
  const sourceId=decision.selectedSourceId??null;
  const bookmaker=decision.selectedBookmaker??null;
  const selectedPrice={
    id:sourceId,
    position:null,
    source:'5DollarFootballAPI',
    bookmaker,
    side:selectedSide,
    line,
    odds,
    priceAgeSeconds:null,
    sourceUpdatedAt:null,
    observedAt:decision.observedAt??null,
    freshnessBasis:decision.freshnessBasis??'OBSERVED',
  };
  const market={
    status:'AH READY',
    source:'5DollarFootballAPI',
    bookmaker,
    market:'FULL MATCH LIVE AH',
    line:finite(decision.homeLine)?Number(decision.homeLine):(selectedSide==='home'?line:(line===null?null:-line)),
    awayLine:finite(decision.homeLine)?-Number(decision.homeLine):(selectedSide==='away'?line:(line===null?null:-line)),
    homeOdds:finite(decision.homeOdds)?Number(decision.homeOdds):null,
    awayOdds:finite(decision.awayOdds)?Number(decision.awayOdds):null,
    sourceUpdatedAt:null,
    observedAt:decision.observedAt??null,
    freshnessBasis:decision.freshnessBasis??'OBSERVED',
  };
  return {priceStatus:'AH READY',market,selectedPrice,priceSources:[selectedPrice]};
}

function liveMatch(fixture,candidate){
  const side=candidate?.side==='away'?'away':'home';
  const pricing=priceFromDecision(candidate?.decisionShadow,side);
  return {
    id:String(fixture.fixtureId),
    fixtureId:String(fixture.fixtureId),
    boardState:'live',
    league:nameOf(fixture.league),
    home:nameOf(fixture.home),
    away:nameOf(fixture.away),
    kickoffAt:fixture.kickoffAt??null,
    minute:finite(fixture.minute)?Number(fixture.minute):null,
    score:clone(fixture.score||{home:null,away:null}),
    stats:clone(candidate?.stats||fixture.stats||{}),
    events:clone(Array.isArray(fixture?.events)?fixture.events:[]),
    rolling:clone(candidate?.rolling||{}),
    state:candidate?.state||'LIVE',
    side,
    detectionPassed:Boolean(candidate?.detectionPassed),
    checks:clone(candidate?.checks||{}),
    passed:finite(candidate?.passed)?Number(candidate.passed):0,
    total:finite(candidate?.total)?Number(candidate.total):6,
    hunger:clone(candidate?.hunger),
    evidence:clone(candidate?.evidence),
    sidePressureShare:finite(candidate?.sidePressureShare)?Number(candidate.sidePressureShare):null,
    freshness:{sourceStale:false,observedAt:fixture?.provenance?.observedAt??null,sourceUpdatedAt:null,freshnessBasis:'OBSERVED'},
    signalStatus:null,
    signalLock:null,
    ...pricing,
  };
}

export function buildFiveUsdPublicFeed(snapshot,candidateShadow){
  const fixtures=Array.isArray(snapshot?.board?.fixtures)?snapshot.board.fixtures:[];
  const candidateById=new Map((candidateShadow?.rows||[]).map(row=>[String(row.fixtureId),row]));
  const matches=[];
  for(const fixture of fixtures){
    if(!fixture?.fixtureId||fixture.boardState!=='live') continue;
    matches.push(liveMatch(fixture,candidateById.get(String(fixture.fixtureId))));
  }
  matches.sort((a,b)=>priority(a.state)-priority(b.state)||Number(b.sidePressureShare||0)-Number(a.sidePressureShare||0));
  const counts={
    live:matches.length,
    waiting:0,
    watching:matches.filter(row=>row.state==='WATCHING').length,
    near:matches.filter(row=>row.state==='NEAR SIGNAL').length,
    signal:0,
    detectorSignal:matches.filter(row=>row.state==='SIGNAL').length,
  };
  return {
    ok:snapshot?.state?.ok!==false,
    source:'5DollarFootballAPI',
    sourceOfTruth:true,
    shadowOnly:true,
    signalAuthority:false,
    liveOnly:true,
    updatedAt:snapshot?.board?.updatedAt??snapshot?.state?.finishedAt??null,
    counts,
    priceStatuses:matches.reduce((out,row)=>{out[row.priceStatus]=(out[row.priceStatus]||0)+1;return out;},{}),
    matches,
    lastError:snapshot?.state?.lastError??null,
    rateLimited:Boolean(snapshot?.state?.rateLimited),
  };
}
