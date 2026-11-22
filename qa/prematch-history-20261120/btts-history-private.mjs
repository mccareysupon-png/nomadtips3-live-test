// BALL46 BTTS TEST history cache, fully isolated from 1X2, HCR and Live.
// Ultra /v1/leagues/{id}/fixtures?season=...&status=finished responses only.
// NO network in this module, NO modification of result_version or test_pick_1x2.
const positive=x=>/^[1-9]\d*$/.test(String(x??''))&&Number.isSafeInteger(Number(x));
const goal=x=>Number.isSafeInteger(x)&&x>=0;
const rows=(db,q,...a)=>Array.from(db.exec(q,...a));
export function initBttsHistory(db){
 db.exec('CREATE TABLE IF NOT EXISTS btts_history_private_test (fixture_id INTEGER PRIMARY KEY, league_id INTEGER NOT NULL, kickoff INTEGER NOT NULL, home_id INTEGER NOT NULL, away_id INTEGER NOT NULL, hg INTEGER NOT NULL, ag INTEGER NOT NULL, observed INTEGER NOT NULL, season TEXT NOT NULL)');
 db.exec('CREATE INDEX IF NOT EXISTS btts_private_home_time ON btts_history_private_test(home_id,kickoff DESC)');
 db.exec('CREATE INDEX IF NOT EXISTS btts_private_away_time ON btts_history_private_test(away_id,kickoff DESC)');
}
export function normalizeBttsFinished(f){
 if(!positive(f?.id)||!positive(f?.league?.id)||!positive(f?.teams?.home?.id)||!positive(f?.teams?.away?.id)||
  String(f.teams.home.id)===String(f.teams.away.id)||f.status!=='finished'||
  f.status_code!=='full'||!goal(f.goals?.home)||!goal(f.goals?.away)||
  !Number.isSafeInteger(f.kickoff_ts)||f.kickoff_ts<=0)return null;
 return {fixtureId:Number(f.id),leagueId:Number(f.league.id),kickoff:f.kickoff_ts,
  homeId:Number(f.teams.home.id),awayId:Number(f.teams.away.id),hg:f.goals.home,ag:f.goals.away};
}
export function importBttsFinished(db,raw,observed,{leagueId,season}={}){
 if(!Array.isArray(raw)||raw.length>100||!positive(leagueId)||
  typeof season!=='string'||!/^\d{4}(?:\/\d{2,4})?$/.test(season)||
  !Number.isSafeInteger(observed)||observed<=0)throw Error('INVALID_BTTS_PRIVATE_PAGE');
 const stats={received:raw.length,added:0,corrected:0,duplicates:0,stale:0,rejected:0,conflicts:0};
 // Validate EVERY row before inserting anything; no partial contaminated pages.
 const accepted=raw.map(normalizeBttsFinished);
 if(accepted.some((x,i)=>!x||x.leagueId!==Number(leagueId)||x.kickoff>=observed)||
  new Set(accepted.map(x=>x.fixtureId)).size!==accepted.length)
  throw Error('INVALID_OR_MIXED_BTTS_LEAGUE_PAGE');
 return db.transaction(()=>{
  for(const r of accepted){
   const old=rows(db,'SELECT * FROM btts_history_private_test WHERE fixture_id=?',r.fixtureId)[0];
   if(old&&(old.league_id!==r.leagueId||old.home_id!==r.homeId||old.away_id!==r.awayId)){
    stats.conflicts++;continue;
   }
   if(old?.observed>observed){stats.stale++;continue}
   if(old&&old.kickoff===r.kickoff&&old.hg===r.hg&&old.ag===r.ag){stats.duplicates++;continue}
   db.exec('INSERT INTO btts_history_private_test(fixture_id,league_id,kickoff,home_id,away_id,hg,ag,observed,season) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(fixture_id) DO UPDATE SET kickoff=excluded.kickoff,hg=excluded.hg,ag=excluded.ag,observed=excluded.observed,season=excluded.season',
    r.fixtureId,r.leagueId,r.kickoff,r.homeId,r.awayId,r.hg,r.ag,observed,season);
   if(old)stats.corrected++;else stats.added++;
  }
  return stats;
 });
}
export function bttsHistoryCoverage(db){
 const x=rows(db,'SELECT COUNT(*) AS fixtures,COUNT(DISTINCT league_id) AS leagues,COUNT(DISTINCT home_id) AS homeTeams FROM btts_history_private_test')[0];
 return {privateFT:x?.fixtures??0,privateLeagues:x?.leagues??0,privateHomeTeams:x?.homeTeams??0};
}
export function bttsLastMatches(db,team,kickoff,asOf,limit=10){
 if(!positive(team)||!Number.isSafeInteger(kickoff)||kickoff<=0||
  !Number.isSafeInteger(asOf)||asOf>kickoff||!Number.isInteger(limit)||limit<1||limit>50)
  throw Error('INVALID_BTTS_HISTORY_QUERY');
 // Merge private BTTS-only FT with immutable existing shared FT, deduplicate by
 // fixture. Observations after analysis time and started matches are excluded.
 const q=`WITH source AS (
  SELECT r.fixture_id,r.league_id,r.kickoff,r.home_id,r.away_id,r.hg,r.ag,r.observed,1 AS priority
  FROM result_version r WHERE (r.home_id=? OR r.away_id=?) AND r.kickoff<? AND r.observed<=?
   AND r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id AND v.observed<=?)
  UNION ALL
  SELECT x.fixture_id,x.league_id,x.kickoff,x.home_id,x.away_id,x.hg,x.ag,x.observed,0 AS priority
  FROM btts_history_private_test x WHERE (x.home_id=? OR x.away_id=?) AND x.kickoff<? AND x.observed<=?
 ), unique_rows AS (
  SELECT source.*,ROW_NUMBER() OVER(PARTITION BY fixture_id ORDER BY observed DESC,priority DESC) AS rn FROM source
 )
 SELECT * FROM unique_rows WHERE rn=1 ORDER BY kickoff DESC,fixture_id DESC LIMIT ?`;
 return rows(db,q,Number(team),Number(team),kickoff,asOf,asOf,
  Number(team),Number(team),kickoff,asOf,limit).map(r=>{
  const home=r.home_id===Number(team),gf=home?r.hg:r.ag,ga=home?r.ag:r.hg;
  return {fixtureId:r.fixture_id,leagueId:r.league_id,kickoff:r.kickoff,
   venue:home?'home':'away',opponentId:home?r.away_id:r.home_id,
   gf,ga,btts:gf>0&&ga>0,result:gf>ga?'W':gf===ga?'D':'L'};
 });
}
export function candidateBttsLeagues(fixtures,limit=25){
 const map=new Map();
 for(const f of (Array.isArray(fixtures)?fixtures:[])){
  if(!positive(f?.league?.id)||!positive(f?.teams?.home?.id)||!positive(f?.teams?.away?.id)||f.status!=='scheduled')continue;
  const id=Number(f.league.id),old=map.get(id)||{leagueId:id,leagueName:String(f.league.name??''),upcoming:0,teamIds:new Set()};
  old.upcoming++;old.teamIds.add(Number(f.teams.home.id));old.teamIds.add(Number(f.teams.away.id));map.set(id,old);
 }
 return [...map.values()].map(x=>({leagueId:x.leagueId,leagueName:x.leagueName,upcoming:x.upcoming,teams:x.teamIds.size}))
  .sort((a,b)=>b.upcoming-a.upcoming||a.leagueId-b.leagueId).slice(0,limit);
}

 // John's one-off fallback when /v1/leagues/{id} exposes no season metadata.
 // Can accept actual last-10 finished rows for ONE confirmed team, from mixed
 // competitions, without making calls in this module or touching shared FT.
