// BALL46 isolated PreMatch TEST: independent Bet365 BTTS shadow.
// NO HTTP, no provider keys, no modification of 1X2/HCR, no publication.
// John 2026-11-21: BTTS is NOT in bulk fixtures; read Bet365 per-fixture
// /v1/fixtures/{id}/odds if already supplied; null means NOT_OFFERED.
import {bttsLastMatches} from './btts-history-private.mjs';
import {evaluateBttsSignal} from './evaluate-btts-signal.mjs';

const pos=x=>/^[1-9]\d*$/.test(String(x??''))&&Number.isSafeInteger(Number(x));
const price=x=>typeof x==='number'&&Number.isFinite(x)&&x>1;
const safeTs=x=>Number.isSafeInteger(x)&&x>0;
const valid=(quote,now,kickoff)=>quote?.bookmaker==='bet365'&&safeTs(quote.observed)&&quote.observed<=now&&quote.observed<kickoff&&
 price(quote.prices?.BTTS_YES)&&price(quote.prices?.BTTS_NO);
const safeFixture=f=>pos(f?.id)&&pos(f?.teams?.home?.id)&&pos(f?.teams?.away?.id)&&
 String(f.teams.home.id)!==String(f.teams.away.id)&&safeTs(f?.kickoff_ts)&&f?.status==='scheduled';

export const BTTS_ULTRA_TEST_POLICY=Object.freeze({
 version:'btts-ultra-history10-shadow-v1',historyPerTeam:10,minHistory:3,
 minProbability:.60,minEdge:.05,minEV:.05,minPrice:1.5,maxPrice:10,
 publish:false,providerRequests:0,source:'BET365_ONLY'
});
// Normalize provider's *actual per-fixture* /odds payload. Never mark a HUB
// aggregated 1X2 price as Bet365 BTTS. Response may have btts:null.
export function parseBet365BttsOdds(body,{fixtureId,homeId,awayId,observed,kickoff,now}){
 if(![fixtureId,homeId,awayId].every(pos)||String(homeId)===String(awayId)||
    !safeTs(observed)||!safeTs(kickoff)||!safeTs(now)||observed>now||observed>=kickoff||now>=kickoff)
   return {state:'INVALID_EVIDENCE'};
 if(!Array.isArray(body?.bookmakers))return {state:'INVALID_PAYLOAD'};
 const books=body.bookmakers.filter(x=>x?.slug==='bet365');
 if(books.length!==1)return {state:books.length?'AMBIGUOUS_BOOKMAKER':'NO_BET365_BOOKMAKER'};
 const market=books[0]?.odds?.btts;
 if(market==null)return {state:'NOT_OFFERED'};
 const closing=market.closing,opening=market.opening;
 const q=[closing,opening].find(x=>price(x?.yes)&&price(x?.no));
 if(!q)return {state:'NOT_OFFERED'};
 return {state:'PRICED',fixtureId:String(fixtureId),homeId:String(homeId),awayId:String(awayId),
  bookmaker:'bet365',observed,kickoff,source:'5USD_FIXTURE_BET365_BTTS',
  sourceQuote:q===closing?'closing':'opening',prices:{BTTS_YES:q.yes,BTTS_NO:q.no}};
}
function matchStored(quote,f){
 return quote&&String(quote.fixtureId)===String(f.id)&&String(quote.homeId)===String(f.teams.home.id)&&
  String(quote.awayId)===String(f.teams.away.id)&&quote.kickoff===f.kickoff_ts;
}
// Only one protected metadata record per scheduled fixture; no changes to
// 1X2 botFixtures, model scores, raw archive or settled test ledger.
export function mergeBet365BttsQuotes(old,fixture,parsed,now){
 if(!safeFixture(fixture)||fixture.kickoff_ts<=now)throw Error('INVALID_FIXTURE');
 if(parsed.state!=='PRICED'&&parsed.state!=='NOT_OFFERED')throw Error('INVALID_BET365_EVIDENCE');
 if(parsed.state==='PRICED'&&!matchStored(parsed,fixture))throw Error('FIXTURE_IDENTITY_MISMATCH');
 const current=old&&typeof old==='object'&&!Array.isArray(old)?{...old}:{};
 const key=String(fixture.id),prior=current[key];
 if(prior&&prior.observed>now)throw Error('FUTURE_PRIOR_QUOTE');
 if(parsed.state==='NOT_OFFERED'){
  // Null is a factual market status, never a fabricated 0 price.
  if(!prior||prior.state==='NOT_OFFERED'){
   current[key]={state:'NOT_OFFERED',fixtureId:key,homeId:String(fixture.teams.home.id),awayId:String(fixture.teams.away.id),kickoff:fixture.kickoff_ts,observed:now};
  }
  return {quotes:current,state:current[key]?.state??'NOT_OFFERED'};
 }
 if(!valid(parsed,now,fixture.kickoff_ts))throw Error('STALE_OR_INVALID_BET365_PRICE');
 if(prior&&prior.observed>parsed.observed)return {quotes:current,state:'STALE_QUOTE_IGNORED'};
 current[key]={...parsed,state:'PRICED'};
 return {quotes:current,state:'PRICED'};
}

