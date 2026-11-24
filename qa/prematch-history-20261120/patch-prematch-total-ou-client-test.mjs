// BALL46 TEST only: route Total statistics to genuine backend combined snapshots.
// No frontend arithmetic from prediction rows; no reuse of 1X2-only period book.
const changeOnce=(s,from,to,label)=>{
 const count=s.split(from).length-1;
 if(count!==1)throw Error('PREMATCH_TOTAL_OU_CLIENT_DRIFT_'+label+'_'+count);
 return s.replace(from,to);
};
export function patchPrematchTotalOuClient(client){
 if(typeof client!=='string'||!client.includes('window.B46PreMatchLiveMirror.render')||
  !client.includes("if(modeNext==='ou-predictions')return;")||
  !client.includes('marketDailySeries={'))throw Error('UNEXPECTED_PREMATCH_CLIENT');
 let out=client;
 out=changeOnce(out,
  "const activeLedger=mode==='ou'?(ouLedger??{rows:[],stats:{}}):mode==='btts'?(bttsLedger??ledger):(mode==='all'||mode==='1x2')?ledger:(allLedger??ledger);",
  "const activeLedger=mode==='ou'?(ouLedger??{rows:[],stats:{}}):mode==='btts'?(bttsLedger??ledger):mode==='all'?(allLedger??ledger):mode==='1x2'?ledger:(allLedger??ledger);",
  'ALL_MODE_LEDGER');
 out=changeOnce(out,
  "const selectedBook=mode==='ou'?ouDailyBook:mode==='predictions'?predictionsDailyBook:mode==='btts'?marketDailyBooks?.btts:(mode==='all'||mode==='1x2')?marketDailyBooks?.oneX2:marketDailyBooks?.all;",
  "const selectedBook=mode==='ou'?ouDailyBook:mode==='predictions'?predictionsDailyBook:mode==='btts'?marketDailyBooks?.btts:mode==='all'?marketDailyBooks?.all:mode==='1x2'?marketDailyBooks?.oneX2:marketDailyBooks?.all;",
  'ALL_MODE_PERIOD');
 const startMarker='// Combine issued rows ONLY on Predictions; Pre-Match Total stays 1X2-only.';
 const endMarker='marketDailySeries={';
 const start=out.indexOf(startMarker),end=out.indexOf(endMarker,start);
 if(start<0||end<=start||out.indexOf(startMarker,start+1)>=0)
  throw Error('PREMATCH_CLIENT_MERGE_ANCHORS_NOT_UNIQUE');
 const legacyMerge=out.slice(start,end);
 if(!legacyMerge.includes('const bothRows=')||!legacyMerge.includes('allLedger={...allLedger,rows:bothRows')||
  !legacyMerge.includes('predictionsDailyBook=baseDay?'))
  throw Error('UNEXPECTED_OLD_CLIENT_MERGE_BODY');
 out=out.slice(0,start)+
  "// Total and Predictions use the SAME 3-market persisted backend snapshot; no client-side remerge.\\n        "+
  'predictionsDailyBook=marketDailyBooks?.all??null;\n        '+
  out.slice(end);
 if(out.includes('Pre-Match · Total (1X2 + BTTS)'))
  out=changeOnce(out,'Pre-Match · Total (1X2 + BTTS)',
   'Pre-Match · Total (1X2 + BTTS + O/U)','TOTAL_LABEL');
 if(!out.includes("mode==='all'?(allLedger??ledger)")||
  !out.includes("mode==='all'?marketDailyBooks?.all")||
  out.includes("const bothRows=[...(allLedger?.rows??[]),...(ouLedger.rows??[])]")||
  !out.includes("mode==='1x2'?ledger")||
  !out.includes("mode==='ou'?(ouLedger??{rows:[],stats:{}})"))
  throw Error('PREMATCH_ALL_OU_ROUTING_POSTPATCH_FAILED');
 return {code:out,changed:true,usesPersistedBackend:true,avoidsDoubleCount:true};
}
