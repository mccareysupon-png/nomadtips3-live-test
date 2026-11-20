import {coverage,ingest,normalize,DAY} from './history.mjs';
const id=v=>/^[1-9]\d{0,15}$/.test(String(v??''))&&Number.isSafeInteger(Number(v))?Number(v):null;
const all=(db,q,...args)=>Array.from(db.exec(q,...args));
export function initBackfill(db){
 db.exec('CREATE TABLE IF NOT EXISTS backfill_plan(cycle TEXT NOT NULL, league_id INTEGER NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, targets TEXT NOT NULL, next_page INTEGER NOT NULL, state TEXT NOT NULL, requests INTEGER NOT NULL, not_before INTEGER NOT NULL, PRIMARY KEY(cycle,league_id))');
}
export function planBackfill(db,fixtures,now,cycle){
 if(!Array.isArray(fixtures)||!Number.isSafeInteger(now)||!cycle)throw Error('BAD_PLAN');
 const groups=new Map();let upcoming=0,eligible=0;const teams=new Set(),missing=new Set(),leagues=new Set();let invalid=0;
 for(const f of fixtures){
  if(f.boardState!=='scheduled'||f.status!=='scheduled')continue;
  const k=Number.isFinite(f.kickoffAt)?Math.floor(f.kickoffAt/1000):Math.floor(Date.parse(f.kickoffUtc)/1000);
  if(!Number.isSafeInteger(k)||k<=now)continue;
  const l=id(f.league?.id),h=id(f.home?.id),a=id(f.away?.id);if(!l||!h||!a||h===a){invalid++;continue}
  upcoming++;leagues.add(l);let complete=true;
  for(const t of [h,a]){teams.add(t);if(!coverage(db,t,k,now).complete){complete=false;missing.add(t);if(!groups.has(l))groups.set(l,new Set());groups.get(l).add(t)}}
  if(complete)eligible++;
 }
 db.transaction(()=>{
  for(const [l,targets] of groups){
   // Use fixed window and stable descending order throughout each cycle.
   // First pass 365 days; any uncovered teams remain explicitly unresolved.
   db.exec('INSERT OR IGNORE INTO backfill_plan VALUES(?,?,?,?,?,1,?,0,0)',String(cycle),l,now-365*DAY,now,JSON.stringify([...targets].sort((a,b)=>a-b)),'pending');
  }
 });
 return {upcoming,leagues:leagues.size,teams:teams.size,missingTeams:missing.size,eligible,invalid,queuedLeagues:groups.size,...planSummary(db,cycle)};
}
export function planSummary(db,cycle){
 const a=all(db,'SELECT state,COUNT(*) AS n, SUM(requests) AS req FROM backfill_plan WHERE cycle=? GROUP BY state',String(cycle));
 const states={};let requests=0,queued=0;for(const x of a){states[x.state]=x.n;requests+=x.req;queued+=x.n}
 return {queueEntries:queued,queueStates:states,backfillRequests:requests,initialLookbackDays:365,gateway:'NOT_CONNECTED'};
}
export function leaguePath(r){
 if(!id(r.league_id)||!Number.isSafeInteger(r.start_at)||!Number.isSafeInteger(r.end_at)||r.end_at<=r.start_at||!Number.isSafeInteger(r.next_page)||r.next_page<1)throw Error('BAD_QUEUE_ENTRY');
 return '/v1/leagues/'+r.league_id+'/fixtures?'+new URLSearchParams({status:'finished',start_time:String(r.start_at),end_time:String(r.end_at),order:'desc',per_page:'100',page:String(r.next_page)});
}
// Testable page consumer. No API key, no standalone network, no alarm.
// Production integration must inject ONE authenticated centrally rate-limited gateway.
// The gateway itself must reserve quota atomically with Live/Rich and observe 429 responses.
export async function processLeaguePage(db,{cycle,league,now,centralGateway}){
 if(typeof centralGateway!=='function')return {state:'blocked_no_gateway',requests:0};
 const r=all(db,'SELECT * FROM backfill_plan WHERE cycle=? AND league_id=?',String(cycle),Number(league))[0];
 if(!r||!['pending','retry'].includes(r.state))return {state:r?.state??'missing',requests:0};
 if(r.not_before>now)return {state:'cooldown',requests:0};
 const targets=JSON.parse(r.targets),complete=()=>targets.every(t=>coverage(db,t,now+1,now).complete);
 const update=(state,page,req,notBefore=0)=>db.exec('UPDATE backfill_plan SET state=?,next_page=?,requests=requests+?,not_before=? WHERE cycle=? AND league_id=?',state,page,req,notBefore,String(cycle),r.league_id);
 if(complete()){update('covered',r.next_page,0);return {state:'covered',requests:0}}
 let v;try{v=await centralGateway(leaguePath(r))}catch{update('retry',r.next_page,0,now+60);return {state:'gateway_error',requests:0}}
 if(v?.state==='deferred_budget'){update('retry',r.next_page,0,now+60);return {state:'deferred_budget',requests:0}}
 if(v?.status===429){const delay=Number(v.retryAfter);update('retry',r.next_page,1,now+(Number.isFinite(delay)&&delay>0?Math.ceil(delay):60));return {state:'deferred_429',requests:1}}
 const b=v?.body,pa=b?.pagination,more=pa?.has_more;
 if(v?.status!==200||b?.success!==1||!Array.isArray(b.data)||b.data.length>100||!pa||pa.page!==r.next_page||typeof more!=='boolean'||(more&&!b.data.length)||b.data.some(f=>!normalize(f)||f.status!=='finished'||Number(f.league?.id)!==r.league_id||f.kickoff_ts<r.start_at||f.kickoff_ts>=r.end_at||/abandon|cancel|award|walkover|extra.time|penalt|suspend|postpon/i.test(String(f.status_reason??'')))){
  update('retry',r.next_page,1,now+60);return {state:'invalid_response',requests:1}
 }
 // Ingest and cursor are idempotent independently: replay same page after crash cannot duplicate fixtures.
 const stats=ingest(db,b.data,now,{start:r.start_at,end:r.end_at});
 const state=complete()?'covered':more?'pending':'exhausted_incomplete';
 update(state,r.next_page+1,1);
 return {state,requests:1,stats}
}
