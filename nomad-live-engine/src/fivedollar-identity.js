import {normalizeTeamName,teamSimilarity} from './real-market.js';

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const num=value=>finite(value)?Number(value):null;
const text=value=>String(value??'').trim();
const pair=value=>({home:num(value?.home),away:num(value?.away)});

const CLASSIFIERS=Object.freeze({
  women:/\b(?:women|woman|womens|ladies|femeni|femenino|feminina|feminine|female|dames|damas)\b/i,
  youth:/\b(?:u[- ]?(?:17|18|19|20|21|23)|under[- ]?(?:17|18|19|20|21|23)|youth|juvenil|junior)\b/i,
  reserve:/\b(?:reserve|reserves|b team|ii|2nd|segunda|amateur)\b/i,
});

function identityClass(value){
  const source=text(value);
  return Object.fromEntries(Object.entries(CLASSIFIERS).map(([key,re])=>[key,re.test(source)]));
}

function incompatibleClass(a,b){
  const left=identityClass(a),right=identityClass(b);
  return Object.keys(left).some(key=>left[key]!==right[key]&&(left[key]||right[key]));
}

function kickoffMs(value){
  if(finite(value)){
    const n=Number(value);return n>10_000_000_000?n:n*1000;
  }
  const parsed=Date.parse(value||'');
  return Number.isFinite(parsed)?parsed:null;
}

function legacyKickoff(match){return kickoffMs(match?.kickoffUtc??match?.kickoffAt??match?.date??match?.startTime);}
function fiveKickoff(match){return kickoffMs(match?.kickoffAt??match?.kickoffUtc??match?.date);}
function legacyName(match,side){return text(match?.[side]??match?.teams?.[side]?.name);}
function fiveName(match,side){return text(match?.[side]?.name??match?.teams?.[side]?.name??match?.[side]);}
function legacyLeague(match){return text(match?.league?.name??match?.league);}
function fiveLeague(match){return text(match?.league?.name??match?.league);}
function legacyId(match){const id=match?.sourceMatchId??match?.id??match?.matchId??null;return id===null?null:String(id);}
function fiveId(match){const id=match?.fixtureId??match?.id??null;return id===null?null:String(id);}

function kickoffScore(a,b){
  const left=legacyKickoff(a),right=fiveKickoff(b);
  if(left===null||right===null) return {score:.5,diffMinutes:null};
  const diff=Math.abs(left-right)/60000;
  if(diff<=10) return {score:1,diffMinutes:diff};
  if(diff<=30) return {score:.9,diffMinutes:diff};
  if(diff<=90) return {score:.65,diffMinutes:diff};
  if(diff<=180) return {score:.3,diffMinutes:diff};
  return {score:0,diffMinutes:diff};
}

function scoreCheck(a,b){
  const left=pair(a?.score),right=pair(b?.score);
  if(left.home===null||left.away===null||right.home===null||right.away===null) return {known:false,match:true};
  return {known:true,match:left.home===right.home&&left.away===right.away,left,right};
}

function minuteCheck(a,b){
  const left=num(a?.minute),right=num(b?.minute);
  if(left===null||right===null) return {known:false,ok:true,diff:null};
  const diff=Math.abs(left-right);
  return {known:true,ok:diff<=8,diff};
}

export function scoreIdentityCandidate(legacy,five){
  const homeLegacy=legacyName(legacy,'home'),awayLegacy=legacyName(legacy,'away');
  const homeFive=fiveName(five,'home'),awayFive=fiveName(five,'away');
  if(!homeLegacy||!awayLegacy||!homeFive||!awayFive) return {ok:false,reason:'missing_team_identity',confidence:0};
  if(incompatibleClass(homeLegacy,homeFive)||incompatibleClass(awayLegacy,awayFive)) return {ok:false,reason:'team_class_mismatch',confidence:0};

  const home=teamSimilarity(homeLegacy,homeFive),away=teamSimilarity(awayLegacy,awayFive),teamAvg=(home+away)/2;
  if(home<.68||away<.68||teamAvg<.75) return {ok:false,reason:'team_similarity_low',confidence:Number(teamAvg.toFixed(4)),home,away};

  const scores=scoreCheck(legacy,five);
  if(scores.known&&!scores.match) return {ok:false,reason:'score_mismatch',confidence:0,home,away,score:scores};
  const minutes=minuteCheck(legacy,five);
  if(minutes.known&&!minutes.ok) return {ok:false,reason:'minute_mismatch',confidence:0,home,away,minute:minutes};

  const kickoff=kickoffScore(legacy,five);
  if(kickoff.diffMinutes!==null&&kickoff.diffMinutes>180) return {ok:false,reason:'kickoff_mismatch',confidence:0,home,away,kickoff};
  const league=legacyLeague(legacy)&&fiveLeague(five)?teamSimilarity(legacyLeague(legacy),fiveLeague(five)):.5;
  const liveEvidence=(scores.known?0.08:0)+(minutes.known?0.04:0);
  const confidence=Math.min(1,teamAvg*.78+league*.05+kickoff.score*.13+liveEvidence);
  const ok=confidence>=.82;
  return {
    ok,reason:ok?'matched':'confidence_low',confidence:Number(confidence.toFixed(4)),
    home:Number(home.toFixed(4)),away:Number(away.toFixed(4)),league:Number(league.toFixed(4)),kickoff,
    score:scores,minute:minutes,
  };
}

