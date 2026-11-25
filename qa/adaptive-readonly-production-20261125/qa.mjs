import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin='https://ball46-adaptive-readonly-page-test-20261125.mccarey-supon.workers.dev';
const dat=await fetch(origin+'/research/adaptive-ou/data');
assert.equal(dat.status,200,'STAGE_SERVER_DATA_FAILED');
const data=await dat.json();
assert.equal(data.ok,true);
assert.equal(data.formulas?.length,42);
assert.equal(data.source,'ADAPTIVE_RESEARCH_TEST_READ_ONLY');
assert(!('records' in data)&&!('providerCalls' in data)&&!('eventJournal' in data),'UNSAFE_RESEARCH_DATA_EXPOSED');
assert(data.formulas.every(f=>/^A\d{2}$/.test(f.formula)));
const post=await fetch(origin+'/research/adaptive-ou/data',{method:'POST'});
assert.equal(post.status,405,'WRITE_METHOD_NOT_REJECTED');
const browser=await chromium.launch({headless:true});const results=[];
try{
 for(const [label,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const r=await page.goto(origin+'/research/adaptive-ou/',{waitUntil:'domcontentloaded',timeout:50000});
  assert(r?.ok());
  await page.waitForFunction(()=>document.querySelectorAll('#results tr').length===42,null,{timeout:30000});
  const first=await page.evaluate(()=>{
   const panel=document.querySelector('#equity-panel');
   const table=document.querySelector('#results'),svg=document.querySelector('#equity');
   const curve=document.querySelector('#curve');
   window.__b46ResearchQa={panel,table,svg,curve,formula:document.querySelector('#formula'),count:0};
   const observer=new MutationObserver(rows=>{
    for(const row of rows)for(const node of row.removedNodes){
      if(node===svg||node===table||node.contains?.(svg)||node.contains?.(table))window.__b46ResearchQa.count++;
    }
   });observer.observe(document.body,{subtree:true,childList:true});
   return {formulaCount:document.querySelector('#formula').options.length,tableRows:table.rows.length,viewport:innerWidth,width:document.documentElement.scrollWidth};
  });
  assert.equal(first.formulaCount,42);
  assert.equal(first.tableRows,42);
  assert(first.width<=first.viewport+3,'HORIZONTAL_OVERFLOW_'+label);
  const ranges=[];
  for(const days of [90,7,30,90,7,30,90,7,30]){
   await page.locator('[data-days="'+days+'"]').click();
   const state=await page.evaluate(n=>{
    const s=window.__b46ResearchQa;
    return {sameTable:s.table===document.querySelector('#results'),sameSvg:s.svg===document.querySelector('#equity'),
       sameLine:s.curve===document.querySelector('#curve'),sameSelect:s.formula===document.querySelector('#formula'),
       noTeardown:s.count===0,pressed:document.querySelector('[data-days="'+n+'"]').getAttribute('aria-pressed'),
       caption:document.querySelector('#detail').textContent,
       horizontalOverflow:document.documentElement.scrollWidth>innerWidth+3};
   },days);
   assert(state.sameTable&&state.sameSvg&&state.sameLine&&state.sameSelect&&state.noTeardown,'CHART_REBUILT_'+label+'_'+days);
   assert(state.pressed==='true'&&state.caption.includes(days+'D'),'PERIOD_NOT_CHANGED_'+label+'_'+days);
   assert(!state.horizontalOverflow,'LAYOUT_OVERFLOW_'+label);
   ranges.push({days,caption:state.caption});
  }
  await page.locator('#formula').selectOption('A03');
  assert((await page.locator('#detail').textContent()).includes('A03'));
  assert.equal(errors.length,0,'JS_ERROR_'+errors.join('|'));
  results.push({label,passed:true,ranges,errors});
  await ctx.close();
 }
}finally{await browser.close();}
console.log('B46_ADAPTIVE_READONLY_STAGE_QA_PASS '+JSON.stringify({url:origin+'/research/adaptive-ou/',results,formulaCount:42,noSecretLeak:true,noProductionWrites:true}));
