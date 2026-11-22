import test from 'node:test';
import assert from 'node:assert/strict';
import {patchExistingBttsV2ReadinessUI,patchBttsReadinessWorkerRoute,BTTS_READINESS_ROUTE} from './patch-existing-btts-bulk-v2-readiness-ui-20261122.mjs';
const fixture="B46_PM_EXACT_LIVE_SCORE_DOM_MIRROR_V2"+
  "\nlet mode='', ledger=null, bttsLedger=null, allLedger=null, marketDailyBooks=null, marketDailySeries=null, monitor=null, dailyBook=null,"+
  "\nfunction draw(){\nif(!visible.length)list.append(el('p','b46pm-empty','No matches in this view.'));\n}"+
  "\nfunction show(modeNext){\nupdateMenu();\n    if(mode==='predictions'||ledger)draw();\n    load();\n}"+
  "\nbttsLedger=j.bttsLedger"+
  "\nif(item.market==='BTTS'){list.append(premiumMatchRow(item,hub,!!monitor?.snapshotStale));continue}";
test('additive BTTS readiness appears only in existing BTTS tab, not 1X2 or other markets',()=>{
 const patched=patchExistingBttsV2ReadinessUI(fixture);
 assert(patched.code.includes("if(mode==='btts'){"));
 assert(patched.code.includes("if(!visible.length&&mode!=='btts')"));
 assert(patched.code.includes("if(mode==='btts')loadBttsScreening();"));
 assert(patched.code.includes("if(mode==='btts'){\n      const line=$('#b46pm-btts-readiness');"));
 assert(patched.code.includes("recorded predictions only"));
 assert(patched.noCSSChanges);
 assert(patched.no1X2LedgerChanges);
 assert(patched.noNewPage);
 assert.throws(()=>patchExistingBttsV2ReadinessUI(patched.code),/ANCHOR_DRIFT_/);
});
test('public UI proxy only forwards existing read-only BTTS preview from existing TEST service',()=>{
 const before='if (u.pathname === "/__b46_prematch_data") return env.PREMATCH_STORE.fetch("https://prematch.internal/preview-data");';
 const patched=patchBttsReadinessWorkerRoute(before);
 assert(patched.code.includes(BTTS_READINESS_ROUTE));
 assert(patched.code.includes('prematch.internal/btts-preview-data?page=1&filter=ALL'));
 assert(patched.code.includes(before));
 assert(!patched.code.includes('OWNER_SECRET'));
 assert(!patched.code.includes('FIVEDOLLAR_API_KEY'));
 assert.throws(()=>patchBttsReadinessWorkerRoute(patched.code),/READINESS_TEST_ROUTE_ANCHOR_CHANGED/);
});
