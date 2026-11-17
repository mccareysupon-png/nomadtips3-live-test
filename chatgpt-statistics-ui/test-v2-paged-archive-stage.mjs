// STAGING-only browser regression: opening recent archived results MUST NOT
// trigger full Ledger recount or overwrite the verified financial Snapshot.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');
const base='https://ball46-chat-statistics-live-ui-test-20261115.mccarey-supon.workers.dev';
const browser=await chromium.launch({headless:true});
const out=[];
try{
 for(const p of [{name:'pc',width:1366,height:900,isMobile:false},
                  {name:'mobile',width:390,height:844,isMobile:true}]){
  const ctx=await browser.newContext({viewport:{width:p.width,height:p.height},timezoneId:'Asia/Bangkok',
    isMobile:p.isMobile,hasTouch:p.isMobile});
  const page=await ctx.newPage(),api=[],errors=[],archiveCalls=[];
  page.on('pageerror',e=>errors.push(e.message.slice(0,190)));
  page.on('request',r=>{
    const u=new URL(r.url());
    if(u.pathname==='/api/engine/statistics')api.push(r.url());
    if(u.pathname==='/api/engine/statistics'&&u.searchParams.get('paged')==='1')archiveCalls.push(r.url());
  });
  const start=Date.now();
  const entry=await page.goto(base+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
  assert.equal(entry?.status(),200,p.name+'_HTTP');
  await page.waitForFunction(()=>window.__B46_FAST_CHART_DIAG?.status==='fast-preview-visible',
    null,{timeout:25000});
  const btn=page.locator('#b46-stage-fast-preview .b46-fast-details');
  await btn.waitFor({state:'visible',timeout:5000});
  const before=await page.evaluate(()=>({
    status:window.__B46_FAST_CHART_DIAG?.status,
    rows:document.querySelectorAll('#b46-stage-archive tbody tr').length,
    net:window.__B46_FAST_CHART_DIAG?.net,
    native:!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length,
    archiveScript:typeof window.__B46_STAGE_OPEN_ARCHIVE,
    overflow:document.documentElement.scrollWidth>innerWidth+2
  }));
  assert.equal(api.length,0,p.name+'_INITIAL_HISTORICAL_API_FETCH');
  assert.equal(before.archiveScript,'function',p.name+'_ARCHIVE_RUNTIME_MISSING');
  assert(before.net!==null&&Number.isFinite(before.net),p.name+'_SAVED_NET_MISSING');
  assert(!before.native&&!before.overflow,p.name+'_PREVIEW_OVERLAP_OR_OVERFLOW');
  await btn.click();
  await page.waitForFunction(()=>window.__B46_STAGE_ARCHIVE_DIAG?.status==='history-visible' &&
    document.querySelectorAll('#b46-stage-archive tbody tr').length>=50,
    null,{timeout:50000});
  const first=await page.evaluate(()=>({
    shown:document.querySelectorAll('#b46-stage-archive tbody tr').length,
    bank:window.__B46_FAST_CHART_DIAG?.net,
    archive:window.__B46_STAGE_ARCHIVE_DIAG,
    rowResults:[...document.querySelectorAll('#b46-stage-archive tbody tr td:last-child')].slice(0,10)
     .map(e=>e.dataset.result),
    fastVisible:!!document.querySelector('#b46-stage-fast-preview')?.getClientRects().length,
    native:!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length,
    overflow:document.documentElement.scrollWidth>innerWidth+2
  }));
  assert.equal(first.shown,50,p.name+'_ARCHIVE_FIRST_50_ONLY');
  assert.equal(api.length,1,p.name+'_ARCHIVE_FETCH_NOT_ONE_PAGE');
  assert(first.rowResults.every(x=>['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'].includes(x)),
    p.name+'_ARCHIVE_INCLUDES_PENDING');
  assert.equal(first.bank,before.net,p.name+'_HISTORY_RECOUNT_CHANGED_ACCOUNT_BALANCE');
  assert(first.fastVisible&&!first.native&&!first.overflow,p.name+'_HISTORY_OVERLAYS_GRAPH');
  const more=page.locator('#b46-stage-archive button');
  assert(await more.isVisible(),p.name+'_SHOW_MORE_MISSING');
  await more.click();
  await page.waitForFunction(()=>document.querySelectorAll('#b46-stage-archive tbody tr').length===100,
    null,{timeout:18000});
  assert.equal(api.length,1,p.name+'_FETCHED_LEDGER_AGAIN_BEFORE_BUFFER_EXHAUSTED');
  assert.equal(errors.length,0,p.name+'_JS_ERRORS_'+JSON.stringify(errors));
  const result={profile:p.name,firstVisibleMs:Date.now()-start,apiBeforeClick:0,
    afterOnePage:50,afterShowMore:100,archiveSourcePages:archiveCalls.length,
    nativeFullRecount:false,net:before.net,errors:errors.length};
  console.log('B46_V2_PAGED_ARCHIVE='+JSON.stringify(result));
  await page.screenshot({path:'/tmp/b46-v2-stats-archive-'+p.name+'.png',fullPage:false});
  out.push(result);
  await ctx.close();
 }
 console.log('B46_V2_LEDGER_ARCHIVE_PAGED_BROWSER=PASS');
}finally{await browser.close()}