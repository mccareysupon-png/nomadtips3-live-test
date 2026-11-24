import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const host='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const report=[];
try{
 for(const device of [
  {name:'PC',width:1440,height:900,mobile:false},
  {name:'Mobile',width:390,height:844,mobile:true}
 ]){
  const context=await browser.newContext({
   viewport:{width:device.width,height:device.height},isMobile:device.mobile,hasTouch:device.mobile
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let native=null,adaptive=null;
  await page.route('**/__b46_prematch_data',async route=>{
   const r=await route.fetch({timeout:29000});assert(r.ok(),'NATIVE_HTTP_'+r.status());
   native=await r.json();await route.fulfill({response:r,body:JSON.stringify(native)});
  });
  await page.route('**/__b46_pm_adaptive_research',async route=>{
   const r=await route.fetch({timeout:29000});assert(r.ok(),'ADAPTIVE_HTTP_'+r.status());
   adaptive=await r.json();await route.fulfill({response:r,body:JSON.stringify(adaptive)});
  });
  const response=await page.goto(host+'/?b46pm=ou',{waitUntil:'domcontentloaded',timeout:60000});
  assert(response?.ok(),'OU_HTTP_FAIL');
  await page.waitForFunction(()=>{
   const list=document.querySelector('#b46-prematch-panel .b46pm-scroll-region > .b46pm-list');
   return list&&list.querySelectorAll(':scope > .b46pm-match').length===10&&
    /matches/.test(list.querySelector('.b46pm-list-head')?.textContent||'');
  },null,{timeout:45000});
  assert(native&&adaptive,'UI_SNAPSHOT_CAPTURE_MISSING');
  assert.equal(adaptive.formulas.length,42,'FORMULAS_LOST');
  const validAdaptive=adaptive.records.filter(p=>['OVER','UNDER'].includes(String(p.selection).toUpperCase())
   &&Number.isFinite(Number(p.line)));
  const records=[...native.ouLedger.rows,...validAdaptive].sort((a,b)=>
   (Number(b.kickoff)||0)-(Number(a.kickoff)||0)||
   (Number(b.picked_at)||0)-(Number(a.picked_at)||0)||
   (Number(b.fixture_id)||0)-(Number(a.fixture_id)||0)||
   String(a.formula_id||'').localeCompare(String(b.formula_id||'')));
  const list=page.locator('#b46-prematch-panel .b46pm-scroll-region > .b46pm-list');
  const count=await list.locator('.b46pm-list-head').innerText();
  assert(count.includes(records.length+' matches'),'WRONG_COMBINED_HISTORY_TOTAL_'+device.name);
  const firstRows=list.locator(':scope > .b46pm-match');
  assert.equal(await firstRows.count(),10,'NOT_TEN_CARDS_'+device.name);
  const first=await firstRows.first().innerText();
  assert(first.includes(records[0].home)&&first.includes(records[0].away),'LATEST_KICKOFF_NOT_FIRST_'+device.name);
  if(records[0].formula_id)
   assert.equal(await firstRows.first().getAttribute('data-b46-adaptive-formula'),
    records[0].formula_id,'FORMULA_TRACE_MISSING_FIRST');
  const firstAdaptive=await firstRows.locator('[data-b46-adaptive-formula]').count();
  // Attribute is on the article, not a child; verify via selector directly.
  const adaptCards=await list.locator(':scope > .b46pm-match[data-b46-adaptive-formula]').count();
  assert(adaptCards>0,'ADAPTIVE_NOT_ON_NATIVE_CARDS_'+device.name);
  assert.equal(await page.locator('#b46pm-ou-history-public').count(),1,'NEW_RESEARCH_HISTORY_REMOVED');
  assert.equal(await page.locator('#b46pm-ou-history-public tbody tr').count(),10,'RESEARCH_TABLE_PAGINATION_CHANGED');
  assert.equal(await page.locator('#b46-adaptive-native table').count(),1,'42_FORMULA_ANALYTICS_MISSING');
  const next=page.locator('#b46-prematch-panel .b46pm-pagination button[data-b46-pm-page="2"]').filter({hasText:/^2$/});
  await next.scrollIntoViewIfNeeded();
  const scrollBefore=await page.locator('#b46-prematch-panel').evaluate(e=>e.scrollTop);
  await next.click();
  await page.waitForFunction(()=>{
   const list=document.querySelector('#b46-prematch-panel .b46pm-scroll-region > .b46pm-list');
   return list?.querySelector('.b46pm-pagination button[aria-current="page"]')?.dataset.b46PmPage==='2';
  },null,{timeout:18000});
  const second=list.locator(':scope > .b46pm-match');
  assert.equal(await second.count(),10,'PAGE2_NOT_TEN_CARDS');
  const secondText=await second.first().innerText();
  assert(secondText.includes(records[10].home)&&secondText.includes(records[10].away),
   'PAGE2_SORT_OR_KICKOFF_WRONG');
  const scrollAfter=await page.locator('#b46-prematch-panel').evaluate(e=>e.scrollTop);
  assert(Math.abs(scrollAfter-scrollBefore)<4,'PAGINATION_SCROLLED_VIEWPORT_'+device.name);
  assert.equal(await page.locator('#b46pm-ou-history-public').count(),1,'RESEARCH_TAB_DISAPPEARED_AFTER_PAGING');
  assert.equal(await page.locator('#b46-pm-firstpaint-loader').count(),0,'FULLSCREEN_SPINNER_REINTRODUCED');
  assert.deepEqual(errors,[],'JS_PAGE_ERRORS_'+device.name+':'+JSON.stringify(errors));
  report.push({device:device.name,originalCardsOnPage:10,pagesTested:[1,2],
   combinedHistoryAtLoad:records.length,adaptiveAtLoad:validAdaptive.length,
   originalAtLoad:native.ouLedger.rows.length,formulaCount:adaptive.formulas.length,
   separateResearchUI:true,formulaTagOnNativeCards:true});
  await context.close();
 }
 console.log('B46_ORIGINAL_OU_HISTORY_BROWSER_QA_PASS '+JSON.stringify({
  report,productionDeploy:false,backendDeploy:false,providerCallsAdded:0}));
}finally{await browser.close()}
