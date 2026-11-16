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
    page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
    page.on('response',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')networkStatuses.push(r.status())});
    const started=Date.now(),resp=await page.goto(base+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:45000});
    assert.equal(resp?.status(),200,profile.name+':STAGE_ENTRY_NOT_200');
    const ready=()=> {
      const data=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
      const chart=document.querySelector('#b46-finance-chart-card svg.f46-svg');
      return data?.ok===true && data.hasMore===false && Array.isArray(data.ledgerRows)
         && data.ledgerRows.length===data.ledgerTotal && !!chart?.getClientRects().length;
    };
    await page.waitForFunction(ready,null,{timeout:170000});
    if(!profile.isMobile){
    await page.waitForFunction(()=>document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item').length===8 &&
      (()=>{const strip=document.querySelector('.b46v23-strip');return strip?getComputedStyle(strip).display==='none':false})(),
      null,{timeout:15000});
    }
    const coldMs=Date.now()-started;
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
          gridOverflow:(()=>{const g=document.querySelector('.b46-stage-summary-grid');return g?.scrollWidth>g?.clientWidth+2})()}};
    });
    assert.equal(cold.fullRows,cold.ledgerTotal,profile.name+':INVALID_LEDGER');
    assert(cold.ledgerTotal>1000,profile.name+':LEDGER_TOO_SMALL');
    assert(cold.loadingAnimationHidden,profile.name+':LOADING_OVERLAY_STILL_VISIBLE');
    if(!profile.isMobile){
    assert(cold.summary.ready&&cold.summary.hiddenTop&&cold.summary.originalDetailsHidden,profile.name+':DUPLICATE_STRIP_VISIBLE');
    assert.equal(cold.summary.count,8,profile.name+':SUMMARY_8_FIELDS_REQUIRED');
    assert.deepEqual(cold.summary.keys,['roi','rate','odds','days','unsettled','wpl','stake','drawdown'],profile.name+':SUMMARY_ORDER');
    assert(!cold.summary.gridOverflow,profile.name+':SUMMARY_GRID_OVERFLOW');
    assert(parseFloat(cold.summary.profitFont)<=23,profile.name+':MAIN_PROFIT_TOO_LARGE');
    }else{
      assert.equal(cold.summary.count,0,profile.name+':MOBILE_SUMMARY_SHOULD_NOT_EXIST');
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
    await page.waitForFunction(ready,null,{timeout:30000});
    if(!profile.isMobile){
    await page.waitForFunction(()=>document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item').length===8 &&
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
        topStripHidden:(()=>{const strip=document.querySelector('.b46v23-strip');return strip?getComputedStyle(strip).display==='none':false})()};
    });
    await page.screenshot({path:'/tmp/b46-staging-cache-'+profile.name+'.png',fullPage:false});
    console.log('B46_STAGE_TIMING='+JSON.stringify({profile:profile.name,coldMs,warmMs,coldLedger:cold.ledgerTotal,warmLedger:warm.ledgerTotal,
      warmStale:warm.stale,warmVisible:warm.graphVisible,pageErrors:errors,statHttp:networkStatuses.length}));
    assert(warm.graphVisible&&warm.rows===warm.ledgerTotal,profile.name+':BAD_WARM_RENDER');
    assert(warm.loadingAnimationHidden,profile.name+':LOADING_OVERLAY_REAPPEARED');
    if(!profile.isMobile){
    assert.equal(warm.summaryCount,8,profile.name+':SUMMARY_DID_NOT_REAPPEAR');
    assert(warm.topStripHidden,profile.name+':TOP_STRIP_REAPPEARED');
    }else{
      assert.equal(warm.summaryCount,0,profile.name+':MOBILE_SUMMARY_ON_RELOAD');
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
