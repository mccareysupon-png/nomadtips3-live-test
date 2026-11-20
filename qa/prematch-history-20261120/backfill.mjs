import {coverage,ingest,normalize,DAY} from './history.mjs';
const id=v=>/^[1-9]\d{0,15}$/.test(String(v??''))&&Number.isSafeInteger(Number(v))?Number(v):null;
const season=v=>typeof v==='string'&&/^(?:\d{4}|\d{2}\/\d{2}|\d{4}\/\d{2}|\d{4}\/\d{4})$/.test(v);
const all=(db,q,...args)=>Array.from(db.exec(q,...args));
export function initBackfill(db){
 // Legacy backfill_plan (date-keyed) is retained for audit but NEVER read or executed.
 db.exec('CREATE TABLE IF NOT EXISTS league_seed_v2(league_id INTEGER NOT NULL, scope TEXT NOT NULL, season TEXT, start_at INTEGER, end_at INTEGER, next_page INTEGER NOT NULL, state TEXT NOT NULL, requests INTEGER NOT NULL, not_before INTEGER NOT NULL, PRIMARY KEY(league_id,scope))');
}
// Only provider-confirmed season labels or provider-confirmed no-season fixed windows.
// No inferred season, automatic catalog call, rolling lookback, or daily reset.
export function registerConfirmedScope(db,{leagueId,season:label,start,end,source},now){
 const l=id(leagueId);if(!l||source!=='provider_confirmed'||!Number.isSafeInteger(now))throw Error('UNVERIFIED_SCOPE');
 const seasonal=season(label),window=label==null&&Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>0&&end>start&&end<=now;
 if(!seasonal&&!window)throw Error('UNVERIFIED_SCOPE');
 const scope=seasonal?'season:'+label:'window:'+start+':'+end;
 db.exec('INSERT OR IGNORE INTO league_seed_v2 VALUES(?,?,?,?,?,1,?,0,0)',l,scope,seasonal?label:null,window?start:null,window?end:null,'pending');
 return scope;
}
export function planBackfill(db,fixtures,now,cycle){
 if(!Array.isArray(fixtures)||!Number.isSafeInteger(now)||!cycle)throw Error('BAD_PLAN');
 const teams=new Set(),missing=new Set(),leagues=new Set(),unconfirmed=new Set();let upcoming=0,eligible=0,invalid=0;
 for(const f of fixtures){
  if(f.boardState!=='scheduled'||f.status!=='scheduled')continue;
  const k=Number.isFinite(f.kickoffAt)?Math.floor(f.kickoffAt/1000):Math.floor(Date.parse(f.kickoffUtc)/1000);
  if(!Number.isSafeInteger(k)||k<=now)continue;
  const l=id(f.league?.id),h=id(f.home?.id),a=id(f.away?.id);if(!l||!h||!a||h===a){invalid++;continue}
  upcoming++;leagues.add(l);let complete=true;
  for(const t of [h,a]){teams.add(t);if(!coverage(db,t,k,now).complete){complete=false;missing.add(t)}}
  if(complete)eligible++;else if(!all(db,'SELECT scope FROM league_seed_v2 WHERE league_id=?',l).length)unconfirmed.add(l);
 }
 // Read-only coverage: never enqueue historical scope in a daily cycle.
 return {policy:'JOHN_ONCE_PER_LEAGUE_SEASON_V2',upcoming,leagues:leagues.size,teams:teams.size,missingTeams:missing.size,eligible,invalid,unconfirmedLeagues:unconfirmed.size,queuedLeagues:planSummary(db).queueEntries,...planSummary(db)};
}
export function planSummary(db){
 const a=all(db,'SELECT state,COUNT(*) AS n,SUM(requests) AS req FROM league_seed_v2 GROUP BY state');
 const states={};let requests=0,queued=0;for(const x of a){states[x.state]=x.n;requests+=x.req;queued+=x.n}
 return {queueEntries:queued,queueStates:states,backfillRequests:requests,gateway:'NOT_CONNECTED',legacyDailyQueue:'DISABLED'};
}
export function leaguePath(r){
 if(!id(r.league_id)||!Number.isSafeInteger(r.next_page)||r.next_page<1)throw Error('BAD_QUEUE_ENTRY');
 const q={status:'finished',per_page:'100',page:String(r.next_page)};
 if(season(r.season))q.season=r.season;
 else if(Number.isSafeInteger(r.start_at)&&Number.isSafeInteger(r.end_at)&&r.start_at>0&&r.end_at>r.start_at){q.start_time=String(r.start_at);q.end_time=String(r.end_at)}
 else throw Error('BAD_QUEUE_SCOPE');
 return '/v1/leagues/'+r.league_id+'/fixtures?'+new URLSearchParams(q);
}
// A single serialized caller is required. Never creates a scope or opens a network connection.
// Finish every page ONCE per confirmed scope, not just the ten matches for today's teams.
export async function processLeaguePage(db,{scope,league,now,centralGateway}){
 if(typeof centralGateway!=='function')return {state:'blocked_no_gateway',requests:0};
 const r=all(db,'SELECT * FROM league_seed_v2 WHERE scope=? AND league_id=?',String(scope),Number(league))[0];
 if(!r||!['pending','retry'].includes(r.state))return {state:r?.state??'missing',requests:0};
 if(r.not_before>now)return {state:'cooldown',requests:0};
 const update=(state,page,req,notBefore=0)=>db.exec('UPDATE league_seed_v2 SET state=?,next_page=?,requests=requests+?,not_before=? WHERE scope=? AND league_id=?',state,page,req,notBefore,r.scope,r.league_id);
 // Persist intent before awaiting the gateway: a crash or overlapping dispatch must not re-send silently.
 update('in_flight_review',r.next_page,0);
 let v;try{v=await centralGateway(leaguePath(r))}catch{update('review_transport',r.next_page,0);return {state:'review_transport',requests:0}}
 if(v?.state==='deferred_budget'){update('retry',r.next_page,0,now+60);return {state:'deferred_budget',requests:0}}
 if(v?.status===429){const delay=Number(v.retryAfter);update('retry',r.next_page,1,now+(Number.isFinite(delay)&&delay>0?Math.ceil(delay):60));return {state:'deferred_429',requests:1}}
 const b=v?.body,pa=b?.pagination,more=pa?.has_more;
 if(v?.status!==200||b?.success!==1||!Array.isArray(b.data)||b.data.length>100||!pa||pa.page!==r.next_page||typeof more!=='boolean'||(more&&!b.data.length)||b.data.some(f=>!normalize(f)||f.status!=='finished'||Number(f.league?.id)!==r.league_id||f.kickoff_ts>=now||(r.start_at!=null&&(f.kickoff_ts<r.start_at||f.kickoff_ts>=r.end_at))||/abandon|cancel|award|walkover|extra.time|penalt|suspend|postpon/i.test(String(f.status_reason??'')))){
  update('review_response',r.next_page,1);return {state:'review_response',requests:1}
 }
 const stats=ingest(db,b.data,now,r.start_at==null?{}:{start:r.start_at,end:r.end_at});
 const state=more?'pending':'complete';update(state,r.next_page+1,1);return {state,requests:1,stats}
}
