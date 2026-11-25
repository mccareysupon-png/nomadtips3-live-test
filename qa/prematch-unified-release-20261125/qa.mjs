import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin=(process.env.B46_UNIFIED_QA_ORIGIN||'https://ball46.com').replace(/\/$/,'');
const path='/prematch/over-under/?b46pm=ou';
const out='qa/prematch-unified-release-20261125/audit';
mkdirSync(out,{recursive:true});
const results=[];
const browser=await chromium.launch({headless:true});
try{
 const publicPage=await fetch(origin+path,{signal:AbortSignal.timeout(45000)});
 assert.equal(publicPage.status,200,'UNIFIED_PAGE_BAD_STATUS');
 assert.equal(publicPage.headers.get('x-b46-prematch-unified'),'readonly-pinned-20261125');
 const root=await fetch(origin+'/',{signal:AbortSignal.timeout(40000)});
 assert.equal(root.status,200,'OTHER_PRODUCTION_HOME_CHANGED');
 assert(!root.headers.has('x-b46-prematch-unified'),'ROOT_INTERCEPTED');
 for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[],nav=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  page.on('framenavigated',f=>{if(f===page.mainFrame())nav.push(f.url())});
  const r=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:75000});
  assert(r?.ok(),'MAIN_HTML_FAIL_'+name);
  await page.waitForSelector('#b46-adaptive-native table',{timeout:65000});
  await page.waitForSelector('.b46pm-performance [data-b46pm-perf-range="90D"]',{timeout:30000});
  const initial=await page.evaluate(()=>{
   const panel=document.querySelector('#b46-prematch-panel');
   const perf=panel?.querySelector('.b46pm-performance');
   const adaptive=panel?.querySelector('#b46-adaptive-native');
   const chart=perf?.querySelector('.b46pm-chart-stage');
   const svg=chart?.querySelector('svg');
   const table=adaptive?.querySelector('table');
   const equity=adaptive?.querySelector('#b46-adaptive-research-equity');
   const equityChart=equity?.querySelector('svg');
   if(!panel||!perf||!adaptive||!chart||!table||!equity||!equityChart)return {missing:true,body:document.body?.textContent?.slice(0,700)};
   document.documentElement.dataset.b46UnifiedQA='keep-'+Date.now();
   window.__b46UnifiedQA={panel,perf,adaptive,chart,svg,table,equity,equityChart,
    docMarker:document.documentElement.dataset.b46UnifiedQA,removed:[]};
   new MutationObserver(records=>{for(const rec of records)for(const node of rec.removedNodes){
    if(node===perf||node===adaptive||node===chart||node===svg||node===table||node===equity||node===equityChart||
       node.contains?.(perf)||node.contains?.(adaptive)||node.contains?.(table)||node.contains?.(equity))
      window.__b46UnifiedQA.removed.push({node:node.nodeName,id:node.id,cls:String(node.className).slice(0,60)});
   }}).observe(panel,{subtree:true,childList:true});
   return {missing:false,tableRows:table.rows.length,hasPerfSvg:!!svg,
     periodButtons:[...perf.querySelectorAll('[data-b46pm-perf-range]')].map(x=>x.dataset.b46pmPerfRange),
     equityButtons:[...equity.querySelectorAll('[data-range-days]')].map(x=>x.dataset.rangeDays),
     formulaCount:equity.querySelector('select')?.options.length,scrollWidth:document.documentElement.scrollWidth,width:innerWidth};
  });
  assert(!initial.missing,'MISSING_UNIFIED_TEST_UI_'+name+' '+JSON.stringify(initial));
  assert(initial.tableRows>=40,'FORMULAS_NOT_PRESENT_'+name);
  assert.equal(initial.formulaCount,42,'RESEARCH_FORMULA_COUNT_'+name);
  assert.deepEqual(initial.periodButtons,['7D','30D','90D','ALL'],'PERFORMANCE_RANGE_BUTTONS_'+name);
  assert.deepEqual(initial.equityButtons,['7','30','90'],'EQUITY_RANGE_BUTTONS_'+name);
  const values=[];
  for(const days of ['90D','7D','30D','ALL','7D','90D','30D']){
   await page.locator('.b46pm-performance [data-b46pm-perf-range="'+days+'"]').click({timeout:16000});
   await page.waitForTimeout(260);
   const state=await page.evaluate(period=>{
    const q=window.__b46UnifiedQA,p=document.querySelector('#b46-prematch-panel');
    return {samePanel:p===q.panel,samePerf:p.querySelector('.b46pm-performance')===q.perf,
      sameAdaptive:p.querySelector('#b46-adaptive-native')===q.adaptive,
      sameTable:p.querySelector('#b46-adaptive-native table')===q.table,
      sameChart:p.querySelector('.b46pm-performance .b46pm-chart-stage')===q.chart,
      samePerfSvg:!q.svg||p.querySelector('.b46pm-performance svg')===q.svg,
      sameEquity:p.querySelector('#b46-adaptive-research-equity')===q.equity,
      sameEquitySvg:p.querySelector('#b46-adaptive-research-equity svg')===q.equityChart,
      removed:q.removed.length,pressed:p.querySelector('.b46pm-performance [data-b46pm-perf-range="'+period+'"]')?.getAttribute('aria-pressed'),
      documentIntact:document.documentElement.dataset.b46UnifiedQA===q.docMarker,
      tableRows:q.table.rows.length};
   },days);
   assert(state.samePanel&&state.samePerf&&state.sameAdaptive&&state.sameTable&&state.sameChart&&state.samePerfSvg&&state.sameEquity&&state.sameEquitySvg&&state.documentIntact,
    'PANEL_RECREATED_'+name+'_'+days+' '+JSON.stringify(state));
   assert(state.removed===0&&state.tableRows===initial.tableRows,'REMOVED_UI_'+name+'_'+days);
   assert(state.pressed==='true','NO_ACTIVE_PERIOD_'+name+'_'+days);
   values.push({days,removed:state.removed,pressed:state.pressed});
  }
  const equityValues=[];
  for(const days of ['90','7','30','90','7','30']){
   await page.locator('#b46-adaptive-research-equity [data-range-days="'+days+'"]').click();
   const st=await page.evaluate(n=>{
    const q=window.__b46UnifiedQA,p=document.querySelector('#b46-prematch-panel');
    return {samePanel:p===q.panel,sameTable:p.querySelector('#b46-adaptive-native table')===q.table,
     sameEquity:p.querySelector('#b46-adaptive-research-equity')===q.equity,
     sameSvg:p.querySelector('#b46-adaptive-research-equity svg')===q.equityChart,
     removed:q.removed.length,pressed:p.querySelector('[data-range-days="'+n+'"]')?.getAttribute('aria-pressed'),
     caption:p.querySelector('#b46-adaptive-research-equity p.b46pm-stats-cutoff')?.textContent};
   },days);
   assert(st.samePanel&&st.sameTable&&st.sameEquity&&st.sameSvg&&st.removed===0,'EQUITY_RECREATED_'+name+'_'+days);
   assert(st.pressed==='true'&&st.caption?.includes(days+'D'),'EQUITY_RANGE_STALE_'+name+'_'+days);
   equityValues.push({days,caption:st.caption});
  }
  await page.waitForTimeout(1800);
  const end=await page.evaluate(()=>{
   const q=window.__b46UnifiedQA;
   return {panelIntact:document.querySelector('#b46-prematch-panel')===q.panel,
    perfIntact:document.querySelector('.b46pm-performance')===q.perf,
    adaptiveIntact:document.querySelector('#b46-adaptive-native')===q.adaptive,
    tableIntact:document.querySelector('#b46-adaptive-native table')===q.table,
    removed:q.removed.length,documentIntact:document.documentElement.dataset.b46UnifiedQA===q.docMarker,
    scrollWidth:document.documentElement.scrollWidth,width:innerWidth};
  });
  assert(end.panelIntact&&end.perfIntact&&end.adaptiveIntact&&end.tableIntact&&end.documentIntact&&end.removed===0,'LATE_ASYNC_REBUILT_'+name+' '+JSON.stringify(end));
  assert.equal(errors.length,0,'JAVASCRIPT_ERRORS_'+name+' '+JSON.stringify(errors));
  await page.screenshot({path:out+'/'+name+'-unified.png',fullPage:false});
  results.push({name,initial,performanceSwitches:values,equitySwitches:equityValues,end,errors,nav});
  await ctx.close();
 }
 console.log('B46_PREMATCH_UNIFIED_BROWSER_QA_PASS '+JSON.stringify({origin,path,results:results.map(x=>({name:x.name,tableRows:x.initial.tableRows,performanceSwitches:x.performanceSwitches.length,equitySwitches:x.equitySwitches.length,removed:x.end.removed,errors:x.errors,documentIntact:x.end.documentIntact}))}));
}catch(error){console.error('B46_PREMATCH_UNIFIED_BROWSER_QA_FAILURE '+String(error.stack||error));process.exitCode=1;}
finally{writeFileSync(out+'/browser.json',JSON.stringify({origin,path,results},null,2));await browser.close();}
