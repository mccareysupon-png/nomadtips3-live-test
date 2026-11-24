// Read-only PreMatch O/U TEST overview: sum existing original O/U snapshot
// plus every Adaptive formula's ALL snapshot. One recorded formula pick = one 1u
// research observation; same fixture under different formulas counts separately.
// This is NEVER BALL46's production/multi-market Total.
export function combineOuOverview(ouLedger,ouDailySeries,ouDailyBook,adaptive){
 const good=n=>Number.isFinite(Number(n));
 const number=n=>good(n)?Number(n):0;
 const money=n=>Math.round((n+Number.EPSILON)*1e8)/1e8;
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
 if(!ouLedger||!ouLedger.stats||adaptive?.code!=='B46_ADAPTIVE_OU_RESEARCH_V1'||
    !Array.isArray(adaptive.formulas)||!Array.isArray(adaptive.daily))
  throw Error('B46_OU_AGGREGATE_SNAPSHOT_UNAVAILABLE');
 const formulas=adaptive.formulas.filter(f=>f.selection==='ALL');
 if(!formulas.length||new Set(formulas.map(f=>f.formula)).size!==formulas.length)
  throw Error('B46_OU_AGGREGATE_FORMULA_REGISTRY_INVALID');
 const original=ouLedger.stats;
 const baseWin=number(original.win),baseLoss=number(original.loss),baseDraw=number(original.push??original.draw);
 const basePending=number(original.pending),baseTotal=number(original.total);
 const baseSettled=number(original.settled??(baseWin+baseLoss+baseDraw));
 if(baseWin+baseLoss+baseDraw!==baseSettled||baseTotal<basePending+baseSettled)
  throw Error('B46_OU_AGGREGATE_BASE_ACCOUNT_INVALID');
 const basePL=number(original.units);
 let total=baseTotal,pending=basePending,win=baseWin,loss=baseLoss,draw=baseDraw,
  settled=baseSettled,units=basePL;
 let adaptiveOddsSum=0,adaptiveCount=0;
 for(const f of formulas){
  const t=number(f.totalPredictions),p=number(f.pending),w=number(f.win),l=number(f.loss);
  if(t!==p+w+l)throw Error('B46_OU_AGGREGATE_FORMULA_ACCOUNT_INVALID_'+f.formula);
  total+=t;pending+=p;win+=w;loss+=l;settled+=w+l;units+=number(f.profitLoss);
  if(t>0&&good(f.averageOdds)){adaptiveOddsSum+=t*number(f.averageOdds);adaptiveCount+=t;}
 }
 const baseRows=Array.isArray(ouLedger.rows)?ouLedger.rows:[];
 const baseOdds=baseRows.filter(r=>good(r.price??r.odds)&&number(r.price??r.odds)>1)
  .map(r=>number(r.price??r.odds));
 const avgComplete=baseOdds.length===baseTotal&&adaptiveCount===total-baseTotal;
 const avgOdds=avgComplete&&total>0?money((baseOdds.reduce((a,b)=>a+b,0)+adaptiveOddsSum)/total):null;
 const overview={total,pending,settled,win,loss,draw,units:money(units),
  winRate:win+loss?money(win/(win+loss)*100):null,
  roi:settled?money(units/settled*100):null,staked:settled,avgOdds};
 // Each row is already a London 06:00 business-day incremental snapshot.
 // A daily FT may settle older picks, therefore selected and settled need not match.
 const days=new Map();
 const get=d=>{
  if(!days.has(d))days.set(d,{date:d,selected:0,settled:0,win:0,loss:0,draw:0,
   stakedUnits:0,netUnits:0});
  return days.get(d);
 };
 for(const r of Array.isArray(ouDailySeries)?ouDailySeries:[]){
  if(!date(r.date))continue;
  const d=get(r.date);
  d.selected+=number(r.selected);d.settled+=number(r.settled);
  d.win+=number(r.win);d.loss+=number(r.loss);d.draw+=number(r.draw??r.push);
  d.stakedUnits+=number(r.stakedUnits??r.settled);
  d.netUnits+=number(r.netUnits);
 }
 const valid=new Set(formulas.map(f=>f.formula));
 for(const r of adaptive.daily){
  if(!valid.has(r.formula_id)||!date(r.business_day))continue;
  const d=get(r.business_day);
  d.selected+=number(r.selected);d.settled+=number(r.settled);
  d.win+=number(r.win);d.loss+=number(r.loss);
  d.stakedUnits+=number(r.settled);
  d.netUnits+=number(r.net_units);
 }
 const sorted=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
 // If the daily endpoint has a finite lookback, open at the all-time
 // snapshot baseline. Never invent missing daily wins/losses or trades.
 const opening=money(overview.units-sorted.reduce((s,r)=>s+r.netUnits,0));
 let running=opening;
 const daily=sorted.map(r=>{
  running=money(running+r.netUnits);
  return {...r,netUnits:money(r.netUnits),cumulativeUnits:running};
 });
 const businessDay=ouDailyBook?.window?.businessDay||daily.at(-1)?.date||null;
 const baseToday=ouDailyBook?.settled??{};
 const adaptiveToday=adaptive.daily.filter(r=>valid.has(r.formula_id)&&r.business_day===businessDay);
 const aday=(f)=>adaptiveToday.reduce((a,r)=>a+number(r[f]),0);
 const todays=businessDay?days.get(businessDay):null;
 const dateCutoff=ouDailyBook?.window;
 const pendingRecent=Array.isArray(adaptive.records)&&
  dateCutoff&&good(dateCutoff.begin)&&good(dateCutoff.end)
  ?adaptive.records.filter(r=>valid.has(r.formula_id)&&r.status==='PENDING'&&
    number(r.picked_at)>=number(dateCutoff.begin)&&number(r.picked_at)<number(dateCutoff.end)).length:null;
 const originalPendingToday=Array.isArray(ouLedger.rows)&&dateCutoff?
  ouLedger.rows.filter(r=>r.status==='PENDING'&&number(r.picked_at)>=number(dateCutoff.begin)&&number(r.picked_at)<number(dateCutoff.end)).length:0;
 const todayWin=number(baseToday.win)+aday('win'),todayLoss=number(baseToday.loss)+aday('loss');
 const todayDraw=number(baseToday.push??baseToday.draw),todaySettled=number(baseToday.total)+aday('settled');
 const todayUnits=money(number(baseToday.units)+aday('net_units'));
 const today={total:number(ouDailyBook?.selected?.total)+aday('selected'),
  settled:todaySettled,win:todayWin,loss:todayLoss,draw:todayDraw,
  pending:pendingRecent===null?null:originalPendingToday+pendingRecent,
  units:todayUnits,winRate:todayWin+todayLoss?money(100*todayWin/(todayWin+todayLoss)):null,
  roi:todaySettled?money(todayUnits/todaySettled*100):null,
  avgOdds:null,staked:todaySettled,selected:todays?.selected??0};
 return {source:'O_U_ORIGINAL_PLUS_ALL_ADAPTIVE_SNAPSHOTS_TEST_ONLY',
  accountScope:'O_U_TEST_OVERVIEW_ONLY',formulaCount:formulas.length,
  observationUnit:'ONE_UNIT_PER_FORMULA_PICK',portfolioIsNotReal:true,
  total:overview,today,daily,openingUnits:opening,businessDay};
}
