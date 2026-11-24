// BALL46 isolated PRE-MATCH O/U engine: an observer BEFORE LIVE, never a hook
// in the LIVE Engine or the HUB request path. TEST Worker deployed; fix wiring here.
//
// HUB scheduled/upcoming/waiting -> historical football model -> EXISTING
// Full Market /board-cache -> Asian O/U EV -> existing immutable V2 shadow.
//
// Do not require or consume 1X2 odds to admit a pre-match fixture.
// Use the existing Full Market HTTP service and the existing V2 quote parser;
// new TEST pickup is capped by ONE call/tick and FOUR shared O/U calls/day.
import {
 screenOuValueV2,recordOuValueShadow,buildOuValueModels,
 extractFullMarketOuOffers,chooseBestOuValue,OU_VALUE_V2_POLICY
} from './ou-value-screener-v2-test.mjs';
import {initOuValueV2PriceBridge} from './ou-value-v2-provider-bridge-test.mjs';
import {inspectOuPickupHealth} from './ou-price-pickup-v1-test.mjs';
import {londonAccountingWindow} from './london-cutoff.mjs';

export const PREMATCH_OU_ENGINE_V1_POLICY=Object.freeze({
 version:'B46_PREMATCH_OU_ENGINE_V1_TEST',
 input:'HUB_CACHED_UPCOMING_WAITING',
 bookmakerSource:'EXISTING_FULL_MARKET_SERVICE',
 cachePricePath:'/board-cache',
 priceFallbackPath:'/fixture-odds?fixtureId=<ID>',
 needs1X2Odds:false,
 acceptedProviderStates:['scheduled','upcoming','waiting','not_started','ns'],
 exclusivelyPreKickoff:true,
 minimumSecondsBeforeKickoff:OU_VALUE_V2_POLICY.minSecondsBeforeKickoff,
 scanBatchLimit:OU_VALUE_V2_POLICY.maxCandidatesPerCycle,
 maximumFeedAgeSeconds:3600,
 maxLookAheadSeconds:OU_VALUE_V2_POLICY.maxLookaheadSec,
 minPriceInclusive:OU_VALUE_V2_POLICY.minimumPriceInclusive,
 maxPriceInclusive:OU_VALUE_V2_POLICY.maximumPriceInclusive,
 minEV:OU_VALUE_V2_POLICY.minimumEV,
 useExistingOULedger:true,
 issueOnePerFixture:true,
 providerPickupOffUnlessExplicitlyEnabled:true,
 maxFullMarketRequestsPerTick:1,
 maxSharedOuRequestsPerLondonDay:4,
 hubQuotaAuthorityAtomic:false,
 preservesLiveEngine:true,
 liveEngineCalls:0,
 productionWrites:0
});

