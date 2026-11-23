// BALL46 Pre-Match O/U — capture an authentic, line-exact payout at the SAME
// selection run, then issue an immutable prediction + price atomically.
// TEST Worker only. Reuses the existing Full Market read cache and 1/day paid
// provider reservation; no post-issue price updates, no new model formulas.
import {parseOuPriceFromExistingPayload} from './ou-verified-price-ingest-v1-test.mjs';
import {OU_MODEL,OU_POLICY,initOu} from './ou-math-v1-test.mjs';
import {initOuPricePickup,inspectOuPickupHealth,readOuPricePickupState} from './ou-price-pickup-v1-test.mjs';
import {londonAccountingWindow} from './london-cutoff.mjs';
const rows=(db,sql,...v)=>Array.from(db.exec(sql,...v));
const goodPrice=n=>typeof n==='number'&&Number.isFinite(n)&&n>1&&n<=1000;
const positiveId=n=>Number.isSafeInteger(Number(n))&&Number(n)>0;
export const OU_INSTANT_POLICY=Object.freeze({
 source:'FULL_MARKET_SERVICE_EXISTING_CACHE_THEN_GUARDED_ONE_REQUEST',
 maxReadBatch:70,maximumCachedAgeMs:120000,maxPaidCallsPerLondonDay:1,
 minimumSecondsBeforeKickoff:300,
 noPostIssueReprice:true,noHistoricalBackfill:true,modelUnchanged:true,productionWrites:0
});
export function quoteFromFullMarketReply(reply,p,now,{cacheOnly=false}={}){
 if(!reply?.ok||String(reply.fixtureId)!==String(p.fixture_id)||reply.stale===true||
    !reply.fullOdds||typeof reply.fullOdds!=='object')return null;
 if(cacheOnly&&reply.cached!==true)return null;
 const fetchedAt=Number(reply.fetchedAt);
 const age=now*1000-fetchedAt;
 if(!Number.isFinite(fetchedAt)||fetchedAt<1e12||
    age< -10000||age>OU_INSTANT_POLICY.maximumCachedAgeMs||
    Number(reply.ageMs??age)>OU_INSTANT_POLICY.maximumCachedAgeMs)return null;
 const contents=reply.fullOdds?.data??reply.fullOdds;
 if(!contents||typeof contents!=='object'||Array.isArray(contents))return null;
 if(contents.fixture_id!=null&&String(contents.fixture_id)!==String(p.fixture_id))return null;
 // The Full Market cache is private, keyed by fixture ID, and fetched through
 // a service binding. Only fill omitted fixture_id, NEVER override mismatch.
 const full={...contents,fixture_id:contents.fixture_id??p.fixture_id};
 const observed=Math.floor(fetchedAt/1000),clock=Math.max(now,Math.floor(Date.now()/1000));
 const parsed=parseOuPriceFromExistingPayload(full,{
  fixtureId:p.fixture_id,homeId:p.home_id,awayId:p.away_id,pick:p.pick,
  kickoff:p.kickoff,observed,now:clock,line:2.5});
 if(parsed.state!=='PRICED'||!goodPrice(parsed.priceOver)||!goodPrice(parsed.priceUnder)||
    !goodPrice(parsed.selectedPrice)||parsed.line!==2.5||
    (parsed.bookmaker!=='bet365')||!['opening','closing'].includes(parsed.stage))return null;
 return {...parsed,source:'FULL_MARKET_'+parsed.source,sourceObservedAt:observed,
  capturedAt:clock,providerCalls:0};
}
const exists=(db,id)=>Boolean(rows(db,'SELECT 1 AS found FROM b46_ou_pick_v1_test WHERE fixture_id=?',id)[0]);
const valid=(p,now)=>positiveId(p.fixture_id)&&positiveId(p.home_id)&&positiveId(p.away_id)&&
 p.home_id!==p.away_id&&positiveId(p.kickoff)&&p.kickoff>now+OU_INSTANT_POLICY.minimumSecondsBeforeKickoff&&
 p.picked_at===now&&p.line===2.5&&p.model===OU_MODEL&&
 ['OVER_2.5','UNDER_2.5'].includes(p.pick)&&
 typeof p.probability==='number'&&p.probability>=OU_POLICY.minProbability&&p.probability<=1&&
 Number(p.home_count)+Number(p.away_count)>=OU_POLICY.minCombinedHistory;
