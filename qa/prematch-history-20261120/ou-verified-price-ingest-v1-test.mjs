// BALL46 O/U verified price ingestion V1 — pure TEST-only parser.
// NO upstream calls, no source-odds inference, no 1X2/BTTS changes.
// Input must be a trusted, already obtained /v1/fixtures/{id}/odds response.
// `closing` is latest pre-kickoff only when received before kickoff.
// Main goal_line values in cached HUB snapshots are LINES, NOT PAYOUT PRICES.
const positiveId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const price=x=>typeof x==='number'&&Number.isFinite(x)&&x>1&&x<=1000;
const line=x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&Math.round(x*4)===x*4;
const validTs=x=>Number.isSafeInteger(x)&&x>946684800&&x<4102444800;
export const OUV1_PRICE_POLICY=Object.freeze({
 targetLine:2.5,bookmaker:'bet365',maxLines:25,minBeforeKickoffSec:900,
 upstreamCalls:0,source:'5USD_FULL_FIXTURE_ODDS_ONLY',modelUnchanged:true
});
const fail=(state,extra={})=>({state,priceOver:null,priceUnder:null,selectedPrice:null,...extra});
const bookmaker=x=>x?.slug==='bet365'||String(x?.name??'').replace(/[\s-]/g,'').toLowerCase()==='bet365';
const quoteIsValid=q=>q&&typeof q==='object'&&!Array.isArray(q)&&price(q.over)&&price(q.under);
export function parseOuPriceFromExistingPayload(response,{fixtureId,homeId,awayId,
  pick,kickoff,observed,now=observed,line:target=2.5}={}){
 if(!positiveId(fixtureId)||!positiveId(homeId)||!positiveId(awayId)||String(homeId)===String(awayId)||
    !validTs(kickoff)||!validTs(observed)||!validTs(now)||observed>now+10||
    now>=kickoff-OUV1_PRICE_POLICY.minBeforeKickoffSec)
   return fail('INVALID_OR_LATE_PRICE_CONTEXT');
 if(target!==2.5||!['OVER_2.5','UNDER_2.5'].includes(pick))
   return fail('UNSUPPORTED_OU_SELECTION');
 if(observed>=kickoff-OUV1_PRICE_POLICY.minBeforeKickoffSec)
   return fail('PRICE_NOT_BEFORE_KICKOFF_CUTOFF');
 const body=response?.data??response;
 if(!body||typeof body!=='object'||!positiveId(body.fixture_id)||
    Number(body.fixture_id)!==Number(fixtureId))return fail('FIXTURE_ID_MISMATCH');
 // Never infer provider identity from the requested endpoint. Require a named
 // bookmaker in the verified provider response.
 const books=Array.isArray(body.bookmakers)?body.bookmakers:[];
 const bet365=books.filter(bookmaker);
 if(bet365.length!==1)return fail('BET365_NOT_UNIQUELY_IDENTIFIED');
 const odds=bet365[0]?.odds;
 if(!odds||typeof odds!=='object'||Array.isArray(odds))return fail('NO_ODDS_OBJECT');
 let quote=null,source=null;
 const fixed=odds.goal_line_fixed;
 if(fixed!=null){
   if(!Array.isArray(fixed)||fixed.length>OUV1_PRICE_POLICY.maxLines)
     return fail('INVALID_FIXED_LINE_LADDER');
   const hit=fixed.filter(x=>x&&typeof x==='object'&&x.line===2.5);
   if(hit.length>1)return fail('DUPLICATE_FIXED_LINE');
   if(hit.length===1){
     // Explicit null closing means Bet365 withdrew the fixed line. Do NOT
     // revive an earlier opening tick or use an in-play price.
     if(hit[0].closing===null)return fail('PRICE_WITHDRAWN');
     if(!quoteIsValid(hit[0].closing))return fail('PRICE_NOT_OFFERED');
     quote=hit[0].closing;source='BET365_GOAL_LINE_FIXED_CLOSING';
   }
 }
 if(!quote){
   // Fallback to moving main goal line ONLY if that *same* line is 2.5 and
   // the full-price object provides both payout sides.
   const closing=odds.goal_line?.closing;
   if(closing!==null&&closing!==undefined){
     if(!closing||typeof closing!=='object'||!line(closing.line))
       return fail('MAIN_GOAL_LINE_NOT_FULL_PRICES');
     if(closing.line!==2.5)return fail('MAIN_GOAL_LINE_MISMATCH',{observedMainLine:closing.line});
     if(!quoteIsValid(closing))return fail('PRICE_NOT_OFFERED');
     quote=closing;source='BET365_MAIN_GOAL_LINE_CLOSING';
   }
 }
 if(!quote)return fail('PRICE_NOT_OFFERED');
 const selectedPrice=pick==='OVER_2.5'?quote.over:quote.under;
 // This observed timestamp is local trusted receipt time. The provider's
 // closing quote has no per-quote timestamp on this endpoint.
 return {state:'PRICED',fixtureId:Number(fixtureId),homeId:Number(homeId),
   awayId:Number(awayId),market:'O/U',line:2.5,pick,
   bookmaker:'bet365',stage:'closing',source,
   observedAt:observed,kickoff,priceOver:quote.over,priceUnder:quote.under,
   selectedPrice,providerQuoteTimestamp:null,
   providerCalls:0,estimatedFromOtherMarket:false};
}