const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const sec=x=>{
 const v=typeof x==='number'?x:Number(x);
 if(Number.isSafeInteger(v)&&v>1e12)return Math.floor(v/1000);
 if(Number.isSafeInteger(v)&&v>1e9)return v;
 if(typeof x==='string'&&x.trim()){
  const parsed=Date.parse(x);return Number.isFinite(parsed)?Math.floor(parsed/1000):null;
 }
 return null;
};
const norm=x=>String(x??'').trim().toLowerCase().replace(/[\s-]+/g,'_');
const allowed=new Set(PREMATCH_OU_ENGINE_V1_POLICY.acceptedProviderStates);
const blocked=new Set([
 'live','inplay','in_play','1h','2h','ht','ft','finished','final','ended','closed',
 'suspended','postponed','cancelled','canceled','abandoned','delayed','unknown'
]);
function preMatchStatus(f){
 const states=[f?.boardState,f?.status].filter(x=>x!=null&&String(x).trim()).map(norm);
 return states.length>0&&states.every(x=>allowed.has(x)&&!blocked.has(x));
}
function normalize(f,now){
 if(!preMatchStatus(f))return null;
 const fixtureId=Number(f.fixtureId??f.fixture_id??f.id);
 const home=f.home??f.teams?.home,away=f.away??f.teams?.away;
 const homeId=Number(home?.id),awayId=Number(away?.id);
 const kickoff=sec(f.kickoffUtc??f.kickoffAt??f.kickoff_ts);
 if(!id(fixtureId)||!id(homeId)||!id(awayId)||homeId===awayId||
  !Number.isSafeInteger(kickoff)||
  kickoff<=now+PREMATCH_OU_ENGINE_V1_POLICY.minimumSecondsBeforeKickoff||
  kickoff>now+PREMATCH_OU_ENGINE_V1_POLICY.maxLookAheadSeconds)return null;
 const leagueId=Number(f.league?.id);
 return {
  id:String(fixtureId),status:'scheduled',kickoff_ts:kickoff,
  ...(id(leagueId)?{league:{id:leagueId,name:String(f.league?.name??'')}}:{}),
  teams:{
   home:{id:homeId,name:String(home?.name??homeId).slice(0,160)},
   away:{id:awayId,name:String(away?.name??awayId).slice(0,160)}
  }
 };
}
export function upcomingWaitingFromHub(snapshot,now,{max=1000}={}){
 if(!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(max)||max<1||max>1000)
  throw Error('INVALID_PREMATCH_HUB_INPUT');
 const base={version:PREMATCH_OU_ENGINE_V1_POLICY.version,
  status:'DEFERRED_HUB_CACHE',fixtures:[],
  stats:{received:0,eligible:0,accepted:0,duplicate:0,rejected:0,
   missing1x2Accepted:0,liveRejected:0,providerCalls:0}};
 if(snapshot?.ok!==true||snapshot.cacheOnly!==true||
  snapshot.stale===true||!Array.isArray(snapshot.fixtures))return base;
 const observed=sec(snapshot.fetchedAt);
 if(!observed||observed>now+60||
  now-observed>PREMATCH_OU_ENGINE_V1_POLICY.maximumFeedAgeSeconds)
  return {...base,status:'DEFERRED_HUB_STALE'};
 const fixtures=new Map(),stats={...base.stats,received:snapshot.fixtures.length};
 for(const raw of snapshot.fixtures){
  if(['live','inplay','in_play','1h','2h','ht','ft','finished'].some(
   state=>norm(raw?.boardState)===state||norm(raw?.status)===state))stats.liveRejected++;
  const f=normalize(raw,now);
  if(!f){stats.rejected++;continue}
  stats.eligible++;
  if(fixtures.has(f.id)){stats.duplicate++;continue}
  if(fixtures.size>=max)continue;
  if(!raw?.providerOdds?.odds?.['1x2']?.closing)stats.missing1x2Accepted++;
  fixtures.set(f.id,f);
 }
 const rows=[...fixtures.values()].sort((a,b)=>
  a.kickoff_ts-b.kickoff_ts||a.id.localeCompare(b.id));
 stats.accepted=rows.length;
 return {version:PREMATCH_OU_ENGINE_V1_POLICY.version,
  status:'READY',fixtures:rows,stats,providerCalls:0};
}
function sliceRoundRobin(fixtures,cursor){
 const len=fixtures.length;
 if(!len)return {batch:[],nextCursor:0};
 const offset=Math.max(0,Number.isSafeInteger(cursor)?cursor:0)%len;
 const limit=PREMATCH_OU_ENGINE_V1_POLICY.scanBatchLimit;
 const count=Math.min(len,limit);
 const batch=Array.from({length:count},(_,i)=>fixtures[(offset+i)%len]);
 return {batch,nextCursor:(offset+count)%len};
}

