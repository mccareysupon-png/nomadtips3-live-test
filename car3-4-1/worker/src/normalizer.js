function finiteOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function pair(input={}){return{home:finiteOrNull(input?.home),away:finiteOrNull(input?.away)};}

export function normalizeGoalooMatch(raw){
  const collectedAt=raw?.collectedAt||new Date().toISOString();
  const stats={
    possession:pair(raw?.stats?.possession),
    attacks:pair(raw?.stats?.attacks),
    dangerousAttacks:pair(raw?.stats?.dangerous_attacks),
    shots:pair(raw?.stats?.shots),
    shotsOnTarget:pair(raw?.stats?.shots_on_target),
    corners:pair(raw?.stats?.corners),
    yellowCards:pair(raw?.stats?.yellow_cards),
    redCards:pair(raw?.stats?.red_cards)
  };
  const required=['possession','attacks','dangerousAttacks','shots','shotsOnTarget','corners'];
  const coreStatsComplete=required.every(key=>stats[key].home!==null&&stats[key].away!==null);
  const warnings=[...(Array.isArray(raw?.warnings)?raw.warnings:[])];
  if(!coreStatsComplete&&!warnings.includes('CORE_STATS_INCOMPLETE'))warnings.push('CORE_STATS_INCOMPLETE');
  if(raw?.minute===null||raw?.minute===undefined)warnings.push('MINUTE_UNAVAILABLE');

  return {
    schema:'nomadtips3.live-match.v1',
    source:{provider:'GOALOO',matchId:String(raw?.sourceMatchId??''),collectedAt},
    match:{
      id:`goaloo:${String(raw?.sourceMatchId??'')}`,
      leagueId:raw?.leagueId??null,
      league:String(raw?.league??''),
      home:String(raw?.home??''),
      away:String(raw?.away??''),
      kickoff:raw?.kickoff??null
    },
    state:{status:String(raw?.status??'UNKNOWN'),minute:finiteOrNull(raw?.minute)},
    score:{home:finiteOrNull(raw?.score?.home)??0,away:finiteOrNull(raw?.score?.away)??0},
    stats,
    sourceMarketHints:{
      asianHandicapLine:finiteOrNull(raw?.marketHints?.asianHandicapLine),
      overUnderLine:finiteOrNull(raw?.marketHints?.overUnderLine)
    },
    quality:{coreStatsComplete,warnings:[...new Set(warnings)]}
  };
}

export function summarizeQuality(matches){
  const total=matches.length;
  const coreStatsReady=matches.filter(m=>m.quality?.coreStatsComplete).length;
  const minuteReady=matches.filter(m=>m.state?.minute!==null).length;
  const warningCount=matches.reduce((sum,m)=>sum+(m.quality?.warnings?.length||0),0);
  return {total,coreStatsReady,minuteReady,warningCount,coreStatsReadyPct:total?Math.round(coreStatsReady/total*1000)/10:0};
}
