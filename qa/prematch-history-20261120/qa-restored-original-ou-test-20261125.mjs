import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const root='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const file='qa/prematch-history-20261120/audit-original-20261122-route';
mkdirSync(file,{recursive:true});
const browser=await chromium.launch({headless:true}),reports=[];
try{
 for(const [device,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error.message)));
  const response=await page.goto(root+'/?b46pm=ou',{waitUntil:'domcontentloaded',timeout:65000});
  assert(response?.ok());
  await page.waitForSelector('#b46-adaptive-native table',{timeout:50000});
  await page.waitForSelector('.b46pm-performance [data-b46pm-perf-range="90D"]',{timeout:25000});
  const init=await page.evaluate(()=>{
   const panel=document.querySelector('#b46-prematch-panel');
   const perf=panel.querySelector('.b46pm-performance');
   const research=panel.querySelector('#b46-adaptive-native'),table=research.querySelector('table');
   const chart=perf.querySelector('.b46pm-chart-stage'),svg=chart.querySelector('svg');
   const equity=research.querySelector('#b46-adaptive-research-equity');
   const equitySvg=equity?.querySelector('svg');
   window.__oldRoute={panel,perf,research,table,chart,svg,equity,equitySvg,removed:0};
   const q=window.__oldRoute;
   new MutationObserver(records=>{for(const r of records)for(const n of r.removedNodes){
    if(n===perf||n===research||n===table||n===chart||n===svg||n===equity||n===equitySvg||
       n.contains?.(research)||n.contains?.(perf)||n.contains?.(table))q.removed++;
   }}).observe(panel,{childList:true,subtree:true});
   document.documentElement.dataset.originalRouteQa='retained';
   return {tableRows:table.rows.length,equity:!!equity,svg:!!svg,eqSvg:!!equitySvg};
  });
  assert(init.tableRows>=40&&init.equity&&init.svg&&init.eqSvg,'ORIGINAL_UI_NOT_PRESENT_'+device);
  const ranges=[];
  for(const r of ['7D','30D','90D','ALL','7D','30D','90D']){
   await page.locator('.b46pm-performance [data-b46pm-perf-range="'+r+'"]').click();
   const state=await page.evaluate(n=>{
    const q=window.__oldRoute,p=document.querySelector('#b46-prematch-panel');
    return {samePanel:q.panel===p,samePerf:q.perf===p.querySelector('.b46pm-performance'),
     sameResearch:q.research===p.querySelector('#b46-adaptive-native'),
     sameTable:q.table===p.querySelector('#b46-adaptive-native table'),
     sameChart:q.chart===p.querySelector('.b46pm-performance .b46pm-chart-stage'),
     sameSVG:q.svg===p.querySelector('.b46pm-performance .b46pm-chart-stage svg'),
     sameEquity:q.equity===p.querySelector('#b46-adaptive-research-equity'),
     sameEquitySvg:q.equitySvg===p.querySelector('#b46-adaptive-research-equity svg'),
     removed:q.removed,pressed:p.querySelector('[data-b46pm-perf-range="'+n+'"]')?.getAttribute('aria-pressed')};
   },r);
   assert(Object.entries(state).filter(([k])=>k.startsWith('same')).every(([,v])=>v)&&state.removed===0&&state.pressed==='true','ORIGINAL_PERFORMANCE_BLINK_'+device+'_'+r+' '+JSON.stringify(state));
   ranges.push(r);
  }
  const equity=[];
  for(const r of [7,30,90,7,30,90]){
   await page.locator('#b46-adaptive-research-equity [data-range-days="'+r+'"]').click();
   const s=await page.evaluate(n=>{
    const q=window.__oldRoute,p=document.querySelector('#b46-prematch-panel');
    return {sameTable:q.table===p.querySelector('#b46-adaptive-native table'),
      sameEquity:q.equity===p.querySelector('#b46-adaptive-research-equity'),
      sameSvg:q.equitySvg===p.querySelector('#b46-adaptive-research-equity svg'),
      removed:q.removed,pressed:p.querySelector('#b46-adaptive-research-equity [data-range-days="'+n+'"]')?.getAttribute('aria-pressed')};
   },r);
   assert(s.sameTable&&s.sameEquity&&s.sameSvg&&s.removed===0&&s.pressed==='true','ORIGINAL_EQUITY_BLINK_'+device+'_'+r);
   equity.push(r);
  }
  await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(()=>window.__oldRoute.removed),0,'ASYNC_RENDER_REMOVED_PANEL_'+device);
  assert.equal(errors.length,0,'JS_ERRORS_'+device);
  await page.screenshot({path:file+'/'+device+'.png',fullPage:false});
  reports.push({device,tableRows:init.tableRows,perfClicks:ranges.length,equityClicks:equity.length,errors,removed:0});
  await ctx.close();
 }
 console.log('B46_ORIGINAL_TEST_ROUTE_BROWSER_QA_PASS '+JSON.stringify({url:root+'/?b46pm=ou',reports}));
}catch(e){console.error('B46_ORIGINAL_TEST_ROUTE_BROWSER_QA_FAIL '+String(e.stack||e));process.exitCode=1;}
finally{writeFileSync(file+'/qa.json',JSON.stringify(reports,null,2));await browser.close();}
