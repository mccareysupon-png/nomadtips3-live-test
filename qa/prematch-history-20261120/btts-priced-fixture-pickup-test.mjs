// BALL46 isolated TEST: automatically collect Bet365 BTTS prematch odds
// ONLY for probability-screened fixtures from the already scheduled feed.
// This is a DIFFERENT provider endpoint from the 5-round 500 FT bulk truck.
// Each of the five history trucks carries at most TWO total 5USD API calls:
// one bulk FT fetch and at most one Bet365 BTTS quote. No 15-minute quota.
// Never infer BTTS from 1X2 odds. Never publish without verified Bet365 prices.
import {londonAccountingWindow} from './london-cutoff.mjs';
import {bttsBulkV2Slot} from './btts-bulk-truck-v2-test.mjs';
import {evaluateBttsUltra,parseBet365BttsOdds} from './btts-ultra-shadow.mjs';

const all=(db,q,...p)=>Array.from(db.exec(q,...p));
export const B46_BTTS_PRICE_PICKUP_CAP=Object.freeze({
 maxPerLondonBusinessDay:5,maxPerTick:1,maxTotalPerTruck:2,
 maxAllTruckCallsDaily:10,minimumSecondsToKickoff:900,
 maxSecondsToKickoff:3*86400,minimumSharedQuotaRemaining:12
});
export function initBttsPricePickup(db){
 db.exec("CREATE TABLE IF NOT EXISTS b46_btts_price_pickup_test (business_day TEXT NOT NULL,fixture_id INTEGER NOT NULL,requested_at INTEGER NOT NULL,completed_at INTEGER,provider_calls INTEGER NOT NULL DEFAULT 1,state TEXT NOT NULL,price_yes REAL,price_no REAL,source_quote TEXT,error TEXT,PRIMARY KEY(business_day,fixture_id))");
 db.exec('CREATE INDEX IF NOT EXISTS b46_btts_price_pickup_at ON b46_btts_price_pickup_test(business_day,requested_at)');
}
export function bttsPricePickupState(db,now){
 initBttsPricePickup(db);
 const day=londonAccountingWindow(now).businessDay;
 const rec=all(db,'SELECT fixture_id,requested_at,completed_at,state,price_yes,price_no,source_quote,error FROM b46_btts_price_pickup_test WHERE business_day=? ORDER BY requested_at DESC LIMIT 40',day);
 const tally=all(db,"SELECT COUNT(*) AS total,COALESCE(SUM(provider_calls),0) AS calls,COALESCE(SUM(state='PRICED_IMPORTED'),0) AS priced,COALESCE(SUM(state='NOT_OFFERED'),0) AS not_offered,COALESCE(SUM(state LIKE 'FAIL_%'),0) AS failures FROM b46_btts_price_pickup_test WHERE business_day=?",day)[0];
 // The actual five-round SQL ledger is authoritative. One priced-fixture API
 // may ride with a truck only AFTER its one historical API has completed.
 const slot=bttsBulkV2Slot(now);
 const trips=all(db,'SELECT round_no,state,provider_calls FROM b46_btts_bulk_v2_rounds WHERE business_day=?',day);
 const activeTrip=trips.find(t=>t.round_no===slot.slot);
 const priceCallsForTrip=rec.filter(r=>{
   const at=bttsBulkV2Slot(r.requested_at);
   return at.businessDay===day&&at.slot===slot.slot;
 }).length;
 const historyCallsToday=trips.reduce((n,t)=>n+Number(t.provider_calls||0),0);
 const priceCallsToday=Number(tally?.calls??0);
 const remainingDaily=Math.max(0,Math.min(B46_BTTS_PRICE_PICKUP_CAP.maxPerLondonBusinessDay-priceCallsToday,
   B46_BTTS_PRICE_PICKUP_CAP.maxAllTruckCallsDaily-historyCallsToday-priceCallsToday));
 const remainingThisTruck=Math.max(0,
   B46_BTTS_PRICE_PICKUP_CAP.maxTotalPerTruck-Number(activeTrip?.provider_calls??0)-priceCallsForTrip);
 return {code:'B46_BTTS_BET365_PRICE_PICKUP_TEST',day,
   calls: Number(tally?.calls??0),attempts:Number(tally?.total??0),
   priced:Number(tally?.priced??0),notOffered:Number(tally?.not_offered??0),
   failures:Number(tally?.failures??0),cap:B46_BTTS_PRICE_PICKUP_CAP,
   truck:{slot:slot.slot,roundsUsed:trips.length,historyCallsToday,
     state:activeTrip?.state??'NO_TRUCK_TRIP',historyCalls:Number(activeTrip?.provider_calls??0),
     priceCalls:priceCallsForTrip,remainingForPrice:remainingThisTruck},
   records:rec,remaining:remainingDaily,
   providerCallsThisRead:0};
}
const asText=x=>String(x??'UNKNOWN').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,70);
const eligible=(c,now)=>c&&c.state==='BET365_PRICE_NEEDED'&&
 Number.isSafeInteger(Number(c.fixtureId))&&Number(c.fixtureId)>0&&
 c.kickoff>now+B46_BTTS_PRICE_PICKUP_CAP.minimumSecondsToKickoff&&
 c.kickoff<=now+B46_BTTS_PRICE_PICKUP_CAP.maxSecondsToKickoff&&
 c.homeHistory>=3&&c.awayHistory>=3&&
 (Number(c.probabilityYes)>=.60||Number(c.probabilityNo)>=.60);

