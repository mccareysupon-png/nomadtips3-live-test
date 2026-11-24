import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {combineOuOverview} from './b46-ou-overview-aggregate-test-v1.mjs';
const base='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const result=[];
try{
 for(const device of [
  {name:'PC_1440',width:1440,height:900,mobile:false},
  {name:'MOBILE_390',width:390,height:844,mobile:true}
 ]){
  const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},
   isMobile:device.mobile,hasTouch:device.mobile});
  const page=await ctx.newPage();
  let dataset=null,adaptive=null;
  for(const [suffix,which] of [['__b46_prematch_data','base'],['__b46_pm_adaptive_research','adaptive']]){
   await page.route('**/'+suffix,async route=>{
    const response=await route.fetch({timeout:30000});
    assert(response.ok(),'BROWSER_CAPTURE_HTTP_'+suffix);
    const value=await response.json();
    if(which==='base')dataset=value;else adaptive=value;
    await route.fulfill({response,body:JSON.stringify(value),headers:{'content-type':'application/json','cache-control':'no-store'}});
   });
  }
  const errors=[];page.on('pageerror',e=>errors.push(String(e.message)));
  const response=await page.goto(base+'?b46pm=ou',{waitUntil:'domcontentloaded',timeout:60000});
  assert(response?.ok(),'OU_PAGE_HTTP_'+device.name);
  await page.locator('#b46-prematch-panel .b46pm-performance-summary .b46pm-performance-hero')
   .waitFor({state:'visible',timeout:55000});
  await page.waitForFunction(()=>document.querySelectorAll('#b46-adaptive-native table').length>=2,{timeout:45000});
  assert(dataset&&adaptive,'BROWSER_NATIVE_API_PAYLOAD_NOT_CAPTURED');
  const combined=combineOuOverview(dataset.ouLedger,dataset.ouDailySeries,dataset.ouDailyBook,adaptive);
  assert.equal(combined.formulaCount,42,'ALL_42_FORMULAS_EXPECTED');
  let ui=await page.evaluate(()=>{
   const board=document.querySelector('#b46-prematch-panel .b46pm-stats-board');
   const cards=board?[...board.querySelectorAll('.b46pm-stat')].map(e=>[
    e.querySelector('.b46pm-stat-label')?.textContent?.trim(),
    e.querySelector('.b46pm-stat-value')?.textContent?.trim()]):[];
   const ps=document.querySelector('#b46-prematch-panel .b46pm-performance-summary');
   const chart=document.querySelector('#b46-prematch-panel .b46pm-performance-chart');
   return {cards:Object.fromEntries(cards),hero:ps?.textContent,chart:chart?.textContent,
    chartSvg:!!chart?.querySelector('.b46pm-chart-stage svg'),
    svgPaths:chart?.querySelectorAll('.b46pm-chart-stage path').length??0,
    adaptiveGraphs:document.querySelectorAll('#b46-adaptive-research-equity svg').length,
    adaptiveVisible:!!document.getElementById('b46-adaptive-native'),
    fullScreen:!!document.getElementById('b46-pm-firstpaint-loader'),
    pageTitle:document.querySelector('.b46pm-performance-subtitle')?.textContent,
    pageWidth:document.documentElement.scrollWidth,screenWidth:innerWidth};
  });
  assert(ui.cards&&Object.keys(ui.cards).length>=8,'OVERVIEW_GRID_NOT_VISIBLE_'+device.name);
  assert.equal(ui.cards.WIN,String(combined.total.win),'WRONG_AGGREGATE_WIN_'+device.name);
  assert.equal(ui.cards.LOSS,String(combined.total.loss),'WRONG_AGGREGATE_LOSS_'+device.name);
  assert.equal(ui.cards.SETTLED,String(combined.total.settled),'WRONG_AGGREGATE_SETTLED_'+device.name);
  assert(ui.cards['WIN RATE'].includes(combined.total.winRate.toFixed(2)),'WRONG_WIN_RATE_'+device.name);
  assert(ui.cards['P/L'].includes(combined.total.units.toFixed(2)),'WRONG_AGGREGATE_PL_'+device.name);
  assert(ui.hero.includes(combined.total.units.toFixed(2)),'CUMULATIVE_SUMMARY_WRONG_'+device.name);
  assert(ui.chartSvg&&ui.svgPaths>=1,'NATIVE_OU_GRAPH_EMPTY_'+device.name);
  assert(ui.adaptiveGraphs>=1&&ui.adaptiveVisible,'SEPARATE_FORMULA_STATS_MISSING_'+device.name);
  assert.equal(ui.fullScreen,false);
  assert(ui.pageWidth<=ui.screenWidth+3,'HORIZONTAL_OVERFLOW_'+device.name);
  const metric=page.locator('#b46-prematch-panel [data-b46pm-perf-metric="winRate"]').first();
  await metric.click();
  await page.waitForTimeout(350);
  const rateStage=await page.locator('#b46-prematch-panel .b46pm-chart-stage svg').count();
  assert.equal(rateStage,1,'WINRATE_GRAPH_EMPTY_'+device.name);
  await page.locator('#b46-prematch-panel [data-b46pm-perf-metric="roi"]').first().click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#b46-prematch-panel .b46pm-chart-stage svg').count(),1,'ROI_GRAPH_EMPTY_'+device.name);
  await page.locator('#b46-prematch-panel [data-b46pm-perf-metric="units"]').first().click();
  await page.waitForTimeout(250);
  for(const range of ['30D','90D']){
   await page.locator('#b46-prematch-panel [data-b46pm-perf-range="'+range+'"]').first().click();
   await page.waitForTimeout(250);
   assert.equal(await page.locator('#b46-prematch-panel .b46pm-chart-stage svg').count(),1,
    range+'_OU_COMBINED_GRAPH_EMPTY_'+device.name);
  }
  assert.deepEqual(errors,[],'BROWSER_SCRIPT_ERROR_'+device.name+'_'+errors.join('|'));
  result.push({device:device.name,wins:ui.cards.WIN,losses:ui.cards.LOSS,
   winRate:ui.cards['WIN RATE'],profitLoss:ui.cards['P/L'],cumulative:ui.hero?.slice(0,80),
   graphPaths:ui.svgPaths,formulaChartPresent:ui.adaptiveGraphs>0,chartRanges:['30D','90D']});
  await ctx.close();
 }
 console.log('B46_OU_AGGREGATE_NATIVE_BROWSER_QA_PASS '+JSON.stringify({
  formulaCount:42,devices:result,
  source:combined.source,noBackendCallsAdded:0
 }));
}finally{await browser.close()}
