// UI ONLY. Add an isolated Over/Under Predictions view and an Over/Under
// Statistics view using the existing Pre-Match navigation and card classes.
// No O/U prediction is issued, and NO original 1X2/BTTS data is re-labelled.
export const B46_OU_UI_CLONE_TEST_V1='B46_OU_UI_CLONE_TEST_V1';
const replace=(s,from,to,label,n=1)=>{
 const hits=s.split(from).length-1;
 if(hits!==n)throw Error('OU_UI_SOURCE_DRIFT_'+label+'_COUNT_'+hits);
 return s.replace(from,to);
};
function renderEmptyOuScreen(content,statsMode){
 const board=el('section','b46pm-stats-board'+(statsMode?'':' b46pm-predictions-compact-board'));
 board.setAttribute('aria-label','Over/Under Pre-Match statistics (not yet active)');
 const toolbar=el('div','b46pm-stats-toolbar');
 const meta=el('div','b46pm-stats-meta');
 meta.append(el('strong','b46pm-stats-period-title',statsPeriod==='today'?'TODAY':'ALL TIME'),
   el('small','b46pm-stats-cutoff','Over/Under · TEST · No predictions issued'));
 toolbar.append(meta);
 const switcher=el('div','b46pm-period-switch');
 switcher.setAttribute('role','group');
 switcher.setAttribute('aria-label','Statistics period');
 for(const [id,label] of [['today','Today'],['all','All Time']]){
   const b=el('button','b46pm-period-btn'+(statsPeriod===id?' active':''),label);
   b.type='button';b.dataset.b46PmPeriod=id;b.setAttribute('aria-pressed',String(statsPeriod===id));
   switcher.append(b);
 }
 toolbar.append(switcher);board.append(toolbar);
 const grid=el('div','b46pm-stats-grid');
 for(const label of ['PICKS','SETTLED','PENDING','LIVE','WIN','LOSS','WIN RATE','P/L','AVG ODDS']){
   const cell=el('div','b46pm-stat');
   cell.append(el('span','b46pm-stat-label',label),el('strong','b46pm-stat-value','—'));
   grid.append(cell);
 }
 board.append(grid);
 const list=el('section','b46pm-list'+(statsMode?'':' b46pm-premium-list'));
 if(statsMode){
   const perf=el('section','b46pm-performance');
   perf.setAttribute('aria-label','Over/Under long term performance');
   const chart=el('section','b46pm-performance-chart');
   chart.append(el('div','b46pm-performance-kicker','LONG-TERM PERFORMANCE · 1 UNIT'),
      el('strong','b46pm-performance-subtitle','Pre-Match · Over/Under'));
   const stage=el('div','b46pm-chart-stage');
   stage.append(el('p','b46pm-empty','No Over/Under performance data yet.'));
   chart.append(stage);perf.append(chart);content.append(perf);
   const bar=el('div','b46pm-list-head');
   bar.append(el('h2','','Prediction History'),el('span','','— matches'));list.append(bar);
 }else content.append(board);
 list.append(el('p','b46pm-empty','No Over/Under predictions issued yet.'));
 if(statsMode)content.append(board);
 content.append(list);
}
export function patchOuPrematchUiClient(input){
 if(typeof input!=='string'||!input.includes('B46_PM_EXACT_LIVE_SCORE_DOM_MIRROR_V2')||
   !input.includes("function draw(pageOnly=false){")||
   !input.includes("const routes = ["))throw Error('NOT_VERIFIED_PREMATCH_TEST_CLIENT');
 let s=input;
 s=replace(s,"    {id:'predictions',label:'Predictions',source:'status-signal',parent:'status-signal'},",
   "    {id:'predictions',label:'Predictions',source:'status-signal',parent:'status-signal'},\n"+
   "    {id:'ou-predictions',label:'Over/Under Predictions',source:'status-signal',parent:'status-signal'},",
   'CLONE_PREDICTIONS_NAV');
 s=replace(s,"    {id:'1x2',label:'1X2',source:'stat-1x2'},",
   "    {id:'1x2',label:'1X2',source:'stat-1x2'},\n"+
   "    {id:'ou',label:'Over/Under',source:'stat-1x2'},",
   'CLONE_1X2_STATS_NAV');
 s=replace(s,"if(route.id==='predictions'){","if(route.id==='predictions'||route.id==='ou-predictions'){",
   'DESKTOP_COPY_NATIVE_PREDICTIONS_ICON',2);
 s=replace(s,"      item.title='Pre-Match Predictions';\n      item.setAttribute('aria-label','Pre-Match Predictions');",
   "      item.title=route.label;\n      item.setAttribute('aria-label','Pre-Match · '+route.label);",
   'DESKTOP_OU_ACCESSIBILITY');
 s=replace(s,"const template=r.id==='predictions'&&nativeMobileLive?nativeMobileLive:ref;",
   "const template=(r.id==='predictions'||r.id==='ou-predictions')&&nativeMobileLive?nativeMobileLive:ref;",
   'MOBILE_NATIVE_PREDICTIONS_ICON');
 s=replace(s,"      if(r.id==='predictions'){",
   "      if(r.id==='predictions'||r.id==='ou-predictions'){",
   'MOBILE_PREDICTIONS_CLONE');
 s=replace(s,"node.nodeValue=raw.replace(/Live\\s+Predictions/i,'Predictions');",
   "node.nodeValue=raw.replace(/Live\\s+Predictions/i,r.label);",
   'MOBILE_PREDICTIONS_LABEL');
 s=replace(s,"if(name)name.textContent='Predictions';else item.append(el('span','','Predictions'));",
   "if(name)name.textContent=r.label;else item.append(el('span','',r.label));",
   'MOBILE_PREDICTIONS_FALLBACK_LABEL');
 s=replace(s,"        item.title='Pre-Match Predictions';\n        item.setAttribute('aria-label','Pre-Match Predictions');",
   "        item.title='Pre-Match · '+r.label;\n        item.setAttribute('aria-label','Pre-Match · '+r.label);",
   'MOBILE_OU_ACCESSIBILITY');
 s=replace(s,"    if(!$('#b46pm-stats-navigation')){",
   "    if(!$('[data-b46-prematch-route=\"ou-predictions\"]')){\n"+
   "      const anchor=$('[data-b46-prematch-route=\"predictions\"]');\n"+
   "      const n=navRow(routes.find(r=>r.id==='ou-predictions'));\n"+
   "      if(anchor&&n)anchor.after(n);\n"+
   "    }\n"+
   "    if(!$('#b46pm-stats-navigation')){",
   'DESKTOP_OU_PREDICTIONS_AFTER_PREDICTIONS');
 s=replace(s,"for(const r of routes.slice(1)){const n=navRow(r);if(n)wrapper.append(n)}",
   "for(const r of routes.filter(r=>r.id!=='predictions'&&r.id!=='ou-predictions')){const n=navRow(r);if(n)wrapper.append(n)}",
   'O_U_ONLY_IN_PREMATCH_STATS_GROUP');
 s=replace(s,"if(count)count.textContent=r.id==='predictions'?String(stats.pending??'—'):r.id==='btts'?rate(btts):r.id==='1x2'?rate(oneX2):rate(stats);",
   "if(count)count.textContent=r.id==='ou'||r.id==='ou-predictions'?'—':r.id==='predictions'?String(stats.pending??'—'):r.id==='btts'?rate(btts):r.id==='1x2'?rate(oneX2):rate(stats);",
   'DONT_SHOW_ONE_X_TWO_METRICS_FOR_OU');
 s=replace(s,"  function draw(pageOnly=false){",
   renderEmptyOuScreen.toString()+"\n  function draw(pageOnly=false){",
   'INSERT_EMPTY_CLONE_RENDERER');
 s=replace(s,"    const title=mode==='predictions'?",
   "    if(mode==='ou'||mode==='ou-predictions'){\n"+
   "      renderEmptyOuScreen(content,mode==='ou');\n"+
   "      finish();return;\n"+
   "    }\n"+
   "    const title=mode==='predictions'?",
   'STOP_BEFORE_ORIGINAL_1X2_DATA_AND_RECEIVER');
 s=replace(s,"const panel=$('#'+root);panel.hidden=modeNext!=='predictions'&&!ledger;",
   "const panel=$('#'+root);panel.hidden=!['predictions','ou-predictions','ou'].includes(modeNext)&&!ledger;",
   'OU_ROUTE_VISIBLE_WITHOUT_1X2_LEDGER');
 s=replace(s,"if(h)h.textContent=mode==='predictions'?'Pre-Match Predictions':'Pre-Match Statistics';",
   "if(h)h.textContent=mode==='ou-predictions'?'Over/Under Predictions':mode==='ou'?'Over/Under Statistics':mode==='predictions'?'Pre-Match Predictions':'Pre-Match Statistics';",
   'OU_WORKSPACE_HEADING');
 s=replace(s,"if(mode==='predictions'||ledger)draw();",
   "if(mode==='predictions'||mode==='ou-predictions'||mode==='ou'||ledger)draw();",
   'RENDER_EMPTY_OU_SCREEN_WITHOUT_LEDGER');
 s=replace(s,"    // Only issued, price-qualified BTTS picks are shown; no preview fetch.\n    load();",
   "    // O/U UI clone has no bot, issued ledger, 5USD or API of its own.\n"+
   "    if(modeNext==='ou'||modeNext==='ou-predictions')return;\n"+
   "    // Only issued, price-qualified BTTS picks are shown; no preview fetch.\n    load();",
   'OU_UI_NO_FETCH');
 if(s===input||!s.includes("renderEmptyOuScreen(content,mode==='ou')"))throw Error('OU_PATCH_NOT_APPLIED');
 return {code:s,onlyEmbeddedClient:true,ouIssuedPredictions:0,ouProviderCalls:0,original1x2CodePreserved:true};
}
