import {DAY,dailyPlan,normalize,ingest,pathFor} from './history.mjs';
import {registerConfirmedScope} from './backfill.mjs';
const rows=(db,q,...a)=>Array.from(db.exec(q,...a));
const id=x=>/^[1-9]\d{0,15}$/.test(String(x??''))&&Number.isSafeInteger(Number(x))?Number(x):null;
const label=s=>typeof s==='string'&&/^(?:\d{4}|\d{2}\/\d{2}|\d{4}\/\d{2}|\d{4}\/\d{4})$/.test(s);
export function initJohn(db){
 db.exec('CREATE TABLE IF NOT EXISTS john_tasks(task_key TEXT PRIMARY KEY,kind TEXT NOT NULL,cycle TEXT NOT NULL,path TEXT NOT NULL,next_page INTEGER NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL,not_before INTEGER NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS john_catalog(league_id INTEGER PRIMARY KEY,seasons TEXT NOT NULL,observed INTEGER NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS john_unknown(fixture_id INTEGER PRIMARY KEY,kickoff INTEGER NOT NULL,state TEXT NOT NULL,last_cycle TEXT,attempts INTEGER NOT NULL)');
}
export function nextCutoff(now){
 // Test actual future London calendar boundary; works at both DST changes.
 for(let h=1;h<=26;h++){const d=dailyPlan(now+h*3600);if(d.cutoff>now)return d.cutoff}
 throw Error('NEXT_CUTOFF');
}
export function prepareDay(db,now){
 const d=dailyPlan(now);
 for(const w of d.windows){
  const key='bulk:'+d.cycle+':'+w.kind+':'+w.start+':'+w.end;
  db.exec('INSERT OR IGNORE INTO john_tasks VALUES(?,?,?,?,1,?,0,0)',key,w.kind,d.cycle,pathFor(w,1),'pending');
 }
 return d;
}
// Called explicitly once for initial setup (or operator-approved catalog refresh).
// Scope registration never happens from today's missing teams.
export function prepareCatalog(db,setupId,activeSince){
 if(typeof setupId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(setupId)||!Number.isSafeInteger(activeSince)||activeSince<=0)throw Error('INVALID_CATALOG_SETUP');
 const key='catalog:'+setupId;
 const path='/v1/leagues?'+new URLSearchParams({include:'seasons',active_since:String(activeSince),per_page:'100',page:'1'});
 db.exec('INSERT OR IGNORE INTO john_tasks VALUES(?,?,?,?,1,?,0,0)',key,'catalog',setupId,path,'pending');return key
}
export function registerCatalogCurrent(db,ids,now){
 if(!Array.isArray(ids))throw Error('INVALID_SCOPE');
 let ready=0,missing=0,noSeason=0;
 for(const l of new Set(ids.map(id).filter(Boolean))){
  const c=rows(db,'SELECT * FROM john_catalog WHERE league_id=?',l)[0];
  if(!c){missing++;continue}
  const s=JSON.parse(c.seasons);
  if(!s.length){noSeason++;continue} // explicit verified window required, never guess.
  const current=s.find(x=>x.current===true);
  if(!current){missing++;continue}
  registerConfirmedScope(db,{leagueId:l,season:current.season,source:'provider_confirmed'},now);ready++;
 }
 return {ready,missing,noSeason};
}
// Use cache and stored results first. Track only genuine unresolved rows; retain
// unresolved records beyond the 72-hour HUB cache, and never treat unknown as 0:0.
export function observeUnresolved(db,fixtures,now){
 for(const f of fixtures){
  const fid=id(f.fixtureId??f.id),k=Number.isFinite(f.kickoffAt)?Math.floor(f.kickoffAt/1000):f.kickoff_ts;
  if(!fid||!Number.isSafeInteger(k)||k>now)continue;
  const st=f.boardState??f.status;
  if(st==='finished'){
   const actual=rows(db,'SELECT status FROM result_version WHERE fixture_id=? ORDER BY observed DESC LIMIT 1',fid)[0];
   if(actual?.status==='finished')db.exec('UPDATE john_unknown SET state=? WHERE fixture_id=?','resolved',fid);
  }else if(st==='unknown'||(['scheduled','live','in_play'].includes(st)&&k<=now-4*3600)){
   db.exec('INSERT INTO john_unknown VALUES(?,?,?,NULL,0) ON CONFLICT(fixture_id) DO UPDATE SET state=excluded.state,kickoff=excluded.kickoff',fid,k,'pending');
  }
 }
}
export function prepareUnknown(db,now){
 const cycle=dailyPlan(now).cycle;
 // Results ingested through daily/recheck may already resolve a pending fixture.
 const a=rows(db,'SELECT * FROM john_unknown WHERE state=? ORDER BY kickoff,fixture_id','pending');
 for(const f of a){
  const last=rows(db,'SELECT status FROM result_version WHERE fixture_id=? ORDER BY observed DESC LIMIT 1',f.fixture_id)[0];
  if(last?.status==='finished'){db.exec('UPDATE john_unknown SET state=? WHERE fixture_id=?','resolved',f.fixture_id);continue}
  if(f.last_cycle===cycle)continue;
  const key='unknown:'+cycle+':'+f.fixture_id;
  db.exec('INSERT OR IGNORE INTO john_tasks VALUES(?,?,?,?,1,?,0,0)',key,'unknown',cycle,'/v1/fixtures/'+f.fixture_id,'pending');
 }
}
export function johnSummary(db){
 const a=rows(db,'SELECT kind,state,COUNT(*) AS n,SUM(attempts) AS requests FROM john_tasks GROUP BY kind,state');
 return {tasks:a,registeredCatalogLeagues:rows(db,'SELECT COUNT(*) AS n FROM john_catalog')[0].n,unresolved:rows(db,'SELECT COUNT(*) AS n FROM john_unknown WHERE state=?','pending')[0].n,execution:'DISABLED_UNTIL_SHARED_HUB_AUTHORITY'};
}
function validCatalog(v){return id(v?.id)&&Array.isArray(v.seasons)&&v.seasons.every(s=>label(s.season)&&typeof s.current==='boolean')&&new Set(v.seasons.map(s=>s.season)).size===v.seasons.length&&(!v.seasons.length||v.seasons.filter(s=>s.current).length===1)}
// Exactly one page per invocation, invoked only by serialized central scheduler.
// Review on bad response; no auto retry of ambiguous failures. 429 persists cooldown.
export async function executeJohnStep(db,{key,now,centralGateway}){
 if(typeof centralGateway!=='function')return {state:'blocked_no_gateway',requests:0};
 const t=rows(db,'SELECT * FROM john_tasks WHERE task_key=?',key)[0];
 if(!t||!['pending','retry'].includes(t.state))return {state:t?.state??'missing',requests:0};
 if(t.not_before>now)return {state:'cooldown',requests:0};
 if(t.kind==='unknown'){
  const fid=id(t.path.split('/').pop()),r=rows(db,'SELECT * FROM john_unknown WHERE fixture_id=?',fid)[0],last=rows(db,'SELECT status FROM result_version WHERE fixture_id=? ORDER BY observed DESC LIMIT 1',fid)[0];
  if(!r||r.state==='resolved'||last?.status==='finished'||t.cycle!==dailyPlan(now).cycle||r.last_cycle===t.cycle){db.exec('UPDATE john_tasks SET state=? WHERE task_key=?','superseded',key);return {state:'superseded',requests:0}}
 }
 const set=(state,p=t.next_page,attempts=0,notBefore=0)=>db.exec('UPDATE john_tasks SET state=?,next_page=?,attempts=attempts+?,not_before=? WHERE task_key=?',state,p,attempts,notBefore,key);
 const u=new URL(t.path,'https://history.invalid');if(t.kind!=='unknown')u.searchParams.set('page',String(t.next_page));
 const path=u.pathname+u.search;
 const write=(state,p=t.next_page)=>{set(state,p,1);return {state,requests:1}};
 // After persisted request intent, a crash is ambiguous; no automatic replay.
 set('in_flight_review');
 let v;try{v=await centralGateway(path)}catch{return write('review_transport')}
 if(v?.state==='deferred_budget'){set('retry',t.next_page,0,now+60);return {state:'deferred_budget',requests:0}}
 if(v?.status===429){set('retry',t.next_page,1,now+Math.max(60,Number(v.retryAfter)||60));return {state:'deferred_429',requests:1}}
 if(v?.status!==200||v?.body?.success!==1)return write('review_response');
 if(t.kind==='unknown'){
  const f=v.body.data,fid=id(u.pathname.split('/').pop()),known=rows(db,'SELECT * FROM john_unknown WHERE fixture_id=?',fid)[0];
  if(!known||id(f?.id)!==fid||f.kickoff_ts!==known.kickoff||!['finished','unknown','scheduled','in_play'].includes(f.status)||(f.status==='finished'&&!normalize(f)))return write('review_response');
  if(f.status==='finished'||f.status==='unknown'){const n=normalize(f);if(!n)return write('review_response');ingest(db,[f],now)}
  db.exec('UPDATE john_unknown SET state=?,last_cycle=?,attempts=attempts+1 WHERE fixture_id=?',f.status==='finished'?'resolved':'pending',t.cycle,fid);
  return write('complete');
 }
 const b=v.body,pa=b.pagination;
 if(!Array.isArray(b.data)||b.data.length>100||pa?.page!==t.next_page||typeof pa.has_more!=='boolean'||(pa.has_more&&!b.data.length))return write('review_response');
 if(t.kind==='catalog'){
  if(b.data.some(x=>!validCatalog(x)))return write('review_response');
  db.transaction(()=>{for(const l of b.data)db.exec('INSERT INTO john_catalog VALUES(?,?,?) ON CONFLICT(league_id) DO UPDATE SET seasons=excluded.seasons,observed=excluded.observed',id(l.id),JSON.stringify(l.seasons),now)});
 }else{
  const start=Number(u.searchParams.get('start_time')),end=Number(u.searchParams.get('end_time'));
  if(b.data.some(f=>!normalize(f)||f.status!=='finished'||f.kickoff_ts<start||f.kickoff_ts>=end||f.kickoff_ts>=now))return write('review_response');
  ingest(db,b.data,now,{start,end});
  observeUnresolved(db,b.data,now);
 }
 return write(pa.has_more?'pending':'complete',t.next_page+1)
}