export function importBttsTeamFallback(db,raw,observed,{teamId}={}){
 if(!positive(teamId)||!Array.isArray(raw)||raw.length<1||raw.length>10||
    !Number.isSafeInteger(observed)||observed<=0)throw Error('INVALID_BTTS_TEAM_FALLBACK');
 const normalized=raw.map(normalizeBttsFinished);
 if(normalized.some(r=>!r||r.kickoff>=observed||r.homeId!==Number(teamId)&&r.awayId!==Number(teamId))||
   new Set(normalized.map(r=>r.fixtureId)).size!==normalized.length)
  throw Error('INVALID_BTTS_TEAM_RESULT');
 const stats={received:raw.length,added:0,corrected:0,duplicates:0,stale:0,conflicts:0};
 return db.transaction(()=>{
  for(const r of normalized){
   const old=rows(db,'SELECT * FROM btts_history_private_test WHERE fixture_id=?',r.fixtureId)[0];
   if(old&&(old.league_id!==r.leagueId||old.home_id!==r.homeId||old.away_id!==r.awayId)){
    stats.conflicts++;continue;
   }
   if(old?.observed>observed){stats.stale++;continue}
   if(old&&old.kickoff===r.kickoff&&old.hg===r.hg&&old.ag===r.ag){stats.duplicates++;continue}
   db.exec('INSERT INTO btts_history_private_test(fixture_id,league_id,kickoff,home_id,away_id,hg,ag,observed,season) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(fixture_id) DO UPDATE SET kickoff=excluded.kickoff,hg=excluded.hg,ag=excluded.ag,observed=excluded.observed,season=excluded.season',
     r.fixtureId,r.leagueId,r.kickoff,r.homeId,r.awayId,r.hg,r.ag,observed,'TEAM_LAST10');
   if(old)stats.corrected++;else stats.added++;
  }
  return stats;
 });
}
