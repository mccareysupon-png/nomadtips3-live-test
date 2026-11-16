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
        loaderPatched:false};
    });
    assert.equal(cold.fullRows,cold.ledgerTotal,profile.name+':INVALID_LEDGER');
    assert(cold.ledgerTotal>1000,profile.name+':LEDGER_TOO_SMALL');
    assert(cold.chartPoints>0,profile.name+':CHART_EMPTY');
    assert.equal(cold.chartStroke,'1px',profile.name+':CHART_STROKE_DRIFT');
    assert(!cold.horizontalOverflow,profile.name+':HORIZONTAL_OVERFLOW');
    if(!profile.isMobile){
      assert.equal(cold.chartLayout,'grid',profile.name+':GRID_MISSING');
      const nums=cold.columns.split(/\s+/).map(parseFloat);
      assert.equal(nums.length,2);
      assert(Math.abs(nums[0]-nums[1])<4,'DESKTOP_50_50_COLUMNS_MISSING');
    }
    await page.waitForFunction(()=>new Promise(resolve=>{
      try{
        const req=indexedDB.open('b46-staging-statistics-v1',1);
        req.onsuccess=()=>{const db=req.result,tx=db.transaction('records','readonly');
          const get=tx.objectStore('records').get('meta');
          get.onsuccess=()=>{const v=get.result;db.close();resolve(Boolean(v?.schema===1&&v?.totalPages>0&&v?.savedAt))};
          get.onerror=()=>{db.close();resolve(false)};
        };
        req.onerror=()=>resolve(false);
      }catch{resolve(false)}
    }),null,{timeout:60000});
    const warmStart=Date.now();
    await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(ready,null,{timeout:30000});
    const warmMs=Date.now()-warmStart;
    const warm=await page.evaluate(()=>{
      const d=window.BALL46_STATISTICS_DATA.getSnapshot();
      return{ledgerTotal:d.ledgerTotal,rows:d.ledgerRows.length,stale:!!d.stale,
        tableLabel:document.querySelector('[data-sp-feed-state]')?.textContent?.trim(),
        graphVisible:!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length};
    });
    await page.screenshot({path:'/tmp/b46-staging-cache-'+profile.name+'.png',fullPage:false});
    assert(warm.graphVisible&&warm.rows===warm.ledgerTotal,profile.name+':BAD_WARM_RENDER');
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
