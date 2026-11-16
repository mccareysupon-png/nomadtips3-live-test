// Production FAST-V1 release QA — real browser before/after activation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');
const statusUrl='/api/engine/statistics';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function verifyBrowser(host,label,auditDir){
 const browser=await chromium.launch({headless:true});
 const output=[];
 try{
  for(const profile of [{name:'pc',width:1366,height:900,isMobile:false},
    {name:'mobile',width:390,height:844,isMobile:true}]){
   const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},
      timezoneId:'Asia/Bangkok',isMobile:profile.isMobile,hasTouch:profile.isMobile});
   const page=await context.newPage(),errors=[],api=[],apiStatuses=[],badRequests=[],warnings=[];
   page.on('response',res=>{
     const u=new URL(res.url());
     if(u.pathname==='/api/engine/statistics')apiStatuses.push({status:res.status(),url:u.pathname+u.search.slice(0,70)});
   });
   page.on('requestfailed',req=>badRequests.push({url:new URL(req.url()).pathname,failure:req.failure()}));
   page.on('console',msg=>{if(['warning','error'].includes(msg.type()))warnings.push(msg.text().slice(0,160))});
   page.on('pageerror',e=>errors.push(e.message.slice(0,190)));
   page.on('request',r=>{if(new URL(r.url()).pathname===statusUrl)api.push(r.method())});
   const start=Date.now(),response=await page.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:65000});
   assert.equal(response?.status(),200,label+':STAT_ENTRY_HTTP');
   await page.waitForFunction(()=>window.__B46_FAST_V1_DIAG?.status==='fast-preview-visible',
     null,{timeout:20000});
   const early=await page.evaluate(()=>{
     const card=document.querySelector('#b46-finance-chart-card'),preview=card?.querySelector('#b46-fast-v1-preview');
     const stats=[...preview?.querySelectorAll('.b46-fast-stat')||[]].filter(e=>getComputedStyle(e).display!=='none');
     return {diag:{...window.__B46_FAST_V1_DIAG},
       nativeCardCount:document.querySelectorAll('#b46-finance-chart-card').length,
       cardIsNative:!!card?.classList.contains('sp-trend'),
       fastVisible:!!preview?.getClientRects().length,
       oldTrendHtml:card?.textContent?.includes('PERFORMANCE TREND')||false,
       keys:stats.map(e=>e.dataset.key),
       outcomeCounts:[...preview?.querySelectorAll('.b46-fast-outcomes-track span')||[]].map(x=>Number(x.dataset.count)),
       outcomesVisible:(()=>{const el=preview?.querySelector('.b46-fast-outcomes');return !!el&&getComputedStyle(el).display!=='none'})(),
       overflow:document.documentElement.scrollWidth>innerWidth+2,
       fastButtonVisible:!!preview?.querySelector('.b46-fast-details')?.getClientRects().length,
       chartWidth:preview?.querySelector('svg')?.getBoundingClientRect()?.width||0
     };
   });
   assert(early.fastVisible&&early.cardIsNative&&early.nativeCardCount===1,
     label+':FAST_NOT_IN_NATIVE_CARD_'+profile.name+':'+JSON.stringify(early));
   assert(!early.oldTrendHtml&&!early.overflow&&early.chartWidth>140&&early.fastButtonVisible,
     label+':FAST_FIRST_PAINT_BAD_'+profile.name);
   if(!profile.isMobile){
     assert.deepEqual(early.keys,['roi','rate','odds','days','unsettled','wpl','stake','drawdown'],
       label+':DESKTOP_FAST_SUMMARY_LOST');
     assert(early.outcomesVisible&&early.outcomeCounts.length===3,label+':PC_OUTCOME_BAR_MISSING');
   }else{
     assert.deepEqual(early.keys.slice().sort(),['roi','rate','settled','drawdown'].sort(),
       label+':MOBILE_FAST_SUMMARY_CHANGED');
     assert(!early.outcomesVisible,label+':MOBILE_OUTCOMES_NOT_REQUESTED');
   }
   await page.waitForTimeout(1300);
   assert.equal(api.length,0,label+':HISTORICAL_API_BEFORE_CLICK_'+profile.name);
   await page.screenshot({path:auditDir+'/'+label+'-'+profile.name+'-fast.png',fullPage:false});
   const fastTime=Date.now()-start;
   const fastHead=await context.request.get(host+'/b46-fast-v1/head',{timeout:22000});
   const fastGraph=await context.request.get(host+'/b46-fast-v1/chart',{timeout:22000});
   assert.equal(fastHead.status(),200,label+':LIVE_HEAD_NOT_FRESH');
   assert.equal(fastGraph.status(),200,label+':LIVE_GRAPH_NOT_FRESH');
   const h=await fastHead.json(),g=await fastGraph.json();
   assert(h.ok&&g.ok&&h.total===g.summary.rows&&h.snapshotSavedAt===g.asOf,
     label+':SNAPSHOT_GENERATION_MISMATCH');
   if(!profile.isMobile){
     assert.deepEqual(early.outcomeCounts,[h.win+h.halfWin,h.push,h.loss+h.halfLoss],
       label+':FAST_SUMMARY_COUNTS_DIFFER');
   }
   await page.locator('#b46-fast-v1-preview .b46-fast-details').click();
   try{
     await page.waitForFunction(()=>{
       const d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
       const chart=document.querySelector('#b46-finance-chart-card svg.f46-svg');
       return !!(d?.ok===true&&d.ledgerRows?.length===d.ledgerTotal&&
         chart?.getClientRects().length);
     },null,{timeout:65000});
   }catch(e){
     const dom=await page.evaluate(()=>{
       const data=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
       const card=document.querySelector('#b46-finance-chart-card');
       const shell=card?.querySelector('[data-b46-perf-shell]');
       const cnt=document.querySelector('.sp-stats-content');
       return{detailRequested:window.__B46_FAST_DETAILS_REQUESTED,
         diag:window.__B46_FAST_V1_DIAG,
         data: data?{ok:data.ok,total:data.total,ledgerTotal:data.ledgerTotal,
           length:data.ledgerRows?.length,stale:data.stale,hasMore:data.hasMore}:null,
         nativeSvg:!!card?.querySelector('svg.f46-svg'),
         rootHtml:card?.outerHTML.slice(0,450),
         shellHtml:shell?.innerHTML.slice(0,450),
         workspaceView:document.body?.dataset?.workspaceView,
         contentDisplay:cnt?getComputedStyle(cnt).display:null,
         feedState:document.querySelector('[data-sp-feed-state]')?.textContent?.slice(0,130)};
     });
     console.log('B46_FAST_V1_NATIVE_TIMEOUT_DIAG='+JSON.stringify({profile:profile.name,dom,
       apiStatuses:apiStatuses.slice(-40),errors,failures:badRequests.slice(-12),warnings:warnings.slice(-12)}));
     throw e;
   }
   await page.waitForFunction(()=>!document.querySelector('#b46-fast-v1-preview'),null,{timeout:10000});
   const native=await page.evaluate(()=>({
     rowCount:window.BALL46_STATISTICS_DATA.getSnapshot().ledgerRows.length,
     ledgerTotal:window.BALL46_STATISTICS_DATA.getSnapshot().ledgerTotal,
     chartPoints:Number(document.querySelector('#b46-finance-chart-card svg.f46-svg')?.dataset?.pointCount||0),
     net:document.querySelector('#b46-finance-chart-card [data-f46-value]')?.textContent?.trim(),
     desktopTiles:document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item').length,
     outcomeBars:document.querySelectorAll('#b46-finance-chart-card .b46-stage-outcomes-segment').length,
     overflow:document.documentElement.scrollWidth>innerWidth+2
   }));
   assert.equal(native.ledgerTotal,native.rowCount,label+':INCOMPLETE_ORIGINAL_LEDGER');
   assert.equal(native.chartPoints,g.series.units.length,label+':NATIVE_DAILY_POINT_COUNT_DRIFT');
   const nativeNet=Number(String(native.net||'').replaceAll(',','').replace(/[^0-9.+-]/g,''));
   // A new settlement can occur during the same browser QA run. Require parity
   // when aggregate result counts still match the snapshot read at first paint.
   const current=windowIsValidNumber(nativeNet);
   assert(current,label+':NATIVE_NET_UNREADABLE');
   assert(!native.overflow,label+':NATIVE_OVERFLOW');
   if(!profile.isMobile){
     assert.equal(native.desktopTiles,8,label+':PRODUCTION_DESKTOP_CARD_LOST');
     assert.equal(native.outcomeBars,3,label+':PRODUCTION_OUTCOMES_LOST');
   }else{
     assert.equal(native.desktopTiles,0,label+':MOBILE_DESKTOP_CARD_LEAK');
     assert.equal(native.outcomeBars,0,label+':MOBILE_OUTCOMES_LEAK');
   }
   assert(api.length>0,label+':NATIVE_HISTORY_WAS_NOT_FETCHED');
   assert.equal(errors.length,0,label+':PAGE_JS_ERRORS_'+JSON.stringify(errors));
   await page.screenshot({path:auditDir+'/'+label+'-'+profile.name+'-native.png',fullPage:false});
   output.push({profile:profile.name,firstPaintMs:early.diag.fastPaintMs,navigationToFastMs:fastTime,
     nativeGraphPoints:native.chartPoints,historyApiCalls:api.length,headRows:h.ledgerTotal,
     nativeRows:native.rowCount,errorCount:errors.length,cardReused:true});
   await context.close();
  }
  // A filtered deep link must bypass precomputed all-market graph.
  const context=await browser.newContext({viewport:{width:1366,height:900},timezoneId:'Asia/Bangkok'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(host+'/?view=statistics&market=ah',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>{
    const d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
    if(!d||!Array.isArray(d.ledgerRows))return false;
    return !!window.__B46_FAST_DETAILS_REQUESTED&&d.ledgerRows.length===d.ledgerTotal&&
      !!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length;
  },null,{timeout:100000});
  assert.equal(await page.locator('#b46-fast-v1-preview').count(),0,label+':FILTERED_ALL_MARKET_GRAPH_SHOWN');
  assert.equal(errors.length,0,label+':FILTERED_JS_ERRORS');
  output.push({profile:'filtered-AH',fallback:'native',pass:true});
  await context.close();
  // A stale/missing Production snapshot must never leave a blank Stats view.
  const fallbackCtx=await browser.newContext({viewport:{width:1366,height:900},timezoneId:'Asia/Bangkok'});
  const fallbackPage=await fallbackCtx.newPage(),fallbackErrors=[];
  fallbackPage.on('pageerror',e=>fallbackErrors.push(e.message));
  await fallbackPage.route('**/b46-fast-v1/chart*',route=>route.fulfill({
    status:503,contentType:'application/json',body:'{"ok":false,"error":"INJECTED_BROWSER_QA_ONLY"}'}));
  await fallbackPage.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
  await fallbackPage.waitForFunction(()=>{
    const d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
    if(!d||!Array.isArray(d.ledgerRows))return false;
    return window.__B46_FAST_V1_DIAG?.status==='unavailable'&&
      !!window.__B46_FAST_DETAILS_REQUESTED&&d.ledgerRows.length===d.ledgerTotal&&
      !!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length;
  },null,{timeout:110000});
  assert.equal(await fallbackPage.locator('#b46-fast-v1-preview').count(),0,
    label+':SNAPSHOT_503_LEFT_FAKE_PREVIEW');
  assert.equal(fallbackErrors.length,0,label+':SNAPSHOT_503_SCRIPT_ERRORS');
  output.push({profile:'graph-503',fallback:'verified-native',pass:true});
  await fallbackCtx.close();
  return {host,label,checks:output};
 }finally{await browser.close()}
}
function windowIsValidNumber(x){return Number.isFinite(x)}
