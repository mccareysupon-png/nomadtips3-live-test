// BALL46 Ultra Bulk Truck V2 — isolated BTTS TEST ONLY.
// One 5USD league-window finished page (<=100) in each of 5 London time
// slots. Calls <=5/day, 1 per slot, with durable reservation BEFORE fetch.
// No per-team fallback, odds calls, 1X2/HCR/Live/Production writes.
// Original provider JSON is permanently stored in this TEST DO.
import {historySlot} from './history-five-rounds.mjs';
import {candidateBttsLeagues,importBttsFinished,bttsLastMatches} from './btts-history-private.mjs';
const rows=(db,q,...a)=>Array.from(db.exec(q,...a));
const valid=x=>/^[1-9]\d*$/.test(String(x??''))&&Number.isSafeInteger(Number(x));
const positive=n=>Number.isSafeInteger(n)&&n>0;
const cap=Object.freeze({maxRoundsPerDay:5,maxProviderCallsPerRound:1,maxRowsPerRound:100,
  maxDailyProviderCalls:5,maxDailyRows:500,legacyCargoWrites:0,sharedLiveWrites:0});
export const B46_BULK_V2_CAP=cap;
export function initBttsBulkV2(db){
 db.exec("CREATE TABLE IF NOT EXISTS b46_btts_bulk_v2_rounds (business_day TEXT NOT NULL, round_no INTEGER NOT NULL, reserved_at INTEGER NOT NULL, completed_at INTEGER, state TEXT NOT NULL, league_id INTEGER, page INTEGER, provider_calls INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0, added INTEGER NOT NULL DEFAULT 0, duplicates INTEGER NOT NULL DEFAULT 0, corrected INTEGER NOT NULL DEFAULT 0, has_more INTEGER, quota_remaining INTEGER, error TEXT, source TEXT NOT NULL DEFAULT '5USD_ULTRA_LEAGUE_WINDOW', PRIMARY KEY(business_day,round_no))");
 db.exec("CREATE TABLE IF NOT EXISTS b46_btts_bulk_v2_originals (business_day TEXT NOT NULL, round_no INTEGER NOT NULL, league_id INTEGER NOT NULL, page INTEGER NOT NULL, fetched_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(business_day,round_no))");
 db.exec("CREATE TABLE IF NOT EXISTS b46_btts_bulk_v2_cursors (league_id INTEGER PRIMARY KEY, next_page INTEGER NOT NULL, updated_at INTEGER NOT NULL, exhausted INTEGER NOT NULL DEFAULT 0)");
}
export function bulkV2State(db,now){
 const slot=historySlot(now);
 const all=rows(db,'SELECT business_day,round_no,state,league_id,page,provider_calls,received,added,duplicates,corrected,has_more,quota_remaining,error FROM b46_btts_bulk_v2_rounds WHERE business_day=? ORDER BY round_no',slot.businessDay);
 const calls=all.reduce((n,x)=>n+x.provider_calls,0);
 const received=all.reduce((n,x)=>n+x.received,0);
 const added=all.reduce((n,x)=>n+x.added,0);
 if(all.length>5||calls>5||received>500)throw Error('BULK_V2_CAP_CORRUPT');
 return {code:'B46_BTTS_BULK_TRUCK_V2',slot:slot.slot,businessDay:slot.businessDay,
   rounds:all,roundsUsed:all.length,providerCalls:calls,received,added,
   remainingCalls:5-calls,remainingSlots:5-all.length,cap};
}
function historyCount(db,team,kickoff,now){
 if(!valid(team)||!positive(kickoff)||kickoff<=now)return 0;
 return bttsLastMatches(db,Number(team),kickoff,now,10).length;
}
export function planBulkV2(db,fixtures,now){
 const state=bulkV2State(db,now);
 if(state.rounds.some(r=>r.round_no===state.slot))return {state:'ALREADY_EXECUTED',current:state};
 const upcoming=Array.isArray(fixtures)?fixtures.filter(f=>f.status==='scheduled'&&
   positive(f.kickoff_ts)&&f.kickoff_ts>now&&positive(Number(f.league?.id))):[];
 const leagues=candidateBttsLeagues(upcoming,100);
 if(!leagues.length)return {state:'NO_UPCOMING_LEAGUES',current:state};
 const used=new Set(state.rounds.map(x=>Number(x.league_id)).filter(positive));
 const ranked=leagues.map(l=>{
   const rel=upcoming.filter(f=>Number(f.league.id)===l.leagueId),teamCounts=new Map();
   let neededTo3=0,neededTo10=0;
   for(const f of rel)for(const team of [f.teams?.home?.id,f.teams?.away?.id]){
     if(!valid(team))continue;
     const key=String(team);
     if(!teamCounts.has(key))teamCounts.set(key,historyCount(db,team,f.kickoff_ts,now));
   }
   for(const count of teamCounts.values()){neededTo3+=Math.max(0,3-count);neededTo10+=Math.max(0,10-count)}
   const cursor=rows(db,'SELECT next_page,exhausted FROM b46_btts_bulk_v2_cursors WHERE league_id=?',l.leagueId)[0];
   return {...l,neededTo3,neededTo10,page:cursor?.exhausted?1:cursor?.next_page??1,
     usedToday:used.has(l.leagueId)};
 }).filter(x=>x.neededTo10>0).sort((a,b)=>Number(a.usedToday)-Number(b.usedToday)||
    b.neededTo3-a.neededTo3||b.upcoming-a.upcoming||
    b.neededTo10-a.neededTo10||a.leagueId-b.leagueId);
 if(!ranked.length)return {state:'HISTORY_TARGETS_COMPLETE',current:state};
 const selected=ranked[0];
 if(!positive(selected.page)||selected.page>200)throw Error('BULK_V2_INVALID_CURSOR');
 return {state:'TARGET_READY',current:state,target:selected,candidateLeagues:ranked.length};
}
function validFinished(f,leagueId,now,start){
 return valid(f?.id)&&Number(f?.league?.id)===leagueId&&
   f?.status==='finished'&&f?.status_code==='full'&&
   Number.isSafeInteger(f.kickoff_ts)&&f.kickoff_ts>=start&&f.kickoff_ts<now&&
   valid(f?.teams?.home?.id)&&valid(f?.teams?.away?.id)&&
   String(f.teams.home.id)!==String(f.teams.away.id)&&
   Number.isSafeInteger(f.goals?.home)&&f.goals.home>=0&&
   Number.isSafeInteger(f.goals?.away)&&f.goals.away>=0;
}
export function validateBulkV2Response(body,leagueId,page,now,start){
 if(body?.success!==1||!Array.isArray(body?.data)||body.data.length>100||
   Number(body.pagination?.page)!==page||typeof body.pagination?.has_more!=='boolean')throw Error('INVALID_ULTRA_BULK_PAGE');
 if(body.data.some(f=>!validFinished(f,leagueId,now,start)))throw Error('INVALID_ULTRA_BULK_FINISHED_DATA');
 if(new Set(body.data.map(x=>String(x.id))).size!==body.data.length)throw Error('DUPLICATE_FIXTURE_IN_ONE_PAGE');
 return body.data;
}
function conclude(db,day,slot,state,now,props={}){
 const old=rows(db,'SELECT state FROM b46_btts_bulk_v2_rounds WHERE business_day=? AND round_no=?',day,slot)[0];
 if(!old||old.state!=='RESERVED')throw Error('BULK_V2_RESERVATION_NOT_HELD');
 db.exec('UPDATE b46_btts_bulk_v2_rounds SET completed_at=?,state=?,received=?,added=?,duplicates=?,corrected=?,has_more=?,quota_remaining=?,error=? WHERE business_day=? AND round_no=?',now,state,props.received??0,props.added??0,props.duplicates??0,props.corrected??0,props.hasMore??null,props.remaining??null,props.error??null,day,slot);
}
export async function runBttsBulkV2(db,{fixtures,now,provider,hubreview=null}={}){
 if(!Number.isSafeInteger(now)||now<=0||typeof provider!=='function')throw Error('INVALID_BULK_V2_EXECUTOR');
 initBttsBulkV2(db);
 const plan=planBulkV2(db,fixtures,now);
 if(plan.state!=='TARGET_READY')return {...plan,providerCalls:0};
 const {current,target}=plan,day=current.businessDay,slot=current.slot;
 if(current.providerCalls>=5||current.roundsUsed>=5)return {state:'DAILY_CAP',providerCalls:0};
 // Optional HUB health check must not call the paid 5USD API.
 // It fails closed if a positive backoff signal is present.
 if(typeof hubreview==='function'){
   const h=await hubreview();
   if(!h?.ok||h?.retryAfterSec>0||h?.lastError) return {state:'HUB_PRIORITY_OR_HEALTH_DEFER',providerCalls:0,
     reason:'UNSAFE_SHARED_PROVIDER_HEALTH'};
 }
 const year=new Date(now*1000).getUTCFullYear();
 const from=Math.floor(Date.UTC(year,0,1)/1000);
 const to=now;
 const params=new URLSearchParams({status:'finished',start_time:String(from),
   end_time:String(to),per_page:'100',page:String(target.page)});
 const path='/v1/leagues/'+target.leagueId+'/fixtures?'+params.toString();
 // Durable claim before the external call: do not replay uncertain requests.
 db.exec("INSERT INTO b46_btts_bulk_v2_rounds (business_day,round_no,reserved_at,state,league_id,page,provider_calls) VALUES (?,?,?,'RESERVED',?,?,1) ON CONFLICT DO NOTHING",day,slot,now,target.leagueId,target.page);
 const changed=rows(db,'SELECT changes() AS n')[0]?.n??0;
 if(changed!==1)return {state:'ALREADY_EXECUTED',providerCalls:0};
 let body,remaining=null;
 try{
   const x=await provider(path);
   body=x.body;remaining=x.remaining??null;
   if(!x.ok)throw Error('PROVIDER_'+String(x.status??'UNKNOWN'));
   if(remaining!==null&&remaining<0)throw Error('INVALID_RATE_HEADER');
   const data=validateBulkV2Response(body,target.leagueId,target.page,now,from);
   const observed=now;
   // Persist full original before import; no truncation of input fields.
   const payload=JSON.stringify(body);
   if(payload.length>1_600_000)throw Error('ORIGINAL_PAYLOAD_TOO_LARGE');
   db.exec('INSERT INTO b46_btts_bulk_v2_originals(business_day,round_no,league_id,page,fetched_at,payload) VALUES(?,?,?,?,?,?)',day,slot,target.leagueId,target.page,observed,payload);
   const stats=importBttsFinished(db,data,observed,{leagueId:target.leagueId,season:String(year)});
   const nextPage=body.pagination.has_more?target.page+1:1;
   db.exec('INSERT INTO b46_btts_bulk_v2_cursors(league_id,next_page,updated_at,exhausted) VALUES(?,?,?,?) ON CONFLICT(league_id) DO UPDATE SET next_page=excluded.next_page,updated_at=excluded.updated_at,exhausted=excluded.exhausted',target.leagueId,nextPage,now,body.pagination.has_more?0:1);
   conclude(db,day,slot,'COMPLETED',now,{received:data.length,
     added:stats.added,duplicates:stats.duplicates,corrected:stats.corrected,
     hasMore:body.pagination.has_more?1:0,remaining});
   return {state:'COMPLETED',target:{leagueId:target.leagueId,leagueName:target.leagueName,
     upcoming:target.upcoming,page:target.page,neededTo3:target.neededTo3},
     received:data.length,...stats,providerCalls:1,remaining,rawPreserved:true,slot,day};
 }catch(e){
   conclude(db,day,slot,'REVIEW_REQUIRED',now,{remaining,error:String(e?.message??e).slice(0,170)});
   return {state:'REVIEW_REQUIRED',reason:String(e?.message??e).slice(0,170),
     providerCalls:1,slot,day,noRetry:true};
 }
}
