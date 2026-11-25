import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const host='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const browser=await chromium.launch({headless:true});
const report={worker:'ball46-premium-match-colors-test-20261120',qa:[],started:new Date().toISOString()};
const out='qa/adaptive-equity-no-flicker-20261125/audit';
mkdirSync(out,{recursive:true});
try{
 for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(host+'/?b46pm=ou&noFlickerTest='+Date.now(),{waitUntil:'domcontentloaded',timeout:75000});
  assert(response?.ok(),'HTTP_FAIL_'+name+'_'+response?.status());
  await page.waitForSelector('#b46-adaptive-native #b46-adaptive-research-equity',{timeout:75000});
  const baseline=await page.evaluate(()=>{
   const panel=document.querySelector('#b46-adaptive-native'),graph=document.querySelector('#b46-adaptive-research-equity');
   const table=panel.querySelector('table'),selector=graph.querySelector('select'),svg=graph.querySelector('svg'),poly=svg?.querySelector('polyline');
   const buttons=[...graph.querySelectorAll('button[data-range-days]')].map(x=>x.dataset.rangeDays);
   window.__B46NoFlickerQa={panel,graph,table,selector,svg,poly};
   const removed=[];
   const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node===graph||node===table||node.contains?.(graph)||node.contains?.(table))removed.push(node.tagName||node.nodeName)});
   observer.observe(panel,{subtree:true,childList:true});
   window.__B46NoFlickerObserver={observer,removed};
   return {panelText:panel.textContent?.slice(0,240),tableRows:table?.rows.length,buttons,formulaCount:selector?.options.length,svgHeight:svg?.getBoundingClientRect().height,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  assert.deepEqual(baseline.buttons,['7','30','90'],'RANGES_MISSING_'+name);
  assert.equal(baseline.formulaCount,42,'FORMULAS_MISSING_'+name);
  assert(baseline.tableRows>=2,'FORMULA_TABLE_EMPTY_'+name);
  assert(baseline.svgHeight>=155,'CHART_FRAME_MISSING_'+name);
  assert(baseline.scrollWidth<=baseline.viewport+3,'HORIZONTAL_OVERFLOW_'+name);
  await page.evaluate(()=>{ window.__B46ClickProbe=[];document.addEventListener('click',e=>{if(e.target?.dataset?.rangeDays)window.__B46ClickProbe.push({phase:'document-capture',value:e.target.dataset.rangeDays})},true);for(const button of document.querySelectorAll('#b46-adaptive-research-equity button[data-range-days]'))button.addEventListener('click',()=>window.__B46ClickProbe.push({phase:'target-after',value:button.dataset.rangeDays}));});
  const states=[];
  for(const days of [90,7,30,7,90,30,90,7,30]){
   await page.locator('#b46-adaptive-research-equity button[data-range-days="'+days+'"]').click();
   const status=await page.evaluate(d=>{
    const current=window.__B46NoFlickerQa,panel=document.querySelector('#b46-adaptive-native'),graph=document.querySelector('#b46-adaptive-research-equity');
    const b=graph.querySelector('button[data-range-days="'+d+'"]');
    return {samePanel:panel===current.panel,sameGraph:graph===current.graph,sameTable:panel.querySelector('table')===current.table,
      sameSvg:graph.querySelector('svg')===current.svg,samePolyline:graph.querySelector('polyline')===current.poly,sameSelector:graph.querySelector('select')===current.selector,
      pressed:b.getAttribute('aria-pressed'),caption:graph.querySelector('p.b46pm-stats-cutoff')?.textContent,
      aria:graph.querySelector('svg')?.getAttribute('aria-label'),
      tableRows:panel.querySelector('table')?.rows.length,removed:window.__B46NoFlickerObserver.removed.length,
      graphHeight:graph.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+3};
   },days);
   const hit=await page.evaluate(d=>{
    const button=document.querySelector('#b46-adaptive-research-equity button[data-range-days="'+d+'"]');
    const b=button.getBoundingClientRect(),at=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
    return {button:button.outerHTML,rect:{x:b.x,y:b.y,w:b.width,h:b.height},at:at?.outerHTML.slice(0,450),
      pointer:getComputedStyle(button).pointerEvents,disabled:button.disabled,buttonClicks:window.__B46ClickProbe};
   },days);
   console.log('B46_EQUITY_RANGE_STATUS '+JSON.stringify({name,days,status,pageErrors:errors,hit}));
   assert(status.samePanel&&status.sameGraph&&status.sameTable&&status.sameSvg&&status.samePolyline&&status.sameSelector,'DOM_REPLACED_'+name+'_'+days);
   assert(status.pressed==='true'&&status.aria.includes(days+' days'),'BAD_RANGE_'+name+'_'+days);
   assert(status.caption.includes(days+'D'),'CAPTION_NOT_UPDATED_'+name+'_'+days);
   assert(status.tableRows===baseline.tableRows&&status.removed===0,'PANEL_BLINKED_'+name+'_'+days);
   assert(status.graphHeight>=240&&!status.overflow,'GRAPH_LAYOUT_SHIFT_'+name+'_'+days);
   states.push({range:days,caption:status.caption,removed:status.removed});
  }
  await page.locator('#b46-adaptive-research-equity select').selectOption('A03');
  const afterFormula=await page.evaluate(()=>{
   const now=window.__B46NoFlickerQa,graph=document.querySelector('#b46-adaptive-research-equity');
   return {sameGraph:graph===now.graph,sameTable:document.querySelector('#b46-adaptive-native table')===now.table,
      sameSvg:graph.querySelector('svg')===now.svg,caption:graph.querySelector('p.b46pm-stats-cutoff')?.textContent,
      selected:graph.querySelector('select').value,removed:window.__B46NoFlickerObserver.removed.length};
  });
  assert(afterFormula.sameGraph&&afterFormula.sameTable&&afterFormula.sameSvg,'FORMULA_CHANGE_REBUILT_UI_'+name);
  assert.equal(afterFormula.selected,'A03','FORMULA_SELECTION_FAILED');
  assert.equal(afterFormula.removed,0,'FORMULA_CHANGE_BLINKED_'+name);
  assert.equal(errors.length,0,'BROWSER_SCRIPT_ERROR_'+name+'_'+errors.join('|'));
  await page.screenshot({path:out+'/'+name+'-7d-30d-90d-stable.png',fullPage:false});
  report.qa.push({name,success:true,baseline,states,afterFormula,pageErrors:errors});
  await ctx.close();
 }
 report.result='PASS';report.completed=new Date().toISOString();
 console.log('B46_ADAPTIVE_EQUITY_NO_FLICKER_BROWSER_QA_PASS '+JSON.stringify(report));
}catch(error){report.result='FAIL';report.error=String(error.stack||error);console.error(error.stack||error);process.exitCode=1;}
finally{writeFileSync(out+'/qa.json',JSON.stringify(report,null,2));await browser.close();}
