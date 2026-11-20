// Shared storage and daily ingestion primitives. No network or provider credentials here.
export const DAY=86400;
const rows=(db,q,...a)=>Array.from(db.exec(q,...a));
const positiveId=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0||typeof x==='string'&&/^[1-9]\d{0,15}$/.test(x)&&Number.isSafeInteger(Number(x));
const goal=x=>Number.isInteger(x)&&x>=0;
export function init(db){
 db.exec('CREATE TABLE IF NOT EXISTS result_version(fixture_id INTEGER NOT NULL, observed INTEGER NOT NULL, league_id INTEGER NOT NULL, kickoff INTEGER NOT NULL, home_id INTEGER NOT NULL, away_id INTEGER NOT NULL, status TEXT NOT NULL, hg INTEGER, ag INTEGER, PRIMARY KEY(fixture_id,observed))');
 db.exec('CREATE INDEX IF NOT EXISTS home_time ON result_version(home_id,kickoff DESC,observed DESC)');
 db.exec('CREATE INDEX IF NOT EXISTS away_time ON result_version(away_id,kickoff DESC,observed DESC)');
 db.exec('CREATE TABLE IF NOT EXISTS sync_state(run_key TEXT PRIMARY KEY, next_page INTEGER NOT NULL, done INTEGER NOT NULL, requests INTEGER NOT NULL)');
}
export function normalize(f){
 if(!positiveId(f?.id)||!positiveId(f?.league?.id)||!positiveId(f?.teams?.home?.id)||!positiveId(f?.teams?.away?.id))return null;
 const k=f.kickoff_ts;if(!Number.isSafeInteger(k)||k<=0||Number(f.teams.home.id)===Number(f.teams.away.id))return null;
 const status=f.status;
 if(status!=='finished'&&status!=='unknown')return null;
 if(status==='finished'&&(f.status_code!=='full'||!goal(f.goals?.home)||!goal(f.goals?.away)))return null;
 return {id:Number(f.id),league:Number(f.league.id),k,home:Number(f.teams.home.id),away:Number(f.teams.away.id),status,hg:status==='finished'?f.goals.home:null,ag:status==='finished'?f.goals.away:null};
}
export function ingest(db,items,observed,{start=0,end=Number.MAX_SAFE_INTEGER}={}){
 if(!Number.isSafeInteger(observed)||observed<=0||!Array.isArray(items))throw Error('INVALID_OBSERVATION');
 const stats={added:0,duplicate:0,corrected:0,unknown:0,rejected:0,stale:0};
 return db.transaction(()=>{
  for(const item of items){
   const r=normalize(item);
   if(!r||r.k<start||r.k>=end||r.k>=observed){stats.rejected++;continue}
   const last=rows(db,'SELECT * FROM result_version WHERE fixture_id=? ORDER BY observed DESC LIMIT 1',r.id)[0];
   if(last&&last.observed>observed){stats.stale++;continue}
   if(last&&[last.league_id,last.kickoff,last.home_id,last.away_id,last.status,last.hg,last.ag].every((v,i)=>v===[r.league,r.k,r.home,r.away,r.status,r.hg,r.ag][i])){stats.duplicate++;continue}
   if(last&&last.observed===observed)throw Error('CONFLICTING_FIXTURE_AT_SAME_OBSERVATION');
   db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',r.id,observed,r.league,r.k,r.home,r.away,r.status,r.hg,r.ag);
   if(r.status==='unknown')stats.unknown++;else if(last)stats.corrected++;else stats.added++;
  }
  return stats;
 });
}
export function lastMatches(db,team,kickoff,asOf,limit=10){
 if(!positiveId(team)||!Number.isSafeInteger(kickoff)||kickoff<=0||!Number.isSafeInteger(asOf)||asOf>kickoff||!Number.isInteger(limit)||limit<1||limit>50)throw Error('INVALID_HISTORY_QUERY');
 // Keep only latest known revision per fixture, before prediction time. Never use future knowledge.
 return rows(db,'SELECT r.* FROM result_version r WHERE (r.home_id=? OR r.away_id=?) AND r.kickoff<? AND r.observed<=? AND r.status=? AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id AND v.observed<=?) ORDER BY r.kickoff DESC,r.fixture_id DESC LIMIT ?',Number(team),Number(team),kickoff,asOf,'finished',asOf,limit).map(r=>{
  const home=r.home_id===Number(team),gf=home?r.hg:r.ag,ga=home?r.ag:r.hg;
  return {fixtureId:r.fixture_id,leagueId:r.league_id,kickoff:r.kickoff,venue:home?'home':'away',opponentId:home?r.away_id:r.home_id,gf,ga,btts:gf>0&&ga>0,result:gf>ga?'W':gf===ga?'D':'L'};
 });
}
export function coverage(db,team,kickoff,asOf,limit=10){
 const matches=lastMatches(db,team,kickoff,asOf,limit);
 return {complete:matches.length===limit,count:matches.length,matches};
}
export function totals(db){
 return rows(db,'SELECT COUNT(*) AS fixtures, SUM(CASE WHEN r.status=? THEN 1 ELSE 0 END) AS finished, SUM(CASE WHEN r.status=? THEN 1 ELSE 0 END) AS unknown FROM result_version r WHERE observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id)','finished','unknown')[0];
}
const parts=t=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t*1000)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
function londonSix(y,m,d){
 const target=Date.UTC(y,m-1,d,6)/1000;let s=target;
 for(let i=0;i<3;i++){const p=parts(s);s+=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)/1000}
 return s;
}
function split(start,end){const out=[];for(let s=start;s<end;s+=DAY)out.push({start:s,end:Math.min(s+DAY,end)});return out}
export function dailyPlan(now){
 if(!Number.isSafeInteger(now))throw Error('INVALID_NOW');
 const p=parts(now),d=p.day-(p.hour<6?1:0),end=londonSix(p.year,p.month,d),prev=londonSix(p.year,p.month,d-1),prior=londonSix(p.year,p.month,d-2);
 return {cycle:String(end),cutoff:end,windows:[...split(prev,end).map(w=>({...w,kind:'daily'})),...split(prior,prev).map(w=>({...w,kind:'recheck'}))]};
}
export function pathFor(window,page,status='finished'){
 if(!Number.isSafeInteger(window.start)||!Number.isSafeInteger(window.end)||window.end<=window.start||window.end-window.start>DAY||!Number.isInteger(page)||page<1||!['finished','unknown'].includes(status))throw Error('INVALID_WINDOW');
 return '/v1/fixtures?'+new URLSearchParams({status,start_time:String(window.start),end_time:String(window.end),per_page:'100',page:String(page)});
}
// Only accepts an injected central-HUB adapter. The caller must acquire the shared account permit per page.
// No independent poller, no fallback request per team. One caller at a time is a deployment invariant.
export async function fetchWindow(db,{cycle,window,status='finished',fetchPage,acquirePermit,observed,maxRequests=10}){
 if(typeof fetchPage!=='function'||typeof acquirePermit!=='function'||!Number.isInteger(maxRequests)||maxRequests<1)throw Error('CENTRAL_ADAPTER_REQUIRED');
 const key=[cycle,window.start,window.end,status].join(':');
 const prior=rows(db,'SELECT * FROM sync_state WHERE run_key=?',key)[0];
 if(prior?.done)return {state:'complete',requests:0,alreadyDone:true};
 let page=prior?.next_page??1,used=0;
 const save=(done)=>db.exec('INSERT INTO sync_state VALUES(?,?,?,?) ON CONFLICT(run_key) DO UPDATE SET next_page=excluded.next_page, done=excluded.done, requests=excluded.requests',key,page,done,(prior?.requests??0)+used);
 while(used<maxRequests){
  if(!await acquirePermit()) {save(0);return {state:'deferred_budget',requests:used,nextPage:page}}
  used++;
  let r;try{r=await fetchPage(pathFor(window,page,status))}catch(e){save(0);return {state:'deferred_transport',requests:used,nextPage:page}}
  if(r?.status===429){save(0);return {state:'deferred_429',requests:used,nextPage:page,retryAfter:r.retryAfter??null}}
  if(r?.status!==200||r.body?.success!==1||!Array.isArray(r.body?.data)||r.body.data.length>100||r.body.pagination?.page!==page||typeof r.body.pagination?.has_more!=='boolean'||(r.body.pagination.has_more&&r.body.data.length===0)){save(0);return {state:'deferred_invalid_response',requests:used,nextPage:page}}
  if(r.body.data.some(f=>f.status!==status)){save(0);return {state:'deferred_status_mismatch',requests:used,nextPage:page}}
  // Each page commits idempotently before the cursor advances; crash/replay cannot duplicate results.
  ingest(db,r.body.data,observed,{start:window.start,end:window.end});
  if(!r.body.pagination.has_more){save(1);return {state:'complete',requests:used}}
  page++;save(0);
 }
 return {state:'deferred_budget',requests:used,nextPage:page};
}
