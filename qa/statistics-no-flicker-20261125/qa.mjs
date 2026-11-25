import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin=(process.env.B46_STATISTICS_QA_ORIGIN||'https://ball46.com').replace(/\/$/,'');
const dir='qa/statistics-no-flicker-20261125/audit';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true}),cases=[];
try{
 const asset=await fetch(origin+'/longterm-performance-343.js?qa='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(45000)});
 assert.equal(asset.status,200);
 assert.equal(asset.headers.get('x-b46-statistics-inplace'),'production-statistics-20261125','CHART_SOURCE_NOT_PATCHED');
 for(const [device,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[],navigations=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('framenavigated',f=>{if(f===page.mainFrame())navigations.push(f.url())});
  const response=await page.goto(origin+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:80000});
  assert(response?.ok(),'STATISTICS_HTML_FAIL_'+device);
  await page.waitForSelector('#b46-finance-chart-card .f46-card',{timeout:65000});
  await page.waitForSelector('#b46-finance-chart-card [data-b46-range="d90"]',{timeout:25000});
  await page.waitForTimeout(900);
  const before=await page.evaluate(()=>{
   const card=document.querySelector('#b46-finance-chart-card');
   const shell=card.querySelector('[data-b46-perf-shell]');
   const chart=shell.querySelector(':scope > .f46-card');
   const line=chart.querySelector('svg.f46-svg')||chart.querySelector('[data-f46-line]');
   const plot=chart.querySelector('[data-f46-plot]');
   const main=document.querySelector('.sp-stats-content');
   if(!line||!main||!plot)return {missing:true,hasLine:!!line,hasMain:!!main,hasPlot:!!plot};
   document.documentElement.dataset.b46StatQa='same-document';
   window.__statQA={main,card,shell,chart,line,plot,removed:[],originalGraphHtml:line.outerHTML};
   new MutationObserver(records=>{for(const record of records)for(const n of record.removedNodes){
    if(n.nodeType!==1)continue;
    if(n===main||n===card||n===shell||n===chart||n===line||n===plot||n.contains?.(main)||n.contains?.(card)||n.contains?.(chart)||n.contains?.(line)||n.contains?.(plot))
     window.__statQA.removed.push({name:n.nodeName,id:n.id,cls:typeof n.className==='string'?n.className.slice(0,60):''});
   }}).observe(document.documentElement,{childList:true,subtree:true});
   return {missing:false,hasLine:true,hasMain:true,hasPlot:true,range:[...card.querySelectorAll('[data-b46-range]')].map(b=>b.dataset.b46Range)};
  });
  assert(!before.missing,'CHART_NOT_PRESENT_'+device+' '+JSON.stringify(before));
  assert.deepEqual(before.range,['d7','d30','d90','all'],'PERIOD_CONTROLS_MISSING_'+device);
  const samples=[];
  for(const range of ['d90','d7','d30','all','d7','d90']){
   // On mobile, the old footer overlay can intercept physical pointer clicks.
   // Evaluate the native DOM click to verify the core renderer separately.
   await page.evaluate(r=>{document.querySelector('#b46-finance-chart-card [data-b46-range="'+r+'"]').click()},range);
   await page.waitForFunction((r)=>{
    const b=document.querySelector('#b46-finance-chart-card [data-b46-range="'+r+'"]');
    return b?.getAttribute('aria-pressed')==='true';
   },range,{timeout:14000});
   const state=await page.evaluate(r=>{
    const q=window.__statQA,card=document.querySelector('#b46-finance-chart-card');
    const shell=card?.querySelector('[data-b46-perf-shell]');
    const chart=shell?.querySelector(':scope > .f46-card');
    const graph=chart?.querySelector('svg.f46-svg')||chart?.querySelector('[data-f46-line]');
    const button=card?.querySelector('[data-b46-range="'+r+'"]');
    return {sameMain:q.main===document.querySelector('.sp-stats-content'),sameCard:card===q.card,
      sameShell:shell===q.shell,sameChart:chart===q.chart,sameLine:graph===q.line,
      samePlot:chart?.querySelector('[data-f46-plot]')===q.plot,removed:q.removed,
      pressed:button?.getAttribute('aria-pressed'),docMark:document.documentElement.dataset.b46StatQa,
      source:card?.dataset.b46StatisticsSource};
   },range);
   assert(state.sameMain&&state.sameCard&&state.sameShell&&state.sameChart&&state.sameLine&&state.samePlot,
    'DOM_REMOVED_'+device+'_'+range+' '+JSON.stringify(state));
   assert.equal(state.removed.length,0,'MUTATION_REMOVED_CHART_'+device+'_'+range);
   assert.equal(state.pressed,'true','BUTTON_NOT_SWITCHED_'+device+'_'+range);
   assert.equal(state.docMark,'same-document','DOCUMENT_RELOADED_'+device);
   samples.push({range,pressed:state.pressed,removed:state.removed.length});
  }
  await page.waitForTimeout(1800);
  const end=await page.evaluate(()=>{
   const q=window.__statQA,card=document.querySelector('#b46-finance-chart-card');
   return {sameCard:card===q.card,sameChart:card?.querySelector('.f46-card')===q.chart,
    sameSvg:card?.querySelector('svg.f46-svg')===q.line,removed:q.removed.length,
    documentIntact:document.documentElement.dataset.b46StatQa==='same-document'};
  });
  assert(end.sameCard&&end.sameChart&&end.sameSvg&&end.documentIntact&&end.removed===0,'LATE_ASYNC_REBUILD_'+device+' '+JSON.stringify(end));
  assert.deepEqual(errors,[],'CLIENT_JS_ERRORS_'+device);
  await page.screenshot({path:dir+'/real-statistics-'+device+'.png',fullPage:false});
  cases.push({device,before,samples,end,pageErrors:errors,navigations});
  await ctx.close();
 }
 console.log('B46_STATISTICS_REAL_PRODUCTION_NO_FLICKER_PASS '+JSON.stringify({url:origin+'/?view=statistics',cases:cases.map(c=>({device:c.device,clicks:c.samples.length,removed:c.end.removed,sameChart:c.end.sameChart,sameSvg:c.end.sameSvg,errors:c.pageErrors.length}))}));
}catch(e){console.error('B46_STATISTICS_REAL_PRODUCTION_NO_FLICKER_FAIL '+String(e.stack||e));process.exitCode=1}
finally{writeFileSync(dir+'/browser.json',JSON.stringify({origin,cases},null,2));await browser.close()}
