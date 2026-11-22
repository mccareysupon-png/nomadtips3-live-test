// Client-only minimal adaptation of the ALREADY EXISTING BALL46 Pre-Match
// TEST BTTS statistics view. No HTML or CSS redesign. Do not portray
// unpriced screening candidates as issued BTTS predictions.
export const BTTS_UI_V2_VERSION='B46_PM_BTTS_BULK_V2_READINESS_UI';
export const BTTS_READINESS_ROUTE='/__b46_pm_btts_readiness';
export function patchExistingBttsV2ReadinessUI(client){
 if(typeof client!=='string'||!client.includes('B46_PM_EXACT_LIVE_SCORE_DOM_MIRROR_V2')||
   !client.includes("bttsLedger=j.bttsLedger")||
   !client.includes("if(item.market==='BTTS'){list.append(premiumMatchRow"))
   throw Error('NOT_VERIFIED_EXISTING_BALL46_PREMATCH_TEST_CLIENT');
 let s=client;
 function replaceUnique(oldValue,newValue,label){
  const n=s.split(oldValue).length-1;
  if(n!==1)throw Error('BTTS_V2_UI_ANCHOR_DRIFT_'+label+'_'+n);
  s=s.replace(oldValue,newValue);
 }
 replaceUnique(
   "let mode='', ledger=null, bttsLedger=null, allLedger=null, marketDailyBooks=null, marketDailySeries=null, monitor=null, dailyBook=null,",
   "let mode='', ledger=null, bttsLedger=null, allLedger=null, marketDailyBooks=null, marketDailySeries=null, bttsScreening=null, bttsScreeningSequence=0, monitor=null, dailyBook=null,",
   'INDEPENDENT_SCREENING_STATE');
 replaceUnique(
   "if(!visible.length)list.append(el('p','b46pm-empty','No matches in this view.'));",
   "if(mode==='btts'){\n"+
   "      // Distinguish BTTS data readiness from issued BTTS predictions.\n"+
   "      const readiness=el('p','b46pm-empty',bttsScreeningLabel());\n"+
   "      readiness.id='b46pm-btts-readiness';\n"+
   "      readiness.setAttribute('role','status');\n"+
   "      list.append(readiness);\n"+
   "    }\n"+
   "    if(!visible.length&&mode!=='btts')\n"+
   "      list.append(el('p','b46pm-empty','No matches in this view.'));",
   'BTTS_STATUS_ONLY_IN_OLD_PREDICTION_HISTORY_LAYOUT');
 const helpers=(
  "// Read TEST-only screening totals through existing PREMATCH_STORE binding.\n"+
  "  function bttsScreeningLabel(){\n"+
  "    if(!bttsScreening)return 'BTTS TEST · Checking history coverage and Bet365 price status…';\n"+
  "    const n=v=>Number.isFinite(Number(v))?String(Math.max(0,Math.trunc(Number(v)))):'—';\n"+
  "    return 'BTTS TEST · History ready '+n(bttsScreening.historyReady)+' / '+n(bttsScreening.upcoming)+\n"+
  "      ' · Probability passed '+n(bttsScreening.modelProbabilityReady)+\n"+
  "      ' · Waiting Bet365 '+n(bttsScreening.quoteRequired)+\n"+
  "      ' · Qualified '+n(bttsScreening.qualified)+\n"+
  "      ' · Below are recorded predictions only.';\n"+
  "  }\n"+
  "  async function loadBttsScreening(){\n"+
  "    const request=++bttsScreeningSequence;\n"+
  "    try{\n"+
  "      const r=await fetch('/__b46_pm_btts_readiness',{cache:'no-store'});\n"+
  "      if(!r.ok)throw Error('READINESS_HTTP_'+r.status);\n"+
  "      const d=await r.json();\n"+
  "      if(d?.mode!=='READ_ONLY_BTTS_SHADOW'||!d.totals||\n"+
  "         !Number.isSafeInteger(d.totals.upcoming)||\n"+
  "         !Number.isSafeInteger(d.totals.historyReady)||\n"+
  "         !Number.isSafeInteger(d.totals.qualified))\n"+
  "        throw Error('UNEXPECTED_BTTS_READINESS_PAYLOAD');\n"+
  "      if(request!==bttsScreeningSequence)return;\n"+
  "      bttsScreening=d.totals;\n"+
  "    }catch(e){\n"+
  "      if(request!==bttsScreeningSequence)return;\n"+
  "      bttsScreening=null;\n"+
  "      console.warn('BTTS test readiness unavailable',String(e));\n"+
  "    }\n"+
  "    // Update status inline without repainting cards or jumping scroll.\n"+
  "    if(mode==='btts'){\n"+
  "      const line=$('#b46pm-btts-readiness');\n"+
  "      if(line)line.textContent=bttsScreeningLabel();\n"+
  "    }\n"+
  "  }\n"+
  "  function show(modeNext){"
 );
 replaceUnique("function show(modeNext){",helpers,'INDEPENDENT_READ_ONLY_HELPERS');
 replaceUnique(
   "updateMenu();\n    if(mode==='predictions'||ledger)draw();\n    load();",
   "updateMenu();\n    if(mode==='predictions'||ledger)draw();\n    if(mode==='btts')loadBttsScreening();\n    load();",
   'BTTS_ONLY_REFRESH_ON_OPEN');
 if(!s.includes('b46pm-btts-readiness')||!s.includes('loadBttsScreening()'))
   throw Error('BTTS_V2_UI_PATCH_NOT_APPLIED');
 return {code:s,previousBytes:client.length,nextBytes:s.length,
  onlyExistingBTTSView:true,noCSSChanges:true,no1X2LedgerChanges:true,noNewPage:true};
}
// Add ONE no-secret UI proxy route; source is the backend's existing safe
// read-only BTTS preview. No owner controls, cargo, paid API or production data.
export function patchBttsReadinessWorkerRoute(worker){
 if(typeof worker!=='string'||!worker.includes('PREMATCH_STORE.fetch('))
  throw Error('NOT_EXISTING_UI_WORKER');
 const anchor='if (u.pathname === "/__b46_prematch_data") return env.PREMATCH_STORE.fetch("https://prematch.internal/preview-data");';
 const extra='if (u.pathname === "'+BTTS_READINESS_ROUTE+'") return env.PREMATCH_STORE.fetch("https://prematch.internal/btts-preview-data?page=1&filter=ALL");';
 const count=worker.split(anchor).length-1;
 if(count!==1||worker.includes(extra))throw Error('READINESS_TEST_ROUTE_ANCHOR_CHANGED_'+count);
 return {code:worker.replace(anchor,anchor+'\n  '+extra),route:extra};
}
