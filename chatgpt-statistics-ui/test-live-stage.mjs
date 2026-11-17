// BALL46 Staging-only current public frontend browser test.
// Checks first load, real complete Ledger, visible finance chart, verified browser snapshot persistence,
// and fast repeat navigation. Never sends writes to Production.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');
const base='https://ball46-chat-statistics-live-ui-test-20261115.mccarey-supon.workers.dev';
const browser=await chromium.launch({headless:true});
const profiles=[{name:'desktop',width:1366,height:900,isMobile:false},{name:'mobile',width:390,height:844,isMobile:true}];
const results=[];
try{
  for(const profile of profiles){
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},
      timezoneId:'Asia/Bangkok',isMobile:profile.isMobile,hasTouch:profile.isMobile});
    const page=await context.newPage(),errors=[],networkStatuses=[];
    await page.addInitScript(()=>{
      const original=window.fetch;
      window.fetch=function(input,...args){
        const url=typeof input==='string'?input:String(input?.url||'');
        if(url.includes('/api/engine/statistics')){
          (window.__B46_EARLY_FETCHES||(window.__B46_EARLY_FETCHES=[])).push({
            url:url.slice(0,150),trace:String(new Error('B46_FETCH_CALLER').stack||'').slice(0,1400)
          });
        }
        return original.call(this,input,...args);
      };
    });
    page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
    page.on('response',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')networkStatuses.push(r.status())});
    // Browser-test-only instrumentation of the ORIGINAL renderer. No staging
    // or Production module is written or deployed by this interception.
    await page.route('**/longterm-performance-343.js*',async route=>{
      const response=await route.fetch();
      const original=await response.text();
      const anchor='function chartHtml(s){const points=f46Points(s);';
      assert(original.includes(anchor),profile.name+':NATIVE_CHART_SOURCE_DRIFT');
      const instrumentation=anchor+
        'window.__B46_NATIVE_QA_POINTS=points.map(p=>({date:p.date,value:p.value}));'+
        'window.__B46_NATIVE_QA_METRIC=metric;';
      await route.fulfill({response,body:original.replace(anchor,instrumentation)});
    });

    // Read the tiny immutable verified head independently of the heavy Ledger.
    // Strictly test parity, do not use this read to replace native formulas.
    const fastStart=Date.now();
    const compactResponse=await context.request.get(base+'/_b46_stage_stats_summary',{timeout:20000});
    assert.equal(compactResponse.status(),200,profile.name+':COMPACT_HEAD_NOT_READY');
    const rawHead=await compactResponse.body();
    const head=JSON.parse(rawHead.toString('utf8'));
    assert(head.ok===true&&head.schema===1&&head.mode==='AGGREGATES_ONLY_NOT_HISTORY',
      profile.name+':COMPACT_HEAD_INVALID');
    assert(!Object.hasOwn(head,'rows'),profile.name+':COMPACT_HEAD_LEAKS_ROWS');
    assert(head.ledgerTotal>1000&&head.total<=head.ledgerTotal,profile.name+':COMPACT_HEAD_COUNT_INVALID');
    assert.equal(head.total,head.win+head.loss+head.push+head.halfWin+head.halfLoss,
      profile.name+':COMPACT_HEAD_RESULT_PARITY');
    assert(rawHead.length<128*1024,profile.name+':COMPACT_HEAD_TOO_LARGE');
    console.log('B46_COMPACT_HEAD_HTTP='+JSON.stringify({
      profile:profile.name,bytes:rawHead.length,ms:Date.now()-fastStart,
      ledgerTotal:head.ledgerTotal,settled:head.total,stageOnly:true}));
    const graphStart=Date.now();
    const graphResponse=await context.request.get(base+'/_b46_stage_stats_chart',{timeout:20000});
    assert.equal(graphResponse.status(),200,profile.name+':VERIFIED_GRAPH_NOT_READY');
    const graphBytes=await graphResponse.body();
    const graph=JSON.parse(graphBytes.toString('utf8'));
    assert(graph.ok===true&&graph.schema===1&&graph.market==='all'&&graph.range==='all',
      profile.name+':GRAPH_CONTRACT_FAILED');
    assert.equal(graph.summary.rows,head.total,profile.name+':GRAPH_SETTLED_COUNT_DRIFT');
    assert.equal(graph.summary.wins,head.win+head.halfWin,profile.name+':GRAPH_WINS_DRIFT');
    assert.equal(graph.summary.losses,head.loss+head.halfLoss,profile.name+':GRAPH_LOSSES_DRIFT');
    assert.equal(graph.summary.pushes,head.push,profile.name+':GRAPH_PUSH_DRIFT');
    assert.equal(graph.asOf,head.snapshotSavedAt,profile.name+':GRAPH_HEAD_TIMESTAMP_DRIFT');
    for(const key of ['units','roi','rate']){
      assert(Array.isArray(graph.series[key])&&graph.series[key].length>0,
        profile.name+':GRAPH_'+key+'_EMPTY');
    }
    assert(!Object.hasOwn(graph,'rows'),profile.name+':GRAPH_HISTORY_LEAK');
    console.log('B46_VERIFIED_GRAPH_HTTP='+JSON.stringify({
      profile:profile.name,bytes:graphBytes.length,ms:Date.now()-graphStart,
      unitsPoints:graph.series.units.length,net:graph.summary.net,stageOnly:true}));
    const started=Date.now(),resp=await page.goto(base+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:45000});
    assert.equal(resp?.status(),200,profile.name+':STAGE_ENTRY_NOT_200');
    await page.waitForFunction(()=>{
      const x=window.__B46_FAST_CHART_DIAG;
      return x?.status==='fast-preview-visible' || x?.status==='native-ready';
    },null,{timeout:10000});
    const early=await page.evaluate(()=>({
      ...window.__B46_FAST_CHART_DIAG,
      visible:!!document.querySelector('#b46-stage-fast-preview')?.getClientRects().length,
      bodyView:document.body?.dataset.workspaceView,
      oldTrendVisible:(()=>{const e=document.querySelector('.sp-trend');return !!(e?.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&!e.classList.contains('b46-fast-paint-host'))})(),
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      previewRight:document.querySelector('#b46-stage-fast-preview')?.getBoundingClientRect().right||null,
      viewport:innerWidth,
      nativeAlready:!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length
    }));
    assert(!early.overflow,profile.name+':FAST_PREVIEW_HORIZONTAL_OVERFLOW');
    assert(early.fastPaintMs>0&&early.fastPaintMs<7500,
      profile.name+':FAST_FIRST_PAINT_TOO_SLOW_'+early.fastPaintMs);
    assert.equal(early.pointCount,graph.series.units.length,
      profile.name+':FAST_CHART_POINTS_NOT_VERIFIED');
    assert.equal(early.net,graph.summary.net,
      profile.name+':FAST_CHART_NET_NOT_VERIFIED');
    console.log('B46_FAST_FIRST_PAINT='+JSON.stringify({profile:profile.name,...early}));
    if(!early.visible){
      const tree=await page.evaluate(()=>{
        const nodes=[];let node=document.querySelector('#b46-stage-fast-preview');
        for(let i=0;node&&i<12;i++,node=node.parentElement){
          const c=getComputedStyle(node),r=node.getBoundingClientRect();
          nodes.push({tag:node.tagName,id:node.id,cls:node.className?.toString().slice(0,90),
            hidden:node.hidden,display:c.display,visibility:c.visibility,opacity:c.opacity,
            rect:[r.x,r.y,r.width,r.height],position:c.position});
        }
        return nodes;
      });
      console.log('B46_NATIVE_SLOT_VISIBILITY_DIAG='+JSON.stringify({profile:profile.name,tree}));
    }

    assert.equal(early.oldTrendVisible,false,profile.name+':OLD_TREND_FLASHES_DURING_FAST_PAINT');
    const fastUI=await page.evaluate(()=>{
      const boxes=[...document.querySelectorAll('#b46-stage-fast-preview .b46-fast-stat')];
      const visible=boxes.filter(el=>getComputedStyle(el).display!=='none');
      return {
        keys:visible.map(el=>el.dataset.key),
        items:visible.map(el=>({key:el.dataset.key,value:el.querySelector('b')?.textContent?.trim()})),
        outcomeCounts:[...document.querySelectorAll('#b46-stage-fast-preview .b46-fast-outcomes-track span')]
          .map(el=>Number(el.dataset.count)),
        outcomesVisible:(()=>{const el=document.querySelector('#b46-stage-fast-preview .b46-fast-outcomes');
          return !!el&&getComputedStyle(el).display!=='none'})(),
        statsOverflow:(()=>{const el=document.querySelector('#b46-stage-fast-preview .b46-fast-stats');
          return !!el&&el.scrollWidth>el.clientWidth+2})()
      };
    });
    assert(!fastUI.statsOverflow,profile.name+':FAST_KPI_GRID_OVERFLOW');
    if(!profile.isMobile){
      assert.deepEqual(fastUI.keys,
        ['roi','rate','odds','days','unsettled','wpl','stake','drawdown'],
        'DESKTOP_FAST_8_KPI_KEYS');
      assert.equal(fastUI.outcomesVisible,true,profile.name+':FAST_OUTCOMES_HIDDEN');
      assert.deepEqual(fastUI.outcomeCounts,
        [head.win+head.halfWin,head.push,head.loss+head.halfLoss],
        profile.name+':FAST_OUTCOMES_COUNTS_DRIFT');
      assert.equal(fastUI.outcomeCounts.reduce((a,b)=>a+b,0),head.total,
        profile.name+':FAST_OUTCOME_SETTLED_DRIFT');
      assert.equal(fastUI.items.find(i=>i.key==='days')?.value,
        String(graph.summary.settledDays),profile.name+':FAST_SETTLED_DAYS_WRONG');
      assert.equal(fastUI.items.find(i=>i.key==='odds')?.value,
        Number(graph.summary.avgOdds).toFixed(2),profile.name+':FAST_ODDS_WRONG');
      assert.equal(fastUI.items.find(i=>i.key==='unsettled')?.value,
        (head.pending+head.unresolved).toLocaleString('en-US'),profile.name+':FAST_PENDING_WRONG');
    }else{
      assert.deepEqual(fastUI.keys.slice().sort(),
        ['roi','rate','settled','drawdown'].sort(),profile.name+':MOBILE_FAST_KPI_DRIFT');
      assert.equal(fastUI.outcomesVisible,false,profile.name+':MOBILE_OUTCOME_BAR_UNREQUESTED');
    }
    console.log('B46_FAST_8_KPI_PARITY='+JSON.stringify({
      profile:profile.name,fields:fastUI.items,outcomeCounts:fastUI.outcomeCounts,
      outcomesVisible:fastUI.outcomesVisible,stageOnly:true}));

    // Initial Statistics view must not read the 16k-row historical Ledger.
    await page.waitForTimeout(1200);
    // Read-only diagnostics should not fail the chart QA solely because the
    // edge resets a separate diagnostic GET. The real browser JS remains tested.
    const diagGet=async path=>{
      for(let i=0;i<3;i++){
        try{return await context.request.get(base+path,{timeout:18000})}
        catch(e){if(i===2)throw e;await new Promise(resolve=>setTimeout(resolve,400*(i+1)))}
      }
    };
    const lazyJs=await diagGet('/singlepage-workspace-343.js');
    const lazyChart=await diagGet('/longterm-performance-343.js');
    const fetchTraces=await page.evaluate(()=>window.__B46_EARLY_FETCHES||[]);
    console.log('B46_LAZY_BOOT_DIAG='+JSON.stringify({
      profile:profile.name,apiCount:networkStatuses.length,apiStatuses:networkStatuses,
      statsPatch:lazyJs.headers()['x-b46-staging-lazy'],
      chartPatch:lazyChart.headers()['x-b46-staging-chart-lazy'],
      callers:fetchTraces.slice(0,6)}));
    assert.equal(networkStatuses.length,0,profile.name+':FULL_LEDGER_WAS_LOADED_BEFORE_HISTORY_REQUEST');
    const detailVisible=await page.locator('#b46-stage-fast-preview .b46-fast-details').isVisible();
    if(!detailVisible){
      const state=await page.evaluate(()=>{
        const preview=document.querySelector('#b46-stage-fast-preview'),btn=preview?.querySelector('.b46-fast-details'),
          native=document.querySelector('#b46-finance-chart-card');
        const css=e=>e?{display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,
          rect:[e.getBoundingClientRect().x,e.getBoundingClientRect().y,
            e.getBoundingClientRect().width,e.getBoundingClientRect().height]}:null;
        const data=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
        return {status:window.__B46_FAST_CHART_DIAG,preview:css(preview),button:css(btn),
          previewConnected:!!preview?.isConnected,buttonCount:document.querySelectorAll('.b46-fast-details').length,
          native:css(native),nativeGraph:!!native?.querySelector('svg.f46-svg')?.getClientRects().length,
          data:data?{ok:data.ok,rows:data.ledgerRows?.length,ledgerTotal:data.ledgerTotal}:null,
          detailsRequested:!!window.__B46_FAST_DETAILS_REQUESTED};
      });
      console.log('B46_FAST_DETAILS_MISSING_DIAG='+JSON.stringify({profile:profile.name,...state}));
      await page.screenshot({path:'/tmp/b46-fast-details-missing-'+profile.name+'.png',fullPage:false});
    }
    assert(detailVisible,profile.name+':DETAIL_REQUEST_BUTTON_NOT_VISIBLE');
    await page.locator('#b46-stage-fast-preview .b46-fast-details').click();
    console.log('B46_LAZY_HISTORY_REQUEST='+JSON.stringify({profile:profile.name,
      apiBeforeClick:0,fastPaintMs:early.fastPaintMs,clicked:true}));

    const ready=()=> {
      const data=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
      const chart=document.querySelector('#b46-finance-chart-card svg.f46-svg');
      return data?.ok===true && data.hasMore===false && Array.isArray(data.ledgerRows)
         && data.ledgerRows.length===data.ledgerTotal && !!chart?.getClientRects().length;
    };
    await page.waitForFunction(ready,null,{timeout:170000});
    if(!profile.isMobile){
    await page.waitForFunction(()=>document.querySelectorAll('#b46-finance-chart-card .b46-stage-outcomes-segment').length===3 &&
      document.querySelectorAll('#b46-finance-chart-card .b46-stage-outcomes-legend-item').length===3 &&
      document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item').length===8 &&
      (()=>{const strip=document.querySelector('.b46v23-strip');return strip?getComputedStyle(strip).display==='none':false})(),
      null,{timeout:15000});
    }
    const coldMs=Date.now()-started;
    await page.waitForFunction(()=>!document.querySelector('#b46-stage-fast-preview'),null,{timeout:5000});
    const fastDiag=await page.evaluate(()=>window.__B46_FAST_CHART_DIAG||{});
    assert.equal(fastDiag.status,'native-ready',profile.name+':FAST_PREVIEW_NOT_REPLACED');
    assert(fastDiag.nativeReadyMs>=fastDiag.fastPaintMs,profile.name+':FAST_TIMING_INVALID');

    const cold=await page.evaluate(()=>{
      const data=window.BALL46_STATISTICS_DATA.getSnapshot();
      const chart=document.querySelector('#b46-finance-chart-card svg.f46-svg');
      const card=document.querySelector('#b46-finance-chart-card .f46-card');
      const style=getComputedStyle(card);
      return {ledgerTotal:data.ledgerTotal,fullRows:data.ledgerRows.length,settled:data.total,
        records:document.querySelector('[data-sp-record-count]')?.textContent?.trim(),
        chartPoints:Number(chart?.dataset?.pointCount||0),chartStroke:getComputedStyle(chart.querySelector('path.f46-line')).strokeWidth,
        chartLayout:style.display,columns:style.gridTemplateColumns,
        horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
        stageMarker:!!document.querySelector('[data-b46-staging-overlay]'),
        loaderPatched:false,
        loadingAnimationHidden:getComputedStyle(document.querySelector('.b46-stats-loader')).display==='none',
        summary:{ready:!!document.querySelector('.sp-stats-content.b46-stage-summary-ready'),
          hiddenTop:(()=>{const strip=document.querySelector('.b46v23-strip');return strip?getComputedStyle(strip).display==='none':false})(),
          count:document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item').length,
          keys:[...document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item')].map(x=>x.dataset.key),
          originalDetailsHidden:getComputedStyle(document.querySelector('#b46-finance-chart-card .f46-details')).display==='none',
          profitFont:getComputedStyle(document.querySelector('#b46-finance-chart-card .f46-value')).fontSize,
          gridOverflow:(()=>{const g=document.querySelector('.b46-stage-summary-grid');return g?.scrollWidth>g?.clientWidth+2})(),
          outcomes:(()=>{
            const s=[...document.querySelectorAll('#b46-finance-chart-card .b46-stage-outcomes-segment')];
            const names=[...document.querySelectorAll('#b46-finance-chart-card .b46-stage-outcomes-legend-item')].map(n=>n.dataset.result);
            return {segments:s.length,names,counts:s.map(n=>Number(n.dataset.count)),title:document.querySelector('.b46-stage-outcomes-heading')?.textContent?.trim(),
              barWidth:document.querySelector('.b46-stage-outcomes-track')?.getBoundingClientRect()?.width||0,
              outerWidth:document.querySelector('.b46-stage-outcomes')?.getBoundingClientRect()?.width||0,
              overflow:document.querySelector('.b46-stage-outcomes')?.scrollWidth>document.querySelector('.b46-stage-outcomes')?.clientWidth+2};
          })(),
          marketGap:(()=>{
            const card=document.querySelector('#b46-finance-chart-card .f46-card');
            const market=[...document.querySelectorAll('.sp-stats-content > .sp-filters')].find(e=>getComputedStyle(e).display!=='none');
            return card&&market?Math.round(market.getBoundingClientRect().top-card.getBoundingClientRect().bottom):null;
          })()}};
    });
    assert.equal(cold.fullRows,cold.ledgerTotal,profile.name+':INVALID_LEDGER');
    if(!profile.isMobile){
      const nativeDays=await page.evaluate(()=>document.querySelector('[data-sp-kpi="settled-days"]')?.textContent?.trim());
      assert.equal(nativeDays,String(graph.summary.settledDays),
        profile.name+':FAST_SETTLED_DAYS_DIFFER_FROM_NATIVE_'+nativeDays);
    }
    // The existing full-ledger renderer is the parity oracle: verify chart index
    // point count and final P/L without altering the native DOM or formulas.
    const parity=await page.evaluate(()=>({
      value:document.querySelector('#b46-finance-chart-card [data-f46-value]')?.textContent?.trim(),
      metric:document.querySelector('#b46-finance-chart-card [data-b46-mode].active')?.getAttribute('data-b46-mode'),
      range:document.querySelector('#b46-finance-chart-card [data-b46-range].active')?.getAttribute('data-b46-range'),
      title:document.querySelector('[data-sp-market-title]')?.textContent?.trim()
    }));
    assert.equal(parity.metric,'units',profile.name+':GRAPH_METRIC_NOT_DEFAULT_UNITS');
    assert.equal(parity.range,'all',profile.name+':GRAPH_RANGE_NOT_DEFAULT_ALL');
    assert.equal(cold.chartPoints,graph.series.units.length,profile.name+':GRAPH_POINT_COUNT_DRIFT');
    const nativeNet=Number(String(parity.value||'').replaceAll(',','').replace(/[^0-9.+-]/g,''));
    assert(Number.isFinite(nativeNet),profile.name+':GRAPH_NATIVE_NET_UNREADABLE_'+parity.value);
    assert(Math.abs(nativeNet-graph.summary.net)<0.011,
      profile.name+':GRAPH_NET_MISMATCH_'+nativeNet+'_VS_'+graph.summary.net);
    // Strict day-by-day parity with the unmodified live financial formula.
    async function compareChart(mode){
      if(mode!=='units'){
        await page.locator('#b46-finance-chart-card [data-b46-mode="'+mode+'"]').click();
        await page.waitForFunction(m=>window.__B46_NATIVE_QA_METRIC===m,mode,{timeout:3000});
      }
      const native=await page.evaluate(()=>window.__B46_NATIVE_QA_POINTS);
      const expected=graph.series[mode];
      assert(Array.isArray(native),profile.name+':NO_NATIVE_QA_POINTS_'+mode);
      assert.equal(native.length,expected.length,profile.name+':GRAPH_DAYS_DRIFT_'+mode);
      for(let i=0;i<expected.length;i++){
        assert.equal(native[i].date,expected[i].date,profile.name+':GRAPH_DATE_DRIFT_'+mode+'_'+i);
        assert(Math.abs(native[i].value-expected[i].value)<1e-8,
          profile.name+':GRAPH_VALUE_DRIFT_'+mode+'_'+i);
      }
      console.log('B46_NATIVE_DAILY_PARITY='+JSON.stringify({profile:profile.name,mode,
        days:native.length,exactDates:true,valuesWithin1e8:true}));
    }
    await compareChart('units');
    await compareChart('roi');
    await compareChart('rate');
    await page.locator('#b46-finance-chart-card [data-b46-mode="units"]').click();
    await page.waitForFunction(()=>window.__B46_NATIVE_QA_METRIC==='units',{timeout:3000});
    console.log('B46_GRAPH_NATIVE_PARITY='+JSON.stringify({
      profile:profile.name,points:cold.chartPoints,nativeNet,precomputedNet:graph.summary.net,
      metric:parity.metric,range:parity.range,pass:true}));
    assert(cold.ledgerTotal>1000,profile.name+':LEDGER_TOO_SMALL');
    assert(cold.loadingAnimationHidden,profile.name+':LOADING_OVERLAY_STILL_VISIBLE');
    if(!profile.isMobile){
    assert(cold.summary.ready&&cold.summary.hiddenTop&&cold.summary.originalDetailsHidden,profile.name+':DUPLICATE_STRIP_VISIBLE');
    assert.equal(cold.summary.count,8,profile.name+':SUMMARY_8_FIELDS_REQUIRED');
    assert.deepEqual(cold.summary.keys,['roi','rate','odds','days','unsettled','wpl','stake','drawdown'],profile.name+':SUMMARY_ORDER');
    assert(!cold.summary.gridOverflow,profile.name+':SUMMARY_GRID_OVERFLOW');
    assert.equal(cold.summary.outcomes.segments,3,profile.name+':OUTCOMES_3_SEGMENTS');
    assert.deepEqual(cold.summary.outcomes.names,['win','push','loss'],profile.name+':OUTCOME_ORDER');
    assert(cold.summary.outcomes.counts.every(x=>Number.isSafeInteger(x)&&x>0),profile.name+':OUTCOME_COUNTS_INVALID');
    assert.equal(cold.summary.outcomes.counts.reduce((a,b)=>a+b,0),cold.settled,profile.name+':OUTCOME_COUNT_PARITY');
    assert(cold.summary.outcomes.title?.includes('SIGNAL OUTCOMES'),profile.name+':OUTCOME_TITLE_MISSING');
    assert(cold.summary.outcomes.barWidth>100&&!cold.summary.outcomes.overflow,profile.name+':OUTCOME_VISUAL_OVERFLOW');
    assert(cold.summary.marketGap!==null&&cold.summary.marketGap>=0&&cold.summary.marketGap<=29,
      profile.name+':MARKET_FILTER_NOT_ALIGNED_'+cold.summary.marketGap);
    assert(parseFloat(cold.summary.profitFont)<=23,profile.name+':MAIN_PROFIT_TOO_LARGE');
    }else{
      assert.equal(cold.summary.count,0,profile.name+':MOBILE_SUMMARY_SHOULD_NOT_EXIST');
      assert.equal(cold.summary.outcomes.segments,0,profile.name+':MOBILE_OUTCOME_NOT_REQUESTED');
      assert(!cold.summary.ready,profile.name+':MOBILE_LAYOUT_CHANGED');
    }
    assert(cold.chartPoints>0,profile.name+':CHART_EMPTY');
    assert.equal(cold.chartStroke,'1px',profile.name+':CHART_STROKE_DRIFT');
    assert(!cold.horizontalOverflow,profile.name+':HORIZONTAL_OVERFLOW');
    if(!profile.isMobile){
      assert.equal(cold.chartLayout,'grid',profile.name+':GRID_MISSING');
      const nums=cold.columns.split(/\s+/).map(parseFloat);
      assert.equal(nums.length,2);
      assert(Math.abs(nums[0]-nums[1])<4,'DESKTOP_50_50_COLUMNS_MISSING');
    }
    // The fast source is staging KV. Do not open IndexedDB in the test: opening
    // a non-existent database at version 1 accidentally creates an empty one
    // without the records object store and interferes with browser-side migration.
    await page.waitForTimeout(300);
    const warmStart=Date.now();
    await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>window.__B46_FAST_CHART_DIAG?.status==='fast-preview-visible',null,{timeout:10000});
    await page.locator('#b46-stage-fast-preview .b46-fast-details').click();
    await page.waitForFunction(ready,null,{timeout:30000});
    if(!profile.isMobile){
    await page.waitForFunction(()=>document.querySelectorAll('#b46-finance-chart-card .b46-stage-outcomes-segment').length===3 &&
      document.querySelectorAll('#b46-finance-chart-card .b46-stage-outcomes-legend-item').length===3 &&
      document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item').length===8 &&
      (()=>{const strip=document.querySelector('.b46v23-strip');return strip?getComputedStyle(strip).display==='none':false})(),
      null,{timeout:12000});
    }
    const warmMs=Date.now()-warmStart;
    const warm=await page.evaluate(()=>{
      const d=window.BALL46_STATISTICS_DATA.getSnapshot();
      return{ledgerTotal:d.ledgerTotal,rows:d.ledgerRows.length,stale:!!d.stale,
        tableLabel:document.querySelector('[data-sp-feed-state]')?.textContent?.trim(),
        graphVisible:!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length,
        loadingAnimationHidden:getComputedStyle(document.querySelector('.b46-stats-loader')).display==='none',
        summaryCount:document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item').length,
        outcomeSegments:document.querySelectorAll('#b46-finance-chart-card .b46-stage-outcomes-segment').length,
        topStripHidden:(()=>{const strip=document.querySelector('.b46v23-strip');return strip?getComputedStyle(strip).display==='none':false})()};
    });
    await page.screenshot({path:'/tmp/b46-chat-real-stage-'+profile.name+'.png',fullPage:false});
    console.log('B46_STAGE_TIMING='+JSON.stringify({profile:profile.name,coldMs,warmMs,coldLedger:cold.ledgerTotal,warmLedger:warm.ledgerTotal,
      warmStale:warm.stale,warmVisible:warm.graphVisible,pageErrors:errors,statHttp:networkStatuses.length}));
    assert(warm.graphVisible&&warm.rows===warm.ledgerTotal,profile.name+':BAD_WARM_RENDER');
    assert(warm.loadingAnimationHidden,profile.name+':LOADING_OVERLAY_REAPPEARED');
    if(!profile.isMobile){
    assert.equal(warm.summaryCount,8,profile.name+':SUMMARY_DID_NOT_REAPPEAR');
    assert.equal(warm.outcomeSegments,3,profile.name+':OUTCOMES_DID_NOT_REAPPEAR');
    assert(warm.topStripHidden,profile.name+':TOP_STRIP_REAPPEARED');
    }else{
      assert.equal(warm.summaryCount,0,profile.name+':MOBILE_SUMMARY_ON_RELOAD');
      assert.equal(warm.outcomeSegments,0,profile.name+':MOBILE_OUTCOME_ON_RELOAD');
      assert(!warm.topStripHidden,profile.name+':ORIGINAL_MOBILE_STRIP_HIDDEN');
    }
    assert(warmMs<=15000,profile.name+':WARM_TOO_SLOW_'+warmMs);
    assert.equal(errors.length,0,profile.name+':PAGE_JS_ERRORS:'+JSON.stringify(errors));
    const result={profile:profile.name,firstLoadMs:coldMs,reloadMs:warmMs,
      cold,warm,statisticsHttpCount:networkStatuses.length,
      http599:networkStatuses.filter(s=>s===599).length,pageErrors:errors};
    console.log('B46_STAGING_CACHE_BROWSER='+JSON.stringify(result));
    results.push(result);
    await context.close();
  }
}finally{await browser.close()}
assert.equal(results.length,2);
console.log('B46_STAGING_SNAPSHOT_CACHE_REAL_BROWSER=PASS');
