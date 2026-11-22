// Patch ONLY the existing PreMatch TEST client rendering logic. The UI
// structure/styles, 1X2 formula, live cards, HCR, receiver and prod are not changed.
export function patchExistingBttsClient(client){
 if(typeof client!=='string'||!client.includes('B46_PM_EXACT_LIVE_SCORE_DOM_MIRROR_V2'))
  throw Error('NOT_EXISTING_PREMATCH_TEST_CLIENT');
 let s=client;
 const patch=(from,to,label)=>{
  const n=s.split(from).length-1;
  if(n!==1)throw Error('PREMATCH_UI_ANCHOR_DRIFT_'+label+'_FOUND_'+n);
  s=s.replace(from,to);
 };
 patch("let mode='', ledger=null, monitor=null, dailyBook=null,",
  "let mode='', ledger=null, bttsLedger=null, allLedger=null, marketDailyBooks=null, marketDailySeries=null, monitor=null, dailyBook=null,",'MARKET_STATE');
 patch("const outcome=p=>({'HOME_WIN':'1 · Home Win','DRAW':'X · Draw','AWAY_WIN':'2 · Away Win'}[p]||p);",
  "const outcome=p=>({'HOME_WIN':'1 · Home Win','DRAW':'X · Draw','AWAY_WIN':'2 · Away Win','BTTS_YES':'BTTS · Yes','BTTS_NO':'BTTS · No'}[p]||p);",'BTTS_PICK_LABEL');
 patch("const market=mode==='btts'?'BTTS':'1X2';\n    const candidate=performanceGraphs?.[market]?.[range]??performanceGraphs?.[range]??performanceGraph;",
  "const market=mode==='btts'?'BTTS':mode==='all'?'ALL':'1X2';\n    const candidate=market==='1X2'?(performanceGraphs?.[market]?.[range]??performanceGraphs?.[range]??performanceGraph):performanceGraphs?.[market]?.[range];",'ISOLATED_RECEIVER');
 patch("if(mode!=='all'&&mode!=='1x2')return null;",
  "if(mode!=='1x2')return null;",'DONT_USE_1X2_RECEIVER_FOR_ALL');
 patch("function perfSource(){\n    const graph=receiverDataForView();",
  `function perfSource(){
    if(mode==='btts'||mode==='all'){
      const active=mode==='btts'?bttsLedger:allLedger;
      const rs=active?.stats??{},daily=mode==='btts'?(marketDailySeries?.btts??[]):(marketDailySeries?.all??[]);
      const settled=Number(rs.win||0)+Number(rs.loss||0);
      return {source:'BTTS_TEST_SETTLED_DAILY',daily,
        settled,pending:Number(rs.pending||0),win:Number(rs.win||0),
        draw:0,loss:Number(rs.loss||0),units:Number(rs.units||0),
        staked:settled,avgOdds:avgOdds(active?.rows??[])};
    }
    const graph=receiverDataForView();`,'MARKET_PERFORMANCE_DAILY');
 patch("const source=perfSource(),empty=mode==='btts'&&source.source!=='RECEIVER';",
  "const source=perfSource(),empty=mode==='btts'&&Number(source.settled||0)===0;",'BTTS_GRAPH_SHOW_WHEN_SETTLED');
 patch("const {rows=[],stats={}}=ledger;\n    const hubRows=monitor?.monitor??{};",
  `const activeLedger=mode==='btts'?(bttsLedger??ledger):mode==='1x2'?ledger:(allLedger??ledger);
    const {rows=[],stats={}}=activeLedger;
    const hubRows=monitor?.monitor??{};`,'SELECT_MARKET_LEDGER');
 patch("const todayWindow=dailyBook?.window??null;\n    const period=",
  `const selectedBook=mode==='btts'?marketDailyBooks?.btts:mode==='1x2'?marketDailyBooks?.oneX2:marketDailyBooks?.all;
    const todayWindow=selectedBook?.window??dailyBook?.window??null;
    const period=`,'USE_MATCHING_ACCOUNTING_WINDOW');
 patch("const settled=period==='today'?(dailyBook?.settled??{}):stats;",
  "const settled=period==='today'?(selectedBook?.settled??{}):stats;",'MARKET_SETTLEMENT_WINDOW');
 patch("const picks=period==='today'?Number(dailyBook?.selected?.total??selectedToday.length):total;",
  "const picks=period==='today'?Number(selectedBook?.selected?.total??selectedToday.length):total;",'MARKET_SELECTED_WINDOW');
 patch("if(mode==='btts'){list.append(el('div','b46pm-empty','BTTS · No predictions recorded yet.'));content.append(list);finish();return}\n    const visible=[...rows].sort((a,b)=>{",
  "const visible=[...rows].sort((a,b)=>{",'NO_HARDCODED_BTTS_EMPTY');
 patch("const visible=[...rows].sort((a,b)=>{\n      const priority=x=>x.status==='PENDING'?",
  `const visible=[...rows].sort((a,b)=>{
      if(mode==='predictions')return Number(a.kickoff)-Number(b.kickoff)||
        Number(a.fixture_id)-Number(b.fixture_id)||String(a.market??'1X2').localeCompare(String(b.market??'1X2'));
      const priority=x=>x.status==='PENDING'?`,'CHRONOLOGICAL_PREDICTIONS');
 patch("const displayRows=mirrorOn?[...leagueGroups.values()].flat():visible;",
  "const displayRows=visible; // Never regroup out of chronological order.",'PRESERVE_KICKOFF_ORDER');
 patch("const displayedLeagues=new Set();",
  "const displayedLeagues=new Set();let lastPredictionsLeague=null;",'LEAGUE_SECTIONS_CHRONOLOGICAL');
 patch("if(!displayedLeagues.has(groupKey)){",
  "if(groupKey!==lastPredictionsLeague){lastPredictionsLeague=groupKey;",'REPEAT_LEAGUE_HEADER_WHEN_SEPARATED');
 patch("if(mode==='predictions'){\n        if(mirrorOn){",
  `if(mode==='predictions'){
        if(item.market==='BTTS'){list.append(premiumMatchRow(item,hub,!!monitor?.snapshotStale));continue}
        if(mirrorOn){`,'USE_EXISTING_CARD_FOR_BTTS');
 patch("const stats=ledger?.stats??{};\n    for(const r of routes){",
  `const stats=allLedger?.stats??ledger?.stats??{};
    const oneX2=ledger?.stats??{},btts=bttsLedger?.stats??{};
    const rate=s=>s.winRate==null?'—':Number(s.winRate).toFixed(2)+'%';
    for(const r of routes){`,'MENU_MARKET_STATS');
 patch("if(count)count.textContent=r.id==='predictions'?String(stats.pending??'—'):r.id==='btts'?'—':stats.winRate==null?'—':Number(stats.winRate).toFixed(2)+'%';",
  "if(count)count.textContent=r.id==='predictions'?String(stats.pending??'—'):r.id==='btts'?rate(btts):r.id==='1x2'?rate(oneX2):rate(stats);",'MENU_WINRATES');
 patch("ledger=j.testLedger;monitor=j.testMonitor??j.testLedger.testMonitor??null;dailyBook=j.dailyBook??j.testLedger.dailyBook??null;",
  `ledger=j.testLedger;
      bttsLedger=j.bttsLedger?.mode==='TEST_ONLY'?j.bttsLedger:{rows:[],stats:{total:0,pending:0,win:0,loss:0,units:0,winRate:null}};
      allLedger=j.allLedger?.mode==='TEST_ONLY'?j.allLedger:ledger;
      marketDailyBooks=j.marketDailyBooks??null;
      marketDailySeries={btts:Array.isArray(j.bttsDailySeries)?j.bttsDailySeries:[],
        all:Array.isArray(j.allDailySeries)?j.allDailySeries:[]};
      monitor=j.testMonitor??j.testLedger.testMonitor??null;dailyBook=j.dailyBook??j.testLedger.dailyBook??null;`,'LOAD_THREE_MARKET_DATA');
 return {code:s,changedOnly:'EXISTING_PREMATCH_CLIENT_BTTS_MARKET_INTEGRATION',sourceBytes:client.length,newBytes:s.length};
}