// Price retrieval uses the same FULL MARKET service endpoint as ball46.com.
// This is deliberately NOT a second API client, a second price ledger or a new
// model. Existing legacy V1 requests and this V2 test queue share the
// b46_ou_price_request_v1_test reservation table.
const get=(db,sql,...args)=>Array.from(db.exec(sql,...args));
const validNumber=x=>typeof x==='number'&&Number.isFinite(x);
function safeError(error){
 return String(error?.message??error??'UNKNOWN').replace(/[^a-z0-9_-]/gi,'_').slice(0,85);
}
function sharedQuoteBudget(db,now){
 initOuValueV2PriceBridge(db);
 const day=londonAccountingWindow(now).businessDay;
 const used=Number(get(db,"SELECT COUNT(*) AS n FROM b46_ou_price_request_v1_test WHERE business_day=?",day)[0]?.n??0);
 return {day,used,remaining:Math.max(0,PREMATCH_OU_ENGINE_V1_POLICY.maxSharedOuRequestsPerLondonDay-used)};
}
export const readPreMatchOuQuoteBudget=(db,now)=>sharedQuoteBudget(db,now);
function reserveQuote(db,model,now){
 const day=londonAccountingWindow(now).businessDay;
 let reserved=false;
 db.transaction(()=>{
  const used=Number(get(db,"SELECT COUNT(*) AS n FROM b46_ou_price_request_v1_test WHERE business_day=?",day)[0]?.n??0);
  if(used>=PREMATCH_OU_ENGINE_V1_POLICY.maxSharedOuRequestsPerLondonDay)return;
  if(get(db,"SELECT 1 AS found FROM b46_ou_value_v2_shadow_test WHERE fixture_id=?",model.fixtureId).length)return;
  db.exec("INSERT INTO b46_ou_price_request_v1_test(fixture_id,business_day,requested_at,state,provider_calls) VALUES(?,?,?,'PREMATCH_OU_RESERVED',1) ON CONFLICT(fixture_id) DO NOTHING",
   model.fixtureId,day,now);
  if(Number(get(db,'SELECT changes() AS n')[0]?.n??0)!==1)return;
  db.exec("INSERT INTO b46_ou_value_v2_provider_attempt_test(fixture_id,business_day,requested_at,state) VALUES(?,?,?,'PREMATCH_RESERVED') ON CONFLICT(fixture_id) DO NOTHING",
   model.fixtureId,day,now);
  reserved=true;
 });
 return reserved;
}
function quotaHealthy(h,full){
 const hstatus=inspectOuPickupHealth(h);
 return hstatus.allowed===true&&full?.ok===true&&
  validNumber(Number(full.remainingLocalBudget))&&Number(full.remainingLocalBudget)>=2&&
  Number(full.retryAfterSec??0)===0&&
  (full.blockedUntil==null||Number(full.blockedUntil)<=Date.now());
}
// One fresh actual quote request per tick, only for a historic-model-qualified
// fixture not already issued or requested, at least 15 minutes before kickoff.
// A valid cached quote is never requested twice, even if EV was insufficient.
// Once the market returns, lock one fixed side+book+line+price if it passes V2 EV.
async function fetchOneFullMarketOu(db,{fixtures,now,market,hubHealth,clock}){
 const budget=sharedQuoteBudget(db,now);
 const out={state:'NO_MARKET_REQUEST',candidateId:null,budgetReserved:0,
  providerCalls:0,pricedFixtures:0,offers:0,selected:null,
  locked:{added:0,duplicate:0,rejected:0},budget};
 if(!budget.remaining){out.state='TEST_SHARED_OU_DAILY_CAP';return out}
 const {models}=buildOuValueModels(db,fixtures,now);
 const eligible=models.filter(m=>
  m.kickoff>now+900&&
  !get(db,"SELECT 1 AS found FROM b46_ou_value_v2_shadow_test WHERE fixture_id=?",m.fixtureId).length&&
  !get(db,"SELECT 1 AS found FROM b46_ou_price_request_v1_test WHERE fixture_id=?",m.fixtureId).length);
 if(!eligible.length){out.state='NO_MODELLED_NEW_UPCOMING';return out}
 // Reuse Full Market's zero-provider-call board cache before quota is reserved.
 const unpriced=[];
 try{
  for(let i=0;i<eligible.length;i+=70){
   const group=eligible.slice(i,i+70);
   const cached=await market('/board-cache',{
    method:'POST',body:{fixtureIds:group.map(m=>String(m.fixtureId))}});
   if(cached?.ok!==true||cached.externalRequestsAdded!==0||
    !cached.entries||typeof cached.entries!=='object'){
    out.state='UNVERIFIED_FULLMARKET_CACHE';return out;
   }
   for(const m of group){
    const entry=cached.entries[String(m.fixtureId)]??null;
    if(!extractFullMarketOuOffers(entry,m.fixtureId,now,m.kickoff).offers.length)
     unpriced.push(m);
   }
  }
 }catch(e){out.state='FULLMARKET_CACHE_UNAVAILABLE';out.error=safeError(e);return out}
 if(!unpriced.length){out.state='FRESH_QUOTES_ALREADY_IN_CACHE';return out}
 unpriced.sort((a,b)=>{
  const ah=a.homeHistory+a.awayHistory,bh=b.homeHistory+b.awayHistory;
  return Number(bh>=10)-Number(ah>=10)||a.kickoff-b.kickoff||bh-ah||a.fixtureId-b.fixtureId;
 });
 const model=unpriced[0];out.candidateId=model.fixtureId;
 let allowed=false;
 try{
  const [hub,full]=await Promise.all([hubHealth(),market('/health',{method:'GET'})]);
  allowed=quotaHealthy(hub,full);
 }catch{}
 if(!allowed){out.state='FULLMARKET_OR_HUB_QUOTA_UNVERIFIED';return out}
 // One atomic DO SQLite reservation; no retry for this fixture.
 if(!reserveQuote(db,model,now)){out.state='RESERVATION_ALREADY_EXISTS_OR_CAP';return out}
 out.budgetReserved=1;
 let status='NO_PRICE',selection=null,err=null,upstream=0,offered=0;
 try{
  const payload=await market('/fixture-odds?fixtureId='+model.fixtureId,{method:'GET'});
  upstream=Number(payload?.externalRequestsAdded??0);
  if(payload?.ok!==true||Number(payload.fixtureId)!==model.fixtureId){
   status='FULLMARKET_RESPONSE_MISMATCH';
  }else{
   const at=clock();
   if(!Number.isSafeInteger(at)||at>=model.kickoff-900){
    status='NO_LONGER_PREMATCH';
   }else{
    const entry={fullOdds:payload.fullOdds,fetchedAt:payload.fetchedAt,
     ageMs:payload.ageMs,stale:payload.stale};
    const parsed=extractFullMarketOuOffers(entry,model.fixtureId,at,model.kickoff);
    offered=parsed.offers.length;
    if(offered){
     const best=chooseBestOuValue(model,parsed.offers,at);
     out.pricedFixtures=1;out.offers=offered;
     if(best.selected){selection=best.selected;status='PRICE_LOCKED'}
     else status='PRICE_RECEIVED_NO_VALUE';
    }else status=parsed.status;
   }
  }
 }catch(e){status='FULLMARKET_FETCH_ERROR_NO_RETRY';err=safeError(e)}
 const atEnd=clock();
 if(selection){
  try{
   out.locked=recordOuValueShadow(db,[selection],selection.pickedAt);
   if(out.locked.added!==1){status='PRICE_NOT_LOCKED';selection=null}
  }catch(e){status='LOCK_ERROR';err=safeError(e);selection=null}
 }
 db.transaction(()=>{
  db.exec("UPDATE b46_ou_price_request_v1_test SET completed_at=?,state=?,error=? WHERE fixture_id=?",
   atEnd,'PREMATCH_'+status,err,model.fixtureId);
  db.exec("UPDATE b46_ou_value_v2_provider_attempt_test SET completed_at=?,state=?,bookmaker=?,line=?,price=?,ev=?,error=?,upstream_added=? WHERE fixture_id=?",
   atEnd,status,selection?.bookmaker??null,selection?.line??null,
   selection?.price??null,selection?.ev??null,err,
   Number.isFinite(upstream)?upstream:0,model.fixtureId);
 });
 out.state=status;out.selected=selection;
 out.providerCalls=Number.isFinite(upstream)?upstream:0;
 out.budget=sharedQuoteBudget(db,atEnd);
 return out;
}

