// BALL46 TEST: Pre-Match Statistics > All Matches / Total is 1X2-ONLY.
// Preserve combined Predictions presentation and independent BTTS statistics.
// No changes to backend ledgers, settlement, BTTS model, or Production.
export const B46_PREMATCH_TOTAL_1X2_ONLY_V1='B46_PREMATCH_TOTAL_1X2_ONLY_V1';
function replaceOnce(s,a,b,label){
 const count=s.split(a).length-1;
 if(count!==1)throw Error('B46_TOTAL_1X2_SOURCE_DRIFT_'+label+'_'+count);
 return s.replace(a,b);
}
export function patchTotalOneXTwoOnlyClient(original){
 if(typeof original!=='string'||
    !original.includes("Pre-Match · Total (1X2 + BTTS)")||
    !original.includes('function perfSource(){')||
    !original.includes("allLedger=j.allLedger?.mode==='TEST_ONLY'?j.allLedger:ledger;")||
    !original.includes("marketDailyBooks?.all")||
    !original.includes("b46-sidebar-section-type-v1"))
   throw Error('NOT_CURRENT_B46_PREMATCH_TEST_TOTAL_CLIENT');
 let s=original;
 s=replaceOnce(s,
   "const market=mode==='btts'?'BTTS':mode==='all'?'ALL':'1X2';",
   "const market=mode==='btts'?'BTTS':'1X2';",
   'TOTAL_RECEIVER_MARKET_1X2');
 s=replaceOnce(s,
   "if(mode!=='1x2')return null;",
   "if(mode!=='1x2'&&mode!=='all')return null;",
   'TOTAL_FETCHES_1X2_RECEIVER_GRAPH');
 s=replaceOnce(s,
   "    if(mode==='btts'||mode==='all'){\n      const active=mode==='btts'?bttsLedger:allLedger;\n      const rs=active?.stats??{},daily=mode==='btts'?(marketDailySeries?.btts??[]):(marketDailySeries?.all??[]);",
   "    if(mode==='btts'){\n      const active=bttsLedger;\n      const rs=active?.stats??{},daily=marketDailySeries?.btts??[];",
   'ONLY_BTTS_USES_BTTS_DAILY_AGGREGATE');
 s=replaceOnce(s,
   "mode==='all'?'Pre-Match · Total (1X2 + BTTS)'",
   "mode==='all'?'Pre-Match · Total (1X2)'",
   'TOTAL_TITLE_1X2_ONLY');
 s=replaceOnce(s,
   "const activeLedger=mode==='btts'?(bttsLedger??ledger):mode==='1x2'?ledger:(allLedger??ledger);",
   "const activeLedger=mode==='btts'?(bttsLedger??ledger):(mode==='all'||mode==='1x2')?ledger:(allLedger??ledger);",
   'TOTAL_READS_ONLY_1X2_LEDGER');
 s=replaceOnce(s,
   "const selectedBook=mode==='btts'?marketDailyBooks?.btts:mode==='1x2'?marketDailyBooks?.oneX2:marketDailyBooks?.all;",
   "const selectedBook=mode==='btts'?marketDailyBooks?.btts:(mode==='all'||mode==='1x2')?marketDailyBooks?.oneX2:marketDailyBooks?.all;",
   'TOTAL_TODAY_CALCULATES_ONLY_1X2');
 s=replaceOnce(s,
   "const stats=allLedger?.stats??ledger?.stats??{};\n    const oneX2=ledger?.stats??{},btts=bttsLedger?.stats??{};",
   "const predictionsStats=allLedger?.stats??ledger?.stats??{};\n    const oneX2=ledger?.stats??{},btts=bttsLedger?.stats??{};",
   'ISOLATE_PREDICTIONS_STATS');
 s=replaceOnce(s,
   "r.id==='predictions'?String(stats.pending??'—'):r.id==='btts'?rate(btts):r.id==='1x2'?rate(oneX2):rate(stats)",
   "r.id==='predictions'?String(predictionsStats.pending??'—'):r.id==='btts'?rate(btts):rate(oneX2)",
   'TOTAL_NAV_RATE_EXCLUDES_BTTS');
 // Combined Predictions deliberately retain allLedger, and BTTS retains its own ledger.
 if(!s.includes(":(allLedger??ledger);")||
    !s.includes("marketDailyBooks?.all")||
    !s.includes("const active=bttsLedger;")||
    !s.includes("r.id==='predictions'?String(predictionsStats.pending")||
    !s.includes("r.id==='btts'?rate(btts):rate(oneX2)"))
    throw Error('BTTS_INDEPENDENCE_OR_PREDICTIONS_VIEW_LOST');
 if(s.includes("Pre-Match · Total (1X2 + BTTS)")||
    s.includes("mode==='all'?'ALL'")||
    s.includes("if(mode==='btts'||mode==='all')")||
    s.includes("r.id==='1x2'?rate(oneX2):rate(stats)"))
   throw Error('BTTS_STILL_MIXED_IN_TOTAL');
 return {code:s,scope:'TEST_TOTAL_FORMULA_AND_LABEL_ONLY',
   totalMarket:'1X2',excludedFromTotal:['BTTS'],predictionsStillCombined:true,
   bttsMarketStillSeparate:true,apiCallsAdded:0,backendWrites:0};
}
