// BALL46 PREMATCH O/U V2, ISOLATED TEST ONLY.
// Cached first; at most one guarded new fixture-odds request per London day,
// sharing the EXISTING V1 O/U request/limiter table. No post-issue repricing.
// Full Market forwards /v1/fixtures/{id}/odds?bookmakers=... through HUB.
// This is BEST EFFORT shared quota health gating, NOT an atomic HUB quota lease.
import {buildOuValueModels,extractFullMarketOuOffers,chooseBestOuValue,
 OU_VALUE_V2_MODEL} from './ou-value-screener-v2-test.mjs';
import {initOuPricePickup,readOuPricePickupState,inspectOuPickupHealth} from './ou-price-pickup-v1-test.mjs';
import {londonAccountingWindow} from './london-cutoff.mjs';
const get=(db,sql,...args)=>Array.from(db.exec(sql,...args));
const positive=x=>Number.isSafeInteger(x)&&x>0;
export const OU_VALUE_V2_BRIDGE_POLICY=Object.freeze({
 mode:'TEST_V2_GUARDED_ONE_CANDIDATE_PRICE_REQUEST',
 cacheFirst:true,oneSelectionPerFixture:true,noOldLedgerChanges:true,
 minBeforeKickoffSec:900,maxAheadSec:3*86400,
 maxPaidAttemptsPerLondonDay:1,sharedWithOuV1:true,
 noRetries:true,maximumPriceAgeMs:120000,
 needsHubHealth:true,needsFullMarketHealth:true,
 controlledBySameExistingDailyBudget:true,
 sharedProviderQuotaIsAtomic:false,
 onlyFullMarketService:true,productionWrites:0
});
export function initOuValueV2PriceBridge(db){
 initOuPricePickup(db);
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_value_v2_provider_attempt_test (fixture_id INTEGER PRIMARY KEY, business_day TEXT NOT NULL, requested_at INTEGER NOT NULL, completed_at INTEGER, state TEXT NOT NULL, bookmaker TEXT, line REAL, price REAL, ev REAL, error TEXT, upstream_added INTEGER)");
 db.exec("CREATE INDEX IF NOT EXISTS b46_ou_value_v2_provider_day_test ON b46_ou_value_v2_provider_attempt_test(business_day,requested_at)");
}
export function readOuValueV2BridgeState(db,now){
 initOuValueV2PriceBridge(db);
 const budget=readOuPricePickupState(db,now);
 return {policy:OU_VALUE_V2_BRIDGE_POLICY,
  sharedOuDailyBudget:{day:budget.day,used:budget.providerCallsToday,remaining:budget.remainingToday},
  recent:get(db,'SELECT fixture_id,business_day,requested_at,completed_at,state,bookmaker,line,price,ev,error,upstream_added FROM b46_ou_value_v2_provider_attempt_test ORDER BY requested_at DESC LIMIT 30'),
  providerCallsThisRead:0};
}
async function bestCacheMissing(models,market,now){
 const candidates=[];
 for(let i=0;i<models.length;i+=70){
  const batch=models.slice(i,i+70),result=await market('/board-cache',{
   method:'POST',body:{fixtureIds:batch.map(m=>String(m.fixtureId))}});
  if(result?.ok!==true||result.externalRequestsAdded!==0||
    !result.entries||typeof result.entries!=='object'||Array.isArray(result.entries))
   return {state:'CACHE_UNVERIFIED',candidates:[]};
  for(const m of batch){
   const entry=result.entries[String(m.fixtureId)]??null;
   const parsed=extractFullMarketOuOffers(entry,m.fixtureId,now,m.kickoff);
   if(!parsed.offers.length)candidates.push(m);
  }
 }
 return {state:'READY',candidates};
}
function eligibleModel(m,now){
 return positive(m.fixtureId)&&positive(m.homeId)&&positive(m.awayId)&&
  m.homeId!==m.awayId&&
  positive(m.kickoff)&&m.kickoff>now+OU_VALUE_V2_BRIDGE_POLICY.minBeforeKickoffSec&&
  m.kickoff<=now+OU_VALUE_V2_BRIDGE_POLICY.maxAheadSec&&
  Number.isFinite(m.expectedTotalGoals)&&m.expectedTotalGoals>0&&
  Number(m.homeHistory)+Number(m.awayHistory)>=1;
}
function chooseCandidate(db,models,now){
 const filtered=models.filter(m=>eligibleModel(m,now)&&
  !get(db,'SELECT 1 AS found FROM b46_ou_value_v2_shadow_test WHERE fixture_id=?',m.fixtureId).length&&
  !get(db,'SELECT 1 AS found FROM b46_ou_price_request_v1_test WHERE fixture_id=?',m.fixtureId).length);
 filtered.sort((a,b)=>{
  // Prefer nearer scheduled matches with enough team history, but never
  // guess an O/U side before an authentic bookmaker quote arrives.
  const ah=Number(a.homeHistory)+Number(a.awayHistory);
  const bh=Number(b.homeHistory)+Number(b.awayHistory);
  return Number(bh>=10)-Number(ah>=10)||
   a.kickoff-b.kickoff||bh-ah||a.fixtureId-b.fixtureId;
 });
 return filtered[0]??null;
}
function reserveOnce(db,m,now){
 let reserved=false;
 const day=londonAccountingWindow(now).businessDay;
 db.transaction(()=>{
  const used=Number(get(db,'SELECT COUNT(*) AS n FROM b46_ou_price_request_v1_test WHERE business_day=?',day)[0]?.n??0);
  if(used>=OU_VALUE_V2_BRIDGE_POLICY.maxPaidAttemptsPerLondonDay||
   get(db,'SELECT 1 AS found FROM b46_ou_value_v2_shadow_test WHERE fixture_id=?',m.fixtureId).length)return;
  db.exec("INSERT INTO b46_ou_price_request_v1_test(fixture_id,business_day,requested_at,state,provider_calls) VALUES(?,?,?,'V2_RESERVED_BEFORE_FETCH',1) ON CONFLICT(fixture_id) DO NOTHING",
   m.fixtureId,day,now);
  if(Number(get(db,'SELECT changes() AS n')[0]?.n??0)!==1)return;
  db.exec("INSERT INTO b46_ou_value_v2_provider_attempt_test(fixture_id,business_day,requested_at,state) VALUES(?,?,?,'RESERVED')",
   m.fixtureId,day,now);
  reserved=true;
 });
 return {reserved,day};
}
export async function captureOneValueV2Price(db,{fixtures,now,market,hubHealth,clock=()=>Math.floor(Date.now()/1000)}={}){
 if(!Array.isArray(fixtures)||!positive(now)||typeof market!=='function'||
  typeof hubHealth!=='function'||typeof clock!=='function')
  throw Error('BAD_V2_PRICE_BRIDGE_ARGUMENTS');
 initOuValueV2PriceBridge(db);
 const out={mode:'OU_V2_PREMATCH_GUARDED_PRICE_BRIDGE_TEST',
  state:'NOT_ATTEMPTED',eligibleModels:0,unpricedModels:0,candidateId:null,
  selected:null,budgetReserved:0,fullMarketUpstreamAdded:0,
  providerCalls:0,productionWrites:0,legacyPicksChanged:false,
  noPostIssueReprice:true};
 const budget=readOuPricePickupState(db,now);
 if(budget.remainingToday<=0){out.state='DAILY_SHARED_OU_CAP';return out}
 const {models}=buildOuValueModels(db,fixtures,now);
 out.eligibleModels=models.length;
 const remaining=models.filter(m=>eligibleModel(m,now)&&
  !get(db,'SELECT 1 AS found FROM b46_ou_value_v2_shadow_test WHERE fixture_id=?',m.fixtureId).length&&
  !get(db,'SELECT 1 AS found FROM b46_ou_price_request_v1_test WHERE fixture_id=?',m.fixtureId).length);
 if(!remaining.length){out.state='NO_UNPRICED_NEW_CANDIDATE';return out}
 let missing;
 try{missing=await bestCacheMissing(remaining,market,now)}
 catch(e){out.state='CACHE_READ_ERROR';out.error=String(e?.message??e).slice(0,100);return out}
 if(missing.state!=='READY'){out.state=missing.state;return out}
 out.unpricedModels=missing.candidates.length;
 const candidate=chooseCandidate(db,missing.candidates,now);
 if(!candidate){out.state='NO_MISSING_MARKET_CANDIDATE';return out}
 out.candidateId=candidate.fixtureId;
 // Both health reads are cache/control endpoints and do not contact 5USD.
 let allowed=false;
 try{
  const [hub,fullMarket]=await Promise.all([hubHealth(),market('/health',{method:'GET'})]);
  allowed=inspectOuPickupHealth(hub).allowed===true&&fullMarket?.ok===true&&
   Number(fullMarket.retryAfterSec??0)===0&&
   Number(fullMarket.remainingLocalBudget)>0&&
   (fullMarket.blockedUntil==null||Number(fullMarket.blockedUntil)<=Date.now());
 }catch{}
 if(!allowed){out.state='SHARED_QUOTA_NOT_VERIFIED';return out}
 const ticket=reserveOnce(db,candidate,now);
 if(!ticket.reserved){out.state='SHARED_DAY_CAP_OR_DUPLICATE';return out}
 out.budgetReserved=1;
 let state='PRICE_NOT_OFFERED',selection=null,err=null,upstream=0;
 try{
  const fetched=await market('/fixture-odds?fixtureId='+candidate.fixtureId,{method:'GET'});
  upstream=Number(fetched?.externalRequestsAdded??0);
  if(fetched?.ok!==true||String(fetched.fixtureId)!==String(candidate.fixtureId)){
   state='SOURCE_MISMATCH_OR_NOT_OK';
  }else{
   const at=clock();
   if(!positive(at)||at>=candidate.kickoff-OU_VALUE_V2_BRIDGE_POLICY.minBeforeKickoffSec){
    state='KICKOFF_BUFFER_EXPIRED';
   }else{
    const entry={fullOdds:fetched.fullOdds,fetchedAt:fetched.fetchedAt,
      ageMs:fetched.ageMs,stale:fetched.stale};
    const parsed=extractFullMarketOuOffers(entry,candidate.fixtureId,at,candidate.kickoff);
    if(parsed.offers.length){
     const decision=chooseBestOuValue(candidate,parsed.offers,at);
     if(decision.selected){
      selection=decision.selected;
      state='VALUE_PICK_PRICED';
     }else state='NO_POSITIVE_EV_WITH_PRICE_OVER_1P50';
    }else state=parsed.status;
   }
  }
 }catch(e){state='FULL_MARKET_FETCH_FAILED_NO_RETRY';err=String(e?.message??e).slice(0,100)}
 const finish=clock(),end=positive(finish)?finish:now;
 db.exec("UPDATE b46_ou_price_request_v1_test SET completed_at=?,state=?,error=? WHERE fixture_id=?",
  end,'V2_'+state,err,candidate.fixtureId);
 db.exec("UPDATE b46_ou_value_v2_provider_attempt_test SET completed_at=?,state=?,bookmaker=?,line=?,price=?,ev=?,error=?,upstream_added=? WHERE fixture_id=?",
  end,state,selection?.bookmaker??null,selection?.line??null,
  selection?.price??null,selection?.ev??null,err,
  Number.isFinite(upstream)?upstream:0,candidate.fixtureId);
 out.state=state;out.selected=selection;
 out.fullMarketUpstreamAdded=Number.isFinite(upstream)?upstream:0;
 out.providerCalls=out.fullMarketUpstreamAdded;
 return out;
}