export function issueOuAtSelection(db,screening,now,priceMap=new Map()){
 initOu(db);initOuPricePickup(db);
 if(!Number.isSafeInteger(now)||!Array.isArray(screening?.qualified))throw Error('INVALID_OU_SELECTION_REPORT');
 let added=0,lockedPrices=0,missingPrices=0,duplicate=0,rejected=0;
 // One transaction for the issued pick, the exact bookmaker quote and
 // the original picked_at timestamp. No UPDATE of an existing pick.
 db.transaction(()=>{
  for(const p of screening.qualified){
   if(!valid(p,now)){rejected++;continue}
   const q=priceMap.get(p.fixture_id)??null;
   const priced=q?.state==='PRICED'&&Number(q.fixtureId)===p.fixture_id&&
    Number(q.homeId)===p.home_id&&Number(q.awayId)===p.away_id&&
    q.pick===p.pick&&q.line===2.5&&q.kickoff===p.kickoff&&
    goodPrice(q.priceOver)&&goodPrice(q.priceUnder)&&goodPrice(q.selectedPrice)&&
    Number.isSafeInteger(q.observedAt)&&q.observedAt<=now+60&&
    q.observedAt<p.kickoff-OU_INSTANT_POLICY.minimumSecondsBeforeKickoff;
   const value=priced?q.selectedPrice:null;
   db.exec("INSERT INTO b46_ou_pick_v1_test(fixture_id,home_id,away_id,league_id,league_name,home,away,kickoff,picked_at,observed,pick,line,probability,over_probability,lambda_home,lambda_away,expected_total,home_count,away_count,price,model) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fixture_id) DO NOTHING",
    p.fixture_id,p.home_id,p.away_id,p.league_id,p.league_name,p.home,p.away,p.kickoff,
    now,now,p.pick,2.5,p.probability,p.overProbability,p.lambdaHome,p.lambdaAway,
    p.expectedTotalGoals,p.home_count,p.away_count,value,OU_MODEL);
   if(Number(rows(db,'SELECT changes() AS n')[0]?.n??0)!==1){duplicate++;continue}
   added++;
   if(!priced){missingPrices++;continue}
   db.exec("INSERT INTO b46_ou_verified_quote_v1_test(fixture_id,home_id,away_id,pick,line,price_over,price_under,selected_price,observed_at,kickoff,source,bookmaker,model) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fixture_id) DO NOTHING",
    p.fixture_id,p.home_id,p.away_id,p.pick,2.5,q.priceOver,q.priceUnder,q.selectedPrice,
    q.observedAt,p.kickoff,q.source,'bet365',OU_MODEL);
   if(Number(rows(db,'SELECT changes() AS n')[0]?.n??0)!==1)
    throw Error('OU_ISSUANCE_QUOTE_INSERT_CONFLICT');
   lockedPrices++;
  }
 });
 return {added,lockedPrices,missingPrices,duplicate,rejected,immutable:true,
  providerCalls:0,postIssueUpdates:0,model:OU_MODEL};
}
const entryQuote=(p,entry,now)=>{
 if(!entry||entry.stale===true||!entry.fullOdds)return null;
 return quoteFromFullMarketReply({
  ok:true,fixtureId:p.fixture_id,fullOdds:entry.fullOdds,
  fetchedAt:entry.fetchedAt,ageMs:entry.ageMs,stale:entry.stale,cached:true
 },p,now,{cacheOnly:true});
};
async function cacheLookup(market,ids){
 const r=await market('/board-cache',{method:'POST',body:{fixtureIds:ids}});
 return r?.ok===true&&r.externalRequestsAdded===0&&r.entries&&typeof r.entries==='object'?r.entries:{};
}
export async function captureAndIssueOu(db,{screening,now,market,hubHealth}={}){
 if(!Array.isArray(screening?.qualified)||!Number.isSafeInteger(now)||
   typeof market!=='function'||typeof hubHealth!=='function)
   throw Error('OU_PRICE_ISSUE_INVALID_ARGUMENTS');
 initOu(db);initOuPricePickup(db);
 const candidates=screening.qualified.filter(p=>valid(p,now)&&!exists(db,p.fixture_id));
 const priceMap=new Map(),cacheStats={lookedUp:0,cached:0,priced:0,missing:0};
 let readFailure=null,providerCalls=0,fullMarketRequested=0,paidAttemptState='SKIPPED';
 // One cache read for each bounded group; this NEVER requests 5USD upstream.
 for(let i=0;i<candidates.length;i+=OU_INSTANT_POLICY.maxReadBatch){
  const group=candidates.slice(i,i+OU_INSTANT_POLICY.maxReadBatch);
  let entries={};
  try{entries=await cacheLookup(market,group.map(p=>String(p.fixture_id)))}
  catch(e){readFailure=String(e?.message??e).slice(0,65)}
  cacheStats.lookedUp+=group.length;
  for(const p of group){
   const entry=entries[String(p.fixture_id)];
   if(entry)cacheStats.cached++;
   const q=entryQuote(p,entry,now);
   if(q){priceMap.set(p.fixture_id,q);cacheStats.priced++}
   else cacheStats.missing++;
  }
 }
 // One optional paid fallback, ONLY for a NEW qualifying fixture and BEFORE
 // issuing its prediction; never post-issue quote pickup/repricing. Full Market
 // owns its provider bridge and local limits, and all workers share the account.
 let requestId=null;
 const unmatched=candidates.find(p=>!priceMap.has(p.fixture_id)&&
   !rows(db,'SELECT fixture_id FROM b46_ou_price_request_v1_test WHERE fixture_id=?',p.fixture_id).length);
 const transport=readOuPricePickupState(db,now);
 if(unmatched&&transport.remainingToday>0){
  let healthy=false;
  try{
   const [h,fm]=await Promise.all([hubHealth(),market('/health',{method:'GET'})]);
   healthy=inspectOuPickupHealth(h).allowed===true&&fm?.ok===true&&
    Number(fm.retryAfterSec??0)===0&&Number(fm.remainingLocalBudget)>0&&
    (fm.blockedUntil==null||Number(fm.blockedUntil)<=Date.now());
  }catch{}
  if(healthy){
   let reserved=false;
   const day=londonAccountingWindow(now).businessDay;
   db.transaction(()=>{
    const count=Number(rows(db,'SELECT COUNT(*) AS n FROM b46_ou_price_request_v1_test WHERE business_day=?',day)[0]?.n??0);
    if(count>=OU_INSTANT_POLICY.maxPaidCallsPerLondonDay)return;
    db.exec("INSERT INTO b46_ou_price_request_v1_test(fixture_id,business_day,requested_at,state,provider_calls) VALUES(?,?,?,'RESERVED_AT_SELECTION',1) ON CONFLICT(fixture_id) DO NOTHING",
     unmatched.fixture_id,day,now);
    reserved=Number(rows(db,'SELECT changes() AS n')[0]?.n??0)===1;
   });
   if(reserved){
    requestId=unmatched.fixture_id;providerCalls=1;paidAttemptState='RESERVED_AND_CALLED';
    let actualState='PRICE_NOT_OFFERED',error=null;
    try{
     const fetched=await market('/fixture-odds?fixtureId='+encodeURIComponent(unmatched.fixture_id),{method:'GET'});
     fullMarketRequested=Number(fetched?.externalRequestsAdded??0);
     const q=quoteFromFullMarketReply(fetched,unmatched,now);
     if(q){priceMap.set(unmatched.fixture_id,q);actualState='PRICE_CAPTURED_AT_SELECTION'}
     else if(fetched?.stale===true)actualState='STALE_PRICE_REJECTED';
    }catch(e){actualState='FM_READ_FAILED';error=String(e?.message??e).slice(0,100)}
    db.exec('UPDATE b46_ou_price_request_v1_test SET completed_at=?,state=?,error=? WHERE fixture_id=?',
     Math.floor(Date.now()/1000),actualState,error,unmatched.fixture_id);
    paidAttemptState=actualState;
   }else paidAttemptState='CAP_OR_DUPLICATE';
  }else paidAttemptState='SHARED_PROVIDER_HEALTH_DEFER';
 }else if(unmatched)paidAttemptState='DAILY_CAP';
 else paidAttemptState='NO_UNPRICED_NEW_FIXTURE';
 // Issue once, no retouch of old predictions. Quote and prediction stored in
 // ONE synchronous SQLite transaction, and frontend reads price from ledger.
 const recorded=issueOuAtSelection(db,screening,now,priceMap);
 return {mode:'OU_INSTANT_PRICE_AT_SELECTION_TEST',
  screening:screening.counts,candidates:candidates.length,
  cache:cacheStats,readFailure,paidAttemptState,requestId,
  reservedPaidRequests:providerCalls,fullMarketUpstreamAdded:fullMarketRequested,
  recorded,priceSource:'CENTRAL_FULL_MARKET',noRepricing:true,
  existingPicksNotModified:true,providerCalls};
}
export function lockedOuPriceEvidence(db,limit=30){
 initOu(db);initOuPricePickup(db);
 return rows(db,"SELECT p.fixture_id,p.pick,p.picked_at,p.price,q.price_over,q.price_under,q.observed_at,q.source FROM b46_ou_pick_v1_test p LEFT JOIN b46_ou_verified_quote_v1_test q ON q.fixture_id=p.fixture_id ORDER BY p.picked_at DESC,p.fixture_id DESC LIMIT ?",limit);
}