export function evaluateBttsUltra(db,fixtures,now,storedQuotes={},limit=250,view=null){
 if(!safeTs(now)||!Array.isArray(fixtures)||!Number.isInteger(limit)||limit<1||limit>1000)throw Error('INVALID_INPUT');
 const totals={upcoming:0,historyReady:0,historyIncomplete:0,modelProbabilityReady:0,
   quoteRequired:0,notOffered:0,availableQuote:0,qualified:0,staleQuotes:0};
 const rows=[],seen=new Set();
 for(const f of fixtures){
  if(!safeFixture(f)||f.kickoff_ts<=now||seen.has(String(f.id)))continue;
  seen.add(String(f.id));totals.upcoming++;
  const home=bttsLastMatches(db,Number(f.teams.home.id),f.kickoff_ts,now,10);
  const away=bttsLastMatches(db,Number(f.teams.away.id),f.kickoff_ts,now,10);
  const complete=home.length>=BTTS_ULTRA_TEST_POLICY.minHistory&&away.length>=BTTS_ULTRA_TEST_POLICY.minHistory;
  if(complete)totals.historyReady++;else totals.historyIncomplete++;
  const cached=storedQuotes[String(f.id)];
  const direct=f.storedBet365;
  const cacheValid=cached?.state==='PRICED'&&matchStored(cached,f)&&valid(cached,now,f.kickoff_ts);
  const directValid=valid(direct,now,f.kickoff_ts);
  const selected=cacheValid&&(!directValid||cached.observed>=direct.observed)?cached:directValid?direct:null;
  const notOffered=!selected&&cached?.state==='NOT_OFFERED'&&matchStored(cached,f);
  let state='INSUFFICIENT_HISTORY',selection='NO_SIGNAL',metrics=null;
  if(complete){
   const args={homeLast10:home,awayLast10:away,asOf:now,kickoff:f.kickoff_ts};
   const inputs=selected?{...args,odds:{bookmaker:'bet365',yes:selected.prices.BTTS_YES,
     no:selected.prices.BTTS_NO,observed:selected.observed}}:args;
   const evaluated=evaluateBttsSignal(inputs,{enabled:true,minHistory:BTTS_ULTRA_TEST_POLICY.minHistory,minProbability:BTTS_ULTRA_TEST_POLICY.minProbability,
     minEdge:BTTS_ULTRA_TEST_POLICY.minEdge,minEV:BTTS_ULTRA_TEST_POLICY.minEV,
     minPrice:BTTS_ULTRA_TEST_POLICY.minPrice,maxPrice:BTTS_ULTRA_TEST_POLICY.maxPrice});
   metrics=evaluated.metrics;
   const probPass=!!evaluated.metrics?.sides?.some(x=>x.probabilityPassed);
   if(probPass)totals.modelProbabilityReady++;
   if(selected){
    totals.availableQuote++;
    state=evaluated.reason;
    if(evaluated.signal!=='NO_SIGNAL'){totals.qualified++;selection=evaluated.signal}
   }else if(notOffered){totals.notOffered++;state='NOT_OFFERED'}
   else if(probPass){totals.quoteRequired++;state='BET365_PRICE_NEEDED'}
   else state='PROBABILITY_BELOW';
  }
  if(cached&&!cacheValid&&cached.state==='PRICED')totals.staleQuotes++;
  rows.push({fixtureId:String(f.id),leagueId:f.league?.id??null,leagueName:f.league?.name??'',
    home:f.teams.home.name??String(f.teams.home.id),away:f.teams.away.name??String(f.teams.away.id),
    kickoff:f.kickoff_ts,homeHistory:home.length,awayHistory:away.length,
    state,signal:selection,metrics,
    probabilityYes:complete?(metrics?.sides?.find(x=>x.signal==='BTTS_YES')?.model??null):null,
    probabilityNo:complete?(metrics?.sides?.find(x=>x.signal==='BTTS_NO')?.model??null):null,
    oddsYes:selected?.prices?.BTTS_YES??null,oddsNo:selected?.prices?.BTTS_NO??null,
    quoteSource:selected?.source??(directValid?'STORED_BET365':null),
    oddsObserved:selected?.observed??null});
 }
 const statusOf=row=>{
  if(row.signal!=='NO_SIGNAL')return 'QUALIFIED_TEST';
  if(row.state==='INSUFFICIENT_HISTORY')return 'WAITING_HISTORY';
  if(row.state==='BET365_PRICE_NEEDED')return 'WAITING_PRICE';
  if(row.state==='NOT_OFFERED')return 'NOT_OFFERED';
  return 'NOT_QUALIFIED';
 };
 let preview;
 if(view&&typeof view==='object'){
  const q=String(view.q??'').trim().slice(0,80).toLowerCase();
  const availableFilters=['ALL','WAITING_HISTORY','WAITING_PRICE','NOT_OFFERED','QUALIFIED_TEST','NOT_QUALIFIED'];
  const filter=availableFilters.includes(view.filter)?view.filter:'ALL';
  const requested=Number(view.page);
  const page=Number.isSafeInteger(requested)&&requested>0?Math.min(requested,999):1;
  const pageSize=25;
  const matched=rows.filter(row=>(filter==='ALL'||statusOf(row)===filter)&&
   (!q||[row.home,row.away,row.leagueName,row.fixtureId].some(x=>String(x).toLowerCase().includes(q))));
  const pages=Math.max(1,Math.ceil(matched.length/pageSize));
  const resolvedPage=Math.min(page,pages);
  preview={page:resolvedPage,pageSize,total:matched.length,pages,filter,query:q,
   rows:matched.slice((resolvedPage-1)*pageSize,resolvedPage*pageSize).map(row=>({
    fixtureId:row.fixtureId,leagueName:row.leagueName,home:row.home,away:row.away,
    kickoff:row.kickoff,homeHistory:row.homeHistory,awayHistory:row.awayHistory,
    status:statusOf(row),signal:row.signal,state:row.state,
    probabilityYes:row.probabilityYes,probabilityNo:row.probabilityNo,
    oddsYes:row.oddsYes,oddsNo:row.oddsNo
   }))};
 }
 return {mode:'READ_ONLY_BTTS_SHADOW',policy:BTTS_ULTRA_TEST_POLICY,totals,
  candidates:rows.filter(x=>x.state==='BET365_PRICE_NEEDED').slice(0,limit),
  decisions:rows.filter(x=>x.signal!=='NO_SIGNAL').slice(0,limit),
  sample:rows.slice(0,Math.min(limit,30)),
  ...(preview?{preview}:{}),providerCalls:0,published:0};
}
