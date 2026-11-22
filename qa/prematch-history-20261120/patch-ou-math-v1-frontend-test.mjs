// BALL46 TEST frontend only: source-guarded O/U 2.5 issued cards and statistics.
const once=(s,a,b,label)=>{
 const hits=s.split(a).length-1;if(hits!==1)throw Error('OU_UI_SOURCE_DRIFT_'+label+'_'+hits);
 return s.replace(a,b);
};
export function patchOuUiClient(input){
 if(typeof input!=='string'||!input.includes("Pre-Match · Total (1X2)")||
    !input.includes("renderEmptyOuScreen(content,mode==='ou')")||
    !input.includes("!['1X2','BTTS','O/U'].includes(market)"))
  throw Error('NOT_CURRENT_OU_UI_TEST_CLIENT');
 let s=input;
 s=once(s,"let mode='', ledger=null, bttsLedger=null, allLedger=null, marketDailyBooks=null,",
  "let mode='', ledger=null, bttsLedger=null, allLedger=null, ouLedger=null,ouDailyBook=null,ouDailySeries=null,predictionsDailyBook=null,marketDailyBooks=null,",
  'OU_DATA_STATE');
 const source=[
 "    if(mode==='ou'){",
 "      const rs=ouLedger?.stats??{};",
 "      return {source:'OU_PERSISTED_SNAPSHOT_MODEL_ONLY',daily:ouDailySeries??[],",
 "        settled:Number(rs.settled||0),pending:Number(rs.pending||0),",
 "        win:Number(rs.win||0),draw:Number(rs.push||0),loss:Number(rs.loss||0),",
 "        units:null,staked:null,avgOdds:null};",
 "    }"
 ].join('\n');
 s=once(s,"     function perfSource(){","     function perfSource(){\n"+source+'\n','OU_PERFORMANCE_SOURCE');
 s=once(s,"const series=receiver?receiver.series[graphKey]",
  "const series=mode==='ou'&&performanceMetric!=='winRate'?[]:receiver?receiver.series[graphKey]",
  'NO_UNPRICED_UNITS_SERIES');
 s=once(s,"mode==='all'?'Pre-Match · Total (1X2)':mode==='btts'?",
  "mode==='all'?'Pre-Match · Total (1X2)':mode==='ou'?'Pre-Match · Over/Under (2.5)':mode==='btts'?",
  'OU_PERFORMANCE_TITLE');
 s=once(s,"if(mode==='ou'||mode==='ou-predictions'){\n      renderEmptyOuScreen(content,mode==='ou');",
  "if(mode==='ou-predictions'){\n      renderEmptyOuScreen(content,false);",
  'ENABLE_OU_STATISTICS');
 s=once(s,"const activeLedger=mode==='btts'?(bttsLedger??ledger):(mode==='all'||mode==='1x2')?ledger:(allLedger??ledger);",
  "const activeLedger=mode==='ou'?(ouLedger??{rows:[],stats:{}}):mode==='btts'?(bttsLedger??ledger):(mode==='all'||mode==='1x2')?ledger:(allLedger??ledger);",
  'OU_ROUTE_LEDGER');
 s=once(s,"const selectedBook=mode==='btts'?marketDailyBooks?.btts:(mode==='all'||mode==='1x2')?marketDailyBooks?.oneX2:marketDailyBooks?.all;",
  "const selectedBook=mode==='ou'?ouDailyBook:mode==='predictions'?predictionsDailyBook:mode==='btts'?marketDailyBooks?.btts:(mode==='all'||mode==='1x2')?marketDailyBooks?.oneX2:marketDailyBooks?.all;",
  'OU_ROUTE_DAILY');
 s=once(s,"r.id==='ou'||r.id==='ou-predictions'?'—':r.id==='predictions'?",
  "r.id==='ou-predictions'?'—':r.id==='ou'?rate(ouLedger?.stats??{}):r.id==='predictions'?",
  'OU_MENU_WINRATE');
 const load=[
 "       ouLedger=j.ouLedger?.mode==='TEST_ONLY'?j.ouLedger:{rows:[],stats:{total:0,pending:0,win:0,loss:0,winRate:null,units:null}};",
 "       ouDailyBook=j.ouDailyBook??null;",
 "       ouDailySeries=Array.isArray(j.ouDailySeries)?j.ouDailySeries:[];",
 "       // Combine issued rows ONLY on Predictions; Pre-Match Total stays 1X2-only.",
 "       const base=allLedger?.stats??{},os=ouLedger.stats??{};",
 "       const wi=Number(base.win||0)+Number(os.win||0),lo=Number(base.loss||0)+Number(os.loss||0);",
 "       const bothRows=[...(allLedger?.rows??[]),...(ouLedger.rows??[])];",
 "       allLedger={...allLedger,rows:bothRows,stats:{...base,total:Number(base.total||0)+Number(os.total||0),",
 "         pending:Number(base.pending||0)+Number(os.pending||0),win:wi,loss:lo,",
 "         winRate:wi+lo?100*wi/(wi+lo):null,units:ouLedger.rows?.length?null:base.units}};",
 "       const baseDay=marketDailyBooks?.all,ouDay=ouDailyBook;",
 "       const bw=Number(baseDay?.settled?.win||0)+Number(ouDay?.settled?.win||0);",
 "       const bl=Number(baseDay?.settled?.loss||0)+Number(ouDay?.settled?.loss||0);",
 "       predictionsDailyBook=baseDay?{...baseDay,",
 "         selected:{...baseDay.selected,total:Number(baseDay.selected?.total||0)+Number(ouDay?.selected?.total||0)},",
 "         settled:{...baseDay.settled,total:Number(baseDay.settled?.total||0)+Number(ouDay?.settled?.total||0),",
 "           win:bw,loss:bl,winRate:bw+bl?100*bw/(bw+bl):null,",
 "           units:ouLedger.rows?.length?null:baseDay.settled?.units}}:ouDay;"
 ].join('\n');
 s=once(s,"       marketDailyBooks=j.marketDailyBooks??null;",
  "       marketDailyBooks=j.marketDailyBooks??null;\n"+load,'LOAD_OU_FROM_TEST_PREVIEW');
 s=once(s,
  "board.append(el('small','b46pm-stats-note','AVG ODDS uses the odds saved when the Bot selected each pick, not changing live odds.'));",
  "board.append(el('small','b46pm-stats-note',mode==='ou'?'O/U 2.5 · Model-only test. Unverified odds; Win Rate uses FT outcomes. ROI/P/L unavailable.':'AVG ODDS uses the odds saved when the Bot selected each pick, not changing live odds.'));",
  'NO_FAKE_OU_ODDS_NOTE');
 if(s.includes("mode==='ou'||mode==='ou-predictions'")||
   !s.includes("mode==='all'?'Pre-Match · Total (1X2)'")||
   !s.includes("mode==='ou'?(ouLedger??")||
   !s.includes("r.id==='ou'?rate(ouLedger?.stats??{})")||
   !s.includes("j.ouLedger?.mode==='TEST_ONLY'"))throw Error('OU_UI_INVARIANT_FAILED');
 return {code:s,scope:'TEST_PREDICTIONS_AND_OU_STATS_ONLY',oneX2TotalUnchanged:true,
  providerCallsAdded:0,productionChanged:false};
}
