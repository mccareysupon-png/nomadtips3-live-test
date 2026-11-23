// PURE TEST VIEW PROJECTION: Show ONLY genuine, immutable, priced O/U V2
// selections in the EXISTING Pre-Match Predictions/Over-Under UI. No model,
// provider call, settlement write, additional ledger, or new page.
export function projectPricedOuV2Ui({shadowRows,identities,now,window,dayForTime,evaluate}){
 if(!Array.isArray(shadowRows)||!Number.isSafeInteger(now)||now<=0||
  !window||typeof dayForTime!=='function'||typeof evaluate!=='function')
  throw Error('OU_PRICED_UI_PROJECTION_INVALID_ARGUMENTS');
 const byId=new Map(),safeName=s=>typeof s==='string'&&s.trim()?s.trim().slice(0,140):null;
 for(const r of shadowRows){
  const id=Number(r?.fixture_id),homeId=Number(r?.home_id),awayId=Number(r?.away_id);
  const kickoff=Number(r?.kickoff),pickedAt=Number(r?.picked_at);
  const sourceObservedAt=Number(r?.source_observed_at);
  const line=Number(r?.line),price=Number(r?.price),ev=Number(r?.ev);
  if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(homeId)||homeId<=0||
   !Number.isSafeInteger(awayId)||awayId<=0||homeId===awayId||
   !Number.isSafeInteger(kickoff)||!Number.isSafeInteger(pickedAt)||
   kickoff-pickedAt<300||pickedAt>now+60||!Number.isSafeInteger(sourceObservedAt)||
   sourceObservedAt>pickedAt+10||pickedAt-sourceObservedAt>120||
   !['OVER','UNDER'].includes(r.pick)||!Number.isFinite(line)||line<0||line>20||
   Math.abs(line*4-Math.round(line*4))>1e-9||
   !Number.isFinite(price)||price<=1.50||
   !Number.isFinite(ev)||ev<0.05-1e-12||
   !String(r.source??'').startsWith('FULL_MARKET_CACHE_')||
   !safeName(r.bookmaker)||!safeName(r.model))continue;
  if(byId.has(id))continue;
  const who=identities?.[String(id)]??{};
  const home=safeName(who.home)??'Team #'+homeId;
  const away=safeName(who.away)??'Team #'+awayId;
  let probability=null;
  try{
   const calc=evaluate(Number(r.expected_goals),line,r.pick,price);
   const p=Number(calc.win)+Number(calc.halfWin);
   if(Number.isFinite(p)&&p>=0&&p<=1)probability=p;
  }catch{}
  byId.set(id,{
   fixture_id:id,home_id:homeId,away_id:awayId,
   league_id:Number.isSafeInteger(Number(who.leagueId))?Number(who.leagueId):0,
   leagueName:safeName(who.leagueName)??'League unavailable',
   home,away,kickoff,picked_at:pickedAt,observed:sourceObservedAt,
   market:'O/U',pick:r.pick+'_'+String(line),line,price,
   bookmaker:String(r.bookmaker),price_source:String(r.source),
   sourceObservedAt,probability,edge:null,ev,
   lambdaHome:Number(r.lambda_home),lambdaAway:Number(r.lambda_away),
   expectedTotalGoals:Number(r.expected_goals),
   home_count:Number(r.home_history)||0,away_count:Number(r.away_history)||0,
   historyConfidence:String(r.history_confidence??'LOW_SAMPLE'),
   status:'PENDING',hg:null,ag:null,settled_at:null,units:null,
   model:String(r.model),pricedV2:true,
   quoteTimestampUnverified:true
  });
 }
 const rows=[...byId.values()].sort((a,b)=>a.kickoff-b.kickoff||a.fixture_id-b.fixture_id);
 const today=window.businessDay;
 const todays=rows.filter(x=>dayForTime(x.picked_at)===today);
 const dailyMap=new Map();
 for(const row of rows){
  const day=dayForTime(row.picked_at);
  dailyMap.set(day,(dailyMap.get(day)??0)+1);
 }
 const dailySeries=[...dailyMap.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
  .map(([date,selected])=>({date,selected,settled:0,win:0,loss:0,draw:0,
   stakedUnits:null,netUnits:null,cumulativeUnits:null}));
 const ouLedger={mode:'TEST_ONLY',market:'O/U',modelOnly:false,pricedOnly:true,
  source:'B46_OU_VALUE_V2_IMMUTABLE_SHADOW',rows,
  stats:{total:rows.length,pending:rows.length,win:0,loss:0,push:0,draw:0,
   settled:0,winRate:null,units:null,pricedSettled:0,
   pricedPending:rows.length},publishedTest:rows.length,
  providerCalls:0,productionWrites:0};
 const ouDailyBook={window,
  selected:{total:todays.length,pending:todays.length},
  settled:{total:0,win:0,loss:0,push:0,draw:0,winRate:null,units:null},
  basis:'PRICED_V2_PENDING_NO_FT_SETTLEMENT',
  model:'LONDON_06_SHARED_WITH_LIVE',
  source:'O_U_V2_PRICE_LOCKED_TEST_UI',providerCalls:0};
 return {ouLedger,ouDailyBook,ouDailySeries:dailySeries,
  excludedModelOnlyV1:true,frontendDesignUnchanged:true,
  providerCalls:0,productionWrites:0};
}