export function buildFixtureIdentityBridge(legacyMatches=[],fiveFixtures=[],previous=[]){
  const fiveById=new Map(fiveFixtures.map(row=>[fiveId(row),row]).filter(([id])=>id));
  const previousByLegacy=new Map((previous||[]).filter(row=>row?.status==='MATCHED'&&row?.legacyMatchId&&row?.fiveUsdFixtureId).map(row=>[String(row.legacyMatchId),row]));
  const usedFive=new Set(),results=[];

  for(const legacy of legacyMatches||[]){
    const lid=legacyId(legacy);
    if(!lid) continue;
    const prior=previousByLegacy.get(lid);
    if(prior){
      const same=fiveById.get(String(prior.fiveUsdFixtureId));
      if(same){
        const checked=scoreIdentityCandidate(legacy,same);
        if(checked.ok){
          usedFive.add(String(prior.fiveUsdFixtureId));
          results.push({status:'MATCHED',legacyMatchId:lid,fiveUsdFixtureId:String(prior.fiveUsdFixtureId),confidence:checked.confidence,sticky:true,breakdown:checked});
          continue;
        }
      }
    }

    const candidates=[];
    for(const five of fiveFixtures||[]){
      const fid=fiveId(five);
      if(!fid||usedFive.has(fid)) continue;
      const scored=scoreIdentityCandidate(legacy,five);
      if(scored.ok) candidates.push({fid,scored});
    }
    candidates.sort((a,b)=>b.scored.confidence-a.scored.confidence);
    const best=candidates[0]||null,second=candidates[1]||null;
    if(!best){results.push({status:'UNMATCHED',legacyMatchId:lid,fiveUsdFixtureId:null,confidence:0,sticky:false,reason:'no_safe_candidate'});continue;}
    const margin=second?best.scored.confidence-second.scored.confidence:1;
    if(second&&margin<.06){
      results.push({status:'AMBIGUOUS',legacyMatchId:lid,fiveUsdFixtureId:null,confidence:best.scored.confidence,sticky:false,reason:'candidate_margin_low',candidateFixtureIds:[best.fid,second.fid],margin:Number(margin.toFixed(4))});
      continue;
    }
    usedFive.add(best.fid);
    results.push({status:'MATCHED',legacyMatchId:lid,fiveUsdFixtureId:best.fid,confidence:best.scored.confidence,sticky:false,breakdown:best.scored,margin:Number(margin.toFixed(4))});
  }

  const matched=results.filter(row=>row.status==='MATCHED').length;
  const ambiguous=results.filter(row=>row.status==='AMBIGUOUS').length;
  const unmatched=results.filter(row=>row.status==='UNMATCHED').length;
  return {rows:results,summary:{legacy:results.length,fiveUsd:fiveFixtures.length,matched,ambiguous,unmatched,coverage:results.length?Number((matched/results.length).toFixed(4)):1}};
}

export function applyShadowFixtureIds(legacyMatches=[],bridgeRows=[]){
  const byLegacy=new Map((bridgeRows||[]).filter(row=>row.status==='MATCHED').map(row=>[String(row.legacyMatchId),row]));
  return (legacyMatches||[]).map(match=>{
    const lid=legacyId(match),bridge=lid?byLegacy.get(lid):null;
    return bridge?{...match,fiveUsdFixtureId:bridge.fiveUsdFixtureId,fiveUsdIdentityConfidence:bridge.confidence}:match;
  });
}

export function publicBridgeRow(row){
  if(!row) return null;
  const {breakdown,...safe}=row;
  return safe;
}

export {incompatibleClass};
