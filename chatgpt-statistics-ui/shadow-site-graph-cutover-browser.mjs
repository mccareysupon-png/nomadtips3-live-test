import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url)),{chromium}=require('playwright');
const options=[['all','all'],['ah','AH'],['1x2','1X2'],['ou','O/U'],['corners','Corners'],['btts','BTTS'],['cards','Cards'],['other','Other']];
const out=process.env.RUNNER_TEMP+'/b46-cutover-browser';
const money=v=>(v>=0?'+':'')+v.toFixed(2)+'U';
export async function browserQA(host,label,{full=true}={}){
 await mkdir(out,{recursive:true});
 const b=await chromium.launch({headless:true}),results=[];
 const context=async mobile=>b.newContext({viewport:{width:mobile?390:1366,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,timezoneId:'Asia/Bangkok',serviceWorkers:'block'});
 async function check(ctx,routeMarket,market,{mobile=false,variant='all',filter='all',range='all',details=false,controls=false}={}){
  const page=await ctx.newPage(),errors=[],history=[],graphs=[];
  let detailAllowed=false;
  page.on('pageerror',e=>errors.push(e.message.slice(0,180)));
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')history.push({afterDetail:detailAllowed,url:r.url()})});
  page.on('response',async r=>{if(new URL(r.url()).pathname==='/b46-receiver-v1/graph'&&r.status()===200)try{graphs.push({d:await r.json(),status:r.status()})}catch{}});
  try{
   const q=new URLSearchParams({view:'statistics',...(routeMarket==='all'?{}:{market:routeMarket}),...(variant==='all'?{}:{variant}),...(filter==='all'?{}:{filter})});
   const start=performance.now();const response=await page.goto(host+'/?'+q,{waitUntil:'domcontentloaded',timeout:60000});assert.equal(response?.status(),200);
   const waitGraph=async (m,v,f,r)=>page.waitForFunction(a=>{const c=document.querySelector('#b46-finance-chart-card');return c?.dataset.b46StatisticsSource==='receiver'&&c.dataset.b46Market===a[0]&&c.dataset.b46Variant===a[1]&&c.dataset.b46Filter===a[2]&&c.dataset.b46Range===a[3]&&!!c.querySelector('.f46-plot')?.getClientRects().length},[m,v,f,r],{timeout:25000});
   await waitGraph(market,variant,filter,range);
   const ms=Math.round(performance.now()-start);
   const read=()=>page.evaluate(()=>{const c=document.querySelector('#b46-finance-chart-card');return {source:c?.dataset.b46StatisticsSource,seq:Number(c?.dataset.b46Sequence),settled:Number(c?.dataset.b46Settled),net:Number(c?.dataset.b46Net),text:c?.querySelector('[data-f46-value]')?.textContent,plot:!!c?.querySelector('.f46-plot svg.f46-svg,.f46-plot .f46-empty')?.getClientRects().length,cards:document.querySelectorAll('#b46-finance-chart-card').length,overflow:document.documentElement.scrollWidth>innerWidth+2,visible:!!c?.getClientRects().length,range:c?.dataset.b46Range}});
   const state=await read();await page.waitForTimeout(200);
   const g=[...graphs].reverse().find(x=>x.d.market===market&&x.d.variant===variant&&x.d.filter===filter&&x.d.range===range&&x.d.sequence===state.seq)?.d;
   assert(g,'MISSING_BROWSER_GRAPH_RESPONSE');assert.equal(state.settled,g.summary.rows);assert(Math.abs(state.net-g.summary.net)<1e-7);assert(state.cards===1&&state.plot&&state.visible&&!state.overflow,'GRAPH_VISIBILITY_OR_LAYOUT');
   if(g.series.units.length)assert.equal(state.text,money(g.series.units.at(-1).value));
   assert.equal(history.filter(x=>!x.afterDetail).length,0,'EARLY_FULL_HISTORY_READ');
   if(controls){
    await page.locator('[data-b46-mode="roi"]').click();await page.waitForFunction(()=>document.querySelector('[data-b46-mode="roi"]')?.getAttribute('aria-pressed')==='true');await page.locator('[data-b46-mode="rate"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-b46-mode="rate"]')?.getAttribute('aria-pressed')==='true');
    for(const r of ['d7','d30','d90','all']){await page.locator('[data-b46-range="'+r+'"]').click();await waitGraph(market,variant,filter,r)}
    await page.locator('[data-b46-mode="units"]').click();
    assert.equal(history.filter(x=>!x.afterDetail).length,0,'CONTROL_TRIGGERED_HISTORY');
    if(market==='AH'){ const chip=page.locator('[data-sp-filter="home"]').first();await chip.click();await waitGraph('AH',variant,'home','all')}
   }
   if(details){detailAllowed=true;await page.locator('[data-b46-legacy-details]').click();await page.waitForFunction(()=>{const x=window.BALL46_STATISTICS_DATA?.getSnapshot?.();return x?.ok===true&&Array.isArray(x.ledgerRows)&&x.ledgerRows.length===x.ledgerTotal},null,{timeout:120000});assert(history.some(x=>x.afterDetail),'LEGACY_DETAIL_NOT_LOADED');await page.waitForFunction(()=>document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource==='receiver');}
   assert.equal(errors.length,0,'JS_ERRORS_'+JSON.stringify(errors));
   await page.screenshot({path:out+'/'+label+'-'+routeMarket+'-'+(mobile?'mobile':'pc')+'-'+variant+'-'+filter+'.png',fullPage:false});
   const result={label,market,mobile,variant,filter,settled:state.settled,net:state.net,ms,receiver:true,legacyHistoryBeforeDetails:0,legacyDetails:details,controls,jsErrors:errors.length};console.log('CUTOVER_BROWSER_CASE='+JSON.stringify(result));results.push(result);
  }catch(e){console.log('CUTOVER_BROWSER_DIAG='+JSON.stringify({market,mobile,variant,filter,errors,history:history.length,graphs:graphs.slice(-4).map(x=>({market:x.d.market,range:x.d.range,seq:x.d.sequence})),dom:await page.evaluate(()=>({view:document.body?.dataset.workspaceView,source:document.querySelector('#b46-finance-chart-card')?.dataset,diag:window.__B46_FAST_V1_DIAG,content:document.querySelector('.sp-stats-content')?.getBoundingClientRect().toJSON(),body:document.querySelector('#b46-finance-chart-card')?.textContent?.slice(0,280)})).catch(()=>null)}));throw e}finally{await page.close()}
 }
 try{
  for(const mobile of [false,true]){
   const ctx=await context(mobile);
   try{
    for(const [r,m] of full?options:options.slice(0,2))await check(ctx,r,m,{mobile,controls:m==='AH'&&!mobile,details:full&&m==='all'&&!mobile});
    if(full&&!mobile)await check(ctx,'ah','AH',{variant:'ft_ah',filter:'away'});
   }finally{await ctx.close()}
  }
  // Original live page still renders and does not request the new graph endpoint.
  const ctx=await context(false),p=await ctx.newPage(),calls=[];
  p.on('request',r=>{if(new URL(r.url()).pathname==='/b46-receiver-v1/graph')calls.push(r.url())});
  assert.equal((await p.goto(host+'/',{waitUntil:'domcontentloaded',timeout:60000}))?.status(),200);
  await p.waitForFunction(()=>document.body?.dataset.workspaceView==='live',null,{timeout:25000});await p.waitForTimeout(800);assert.equal(calls.length,0,'LIVE_GRAPH_LEAK');await ctx.close();
  if(full){
   const c=await context(false),p=await c.newPage();try{
    await p.route('**/b46-receiver-v1/graph?*',r=>r.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"BROWSER_QA_ONLY"}'}));
    await p.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
    await p.waitForFunction(()=>{const x=window.BALL46_STATISTICS_DATA?.getSnapshot?.();return x?.ok&&x.ledgerRows?.length===x.ledgerTotal&&document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource==='legacy'},null,{timeout:120000});
    console.log('CUTOVER_BROWSER_FALLBACK_PASS='+JSON.stringify({label,legacy:true,injectedBrowserOnly:true}));
   }finally{await c.close()}
  }
  console.log('CUTOVER_BROWSER_PASS='+JSON.stringify({label,cases:results.length,full,pc:true,mobile:true,liveUnchanged:true}));return results;
 }finally{await b.close()}
}
