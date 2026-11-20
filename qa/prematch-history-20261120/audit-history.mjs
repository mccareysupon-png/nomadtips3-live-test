import {normalize,lastMatches,totals} from './history.mjs';
const rows=(db,q,...a)=>Array.from(db.exec(q,...a));
export async function auditHistory(db,j,adapt,report,now){
 if(j?.ok!==true||j.cacheOnly!==true||Number(j.externalRequestsAdded)!==0||j.stale===true||!Array.isArray(j.fixtures)||!j.fixtures.length||j.fixtures.length>15000||!Number.isFinite(Number(j.ageMs))||Number(j.ageMs)<0||Number(j.ageMs)>3600000)throw Error('CACHE_CONTRACT');
 const sql='SELECT r.* FROM result_version r WHERE r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id) ORDER BY r.fixture_id';
 const stored=rows(db,sql),map=new Map(stored.map(r=>[r.fixture_id,r]));
 const observation=Date.parse(report?.observedAt??'')/1000;
 const compare={accepted:0,exact:0,notYetStored:0,changed:0,excluded:0,duplicateSource:0,archiveOutsideCurrentCache:0},ids=new Set(),samples=[],changes=[],missing=[];
 const score={homeWin:0,draw:0,awayWin:0,bttsYes:0,bttsNo:0},issues={lookupMismatch:0,sourceDuplicate:0};
 for(const f of j.fixtures){
  if(!['finished','unknown'].includes(f.boardState))continue;
  const n=normalize(adapt(f));
  // adapt may reject non-normal-time results; normalize handles null.
  if(!n){compare.excluded++;continue}
  if(ids.has(n.id)){compare.duplicateSource++;continue}ids.add(n.id);compare.accepted++;
  const r=map.get(n.id);
  if(!r){compare.notYetStored++;if(missing.length<5)missing.push(n.id);continue}
  if([r.league_id,r.kickoff,r.home_id,r.away_id,r.status,r.hg,r.ag].every((x,i)=>x===[n.league,n.k,n.home,n.away,n.status,n.hg,n.ag][i])){
   compare.exact++;if(samples.length<5&&n.status==='finished')samples.push({id:n.id,home:String(f.home?.name??n.home),away:String(f.away?.name??n.away),hubScore:n.hg+':'+n.ag,sqliteScore:r.hg+':'+r.ag});
  }else{compare.changed++;if(changes.length<5)changes.push({id:n.id,dbStatus:r.status,sourceStatus:n.status,dbScore:r.hg===null?null:r.hg+':'+r.ag,sourceScore:n.hg===null?null:n.hg+':'+n.ag})}
 }
 compare.archiveOutsideCurrentCache=stored.filter(r=>!ids.has(r.fixture_id)).length;
 const teams=new Set(),byTeam=new Map();for(const r of stored){
  if(r.status!=='finished')continue;
  score[r.hg>r.ag?'homeWin':r.hg===r.ag?'draw':'awayWin']++;score[r.hg>0&&r.ag>0?'bttsYes':'bttsNo']++;
  for(const t of [r.home_id,r.away_id]){teams.add(t);if(!byTeam.has(t))byTeam.set(t,[]);byTeam.get(t).push(r)}
 }
 let teamsWith10=0,lookups=0;
 for(const t of teams){const expected=byTeam.get(t).filter(r=>r.kickoff<now&&r.observed<=now).sort((a,b)=>b.kickoff-a.kickoff||b.fixture_id-a.fixture_id).slice(0,10).map(r=>{const home=r.home_id===t,gf=home?r.hg:r.ag,ga=home?r.ag:r.hg;return {fixtureId:r.fixture_id,leagueId:r.league_id,kickoff:r.kickoff,venue:home?'home':'away',opponentId:home?r.away_id:r.home_id,gf,ga,btts:gf>0&&ga>0,result:gf>ga?'W':gf===ga?'D':'L'}});
  const actual=lastMatches(db,t,now,now);lookups++;if(actual.length===10)teamsWith10++;if(JSON.stringify(actual)!==JSON.stringify(expected))issues.lookupMismatch++;
 }
 const upcoming={fixtures:0,teams:0,eligible:0},uTeams=new Set(),cacheSeasons=new Set(),uLeagues=new Set();
 for(const f of j.fixtures){if(f.boardState!=='scheduled'||f.status!=='scheduled'||!Number.isFinite(f.kickoffAt)||f.kickoffAt<=now*1000)continue;const h=Number(f.home?.id),a=Number(f.away?.id);if(!Number.isSafeInteger(h)||h<=0||!Number.isSafeInteger(a)||a<=0||h===a)continue;upcoming.fixtures++;uTeams.add(h);uTeams.add(a);if(f.league?.id){uLeagues.add(String(f.league.id));if(f.league?.season!=null||f.season!=null)cacheSeasons.add(String(f.league.id))}if(lastMatches(db,h,Math.floor(f.kickoffAt/1000),now).length===10&&lastMatches(db,a,Math.floor(f.kickoffAt/1000),now).length===10)upcoming.eligible++}
 upcoming.teams=uTeams.size;upcoming.leagues=uLeagues.size;upcoming.leaguesWithSeason=cacheSeasons.size;
 const versions=rows(db,'SELECT COUNT(*) AS n FROM result_version')[0].n;
 const duplicates=rows(db,'SELECT COUNT(*) AS n FROM (SELECT fixture_id,observed,COUNT(*) AS n FROM result_version GROUP BY fixture_id,observed HAVING COUNT(*)>1)')[0].n;
 const taskCounts=rows(db,'SELECT kind,state,COUNT(*) AS n,SUM(attempts) AS attempts FROM john_tasks GROUP BY kind,state');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stored)));
 return {auditVersion:'REAL_SQL_MATCH_V1',checkedAt:new Date(now*1000).toISOString(),lastImport:report?.observedAt??null,lastImportValid:Number.isFinite(observation),hub:{version:j.version,cacheOnly:j.cacheOnly,ageMs:j.ageMs,rows:j.fixtures.length,externalRequestsAdded:j.externalRequestsAdded},stored:totals(db),versions,duplicates,compare,score,lookup:{teams:teams.size,lookups,teamsWith10,mismatches:issues.lookupMismatch},upcoming,tasks:taskCounts,backfillExecuted:taskCounts.some(x=>x.attempts>0),samples,changes,missingSample:missing,dbDigest:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')};
}
