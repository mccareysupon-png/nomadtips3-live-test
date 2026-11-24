import test from 'node:test';
import assert from 'node:assert/strict';
import {patchPrematchTotalOuClient} from './patch-prematch-total-ou-client-test.mjs';
const client=[
  "window.B46PreMatchLiveMirror.render",
  "if(modeNext==='ou-predictions')return;",
  "const activeLedger=mode==='ou'?(ouLedger??{rows:[],stats:{}}):mode==='btts'?(bttsLedger??ledger):(mode==='all'||mode==='1x2')?ledger:(allLedger??ledger);",
  "const selectedBook=mode==='ou'?ouDailyBook:mode==='predictions'?predictionsDailyBook:mode==='btts'?marketDailyBooks?.btts:(mode==='all'||mode==='1x2')?marketDailyBooks?.oneX2:marketDailyBooks?.all;",
  "// Combine issued rows ONLY on Predictions; Pre-Match Total stays 1X2-only.",
  "const base=allLedger?.stats??{},os=ouLedger.stats??{};",
  "const bothRows=[...(allLedger?.rows??[]),...(ouLedger.rows??[])];",
  "allLedger={...allLedger,rows:bothRows,stats:{...base}};",
  "predictionsDailyBook=baseDay?{}:ouDay;",
  "marketDailySeries={btts:[],all:[]};",
  "Pre-Match · Total (1X2 + BTTS)"
].join('\n');
test('Total reads actual 3-market backend totals and period; no client re-aggregation',()=>{
 const v=patchPrematchTotalOuClient(client).code;
 assert(v.includes("mode==='all'?(allLedger??ledger)"));
 assert(v.includes("mode==='all'?marketDailyBooks?.all"));
 assert(v.includes("mode==='1x2'?ledger"));
 assert(v.includes("predictionsDailyBook=marketDailyBooks?.all??null;"));
 assert(!v.includes("const bothRows="));
 assert(v.includes('Pre-Match · Total (1X2 + BTTS + O/U)'));
 assert(v.includes('window.B46PreMatchLiveMirror.render'));
});
test('Abort if deployed UI does not have recognizable original exact anchors',()=>{
 assert.throws(()=>patchPrematchTotalOuClient(client.replace("const bothRows=","const other=")),
  /UNEXPECTED_OLD_CLIENT_MERGE_BODY/);
});
