// TEST-only source patch; refuses changed anchors. Never modifies source models.
const once=(s,a,b,label)=>{
 const n=s.split(a).length-1;if(n!==1)throw Error('OU_V1_MAIN_DRIFT_'+label+'_'+n);
 return s.replace(a,b);
};
export function patchOuMain(old){
 if(typeof old!=='string'||!old.includes('class PrematchStore extends DurableObject')||
  !old.includes("if(path==='/btts-cycle-test'&&req.method==='POST')")||
  !old.includes('combinedPrematchLedgers(ledgerNow,bttsRaw)')||
  !old.includes('const bttsIssued=await this.recordQualifiedBtts(now,fixtures);'))
  throw Error('NOT_CURRENT_B46_TEST_BACKEND');
 let s=old;
 s=once(s,
  "import {initPreMarketStatsRegistry,syncPreMarketStatsRegistry,readPreMarketStatsRegistry,auditPreMarketStatsRegistry} from './prematch-stats-registry-test.mjs';",
  "import {initPreMarketStatsRegistry,syncPreMarketStatsRegistry,readPreMarketStatsRegistry,auditPreMarketStatsRegistry} from './prematch-stats-registry-test.mjs';\n"+
  "import {initOu,screenOu,recordOu,settleOu,syncOuSnapshot,readOuLedger,readOuSnapshot,historicalOuBacktest,OU_POLICY} from './ou-math-v1-test.mjs';",
  'MODULE_IMPORT');
 s=once(s,"initPreMarketStatsRegistry(this.db)}","initPreMarketStatsRegistry(this.db);initOu(this.db)}",'NEW_LEDGER_BOOT');
 s=once(s,
  "const bttsSettled=settleBttsPicks(this.db,now);\n   if(settled||bttsSettled)syncPreMarketStatsRegistry(this.db,now);",
  "const bttsSettled=settleBttsPicks(this.db,now);\n   const ouSettled=settleOu(this.db,now);\n   if(ouSettled.settled)syncOuSnapshot(this.db,now);\n   if(settled||bttsSettled)syncPreMarketStatsRegistry(this.db,now);",
  'FT_AUTO_SETTLEMENT');
 s=once(s,
  "const allLedgerNow={...allRaw,stats:registry.markets.TOTAL};",
  "const allLedgerNow={...allRaw,stats:registry.markets.TOTAL};\n const ouLedgerNow=readOuLedger(this.db,now),ouSnapshotNow=readOuSnapshot(this.db,now);",
  'INDEPENDENT_OU_SNAPSHOT');
 s=once(s,
  "bttsLedger:bttsLedgerNow,allLedger:allLedgerNow,marketDailyBooks:dailyMarkets,",
  "bttsLedger:bttsLedgerNow,allLedger:allLedgerNow,ouLedger:ouLedgerNow,ouDailyBook:ouSnapshotNow.dailyBook,ouDailySeries:ouSnapshotNow.dailySeries,marketDailyBooks:dailyMarkets,",
  'PREVIEW_OU_PROJECTION');
 const cycle=[
  "  // O/U MODEL-ONLY research: no paid odds; separate durable prediction ledger.",
  "  if(path==='/ou-cycle-test'&&req.method==='POST'){",
  "   const fixtures=await this.ctx.storage.get('botFixtures')??[];",
  "   const screening=screenOu(this.db,fixtures,now,350);",
  "   const recorded=recordOu(this.db,screening,now);",
  "   const settled=settleOu(this.db,now);",
  "   const sync=syncOuSnapshot(this.db,now);",
  "   const registry=readOuSnapshot(this.db,now);",
  "   return json({mode:'OU_MATH_V1_TEST',screening:screening.counts,recorded,settled,sync,stats:registry.stats,model:OU_POLICY.model,providerCalls:0,paidOddsRequested:0});",
  "  }",
  "  if(path==='/ou-state-test'&&req.method==='GET'){",
  "   const out=readOuSnapshot(this.db,now);",
  "   return json({mode:'OU_MATH_V1_TEST',policy:OU_POLICY,stats:out.stats,dailyBook:out.dailyBook,dailySeries:out.dailySeries,providerCalls:0});",
  "  }",
  "  if(path==='/ou-backtest-test'&&req.method==='GET'){",
  "   const requested=Number(new URL(req.url).searchParams.get('limit')||350);",
  "   return json(historicalOuBacktest(this.db,requested));",
  "  }",
 ].join('\n')+'\n';
 s=once(s,"  if(path==='/btts-shadow'&&req.method==='GET'){",cycle+"  if(path==='/btts-shadow'&&req.method==='GET'){",'OWNER_RESEARCH_ROUTES');
 s=once(s,
  "const bttsIssued=await this.recordQualifiedBtts(now,fixtures);\n  const statsRegistry=syncPreMarketStatsRegistry(this.db,now);",
  "const bttsIssued=await this.recordQualifiedBtts(now,fixtures);\n  let ouRun={state:'NOT_EXECUTED'};\n  try{const trial=screenOu(this.db,fixtures,now,350);const issued=recordOu(this.db,trial,now);const ouSettled=settleOu(this.db,now);const sync=syncOuSnapshot(this.db,now);ouRun={state:'MODEL_ONLY_TEST',counts:trial.counts,issued,settled:ouSettled,snapshotUpdated:sync.processed}}catch(error){ouRun={state:'REVIEW_REQUIRED',error:String(error.message).slice(0,130)}}\n  const statsRegistry=syncPreMarketStatsRegistry(this.db,now);",
  'AUTO_BOT_FLOW');
 s=once(s,
  "qualified:out.qualified,dailyBook,bttsIssued,statsRegistry};",
  "qualified:out.qualified,dailyBook,bttsIssued,ouRun,statsRegistry};",
  'BOT_OWNER_REPORT');
 s=once(s,
  "const b=await stub.fetch('https://prematch.internal/btts-cycle-test',{method:'POST'});console.log('BTTS_TEST_ONLY_CYCLE '+b.status)",
  "const b=await stub.fetch('https://prematch.internal/btts-cycle-test',{method:'POST'});console.log('BTTS_TEST_ONLY_CYCLE '+b.status);const ou=await stub.fetch('https://prematch.internal/ou-cycle-test',{method:'POST'});console.log('OU_MATH_V1_TEST_CYCLE '+ou.status)",
  'CRON_15MIN_EXISTING_CYCLE');
 const necessary=["from './ou-math-v1-test.mjs'","initOu(this.db)","ouLedger:ouLedgerNow","const ouSettled=settleOu(this.db,now)","path==='/ou-cycle-test'","path==='/ou-backtest-test'","OU_MATH_V1_TEST_CYCLE"];
 if(necessary.some(x=>!s.includes(x)))throw Error('OU_TEST_SOURCE_WIRING_INCOMPLETE');
 return {code:s,scope:'ISOLATED_PREMATCH_TEST_WORKER',newModule:'ou-math-v1-test.mjs',providerCallsAdded:0,oneX2ModelChanged:false,btTsModelChanged:false,productionChanged:false};
}