export async function runBttsPricePickup(db,{fixtures,quotes={},now,provider,hubreview,onQuote,feedAt,clock=()=>Math.floor(Date.now()/1000)}={}){
 if(!Number.isSafeInteger(now)||now<=0||!Array.isArray(fixtures)||
    typeof provider!=='function'||typeof onQuote!=='function')
   throw Error('INVALID_BTTS_PRICE_PICKUP_INPUT');
 const before=bttsPricePickupState(db,now),day=before.day;
 // Mandatory per-truck, per-slot guard: 1 bulk + at most 1 BTTS quote.
 // Historical calls already used and any prior 15-min quote attempts count.
 // Never call 5USD just because a 15-minute cron fired.
 if(before.truck.slot===0||before.truck.state!=='COMPLETED'||before.truck.historyCalls!==1)
   return {state:'AWAIT_COMPLETED_BTTS_HISTORY_TRUCK',providerCalls:0,transport:before};
 if(before.truck.priceCalls>=1||before.truck.remainingForPrice<1)
   return {state:'TWO_APIS_PER_TRUCK_CAP',providerCalls:0,transport:before};
 if(!Number.isSafeInteger(feedAt)||feedAt<=0||feedAt>now+60||now-feedAt>3600)
   return {state:'FRESH_SCHEDULED_FEED_REQUIRED',providerCalls:0,transport:before};
 if(before.remaining===0)return {state:'DAILY_PRICE_REQUEST_CAP',providerCalls:0,transport:before};
 const fail=all(db,"SELECT 1 AS x FROM b46_btts_price_pickup_test WHERE business_day=? AND state IN ('FAIL_429','FAIL_LOW_SHARED_QUOTA') LIMIT 1",day);
 if(fail.length)return {state:'SHARED_RATE_LIMIT_STOP_FOR_DAY',providerCalls:0,transport:before};
 if(typeof hubreview==='function'){
   const health=await hubreview();
   if(health?.ok!==true||Number(health.retryAfterSec??0)>0||health.lastError)
     return {state:'SHARED_HUB_NOT_READY',providerCalls:0,transport:before};
 }
 const report=evaluateBttsUltra(db,fixtures,now,quotes,1000);
 // The evaluator's CANDIDATES only contains probability-passed and unpriced.
 // Never fetch pricing for the full fixture feed (or for issued 1X2 picks).
 const candidates=report.candidates.filter(c=>eligible(c,now))
   .sort((a,b)=>a.kickoff-b.kickoff||Number(a.fixtureId)-Number(b.fixtureId));
 const used=new Set(all(db,'SELECT fixture_id FROM b46_btts_price_pickup_test WHERE business_day=?',day)
   .map(x=>String(x.fixture_id)));
 const pending=candidates.filter(c=>!used.has(String(c.fixtureId)));
 if(!pending.length)return {state:'NO_NEW_PROBABILITY_READY_FIXTURES',providerCalls:0,
   candidates:candidates.length,modelReady:report.totals.modelProbabilityReady,transport:before};
 const fixtureById=new Map(fixtures.map(x=>[String(x.id),x]));
 const run=[];
 const maximum=Math.min(B46_BTTS_PRICE_PICKUP_CAP.maxPerTick,before.remaining,pending.length,
  before.truck.remainingForPrice);
 for(const c of pending.slice(0,maximum)){
   const f=fixtureById.get(String(c.fixtureId));
   if(!f||f.status!=='scheduled'||f.kickoff_ts<=now+900)continue;
   // Reserve BEFORE any external request. No automatic retry of uncertainty,
   // including timeouts and 429s; a failed claim still consumes one allowance.
   db.exec("INSERT OR IGNORE INTO b46_btts_price_pickup_test (business_day,fixture_id,requested_at,state,provider_calls) VALUES (?,?,?,'RESERVED',1)",
    day,Number(f.id),now);
   const changed=all(db,'SELECT changes() AS n')[0]?.n??0;
   if(changed!==1)continue;
   const path='/v1/fixtures/'+encodeURIComponent(String(f.id))+'/odds?market=btts';
   const item={fixtureId:String(f.id),state:'RESERVED',source:'5USD_FIXTURE_BET365_BTTS'};
   let remain=null;
   try{
     const raw=await provider(path);
     remain=raw?.remaining??null;
     const observed=clock();
     if(!raw?.ok){
       item.state=raw?.status===429?'FAIL_429':'FAIL_PROVIDER_'+asText(raw?.status);
       item.error='HTTP_'+asText(raw?.status);
     }else if(observed>=f.kickoff_ts||f.kickoff_ts<=now){
       item.state='FAIL_KICKOFF_REACHED';item.error='PRICE_OBSERVED_AFTER_KICKOFF';
     }else{
       const body=raw.body?.data??raw.body;
       if(body?.fixture_id!=null&&String(body.fixture_id)!==String(f.id)||
          body?.fixtureId!=null&&String(body.fixtureId)!==String(f.id)){
         item.state='FAIL_FIXTURE_IDENTITY';item.error='PROVIDER_FIXTURE_MISMATCH';
       }else{
         const parsed=parseBet365BttsOdds(body,{fixtureId:f.id,homeId:f.teams.home.id,
           awayId:f.teams.away.id,observed,kickoff:f.kickoff_ts,now:observed});
         item.state=parsed.state;
         // Store the ACTUAL evidence before handing it to the Bot. This allows
         // review/recovery without buying the same quote again if a write fails.
         if(parsed.state==='PRICED'||parsed.state==='NOT_OFFERED'){
           db.exec('UPDATE b46_btts_price_pickup_test SET completed_at=?,state=?,price_yes=?,price_no=?,source_quote=? WHERE business_day=? AND fixture_id=?',
            observed,'QUOTE_STORED',parsed.prices?.BTTS_YES??null,parsed.prices?.BTTS_NO??null,
            parsed.sourceQuote??null,day,Number(f.id));
           const processed=await onQuote(f,parsed,observed);
           item.state=parsed.state==='PRICED'?'PRICED_IMPORTED':'NOT_OFFERED';
           item.issued=processed?.issued??null;
           item.oddsYes=parsed.prices?.BTTS_YES??null;
           item.oddsNo=parsed.prices?.BTTS_NO??null;
           item.observed=observed;
         }
       }
     }
     if(remain!==null&&Number.isFinite(Number(remain))&&Number(remain)<=B46_BTTS_PRICE_PICKUP_CAP.minimumSharedQuotaRemaining){
       if(item.state!=='FAIL_429'&&!item.state.startsWith('FAIL_')){
         // Preserve successful price state; block future calls via state note.
         item.sharedQuotaLow=true;
       }else if(item.state!=='FAIL_429')item.state='FAIL_LOW_SHARED_QUOTA';
     }
   }catch(err){
     item.state='FAIL_'+asText(err?.message).slice(0,62);
     item.error=String(err?.message??err).slice(0,140);
   }
   db.exec('UPDATE b46_btts_price_pickup_test SET completed_at=?,state=?,price_yes=COALESCE(?,price_yes),price_no=COALESCE(?,price_no),error=? WHERE business_day=? AND fixture_id=?',
    clock(),item.state,item.oddsYes??null,item.oddsNo??null,item.error??null,day,Number(f.id));
   run.push(item);
   if(item.state==='FAIL_429'||item.sharedQuotaLow||item.state.startsWith('FAIL_'))break;
 }
 return {state:'PICKUP_EXECUTED',providerCalls:run.length,screenCandidates:candidates.length,
   selected:run,transport:bttsPricePickupState(db,now),productionWrites:0};
}
