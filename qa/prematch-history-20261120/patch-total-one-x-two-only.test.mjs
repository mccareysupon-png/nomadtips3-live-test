import test from 'node:test';
import assert from 'node:assert/strict';
import {patchTotalOneXTwoOnlyClient} from './patch-total-one-x-two-only-test-20261122.mjs';
const code=[
 "const activeTitle='Pre-Match · Total (1X2 + BTTS)';",
 "const x='b46-sidebar-section-type-v1';",
 "const market=mode==='btts'?'BTTS':mode==='all'?'ALL':'1X2';",
 "if(mode!=='1x2')return null;",
 "function perfSource(){",
 "    if(mode==='btts'||mode==='all'){",
 "      const active=mode==='btts'?bttsLedger:allLedger;",
 "      const rs=active?.stats??{},daily=mode==='btts'?(marketDailySeries?.btts??[]):(marketDailySeries?.all??[]);",
 "    }",
 "const subtitle=mode==='all'?'Pre-Match · Total (1X2 + BTTS)':mode==='btts'?'BTTS':'1X2';",
 "const activeLedger=mode==='btts'?(bttsLedger??ledger):mode==='1x2'?ledger:(allLedger??ledger);",
 "const selectedBook=mode==='btts'?marketDailyBooks?.btts:mode==='1x2'?marketDailyBooks?.oneX2:marketDailyBooks?.all;",
 "const stats=allLedger?.stats??ledger?.stats??{};",
 "    const oneX2=ledger?.stats??{},btts=bttsLedger?.stats??{};",
 "if(count)count.textContent=r.id==='ou'||r.id==='ou-predictions'?'—':r.id==='predictions'?String(stats.pending??'—'):r.id==='btts'?rate(btts):r.id==='1x2'?rate(oneX2):rate(stats);",
 "allLedger=j.allLedger?.mode==='TEST_ONLY'?j.allLedger:ledger;"
].join('\n');
test('Total reads only 1X2 ledger, daily summary and 1X2 receiver graph',()=>{
 const source=code.replace("const activeTitle='Pre-Match · Total (1X2 + BTTS)';\n",'');
 const r=patchTotalOneXTwoOnlyClient(source);
 assert.equal(r.totalMarket,'1X2');
 assert(!r.code.includes('1X2 + BTTS'));
 assert(r.code.includes("const market=mode==='btts'?'BTTS':'1X2';"));
 assert(r.code.includes("if(mode!=='1x2'&&mode!=='all')return null;"));
 assert(r.code.includes("const active=bttsLedger;"));
 assert(r.code.includes("mode==='all'||mode==='1x2')?ledger:(allLedger??ledger)"));
 assert(r.code.includes("mode==='all'||mode==='1x2')?marketDailyBooks?.oneX2"));
 assert(r.code.includes("r.id==='btts'?rate(btts):rate(oneX2)"));
 assert.equal(r.backendWrites,0);
});
test('combined Predictions and independent BTTS are preserved',()=>{
 const c=patchTotalOneXTwoOnlyClient(code.replace("const activeTitle='Pre-Match · Total (1X2 + BTTS)';\n",'')).code;
 assert(c.includes("allLedger=j.allLedger?.mode==='TEST_ONLY'?j.allLedger:ledger;"));
 assert(c.includes("mode==='btts'?(bttsLedger??ledger)"));
 assert(c.includes(":(allLedger??ledger)"));
 assert(c.includes("r.id==='predictions'?String(predictionsStats.pending"));
});
test('fails closed on source drift',()=>{
 assert.throws(()=>patchTotalOneXTwoOnlyClient('other'),/NOT_CURRENT/);
 assert.throws(()=>patchTotalOneXTwoOnlyClient(code.replace("const activeTitle='Pre-Match · Total (1X2 + BTTS)';\n",'').replace("mode==='all'?'ALL'", "mode==='all'?'OTHER'")),/SOURCE_DRIFT/);
});
