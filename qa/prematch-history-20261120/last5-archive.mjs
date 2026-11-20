// Last 5 is a read-only display of verified FT results, not a prediction-time feature.
// New source is the common archive. No fetch to a provider, no per-team sync.
import {coverage,lastMatches} from './history.mjs';
const id=x=>/^[1-9]\d{0,15}$/.test(String(x??''))&&Number.isSafeInteger(Number(x));
const rows=(db,q,...a)=>Array.from(db.exec(q,...a));
export function initNames(db){db.exec('CREATE TABLE IF NOT EXISTS team_name(team_id INTEGER PRIMARY KEY,name TEXT NOT NULL,observed INTEGER NOT NULL)')}
export function rememberNames(db,fixtures,now){
 const candidates=new Map();for(const f of fixtures){for(const t of [f.home??f.teams?.home,f.away??f.teams?.away]){if(id(t?.id)&&typeof t.name==='string'&&t.name.trim()&&t.name.length<=240)candidates.set(Number(t.id),t.name.trim())}}
 db.transaction(()=>{for(const [i,n] of candidates)db.exec('INSERT INTO team_name VALUES(?,?,?) ON CONFLICT(team_id) DO UPDATE SET name=excluded.name,observed=excluded.observed WHERE excluded.observed>=team_name.observed',i,n,now)});
 return candidates.size;
}
export function validateLast5(u,now){
 const fixtureId=u.searchParams.get('fixtureId'),home=u.searchParams.get('home'),away=u.searchParams.get('away'),cutoff=Number(u.searchParams.get('cutoff'));
 if(!id(fixtureId)||!id(home)||!id(away)||home===away||!Number.isSafeInteger(cutoff)||cutoff<946684800000||cutoff>now*1000+60*86400000)throw Error('INVALID_HISTORY_REQUEST');
 return{fixtureId,home,away,cutoff}
}
export function archiveLast5(db,params,now){
 const {fixtureId,home,away,cutoff}=params,k=Math.floor(cutoff/1000);
 const team=teamId=>{
  // For display only, use latest known FT revisions before match kickoff.
  // Prediction features use history.mjs lastMatches with strict observation cutoff.
  const recent=rows(db,'SELECT r.* FROM result_version r WHERE (r.home_id=? OR r.away_id=?) AND r.kickoff<? AND r.observed<=? AND r.fixture_id<>? AND r.status=? AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id AND v.observed<=?) ORDER BY r.kickoff DESC,r.fixture_id DESC LIMIT 5',Number(teamId),Number(teamId),k,now,Number(fixtureId),'finished',now);
  const result=recent.flatMap(r=>{const isHome=r.home_id===Number(teamId),opp=isHome?r.away_id:r.home_id,lookup=rows(db,'SELECT name FROM team_name WHERE team_id=?',opp)[0];if(!lookup?.name)return[];const gf=isHome?r.hg:r.ag,ga=isHome?r.ag:r.hg;return[{fixtureId:String(r.fixture_id),kickoffUtc:new Date(r.kickoff*1000).toISOString(),venue:isHome?'home':'away',opponent:{id:String(opp),name:lookup.name},status:'FT',gf,ga,result:gf>ga?'W':gf===ga?'D':'L'}]});
  return{teamId:String(teamId),source:'5USD',verified:true,fetchedAt:new Date(now*1000).toISOString(),cutoffUtc:new Date(cutoff).toISOString(),count:result.length,completeLastFive:result.length===5,rows:result,cache:'ARCHIVE'};
 };
 return{ok:true,fixtureId,source:'5USD',cutoffUtc:new Date(cutoff).toISOString(),home:team(home),away:team(away),externalRequestsAdded:0}
}
export function chooseCached(archive,old,team,cutoff){
 // Preserve an already validated fresh legacy cache if it is more complete.
 // No stale cross-fixture fallback, no provider fetch and no manufactured matches.
 const d=old?.data;
 if(!old||old.expires<=Date.now()||d?.verified!==true||String(d.teamId)!==String(team)||d.cutoffUtc!==new Date(cutoff).toISOString()||!Array.isArray(d.rows)||d.count!==d.rows.length||d.count>5||!d.rows.every(r=>r.status==='FT'&&['W','D','L'].includes(r.result)&&r.opponent?.name&&Number.isInteger(r.gf)&&Number.isInteger(r.ga)&&Date.parse(r.kickoffUtc)<cutoff))return archive;
 return d.count>archive.count?{...d,cache:'LEGACY_HIT'}:archive;
}
