import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');
const host=process.env.B46_TOP_KPI_TEST_HOST;
if(!host||!host.startsWith('https://'))throw Error('HTTPS_CANDIDATE_URL_REQUIRED');
const browser=await chromium.launch({headless:true});
const cases=[
  {name:'pc-total',path:'/?view=statistics',width:1366,height:900},
  {name:'pc-1x2',path:'/?view=statistics&market=1x2',width:1366,height:900,filtered:true},
  {name:'pc-ah',path:'/?view=statistics&market=ah',width:1366,height:900,filtered:true},
  {name:'mobile-total',path:'/?view=statistics',width:390,height:844,mobile:true}
];
try{
 for(const c of cases){
  const ctx=await browser.newContext({viewport:{width:c.width,height:c.height},
    isMobile:!!c.mobile,hasTouch:!!c.mobile,timezoneId:'Asia/Bangkok'});
  const page=await ctx.newPage(),errors=[],api=[];
  page.on('pageerror',e=>errors.push(e.message.slice(0,250)));
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')api.push(r.method())});
  await page.addInitScript(()=>{
   window.__B46_KPI_REAPPEAR_COUNT=0;
   let observer;
   const install=()=>{
    observer=new MutationObserver(events=>{
     for(const event of events)for(const node of event.addedNodes){
      if(node.nodeType===1&&(node.matches?.('.sp-kpis')||node.querySelector?.('.sp-kpis')))
       window.__B46_KPI_REAPPEAR_COUNT++;
     }
    });
    observer.observe(document.documentElement,{subtree:true,childList:true});
   };
   if(document.documentElement)install();
   else document.addEventListener('DOMContentLoaded',install,{once:true});
  });
  const response=await page.goto(host+c.path,{waitUntil:'domcontentloaded',timeout:55000});
  assert.equal(response?.status(),200,c.name+':HTTP_FAIL');
  const src=await response.text();
  assert(!src.includes('<section class="sp-kpis">'),c.name+':SOURCE_HAS_REMOVED_ROW');
  assert(!src.includes('data-sp-kpi="total"'),c.name+':SOURCE_HAS_SETTLED_LEGACY_CARD');
  const early=await page.evaluate(()=>({
    row:document.querySelectorAll('.sp-kpis').length,
    cards:document.querySelectorAll('.sp-kpis .sp-kpi').length,
    settledDays:document.querySelectorAll('[data-b46-settled-days-kpi]').length
  }));
  assert.equal(early.row+early.cards+early.settledDays,0,c.name+':ROW_VISIBLE_AT_DOM_READY');
  if(c.filtered){
   await page.waitForFunction(()=>{
    const d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
    return d?.ok===true&&d.ledgerRows?.length===d.ledgerTotal&&
      !!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length;
   },null,{timeout:110000});
  }else{
   await page.waitForFunction(()=>window.__B46_FAST_V1_DIAG?.status==='fast-preview-visible',
      null,{timeout:23000});
   await page.waitForTimeout(800);
  }
  const state=await page.evaluate(()=>{
   const chart=document.querySelector('#b46-finance-chart-card');
   return{
    legacyRow:document.querySelectorAll('.sp-kpis').length,
    legacyKpis:document.querySelectorAll('.sp-kpis .sp-kpi').length,
    oldSettledDays:document.querySelectorAll('[data-b46-settled-days-kpi]').length,
    reappeared:window.__B46_KPI_REAPPEAR_COUNT,
    financeCardCount:document.querySelectorAll('#b46-finance-chart-card').length,
    financialMetrics:chart?.querySelectorAll('.b46-fast-stat,.f46-metrics>div').length||0,
    fast:!!document.querySelector('#b46-fast-v1-preview')?.getClientRects().length,
    native:!!chart?.querySelector('svg.f46-svg')?.getClientRects().length,
    overflow:document.documentElement.scrollWidth>innerWidth+2
   };
  });
  assert(state.legacyRow===0&&state.legacyKpis===0&&state.oldSettledDays===0&&
    state.reappeared===0,c.name+':MOVED_BAR_REAPPEARED_'+JSON.stringify(state));
  assert(state.financeCardCount===1&&state.financialMetrics>=4,c.name+':NEW_FINANCE_CARD_LOST');
  assert(!state.overflow,c.name+':HORIZONTAL_OVERFLOW');
  assert.equal(errors.length,0,c.name+':JS_ERRORS_'+JSON.stringify(errors));
  if(!c.filtered)assert.equal(api.length,0,c.name+':LOADED_FULL_LEDGER_BEFORE_DETAILS');
  if(c.name==='pc-total'){
   await page.locator('#b46-fast-v1-preview .b46-fast-details').click();
   await page.waitForFunction(()=>{
     const d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
     return d?.ok===true&&d.ledgerRows?.length===d.ledgerTotal &&
       !!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length &&
       !document.querySelector('#b46-fast-v1-preview');
   },null,{timeout:115000});
   assert.equal(await page.locator('.sp-kpis,[data-b46-settled-days-kpi]').count(),0,
      'OLD_BAR_RETURNED_AFTER_NATIVE_TAKEOVER');
   assert.equal(errors.length,0,'NATIVE_TAKEOVER_SCRIPT_ERRORS');
  }
  console.log('B46_TOP_KPI_QA='+JSON.stringify({profile:c.name,result:'PASS',
     statRowRemoved:true,financeCardRetained:true,apiCalls:api.length,errors:errors.length}));
  await ctx.close();
 }
}finally{await browser.close()}
