import assert from 'node:assert/strict';
const base='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const paths=['/__b46_prematch_data','/__b46_pm_adaptive_research','/__b46_prematch_graph?market=1X2&variant=all&filter=all&range=d30'];
for(const path of paths){
 const r=await fetch(base+path,{cache:'no-store',signal:AbortSignal.timeout(40000)});
 const j=await r.json().catch(()=>null);
 if(path.includes('adaptive')){
  console.log('B46_WIN_SOURCE '+JSON.stringify({path,status:r.status,code:j?.code,
   formulas:j?.formulas?.filter(x=>['A02','A03','A04','A05'].includes(x.formula)),
   otherFormulas:j?.formulas?.length,
   recent:j?.records?.slice(0,12).map(x=>({formula:x.formula_id,status:x.status,net:x.net_units,odds:x.odds,ft:[x.hg,x.ag]})),
   series30:j?.series30?.rangeDays,series90:j?.series90?.rangeDays,
   daily:j?.daily?.slice(0,10),totalRecords:j?.records?.length,
   chosen30:Object.fromEntries(['A02','A03','A04','A05'].map(f=>[f,{n:j?.series30?.byFormula?.[f]?.length,first:j?.series30?.byFormula?.[f]?.[0],last:j?.series30?.byFormula?.[f]?.at(-1)}])),
   source:j?.series30?.source
  }));
 }else if(path.includes('prematch_data')){
  console.log('B46_WIN_SOURCE '+JSON.stringify({path,status:r.status,
   ou:j?.ouLedger?.stats,ouRows:j?.ouLedger?.rows?.length,
   ouStatuses:j?.ouLedger?.rows?.slice(0,12).map(x=>({status:x.status,market:x.market,price:x.price,units:x.units})),
   ouDaily:j?.ouDailySeries?.slice(0,7),ouBook:j?.ouDailyBook,
   oneX2:j?.testLedger?.stats,all:j?.allLedger?.stats,
   keys:Object.keys(j||{}),graphs:j?.performanceGraphs?Object.keys(j.performanceGraphs):null
  }));
 }else{
  console.log('B46_WIN_SOURCE '+JSON.stringify({path,status:r.status,summary:j?.summary,source:j?.source,series:j?.series?Object.keys(j.series):null}));
 }
}
