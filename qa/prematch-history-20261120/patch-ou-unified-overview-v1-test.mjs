import {combineOuOverview} from './b46-ou-overview-aggregate-test-v1.mjs';
export const B46_OU_ALL_ACCOUNTS_OVERVIEW_V1='B46_OU_ALL_ACCOUNTS_OVERVIEW_V1';
const one=(source,from,to,label)=>{
 const n=source.split(from).length-1;
 if(n!==1)throw Error('B46_OU_OVERVIEW_SOURCE_DRIFT_'+label+'_'+n);
 return source.replace(from,to);
};
export function patchOuUnifiedOverviewClient(client){
 if(typeof client!=='string'||!client.includes('B46_ADAPTIVE_NATIVE_CHART_30_90_V3')||
  !client.includes('B46_PM_CONTENT_ONLY_LOADING_V1')||
  !client.includes("  function performancePanel(){")||
  !client.includes("  function draw(pageOnly=false){"))throw Error('EXPECTED_CURRENT_PREMATCH_TEST_CLIENT');
 if(client.includes(B46_OU_ALL_ACCOUNTS_OVERVIEW_V1))throw Error('OU_OVERVIEW_ALREADY_INSTALLED');
 const overviewFunc="\n  // B46_OU_ALL_ACCOUNTS_OVERVIEW_V1. UI aggregation only; no ledger mutation.\n"+
   "  const b46AggregateOuSnapshot="+combineOuOverview.toString()+";\n"+
   "  function b46OuOverviewData(){\n"+
   "    if(!ouLedger||!b46AdaptiveData)return null;\n"+
   "    try{return b46AggregateOuSnapshot(ouLedger,ouDailySeries,ouDailyBook,b46AdaptiveData);}\n"+
   "    catch(error){console.warn('Pre-Match O/U aggregate snapshot:',String(error));b46AdaptiveOverviewError=true;return null;}\n"+
   "  }\n";
 let out=one(client,"    function perfSource(){",overviewFunc+"    function perfSource(){",'AGGREGATOR');
 const priorSource=`    if(mode==='ou'){
      const rs=ouLedger?.stats??{};
      return {source:'OU_PERSISTED_SNAPSHOT_MODEL_ONLY',daily:ouDailySeries??[],
        settled:Number(rs.settled||0),pending:Number(rs.pending||0),
        win:Number(rs.win||0),draw:Number(rs.push||0),loss:Number(rs.loss||0),
        units:null,staked:null,avgOdds:null};
    }`;
 const newSource=`    if(mode==='ou'){
      const combined=b46OuOverviewData();
      const s=combined?.total;
      return {source:'OU_ADAPTIVE_COMBINED_VIEW_ONLY',
        daily:combined?.daily??[],settled:s?.settled??0,pending:s?.pending??0,
        win:s?.win??0,draw:s?.draw??0,loss:s?.loss??0,
        units:s?.units??null,staked:s?.staked??null,avgOdds:s?.avgOdds??null};
    }`;
 out=one(out,priorSource,newSource,'PERF_SOURCE_OU');
 out=one(out,"  function performancePanel(){",
 `  function performancePanel(){
    if(mode==='ou'&&!b46OuOverviewData()){
      const waiting=el('section','b46pm-performance');
      if(b46AdaptiveOverviewError){
        const block=el('div','b46pm-inline-wait');
        block.append(el('p','b46pm-inline-error','Combined Over/Under statistics unavailable.'));
        const retry=el('button','b46pm-inline-retry','Retry');
        retry.type='button';
        retry.addEventListener('click',()=>{
          b46AdaptiveOverviewError=false;b46AdaptiveAt=0;draw();
        });
        block.append(retry);waiting.append(block);
      }else waiting.append(b46PrematchLoadingContent());
      return waiting;
    }`,'PERF_WAIT');
 out=one(out,
 "    const series=mode==='ou'&&performanceMetric!=='winRate'?[]:receiver?receiver.series[graphKey].map(p=>({date:new Date(p.date).toISOString().slice(0,10),value:p.value}))",
 "    const series=receiver?receiver.series[graphKey].map(p=>({date:new Date(p.date).toISOString().slice(0,10),value:p.value}))",
 'REMOVE_GRAPH_SUPPRESSION');
 out=one(out,
 "  let b46AdaptiveData=null,b46AdaptiveAt=0,b46AdaptiveLoading=null;",
 "  let b46AdaptiveData=null,b46AdaptiveAt=0,b46AdaptiveLoading=null,b46AdaptiveOverviewError=false;",
 'ERROR_STATE');
 out=one(out,
 "          b46AdaptiveData=d;b46AdaptiveAt=Date.now();\n          if(mode==='ou'&&content.isConnected)b46AdaptivePanel(content);",
 "          b46AdaptiveData=d;b46AdaptiveAt=Date.now();b46AdaptiveOverviewError=false;\n          if(mode==='ou'&&content.isConnected)draw();",
 'ON_SNAPSHOT_READY_RENDER_OVERVIEW');
 out=one(out,
 "        .catch(e=>{\n          const live=document.getElementById('b46-adaptive-native');",
 "        .catch(e=>{\n          b46AdaptiveOverviewError=true;\n          if(mode==='ou')draw();\n          const live=document.getElementById('b46-adaptive-native');",
 'ON_SNAPSHOT_ERROR');
 out=one(out,
 "    if(!b46AdaptiveLoading&&(!b46AdaptiveData||Date.now()-b46AdaptiveAt>60000)){",
 "    if(!b46AdaptiveOverviewError&&!b46AdaptiveLoading&&(!b46AdaptiveData||Date.now()-b46AdaptiveAt>60000)){",
 'RETRY_GUARD');
 // The existing scroll memory was accidentally declared inside draw().
 // Moving it into its persistent lexical scope avoids a position jump
 // when the delayed Adaptive snapshot finally refreshes the overview.
 out=one(out,"    let b46PrematchLastScrollRoute=null; // B46_PREMATCH_NAV_SCROLL_V1\nconst finish=()=>{",
 "const finish=()=>{",'SCROLL_REMOVE_LOCAL');
 out=one(out,"  function draw(pageOnly=false){",
 "  let b46PrematchLastScrollRoute=null; // B46_PREMATCH_NAV_SCROLL_V1\n  function draw(pageOnly=false){",'SCROLL_KEEP_ROUTE');
 out=one(out,"    const {rows=[],stats={}}=activeLedger;",
 `    const {rows=[],stats:originalMarketStats={}}=activeLedger;
    const b46OuCombined=mode==='ou'?b46OuOverviewData():null;
    const stats=mode==='ou'?(b46OuCombined?.total??{
      total:0,settled:0,pending:0,win:0,loss:0,winRate:null,units:null
    }):originalMarketStats;`,'TOP_STATS_SOURCE');
 out=one(out,
 "    const settled=period==='today'?(selectedBook?.settled??{}):stats;",
 "    const settled=mode==='ou'&&b46OuCombined?(period==='today'?b46OuCombined.today:b46OuCombined.total):period==='today'?(selectedBook?.settled??{}):stats;",
 'TODAY_SETTLED_SOURCE');
 out=one(out,
 "    const picks=period==='today'?Number(selectedBook?.selected?.total??selectedToday.length):total;",
 "    const picks=mode==='ou'&&b46OuCombined?Number(period==='today'?b46OuCombined.today.total:b46OuCombined.total.total):period==='today'?Number(selectedBook?.selected?.total??selectedToday.length):total;",
 'TOP_TOTAL');
 out=one(out,
 "    const pendingCount=period==='today'?selectedToday.filter(x=>x.status==='PENDING').length:pending;",
 "    const pendingCount=mode==='ou'&&b46OuCombined?(period==='today'?b46OuCombined.today.pending:b46OuCombined.total.pending):period==='today'?selectedToday.filter(x=>x.status==='PENDING').length:pending;",
 'TOP_PENDING');
 out=one(out,
 "    const liveCount=selected.filter(x=>x.status==='PENDING'&&hubRows[x.fixture_id]?.phase==='LIVE').length;",
 "    const liveCount=mode==='ou'&&b46OuCombined?null:selected.filter(x=>x.status==='PENDING'&&hubRows[x.fixture_id]?.phase==='LIVE').length;",
 'TOP_LIVE');
 out=one(out,
 "      ['PENDING',pendingCount,'pending'],\n      ['LIVE',liveCount,'live'],",
 "      ['PENDING',pendingCount===null?'—':pendingCount,'pending'],\n      ['LIVE',liveCount===null?'—':liveCount,'live'],",
 'UNKNOWN_LIVE_NO_FABRICATION');
 out=one(out,
 "      ['AVG ODDS',selected.length?avgOdds(selected):'','']",
 "      ['AVG ODDS',mode==='ou'?(period==='all'&&b46OuCombined?.total.avgOdds!=null?b46OuCombined.total.avgOdds.toFixed(2):'—'):selected.length?avgOdds(selected):'','']",
 'WEIGHTED_AVG_ODDS');
 out=one(out,
 "mode==='ou'?'Over/Under · Full Market price captured in TEST. EV is a model estimate; ROI/P/L pending settlement.'",
 "mode==='ou'?'O/U overview = original O/U + all Adaptive formulas, 1U per recorded formula pick. TEST-only; formulas may overlap fixtures; not 1X2/BTTS Total.'",
 'SCOPE_NOTE');
 out=one(out,
 "      else content.append(performancePanel());",
 "      else {content.append(performancePanel());if(mode==='ou'&&b46OuCombined)content.append(board);}",
 'SHOW_OVERVIEW_GRID');
 return out;
}
export function patchOuUnifiedOverviewWorker(worker){
 if(typeof worker!=='string')throw Error('WORKER_SOURCE_REQUIRED');
 if(worker.includes(B46_OU_ALL_ACCOUNTS_OVERVIEW_V1))throw Error('OU_OVERVIEW_ALREADY_INSTALLED');
 const re=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
 const m=worker.match(re);if(!m)throw Error('EMBEDDED_PREMATCH_CLIENT_NOT_FOUND');
 const client=patchOuUnifiedOverviewClient(JSON.parse(m[1]));
 return {worker:one(worker,m[0],'var prematchClientScript = '+JSON.stringify(client)+';','EMBEDDED_CLIENT_ONLY'),client};
}
