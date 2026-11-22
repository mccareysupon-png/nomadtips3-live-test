// BALL46 TEST ONLY: confirmed Bet365 Over/Under 2.5 price pickup.
// One already-issued qualifying O/U selection; one provider call per London day.
// A call is reserved before fetching and never retried, even after failures.
// This uses a conservative TEST budget and health guard; shared-account quota
// is NOT atomically reserved inside production HUB. Never claim otherwise.
import {londonAccountingWindow} from './london-cutoff.mjs';
import {parseOuPriceFromExistingPayload} from './ou-verified-price-ingest-v1-test.mjs';
const get=(db,q,...args)=>Array.from(db.exec(q,...args));
const isInt=x=>Number.isSafeInteger(x)&&x>0;
export const OUV1_PICKUP_POLICY=Object.freeze({
 model:'B46_OU_2P5_QUOTE_PICKUP_TEST_V1',quoteMarket:'full_fixture_odds',
 targetLine:2.5,bookmaker:'bet365',
 maxProviderCallsPerLondonDay:1,maxProviderCallsPerTick:1,
 minimumSecondsBeforeKickoff:900,maximumSecondsBeforeKickoff:3*86400,
 maximumFeedAgeSec:3600,maximumHubSnapshotAgeMs:600000,
 maxHubRequestsPerMinute:10,minimumHubRefreshMs:10000,
 maxProviderTimeoutMs:15000,productionWrites:0,sharedQuotaGuarantee:false
});
export function initOuPricePickup(db){
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_price_request_v1_test (fixture_id INTEGER PRIMARY KEY,business_day TEXT NOT NULL,requested_at INTEGER NOT NULL,completed_at INTEGER,state TEXT NOT NULL,provider_calls INTEGER NOT NULL CHECK(provider_calls=1),price_over REAL,price_under REAL,selected_price REAL,quote_source TEXT,error TEXT,observed_at INTEGER)");
 db.exec("CREATE INDEX IF NOT EXISTS b46_ou_price_request_day_v1 ON b46_ou_price_request_v1_test(business_day,requested_at)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_verified_quote_v1_test(fixture_id INTEGER PRIMARY KEY,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,pick TEXT NOT NULL,line REAL NOT NULL CHECK(line=2.5),price_over REAL NOT NULL,price_under REAL NOT NULL,selected_price REAL NOT NULL,observed_at INTEGER NOT NULL,kickoff INTEGER NOT NULL,source TEXT NOT NULL,bookmaker TEXT NOT NULL,model TEXT NOT NULL)");
}
const currentDay=now=>londonAccountingWindow(now).businessDay;
export function readOuPricePickupState(db,now){
 initOuPricePickup(db);
 const day=currentDay(now);
 const used=get(db,"SELECT COUNT(*) AS n FROM b46_ou_price_request_v1_test WHERE business_day=?",day)[0]?.n??0;
 const all=get(db,"SELECT COUNT(*) AS n,COALESCE(SUM(state='PRICED_IMPORTED'),0) AS priced,COALESCE(SUM(state='PRICE_NOT_OFFERED'),0) AS noOffer,COALESCE(SUM(state LIKE 'HTTP_%'),0) AS httpFailed FROM b46_ou_price_request_v1_test")[0];
 const recent=get(db,"SELECT fixture_id,business_day,requested_at,completed_at,state,price_over,price_under,selected_price,quote_source,error,observed_at FROM b46_ou_price_request_v1_test ORDER BY requested_at DESC LIMIT 20");
 const priced=Number(get(db,"SELECT COUNT(*) AS n FROM b46_ou_verified_quote_v1_test")[0]?.n??0);
 return {system:'O_U_VERIFIED_PRICE_PICKUP_TEST',day,mode:'ACTIVE_TEST',
  policy:OUV1_PICKUP_POLICY,providerCallsToday:Number(used),remainingToday:Math.max(0,1-Number(used)),
  lifetimeRequests:Number(all?.n??0),pricedImported:priced,noOffer:Number(all?.noOffer??0),
  httpFailures:Number(all?.httpFailed??0),recent,providerCallsThisRead:0};
}
export function selectOuPriceCandidate(db,fixtures,now){
 if(!Array.isArray(fixtures)||!isInt(now))throw Error('INVALID_OU_QUOTE_SELECTION');
 const byId=new Map(fixtures.filter(x=>x?.status==='scheduled').map(x=>[String(x.id),x]));
 const q=[
  "SELECT p.fixture_id,p.home_id,p.away_id,p.kickoff,p.picked_at,p.pick,p.line,p.probability,p.price,p.status,p.model",
  "FROM b46_ou_pick_v1_test p WHERE p.status='PENDING' AND p.price IS NULL",
  "AND p.line=2.5 AND p.probability>=0.64 AND p.picked_at<=? AND p.kickoff>? AND p.kickoff<=?",
  "AND NOT EXISTS(SELECT 1 FROM b46_ou_price_request_v1_test q WHERE q.fixture_id=p.fixture_id)",
  "ORDER BY p.kickoff,p.fixture_id LIMIT 80"
 ].join(' ');
 const unpriced=get(db,q,now,now+OUV1_PICKUP_POLICY.minimumSecondsBeforeKickoff,
  now+OUV1_PICKUP_POLICY.maximumSecondsBeforeKickoff);
 for(const p of unpriced){
  if(!['OVER_2.5','UNDER_2.5'].includes(p.pick)||!isInt(p.fixture_id)||!isInt(p.home_id)||!isInt(p.away_id))continue;
  const f=byId.get(String(p.fixture_id));
  if(!f||Number(f.teams?.home?.id)!==p.home_id||Number(f.teams?.away?.id)!==p.away_id)continue;
  if(!isInt(f.kickoff_ts)||f.kickoff_ts<=now+OUV1_PICKUP_POLICY.minimumSecondsBeforeKickoff)continue;
  const actualKickoff=Math.min(p.kickoff,f.kickoff_ts);
  if(actualKickoff<=now+OUV1_PICKUP_POLICY.minimumSecondsBeforeKickoff)continue;
  return {...p,actualKickoff};
 }
 return null;
}
export function inspectOuPickupHealth(h){
 if(h?.ok!==true||h.stale!==false||h.lastError||
   !Number.isFinite(h.ageMs)||h.ageMs<0||h.ageMs>OUV1_PICKUP_POLICY.maximumHubSnapshotAgeMs||
   Number(h.retryAfterSec??0)>0)return {allowed:false,reason:'HUB_NOT_HEALTHY_OR_STALE'};
 if(Number(h.accountLimitPerMinute)!==40||
   !Number.isFinite(h.estimatedBulkRequestsPerMinute)||
   h.estimatedBulkRequestsPerMinute>OUV1_PICKUP_POLICY.maxHubRequestsPerMinute||
   !Number.isFinite(h.refreshMs)||h.refreshMs<OUV1_PICKUP_POLICY.minimumHubRefreshMs)
  return {allowed:false,reason:'UNVERIFIED_SHARED_CAPACITY'};
 // During accelerated 10s/15s LIVE refresh, inspect the account-wide 5USD
 // quota evidence already observed and validated by the existing HUB V3.
 // Not an atomic shared reservation: still strictly one external call/day.
 if(h.refreshMs<30000&&(
  h.bulkSpeedV3Ready!==true||
  h.bulkSpeedV3?.quotaObserved!==true||
  h.bulkSpeedV3?.accelerationAvailable!==true||
  h.bulkSpeedV3?.configuredSeconds*1000!==h.refreshMs
 ))return {allowed:false,reason:'ACCELERATED_HUB_QUOTA_NOT_VERIFIED'};
 return {allowed:true,reason:h.refreshMs<30000?
  'HUB_ACCOUNT_HEADROOM_OBSERVED_BEST_EFFORT_ONE_PER_DAY':
  'HEALTHY_ONE_REQUEST_PER_DAY_BEST_EFFORT'};
}
const safeError=v=>String(v??'UNKNOWN').replace(/[^A-Z0-9_-]/gi,'_').slice(0,70);
export async function runOuPricePickup(db,{fixtures,now,feedAt,hubreview,provider,
  clock=()=>Math.floor(Date.now()/1000)}={}){
 if(!isInt(now)||!Array.isArray(fixtures)||typeof hubreview!=='function'||typeof provider!=='function')
  throw Error('INVALID_OU_PRICE_RUN_INPUT');
 const start=readOuPricePickupState(db,now);
 if(start.remainingToday===0)return {state:'DAILY_QUOTE_CAP',providerCalls:0,transport:start};
 if(!isInt(feedAt)||feedAt>now+60||now-feedAt>OUV1_PICKUP_POLICY.maximumFeedAgeSec)
  return {state:'FRESH_SCHEDULED_FEED_REQUIRED',providerCalls:0,transport:start};
 const candidate=selectOuPriceCandidate(db,fixtures,now);
 if(!candidate)return {state:'NO_NEW_QUALIFIED_UNPRICED_FIXTURE',providerCalls:0,transport:start};
 const health=inspectOuPickupHealth(await hubreview());
 if(!health.allowed)return {state:health.reason,providerCalls:0,transport:start};
 let reserved=false;
 db.transaction(()=>{
  const used=Number(get(db,"SELECT COUNT(*) AS n FROM b46_ou_price_request_v1_test WHERE business_day=?",start.day)[0]?.n??0);
  if(used>=OUV1_PICKUP_POLICY.maxProviderCallsPerLondonDay)return;
  db.exec("INSERT INTO b46_ou_price_request_v1_test(fixture_id,business_day,requested_at,state,provider_calls) VALUES(?,?,?,'RESERVED',1) ON CONFLICT(fixture_id) DO NOTHING",
   candidate.fixture_id,start.day,now);
  reserved=Number(get(db,'SELECT changes() AS n')[0]?.n??0)===1;
 });
 if(!reserved)return {state:'DUPLICATE_OR_DAY_CAP',providerCalls:0};
 let state='RESERVED',error=null,priced=null,observed=clock(),providerRemaining=null;
 // market is intentionally omitted: one native API call returns BOTH fixed ladder and moving goal_line.
 const path='/v1/fixtures/'+candidate.fixture_id+'/odds';
 try{
  const response=await provider(path);
  observed=clock();providerRemaining=response?.remaining??null;
  if(!response?.ok){
   state='HTTP_'+safeError(response?.status);
   error='PROVIDER_HTTP_'+safeError(response?.status);
  }else{
   const parsed=parseOuPriceFromExistingPayload(response.body,
     {fixtureId:candidate.fixture_id,homeId:candidate.home_id,awayId:candidate.away_id,
      pick:candidate.pick,kickoff:candidate.actualKickoff,observed,now:observed,line:2.5});
   state=parsed.state;
   if(state==='PRICED'){
    db.transaction(()=>{
     const current=get(db,"SELECT status,price,pick,kickoff FROM b46_ou_pick_v1_test WHERE fixture_id=?",candidate.fixture_id)[0];
     if(!current||current.status!=='PENDING'||current.price!==null||
      current.pick!==candidate.pick||current.kickoff!==candidate.kickoff||
      observed+OUV1_PICKUP_POLICY.minimumSecondsBeforeKickoff>candidate.actualKickoff){
       state='QUOTE_NO_LONGER_APPLICABLE';return;
     }
     db.exec("INSERT INTO b46_ou_verified_quote_v1_test(fixture_id,home_id,away_id,pick,line,price_over,price_under,selected_price,observed_at,kickoff,source,bookmaker,model) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fixture_id) DO NOTHING",
      candidate.fixture_id,candidate.home_id,candidate.away_id,candidate.pick,2.5,parsed.priceOver,parsed.priceUnder,
      parsed.selectedPrice,observed,candidate.actualKickoff,parsed.source,'bet365',candidate.model);
     if(Number(get(db,'SELECT changes() AS n')[0]?.n??0)!==1){state='DUPLICATE_VERIFIED_QUOTE';return}
     db.exec("UPDATE b46_ou_pick_v1_test SET price=? WHERE fixture_id=? AND status='PENDING' AND price IS NULL AND pick=? AND kickoff=?",
      parsed.selectedPrice,candidate.fixture_id,candidate.pick,candidate.kickoff);
     if(Number(get(db,'SELECT changes() AS n')[0]?.n??0)!==1)throw Error('OU_QUOTE_PICK_UPDATE_RACE');
     priced={fixtureId:candidate.fixture_id,pick:candidate.pick,source:parsed.source,
      priceOver:parsed.priceOver,priceUnder:parsed.priceUnder,selectedPrice:parsed.selectedPrice,
      observedAt:observed,preKickoff:true};
     state='PRICED_IMPORTED';
    });
   }
  }
 }catch(e){state='ERROR_NO_RETRY';error=String(e?.message??e).slice(0,145)}
 db.exec("UPDATE b46_ou_price_request_v1_test SET completed_at=?,state=?,price_over=?,price_under=?,selected_price=?,quote_source=?,error=?,observed_at=? WHERE fixture_id=?",
  observed,state,priced?.priceOver??null,priced?.priceUnder??null,priced?.selectedPrice??null,
  priced?.source??null,error,observed,candidate.fixture_id);
 return {state,providerCalls:1,fixtureId:candidate.fixture_id,qualifiedPick:candidate.pick,
  priced,providerRemaining,productionWrites:0,transport:readOuPricePickupState(db,observed)};
}
