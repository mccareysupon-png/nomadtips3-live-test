import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const url='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=ou';
const browser=await chromium.launch({headless:true}),cases=[];
mkdirSync('qa/perf-range-inplace-20261125/audit',{recursive:true});
try{
 for(const [mode,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[],nav=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('framenavigated',f=>{if(f===page.mainFrame())nav.push(f.url())});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:70000});
  await page.waitForSelector('#b46-adaptive-native table',{timeout:55000});
  await page.waitForSelector('.b46pm-performance [data-b46pm-perf-range="90D"]',{timeout:20000});
  const before=await page.evaluate(()=>{
   const panel=document.querySelector('#b46-prematch-panel');
   const perf=panel.querySelector('.b46pm-performance');
   const adaptive=panel.querySelector('#b46-adaptive-native');
   const chart=perf.querySelector('.b46pm-chart-stage');
   const svg=chart.querySelector('svg'),table=adaptive.querySelector('table');
   document.documentElement.dataset.b46PerfQa='retained-'+Date.now();
   window.__flickerQA={panel,perf,adaptive,chart,svg,table,removed:[],marker:document.documentElement.dataset.b46PerfQa};
   new MutationObserver(records=>{for(const rec of records)for(const node of rec.removedNodes){
    if(node===perf||node===adaptive||node===chart||node===svg||node===table||node.contains?.(perf)||node.contains?.(adaptive)||node.contains?.(table))
     window.__flickerQA.removed.push({node:node.nodeName,id:node.id,cls:String(node.className).slice(0,85)});
   }}).observe(panel,{subtree:true,childList:true});
   return {tableRows:table.rows.length,hasSvg:!!svg,rangeButtons:perf.querySelectorAll('[data-b46pm-perf-range]').length,scroll:panel.scrollTop};
  });
  assert(before.tableRows>=2&&before.rangeButtons===4,'CONTROL_SETUP_FAILURE_'+mode);
  const state=[];
  for(const range of ['90D','7D','30D','90D','ALL','7D','30D']){
   await page.locator('.b46pm-performance [data-b46pm-perf-range="'+range+'"]').click();
   await page.waitForTimeout(180);
   const current=await page.evaluate(range=>{
    const q=window.__flickerQA,p=document.querySelector('#b46-prematch-panel');
    const chart=p.querySelector('.b46pm-performance .b46pm-chart-stage');
    const b=p.querySelector('.b46pm-performance [data-b46pm-perf-range="'+range+'"]');
    return {samePanel:p===q.panel,samePerformance:p.querySelector('.b46pm-performance')===q.perf,
     sameAdaptive:p.querySelector('#b46-adaptive-native')===q.adaptive,sameTable:p.querySelector('#b46-adaptive-native table')===q.table,
     sameChart:chart===q.chart,sameSvg:!q.svg||chart.querySelector('svg')===q.svg,
     removed:q.removed,pressed:b?.getAttribute('aria-pressed'),tableRows:q.table.rows.length};
   },range);
   assert(current.samePanel&&current.samePerformance&&current.sameAdaptive&&current.sameTable&&current.sameChart,
    'FULL_PANEL_REBUILT_'+mode+'_'+range+'_'+JSON.stringify(current));
   assert(current.sameSvg&&current.removed.length===0,'CHART_OR_TABLE_REMOVED_'+mode+'_'+range);
   assert(current.pressed==='true','RANGE_DID_NOT_CHANGE_'+mode+'_'+range);
   assert.equal(current.tableRows,before.tableRows,'RESEARCH_FORMULA_TABLE_CHANGED_'+mode);
   state.push({range,pressed:current.pressed,removed:current.removed.length});
  }
  await page.waitForTimeout(1400);
  const stable=await page.evaluate(()=>{
   const q=window.__flickerQA,p=document.querySelector('#b46-prematch-panel');
   return {samePerformance:p.querySelector('.b46pm-performance')===q.perf,sameAdaptive:p.querySelector('#b46-adaptive-native')===q.adaptive,
    sameTable:p.querySelector('#b46-adaptive-native table')===q.table,removed:q.removed};
  });
  assert(stable.samePerformance&&stable.sameAdaptive&&stable.sameTable&&stable.removed.length===0,'ASYNC_RESPONSE_CAUSED_FULL_RERENDER_'+mode);
  assert.equal(errors.length,0,'JS_ERRORS_'+mode+'_'+errors.join(';'));
  const frameStable=await page.evaluate(()=>document.documentElement.dataset.b46PerfQa===window.__flickerQA?.marker);
  assert(frameStable,'DOCUMENT_RELOADED_'+mode);
  console.log('B46_PERFORMANCE_INPLACE_NAV '+JSON.stringify({mode,nav,frameStable}));
  await page.screenshot({path:'qa/perf-range-inplace-20261125/audit/'+mode+'.png',fullPage:false});
  cases.push({mode,before,state,stable,pageErrors:errors,nav});
  await ctx.close();
 }
 console.log('B46_PERFORMANCE_INPLACE_BROWSER_QA_PASS '+JSON.stringify({url,cases}));
}catch(error){console.error('B46_PERFORMANCE_INPLACE_BROWSER_QA_FAIL '+String(error.stack||error));process.exitCode=1;}
finally{writeFileSync('qa/perf-range-inplace-20261125/audit/browser.json',JSON.stringify({cases},null,2));await browser.close();}
