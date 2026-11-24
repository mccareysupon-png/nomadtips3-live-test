// BALL46 isolated 42-formula Adaptive O/U 30D/90D charts.
// Compute chart points ONLY from incremental persistent daily snapshots.
// Never scan prediction ledgers on web reads, never combine into market TOTAL.
import {londonAccountingWindow} from './london-cutoff.mjs';
const all=(db,q,...args)=>Array.from(db.exec(q,...args));
const money=x=>Math.round(x*100000000)/100000000;
export function adaptiveSnapshotSeries(db,now,days){
 if(![30,90].includes(days))throw Error('ADAPTIVE_SERIES_DAYS_MUST_BE_30_OR_90');
 const businessDay=londonAccountingWindow(now).businessDay;
 const end=Date.parse(businessDay+'T00:00:00Z');
 const from=new Date(end-(days-1)*86400000).toISOString().slice(0,10);
 const baseline=all(db,"SELECT formula_id,COALESCE(SUM(net_units),0) opening FROM b46_adaptive_ou_research_v1_daily_test WHERE business_day<? GROUP BY formula_id",from);
 const history=all(db,"SELECT formula_id,business_day,selected,settled,win,loss,net_units FROM b46_adaptive_ou_research_v1_daily_test WHERE business_day>=? AND business_day<=? ORDER BY formula_id,business_day",from,businessDay);
 const first=new Map(baseline.map(x=>[x.formula_id,Number(x.opening)]));
 const byFormula=new Map();
 for(const r of history){
  if(!byFormula.has(r.formula_id))byFormula.set(r.formula_id,new Map());
  byFormula.get(r.formula_id).set(r.business_day,r);
 }
 const out={};
 for(const [formula,dayMap] of byFormula){
  let accumulated=first.get(formula)??0;
  const points=[];
  for(let i=0;i<days;i++){
   const date=new Date(Date.parse(from+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);
   const row=dayMap.get(date);
   const net=Number(row?.net_units??0);
   accumulated=money(accumulated+net);
   const win=Number(row?.win??0),loss=Number(row?.loss??0);
   points.push({date,selected:Number(row?.selected??0),settled:Number(row?.settled??0),
    win,loss,winRate:win+loss?Math.round(10000*win/(win+loss))/100:null,
    netUnits:money(net),cumulativeUnits:accumulated});
  }
  out[formula]=points;
 }
 return {rangeDays:days,start:from,end:businessDay,source:'PERSISTED_ADAPTIVE_DAILY_SNAPSHOT',
  cutoff:'06:00 Europe/London',byFormula:out,providerCalls:0,portfolioCombined:false};
}
