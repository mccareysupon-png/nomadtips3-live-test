// BALL46 isolated PRE-MATCH O/U engine: an observer BEFORE LIVE, never a hook
// in the LIVE Engine or the HUB request path. TEST branch only, NOT deployed.
//
// HUB scheduled/upcoming/waiting -> historical football model -> EXISTING
// Full Market /board-cache -> Asian O/U EV -> existing immutable V2 shadow.
//
// Do not require or consume 1X2 odds to admit a pre-match fixture.
// No paid provider request unless explicitly enabled through the already
// guarded V2 Full Market service path. Do not duplicate price parser/model.
import {
 screenOuValueV2,recordOuValueShadow,OU_VALUE_V2_POLICY
} from './ou-value-screener-v2-test.mjs';
import {
 captureOneValueV2Price
} from './ou-value-v2-provider-bridge-test.mjs';

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
 minPriceExclusive:OU_VALUE_V2_POLICY.minimumPriceExclusive,
 minEV:OU_VALUE_V2_POLICY.minimumEV,
 useExistingOULedger:true,
 issueOnePerFixture:true,
 providerPickupOffUnlessExplicitlyEnabled:true,
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
  // Only existing isolated V2 price bridge can reserve the one/day O/U
  // request through existing Full Market service-> HUB bridge. The hook here
  // cannot use raw 5USD credentials or bypass V1's daily ledger.
  const priced=await captureOneValueV2Price(db,{
   fixtures:batch,now,market,hubHealth,clock
  });
  result.priceBridge={
   state:priced.state,candidateId:priced.candidateId??null,
   budgetReserved:priced.budgetReserved??0,
   providerCalls:priced.providerCalls??0,
   ...(priced.selected?{selected:{
    fixtureId:priced.selected.fixtureId,
    bookmaker:priced.selected.bookmaker,line:priced.selected.line,
    side:priced.selected.side,price:priced.selected.price,
    ev:priced.selected.ev
   }}:{})
  };
  if(priced.selected){
   const added=recordOuValueShadow(db,[priced.selected],priced.selected.pickedAt);
   result.locked={
    added:result.locked.added+added.added,
    duplicate:result.locked.duplicate+added.duplicate,
    rejected:result.locked.rejected+added.rejected
   };
  }
  result.providerCalls=result.priceBridge.providerCalls;
 }
 result.status='SCREENED_PREMATCH';
 return result;
}
