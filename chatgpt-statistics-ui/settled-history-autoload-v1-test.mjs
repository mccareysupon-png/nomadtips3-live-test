import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {patchHistoryAutoload,patchHistoryWorkspace} from './settled-history-autoload-v1.mjs';
const {chromium}=createRequire(new URL('./.runtime/package.json',import.meta.url))('playwright');
const host='https://www.ball46.com',chart='/longterm-performance-343.js',out=process.env.RUNNER_TEMP+'/settled-history-stage';
await mkdir(out,{recursive:true});
const r=await fetch(host+chart,{headers:{'user-agent':'Mozilla/5.0 B46-HistoryStage','cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});
assert.equal(r.status,200);const code=patchHistoryAutoload(await r.text());new Function(code);
const workspace='/singlepage-workspace-343.js',wr=await fetch(host+workspace,{headers:{'user-agent':'Mozilla/5.0 B46-HistoryStage','cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});assert.equal(wr.status,200);const workspaceCode=patchHistoryWorkspace(await wr.text());new Function(workspaceCode);
const b=await chromium.launch({headless:true});
try{
 for(const mobile of [false,true]){
  const ctx=await b.newContext({viewport:{width:mobile?390:1612,height:mobile?844:856},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const p=await ctx.newPage(),errors=[],history=[],graph=[];let applied=0;
  p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/engine/statistics')history.push({url:u.pathname+u.search,at:Date.now()});if(u.pathname==='/b46-receiver-v1/graph')graph.push({url:u.search,at:Date.now()})});
  await p.addInitScript(()=>{
   window.__historyStageFetch=[];const original=window.fetch;
   window.fetch=function(input,...rest){let url;try{url=new URL(typeof input==='string'?input:input.url,location.href)}catch{}if(url?.pathname==='/api/engine/statistics')window.__historyStageFetch.push({source:document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource,graphVisible:!!document.querySelector('#b46-finance-chart-card .f46-plot')?.getClientRects().length,requested:!!window.__B46_FAST_DETAILS_REQUESTED});return original.call(this,input,...rest)};
  });
  await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(!['GET','HEAD'].includes(req.method()))return route.abort();if(['ball46.com','www.ball46.com'].includes(u.hostname)&&[chart,workspace].includes(u.pathname)){applied++;return route.fulfill({status:200,contentType:'application/javascript',body:u.pathname===chart?code:workspaceCode})}return route.continue()});
  const started=Date.now();
  try{
   assert.equal((await p.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000}))?.status(),200);
   await p.waitForFunction(()=>document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource==='receiver'&&document.querySelector('[data-b46-win-rate]'),null,{timeout:30000});
   const graphMs=Date.now()-started;
   assert(applied>=2);
   // No click: restore existing native table and require verified complete native snapshot.
   await p.waitForFunction(()=>{const d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();return d?.ok&&Array.isArray(d.ledgerRows)&&d.ledgerRows.length===d.ledgerTotal&&d.ledgerRows.length>0},null,{timeout:120000});
   await p.waitForFunction(()=>{const tables=[...document.querySelectorAll('.sp-stats-content table,table')];return tables.some(t=>[...t.querySelectorAll('tbody tr')].some(row=>row.cells.length>=4&&row.textContent.trim()&&!/Waiting for settled results/i.test(row.textContent)))},null,{timeout:30000});
   const report=await p.evaluate(()=>{
    const c=document.querySelector('#b46-finance-chart-card'),d=window.BALL46_STATISTICS_DATA.getSnapshot();
    const tables=[...document.querySelectorAll('.sp-stats-content table,table')].map(t=>({rows:[...t.querySelectorAll('tbody tr')].filter(x=>x.cells.length>=4).map(x=>x.textContent.trim().slice(0,250)),visible:!!t.getClientRects().length}));
    return {source:c?.dataset.b46StatisticsSource,settled:Number(c?.dataset.b46Settled),historyTotal:d.ledgerRows.length,pending:d.pending,firstFetch:window.__historyStageFetch[0],fetches:window.__historyStageFetch.length,sidebar:[...document.querySelectorAll('[data-stat-market] b')].map(e=>({text:e.textContent,font:parseFloat(getComputedStyle(e).fontSize),after:getComputedStyle(e,'::after').content})),tables};
   });
   assert.equal(report.source,'receiver');assert(report.firstFetch?.source==='receiver'&&report.firstFetch.graphVisible&&report.firstFetch.requested,'HISTORY_BEFORE_GRAPH');
   const mobileCards=mobile?await p.getByText(/^\+?\s*Match details$/i).evaluateAll(els=>els.filter(e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden').length):0;
   assert(mobile?mobileCards>0:report.tables.some(t=>t.visible&&t.rows.length>0),'NO_VISIBLE_HISTORY');assert(report.sidebar.length===8&&report.sidebar.every(x=>x.font>0&&x.after==='none'&&(x.text==='—'||/%$/.test(x.text))),'SIDEBAR_REGRESSION');
   assert.equal(errors.length,0,JSON.stringify(errors));assert(history.length>0);
   await p.screenshot({path:out+'/'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
   console.log('HISTORY_AUTOLOAD_STAGE_PASS='+JSON.stringify({mobile,graphMs,historyMs:Date.now()-started,settled:report.settled,historyTotal:report.historyTotal,pending:report.pending,firstFetch:report.firstFetch,historyRequests:history.length,visibleRows:report.tables.filter(t=>t.visible).map(t=>t.rows.length),mobileCards,example:report.tables.find(t=>t.visible&&t.rows.length)?.rows[0],sidebar:report.sidebar,jsErrors:errors.length,productionDeploy:false}));
  }catch(e){console.log('HISTORY_AUTOLOAD_DIAG='+JSON.stringify({mobile,error:String(e.message).slice(0,250),history:history.length,graph:graph.length,errors,state:await p.evaluate(()=>({view:document.body?.dataset.workspaceView,requested:window.__B46_FAST_DETAILS_REQUESTED,firstFetch:window.__historyStageFetch?.[0],snapshot:window.BALL46_STATISTICS_DATA?.getSnapshot?.()?.ledgerTotal,table:[...document.querySelectorAll('table')].map(t=>({rows:t.rows.length,text:t.textContent.slice(0,230)})),body:document.body.innerText.slice(-1200)})).catch(()=>null)}));await p.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e}
  finally{await ctx.close()}
 }
 // No auto history on live homepage.
 const ctx=await b.newContext({serviceWorkers:'block'}),p=await ctx.newPage(),calls=[];
 p.on('request',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')calls.push(r.url())});
 await ctx.route('**/longterm-performance-343.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:code}));await ctx.route('**/singlepage-workspace-343.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:workspaceCode}));
 await p.goto(host+'/',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>document.body?.dataset.workspaceView==='live');await p.waitForTimeout(1000);
 assert.equal(calls.length,0,'LIVE_HISTORY_LEAK');await ctx.close();
 console.log('HISTORY_AUTOLOAD_STAGE_COMPLETE='+JSON.stringify({pc:true,mobile:true,liveUnchanged:true,productionDeploy:false}));
}finally{await b.close()}
