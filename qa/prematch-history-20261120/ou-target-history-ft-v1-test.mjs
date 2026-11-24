// BALL46 O/U-only historical FT TEST vault. Absolutely independent of BTTS CLOSED control.
// Receives ONLY provider-verified historical FT for Upcoming/Waiting target league/team.
// No provider calls, no cron, no mutations to 1X2/BTTS/HCR ledgers or price snapshots.
// A distinct Durable Object SQLite table saves original rows and dedupes fixture IDs.
import {bttsLastMatches} from './btts-history-private.mjs';
const sql=(db,q,...args)=>Array.from(db.exec(q,...args));
const okId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const validGoals=v=>Number.isSafeInteger(v)&&v>=0;
const ready=new WeakSet();
export const OU_TARGET_HISTORY_CODE='B46_OU_TARGET_FT_HISTORY_V1_TEST';
export function initOuTargetHistoryFT(db){
 if(ready.has(db))return;
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_target_history_ft_v1(fixture_id INTEGER PRIMARY KEY,league_id INTEGER NOT NULL,kickoff INTEGER NOT NULL,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,hg INTEGER NOT NULL,ag INTEGER NOT NULL,observed INTEGER NOT NULL,source TEXT NOT NULL,raw_json TEXT NOT NULL)");
 db.exec("CREATE INDEX IF NOT EXISTS b46_ou_history_home_time ON b46_ou_target_history_ft_v1(home_id,kickoff DESC)");
 db.exec("CREATE INDEX IF NOT EXISTS b46_ou_history_away_time ON b46_ou_target_history_ft_v1(away_id,kickoff DESC)");
 db.exec("CREATE INDEX IF NOT EXISTS b46_ou_history_league_time ON b46_ou_target_history_ft_v1(league_id,kickoff DESC)");
 ready.add(db);
}
export function ouTargetHistoryCoverage(db){
 initOuTargetHistoryFT(db);
 const d=sql(db,"SELECT COUNT(*) AS ft,COUNT(DISTINCT league_id) AS leagues,COUNT(DISTINCT home_id) AS homeTeams FROM b46_ou_target_history_ft_v1")[0]??{};
 return {code:OU_TARGET_HISTORY_CODE,ft:Number(d.ft??0),leagues:Number(d.leagues??0),homeTeams:Number(d.homeTeams??0),
  source:'VERIFIED_FINISHED_PROVIDER_FROM_UPCOMING_TARGETS',providerCallsThisRead:0,productionWrites:0};
}
export function importOuTargetHistoryFT(db,raw,observed,{leagueId=null,teamId=null}={}){
 if(!Array.isArray(raw)||raw.length>100||!Number.isSafeInteger(observed)||observed<=0||
  !(okId(leagueId)||okId(teamId))||okId(leagueId)&&okId(teamId))throw Error('OU_HISTORY_INVALID_IMPORT');
 initOuTargetHistoryFT(db);
 const normalized=raw.map(f=>{
  const home=Number(f?.teams?.home?.id),away=Number(f?.teams?.away?.id),lid=Number(f?.league?.id),
   fid=Number(f?.id),start=f?.kickoff_ts;
  if(!okId(fid)||!okId(lid)||!okId(home)||!okId(away)||home===away||
   f?.status!=='finished'||f?.status_code!=='full'||!Number.isSafeInteger(start)||
   start<=0||start>=observed||!validGoals(f?.goals?.home)||!validGoals(f?.goals?.away)||
   okId(leagueId)&&lid!==Number(leagueId)||
   okId(teamId)&&home!==Number(teamId)&&away!==Number(teamId))throw Error('OU_HISTORY_INVALID_FT_OR_TARGET');
  const rawJson=JSON.stringify(f);
  if(rawJson.length>28000)throw Error('OU_HISTORY_ORIGINAL_TOO_LARGE');
  return {fid,lid,start,home,away,hg:f.goals.home,ag:f.goals.away,rawJson};
 });
 if(new Set(normalized.map(x=>x.fid)).size!==normalized.length)throw Error('OU_HISTORY_DUPLICATE_PAGE_FIXTURE');
 return db.transaction(()=>{
  let added=0,unchanged=0,corrected=0,conflicts=0,stale=0;
  for(const x of normalized){
   const old=sql(db,'SELECT league_id,home_id,away_id,kickoff,hg,ag,observed FROM b46_ou_target_history_ft_v1 WHERE fixture_id=?',x.fid)[0];
   if(old&&(old.league_id!==x.lid||old.home_id!==x.home||old.away_id!==x.away||old.kickoff!==x.start)){conflicts++;continue}
   if(old&&old.observed>observed){stale++;continue}
   if(old&&old.hg===x.hg&&old.ag===x.ag){unchanged++;continue}
   db.exec('INSERT INTO b46_ou_target_history_ft_v1(fixture_id,league_id,kickoff,home_id,away_id,hg,ag,observed,source,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fixture_id) DO UPDATE SET hg=excluded.hg,ag=excluded.ag,observed=excluded.observed,raw_json=excluded.raw_json',
    x.fid,x.lid,x.start,x.home,x.away,x.hg,x.ag,observed,
    okId(teamId)?'5USD_UPCOMING_TEAM_FINISHED':'5USD_UPCOMING_LEAGUE_FINISHED',x.rawJson);
   if(old)corrected++;else added++;
  }
  return {received:raw.length,added,unchanged,corrected,conflicts,stale,providerCalls:0,
   ouOnly:true,otherLedgersTouched:false};
 });
}
export function ouTargetLastMatches(db,team,kickoff,asOf,limit=10){
 if(!okId(team)||!Number.isSafeInteger(kickoff)||!Number.isSafeInteger(asOf)||
  !(asOf<kickoff)||!Number.isInteger(limit)||limit<1||limit>50)throw Error('OU_HISTORY_INVALID_QUERY');
 initOuTargetHistoryFT(db);
 const old=bttsLastMatches(db,team,kickoff,asOf,limit);
 const own=sql(db,'SELECT fixture_id,league_id,kickoff,home_id,away_id,hg,ag FROM b46_ou_target_history_ft_v1 WHERE (home_id=? OR away_id=?) AND kickoff<? AND observed<=? ORDER BY kickoff DESC,fixture_id DESC LIMIT ?',
  team,team,kickoff,asOf,limit).map(r=>{
  const h=Number(r.home_id)===Number(team),gf=h?r.hg:r.ag,ga=h?r.ag:r.hg;
  return {fixtureId:r.fixture_id,leagueId:r.league_id,kickoff:r.kickoff,
   venue:h?'home':'away',opponentId:h?r.away_id:r.home_id,gf,ga,btts:gf>0&&ga>0,
   result:gf>ga?'W':gf===ga?'D':'L'};
 });
 // O/U FT store takes precedence on duplicate fixture ID; original source
 // matches are preserved in their own tables, never deleted or rewritten.
 const seen=new Map(old.map(x=>[String(x.fixtureId),x]));
 for(const x of own)seen.set(String(x.fixtureId),x);
 return [...seen.values()].sort((a,b)=>b.kickoff-a.kickoff||Number(b.fixtureId)-Number(a.fixtureId)).slice(0,limit);
}
export function ouTargetLeagueAsOf(db,league,kickoff,asOf,limit=120){
 if(!okId(league)||!Number.isSafeInteger(kickoff)||!Number.isSafeInteger(asOf)||
  !(asOf<kickoff)||!Number.isInteger(limit)||limit<1||limit>120)return [];
 initOuTargetHistoryFT(db);
 const normal=sql(db,"SELECT r.fixture_id,r.kickoff,r.hg,r.ag FROM result_version r WHERE r.league_id=? AND r.status='finished' AND r.kickoff<? AND r.observed<=? AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id AND v.observed<=?) ORDER BY r.kickoff DESC LIMIT ?",
  league,kickoff,asOf,asOf,limit);
 const privateFT=sql(db,"SELECT fixture_id,kickoff,hg,ag FROM btts_history_private_test WHERE league_id=? AND kickoff<? AND observed<=? ORDER BY kickoff DESC LIMIT ?",
  league,kickoff,asOf,limit);
 const ouFT=sql(db,"SELECT fixture_id,kickoff,hg,ag FROM b46_ou_target_history_ft_v1 WHERE league_id=? AND kickoff<? AND observed<=? ORDER BY kickoff DESC LIMIT ?",
  league,kickoff,asOf,limit);
 const all=new Map();
 for(const x of [...normal,...privateFT,...ouFT])all.set(String(x.fixture_id),x);
 return [...all.values()].sort((a,b)=>b.kickoff-a.kickoff||Number(b.fixture_id)-Number(a.fixture_id))
  .slice(0,limit).map(x=>({hg:x.hg,ag:x.ag}));
}