export async function runPreMatchOuEngineV1(db,{
 snapshot,now,market,hubHealth=null,
 cursor=0,enablePaidQuoteFallback=false,
 clock=()=>Math.floor(Date.now()/1000)
}={}){
 if(!db||!Number.isSafeInteger(now)||typeof market!=='function'||typeof clock!=='function')
  throw Error('INVALID_PREMATCH_OU_ENGINE');
 const feed=upcomingWaitingFromHub(snapshot,now);
 const result={
  engine:PREMATCH_OU_ENGINE_V1_POLICY.version,
  stage:'PREMATCH_ONLY_BEFORE_LIVE',status:feed.status,
  feed:feed.stats,scan:{checked:0,modeled:0,cacheHits:0,pricedFixtures:0,
   prices:0,valueQualified:0},
  locked:{added:0,duplicate:0,rejected:0},
  cursorIn:cursor,cursorOut:0,
  priceBridge:{state:'DISABLED_CACHE_ONLY',budgetReserved:0,providerCalls:0},
  providerCalls:0,liveEngineCalls:0,productionWrites:0
 };
 if(feed.status!=='READY')return result;
 const {batch,nextCursor}=sliceRoundRobin(feed.fixtures,cursor);
 result.cursorOut=nextCursor;
 if(!batch.length){result.status='NO_PREMATCH_FIXTURES';return result}
 // Reuse O/U V2 math, named-bookmaker parser and Asian full/quarter settlement;
 // use FULL MARKET's read-only board cache. It never makes provider requests.
 const screened=await screenOuValueV2(db,{fixtures:batch,now,market});
 result.scan={
  checked:screened.checked,modeled:screened.modeled,
  cacheHits:screened.cached,pricedFixtures:screened.pricedFixtures,
  prices:screened.offers,valueQualified:screened.qualified,
  unavailable:screened.unavailable
 };
 result.locked=recordOuValueShadow(db,screened.selected,now);
 if(enablePaidQuoteFallback){
  if(typeof hubHealth!=='function')throw Error('HUB_QUOTA_AUTHORITY_REQUIRED');
  const priced=await fetchOneFullMarketOu(db,{
   fixtures:batch,now,market,hubHealth,clock
  });
  result.priceBridge={state:priced.state,candidateId:priced.candidateId,
   budgetReserved:priced.budgetReserved,providerCalls:priced.providerCalls,
   pricedFixtures:priced.pricedFixtures,offers:priced.offers,
   budget:priced.budget,
   ...(priced.error?{error:priced.error}:{}),
   ...(priced.selected?{selected:{
    fixtureId:priced.selected.fixtureId,bookmaker:priced.selected.bookmaker,
    line:priced.selected.line,side:priced.selected.side,
    price:priced.selected.price,ev:priced.selected.ev
   }}:{})
  };
  result.scan.pricedFixtures+=priced.pricedFixtures;
  result.scan.prices+=priced.offers;
  if(priced.selected)result.scan.valueQualified++;
  result.locked={
   added:result.locked.added+priced.locked.added,
   duplicate:result.locked.duplicate+priced.locked.duplicate,
   rejected:result.locked.rejected+priced.locked.rejected
  };
  result.providerCalls=priced.providerCalls;
 }
 result.status='SCREENED_PREMATCH';
 return result;
}
