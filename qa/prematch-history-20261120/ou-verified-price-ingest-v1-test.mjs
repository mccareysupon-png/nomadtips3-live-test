// BALL46 O/U verified price ingestion V1 — pure TEST-only parser.
// NO upstream calls, no source-odds inference, no 1X2/BTTS changes.
// Input must be a trusted, already obtained /v1/fixtures/{id}/odds response.
// `closing` is latest pre-kickoff until kickoff; `opening` is a recorded earlier
// price, and may NOT have been executable at the time the prediction was issued.
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
 let quote=null,source=null,stage=null;
 const fixed=odds.goal_line_fixed;
 let fixed25=null;
 if(fixed!=null){
   if(!Array.isArray(fixed)||fixed.length>OUV1_PRICE_POLICY.maxLines)
     return fail('INVALID_FIXED_LINE_LADDER');
   const matches=fixed.filter(x=>x&&typeof x==='object'&&x.line===2.5);
   if(matches.length>1)return fail('DUPLICATE_FIXED_LINE');
   fixed25=matches[0]??null;
 }
 // Read the PRE-MATCH full payout for the SAME 2.5 strike. Never treat a
 // number 2.5/2.75/3.0 (bulk fixture goal-line marker) as a decimal price.
 // Prefer latest closing, but user also accepts an authentic recorded opening.
 // A recorded opening may be historical; the returned stage remains explicit.
 const accept=(value,name,fromStage)=>{
   if(!quoteIsValid(value))return false;
   quote=value;source=name+'_'+fromStage.toUpperCase();stage=fromStage;
   return true;
 };
 if(fixed25){
   accept(fixed25.closing,'BET365_GOAL_LINE_FIXED','closing')||
   accept(fixed25.opening,'BET365_GOAL_LINE_FIXED','opening');
 }
 const main=odds.goal_line;
 if(!quote&&main&&typeof main==='object'&&!Array.isArray(main)){
   for(const step of ['closing','opening']){
     const values=main[step];
     if(values&&typeof values==='object'&&!Array.isArray(values)&&
       line(values.line)&&values.line===2.5&&
       accept(values,'BET365_MAIN_GOAL_LINE',step))break;
   }
 }
 if(!quote){
   if(fixed25&&fixed25.closing===null&&!quoteIsValid(fixed25.opening))
     return fail('PRICE_WITHDRAWN');
   const stages=[main?.closing,main?.opening];
   if(stages.some(v=>v!==null&&v!==undefined&&typeof v!=='object'))
     return fail('MAIN_GOAL_LINE_NOT_FULL_PRICES');
   const other=stages.find(v=>v&&typeof v==='object'&&line(v.line)&&v.line!==2.5);
   if(other)return fail('MAIN_GOAL_LINE_MISMATCH',{observedMainLine:other.line});
   return fail('PRICE_NOT_OFFERED');
 }
 const selectedPrice=pick==='OVER_2.5'?quote.over:quote.under;
 // This observed timestamp is local trusted receipt time. The provider's
 // closing quote has no per-quote timestamp on this endpoint.
 return {state:'PRICED',fixtureId:Number(fixtureId),homeId:Number(homeId),
   awayId:Number(awayId),market:'O/U',line:2.5,pick,
   bookmaker:'bet365',stage,source,
   priceStage:stage,openingIsHistorical:stage==='opening',
   observedAt:observed,kickoff,priceOver:quote.over,priceUnder:quote.under,
   selectedPrice,providerQuoteTimestamp:null,
   providerCalls:0,estimatedFromOtherMarket:false};
}
