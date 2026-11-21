// Test-only history vehicle: at most FIVE cache-import windows per
// 06:00 Europe/London accounting day, <=100 unique finished matches/window.
// No upstream HTTP requests, no independent 5USD key, no quota bypass.
// Central provider history gateway remains hard off until Live quota integration.
import {londonAccountingWindow} from './london-cutoff.mjs';
import {ingest} from './history.mjs';

export const HISTORY_MAX_ROUNDS=5;
export const HISTORY_MAX_ROWS_PER_ROUND=100;
export const HISTORY_MAX_ROWS_PER_DAY=500;
const localFmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'});
const cutoffHours=[6,10,14,18,22];
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const score=x=>typeof x==='number'&&Number.isInteger(x)&&x>=0;
const toSecond=v=>{
 const n=Number(v);
 if(Number.isSafeInteger(n)&&n>1e12)return Math.floor(n/1000);
 if(Number.isSafeInteger(n)&&n>1e9)return n;
 if(typeof v!=='string')return 0;
 const parsed=Date.parse(v);return Number.isFinite(parsed)?Math.floor(parsed/1000):0;
};
export function historySlot(now){
 const win=londonAccountingWindow(now),hour=Number(localFmt.format(new Date(now*1000)));
 if(!Number.isInteger(hour)||hour<0||hour>23)throw Error('INVALID_LONDON_HOUR');
 const slot=hour>=22||hour<6?5:hour>=18?4:hour>=14?3:hour>=10?2:1;
 return {businessDay:win.businessDay,slot,slotLocal:cutoffHours[slot-1]+':00',cutoffLocal:'06:00',timezone:'Europe/London',maxRounds:HISTORY_MAX_ROUNDS,maxPerRound:HISTORY_MAX_ROWS_PER_ROUND,maxPerDay:HISTORY_MAX_ROWS_PER_DAY};
}
const rows=(db,q,...args)=>Array.from(db.exec(q,...args));
export function initHistoryRounds(db){
 db.exec("CREATE TABLE IF NOT EXISTS prematch_history_rounds (business_day TEXT NOT NULL, round_no INTEGER NOT NULL, attempted_at INTEGER NOT NULL, source TEXT NOT NULL, state TEXT NOT NULL, imported INTEGER NOT NULL DEFAULT 0, received INTEGER NOT NULL DEFAULT 0, provider_calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(business_day,round_no))");
}
export function historyRoundState(db,now){
 const slot=historySlot(now),records=rows(db,'SELECT round_no,attempted_at,source,state,imported,received,provider_calls FROM prematch_history_rounds WHERE business_day=? ORDER BY round_no',slot.businessDay);
 const total=records.reduce((s,r)=>s+r.imported,0),providerCalls=records.reduce((s,r)=>s+r.provider_calls,0);
 if(total>HISTORY_MAX_ROWS_PER_DAY||records.length>HISTORY_MAX_ROUNDS)throw Error('HISTORY_BUDGET_CORRUPT');
 return {...slot,completed:records.length,imported:total,remainingRounds:HISTORY_MAX_ROUNDS-records.length,remainingCapacity:HISTORY_MAX_ROWS_PER_DAY-total,providerCalls,records,source:'NORMAL_HUB_CACHED_FINISHED',historyProviderGateway:'DISABLED_PENDING_SHARED_QUOTA'};
}
function toFinished(f,observed){
 if(!positive(f?.fixtureId)||!positive(f?.league?.id)||!positive(f?.home?.id)||!positive(f?.away?.id)||String(f.home.id)===String(f.away.id))return null;
 if(f.status!=='finished'||f.boardState!=='finished'||f.statusCode!=='full'||!score(f.goals?.home)||!score(f.goals?.away))return null;
 const kickoff=toSecond(f.kickoffUtc??f.kickoffAt);
 if(!positive(kickoff)||kickoff>=observed)return null;
 return {id:Number(f.fixtureId),league:{id:Number(f.league.id)},teams:{home:{id:Number(f.home.id)},away:{id:Number(f.away.id)}},kickoff_ts:kickoff,status:'finished',status_code:'full',goals:{home:f.goals.home,away:f.goals.away}};
}
export function importHistoryRoundFromCache(db,snapshot,now){
 const s=historySlot(now);initHistoryRounds(db);
 if(snapshot?.ok!==true||snapshot?.cacheOnly!==true||snapshot?.stale===true||!Array.isArray(snapshot.fixtures))return {state:'DEFERRED_CACHE_UNAVAILABLE',...historyRoundState(db,now)};
 const observed=toSecond(snapshot.fetchedAt);
 if(!positive(observed)||observed>now+60||now-observed>3600)return {state:'DEFERRED_CACHE_STALE',...historyRoundState(db,now)};
 const before=historyRoundState(db,now);
 if(before.records.some(r=>r.round_no===s.slot))return {state:'ALREADY_EXECUTED',...before};
 if(before.completed>=HISTORY_MAX_ROUNDS||before.remainingCapacity<=0)return {state:'DAILY_LIMIT_REACHED',...before};
 const seen=new Set(),candidates=[];
 for(const raw of snapshot.fixtures){
  const f=toFinished(raw,observed);if(!f||seen.has(f.id))continue;seen.add(f.id);
  if(rows(db,'SELECT 1 FROM result_version WHERE fixture_id=? LIMIT 1',f.id).length)continue;
  candidates.push(f);
 }
 candidates.sort((a,b)=>b.kickoff_ts-a.kickoff_ts||a.id-b.id);
 const selected=candidates.slice(0,Math.min(HISTORY_MAX_ROWS_PER_ROUND,before.remainingCapacity));
 // Reserve the current 4h window BEFORE importing; an uncertain failure
 // cannot trigger a replay or exceed 100 rows/round.
 const reserved=db.exec("INSERT INTO prematch_history_rounds(business_day,round_no,attempted_at,source,state,imported,received,provider_calls) VALUES(?,?,?,'NORMAL_HUB_CACHED_FINISHED','RESERVED',0,0,0) ON CONFLICT DO NOTHING",s.businessDay,s.slot,now);
 if(Number(reserved?.changes??0)!==1)return {state:'ALREADY_EXECUTED',...historyRoundState(db,now)};
 let imported=0;
 try{
  const stats=selected.length?ingest(db,selected,observed):{added:0,corrected:0,duplicate:0,rejected:0};
  imported=stats.added;
  if(imported>HISTORY_MAX_ROWS_PER_ROUND)throw Error('ROUND_LIMIT_BROKEN');
  db.exec("UPDATE prematch_history_rounds SET state='COMPLETED',received=?,imported=? WHERE business_day=? AND round_no=?",selected.length,imported,s.businessDay,s.slot);
  return {state:'COMPLETED',current:{slot:s.slot,attemptedAt:now,received:selected.length,imported},...historyRoundState(db,now)};
 }catch(e){
  db.exec("UPDATE prematch_history_rounds SET state='REVIEW_REQUIRED' WHERE business_day=? AND round_no=?",s.businessDay,s.slot);
  return {state:'REVIEW_REQUIRED',error:String(e.message).slice(0,100),...historyRoundState(db,now)};
 }
}
