// BALL46 shared FT history SHADOW reader (TEST only).
// Read-only merger of existing 1X2 result_version and independently verified O/U FT.
// Does not publish picks, import data, invoke a provider or modify any ledger/Run/Pause.
const rows=(db,q,...args)=>Array.from(db.exec(q,...args));
const validId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
function match(r,team){
 const home=r.home_id===team, gf=home?r.hg:r.ag, ga=home?r.ag:r.hg;
 return {fixtureId:r.fixture_id,leagueId:r.league_id,kickoff:r.kickoff,venue:home?'home':'away',
  opponentId:home?r.away_id:r.home_id,gf,ga,totalGoals:gf+ga,
  over25:gf+ga>=3,btts:gf>0&&ga>0,result:gf>ga?'W':gf===ga?'D':'L',
  source:r.source};
}
export function sharedFtLastMatches(db,team,kickoff,asOf,limit=10){
 team=Number(team);
 if(!validId(team)||!Number.isSafeInteger(kickoff)||kickoff<=0||
    !Number.isSafeInteger(asOf)||asOf<=0||asOf>kickoff||
    !Number.isInteger(limit)||limit<1||limit>10)throw Error('SHARED_FT_INVALID_QUERY');
 const canonical=rows(db,`SELECT r.fixture_id,r.league_id,r.kickoff,r.home_id,r.away_id,r.hg,r.ag,
   'CANONICAL_1X2' AS source FROM result_version r
   WHERE (r.home_id=? OR r.away_id=?) AND r.kickoff<? AND r.observed<=?
    AND r.status='finished' AND r.hg>=0 AND r.ag>=0
    AND r.observed=(SELECT MAX(v.observed) FROM result_version v
      WHERE v.fixture_id=r.fixture_id AND v.observed<=?)
   ORDER BY r.kickoff DESC,r.fixture_id DESC LIMIT ?`,
   team,team,kickoff,asOf,asOf,limit);
 const targeted=rows(db,`SELECT fixture_id,league_id,kickoff,home_id,away_id,hg,ag,
   'VERIFIED_OU_FT' AS source FROM b46_ou_target_history_ft_v1
   WHERE (home_id=? OR away_id=?) AND kickoff<? AND observed<=?
    AND hg>=0 AND ag>=0
   ORDER BY kickoff DESC,fixture_id DESC LIMIT ?`,
   team,team,kickoff,asOf,limit);
 // Canonical wins any overlap; duplicates do not inflate sample sizes.
 const byId=new Map();
 for(const r of targeted)byId.set(String(r.fixture_id),r);
 for(const r of canonical)byId.set(String(r.fixture_id),r);
 return [...byId.values()].sort((a,b)=>b.kickoff-a.kickoff||b.fixture_id-a.fixture_id)
  .slice(0,limit).map(r=>match(r,team));
}
export function sharedFtShadowCoverage(db,homeId,awayId,kickoff,asOf,limit=10){
 if(!validId(homeId)||!validId(awayId)||Number(homeId)===Number(awayId))
  throw Error('SHARED_FT_INVALID_TEAMS');
 const home=sharedFtLastMatches(db,homeId,kickoff,asOf,limit);
 const away=sharedFtLastMatches(db,awayId,kickoff,asOf,limit);
 const summarize=a=>({count:a.length,ready3:a.length>=3,ready5:a.length>=5,
  ready10:a.length>=10,over25Rate:a.length?a.filter(r=>r.over25).length/a.length:null,
  bttsRate:a.length?a.filter(r=>r.btts).length/a.length:null,
  sources:{canonical:a.filter(r=>r.source==='CANONICAL_1X2').length,
   targeted:a.filter(r=>r.source==='VERIFIED_OU_FT').length}});
 return {mode:'SHADOW_READ_ONLY_NO_PICKS',home:summarize(home),away:summarize(away),
  bothReady3:home.length>=3&&away.length>=3,bothReady5:home.length>=5&&away.length>=5,
  bothReady10:home.length>=10&&away.length>=10,providerCalls:0,writes:0};
}
