import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {sidebarWinRates,validSidebar,SIDEBAR_MARKETS,optionalSidebar} from './sidebar-winrate-v1.mjs';
import {patchProjection,patchProxy,patchBrowserChart,patchWorkspace} from './sidebar-winrate-v1-patch.mjs';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url)),{chromium}=require('playwright');
const host='https://www.ball46.com',graphPath='/b46-receiver-v1/graph',out=process.env.RUNNER_TEMP+'/sidebar-winrate-qa';
await mkdir(out,{recursive:true});
const ua='Mozilla/5.0 B46-SidebarQA';
async function get(path){const t=performance.now(),r=await fetch(host+path,{headers:{'user-agent':ua,'cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,path);const raw=await r.text();return {raw,ms:Math.round(performance.now()-t)}}
const query=m=>new URLSearchParams({market:m,variant:'all',filter:'all',range:'all'});
let graphs,seq,gen;
for(let attempt=0;attempt<4;attempt++){
 const responses=await Promise.all(SIDEBAR_MARKETS.map(async m=>[m,JSON.parse((await get(graphPath+'?'+query(m))).raw)]));
 graphs=Object.fromEntries(responses);seq=graphs.all.sequence;gen=graphs.all.generation;
 if(responses.every(([m,g])=>g.source==='RECEIVER'&&g.market===m&&g.sequence===seq&&g.generation===gen))break;
 graphs=null;
}
assert(graphs,'COHERENT_PRODUCTION_READ_UNAVAILABLE');
const real=sidebarWinRates(graphs);assert(validSidebar(real));const expected=Object.fromEntries(SIDEBAR_MARKETS.map(m=>[m,real[m].rate===null?'—':real[m].rate.toFixed(2)+'%']));
console.log('SIDEBAR_STAGE_SOURCE='+JSON.stringify({sequence:seq,settled:real.all.settled,rates:expected,readOnly:true}));
const fixture=structuredClone(graphs);
const old=fixture.AH.counts;old.HALF_WIN+=4;fixture.AH.summary.rows+=4;fixture.all.counts.HALF_WIN+=4;fixture.all.summary.rows+=4;
const nextRates=sidebarWinRates(fixture);assert(nextRates.AH.rate>real.AH.rate);assert(nextRates.all.rate>real.all.rate);
const zero=Object.fromEntries(SIDEBAR_MARKETS.map(m=>[m,{counts:{WIN:0,LOSS:0,HALF_WIN:0,HALF_LOSS:0,PUSH:0},summary:{rows:0}}]));
zero.AH.counts.PUSH=zero.all.counts.PUSH=2;zero.AH.summary.rows=zero.all.summary.rows=2;assert.equal(sidebarWinRates(zero).AH.rate,null);
zero.AH.counts.HALF_WIN=zero.all.counts.HALF_WIN=1;zero.AH.counts.HALF_LOSS=zero.all.counts.HALF_LOSS=1;zero.AH.summary.rows=zero.all.summary.rows=4;assert.equal(sidebarWinRates(zero).AH.rate,50);
zero.AH.counts.WIN=1;assert.equal(optionalSidebar(zero),null);assert.equal(validSidebar({...real,AH:{rate:101,settled:real.AH.settled}}),false);
const proj=patchProjection(await readFile(new URL('./shadow-receiver-projection-v1.mjs',import.meta.url),'utf8')),proxy=patchProxy(await readFile(new URL('./shadow-site-graph-cutover.mjs',import.meta.url),'utf8'));
const localProj=new URL('./.sidebar-projection-stage.mjs',import.meta.url),localProxy=new URL('./.sidebar-proxy-stage.mjs',import.meta.url);
await writeFile(localProj,proj);await writeFile(localProxy,proxy);
const {projectionHandle}=await import(localProj.href),{receiverGraph}=await import(localProxy.href);
await unlink(localProj);await unlink(localProxy);
const sourceMap=Object.fromEntries(SIDEBAR_MARKETS.map(m=>[m,{...graphs[m],win_rate:real[m].rate??0}]));
const all=sourceMap.all,c=all.counts,book={...c,total:all.summary.rows,total_pnl:all.summary.net,winRate:real.all.rate??0,corrections:seq-all.summary.rows,pnl_schema:1};
const state={status:'loaded',sequence:seq,generation:gen,lastError:null},reads=[];
const map=new Map([['projection:v2:state',state],['projection:v2:graphs',sourceMap],['composite:state',book]]);
const store={get:async k=>{reads.push(k);assert(map.has(k),'UNEXPECTED_STORAGE_READ '+k);return structuredClone(map.get(k))},transaction:async fn=>fn(store),list:async()=>{throw Error('HISTORY_SCAN')},put:async()=>{throw Error('PRODUCTION_WRITE')}};
let services=0;
const env={B46_MARKET_READER:{fetch:r=>{services++;return projectionHandle(store,{},r)}}};
const t=performance.now();const response=await receiverGraph(new Request(host+graphPath+'?'+query('all')),env);const ms=performance.now()-t;
assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data.sidebarWinRates,real);
assert.deepEqual(data.summary,graphs.all.summary);assert.deepEqual(data.series,graphs.all.series);assert.equal(services,1);
const bytes=Buffer.byteLength(JSON.stringify({sidebarWinRates:real}));assert(bytes<1024,'SIDEBAR_PAYLOAD');
assert(reads.every(k=>['projection:v2:state','projection:v2:graphs','composite:state'].includes(k)));
console.log('SIDEBAR_STAGE_UNIT='+JSON.stringify({readKeys:[...new Set(reads)],serviceCalls:services,addedBytes:bytes,localMs:Math.round(ms*100)/100,halfWins:true,halfLosses:true,pushExcluded:true,zeroDenominator:true,marketInvariant:true,newSettlement:true,noWrites:true}));
const chartPath='/longterm-performance-343.js',workspacePath='/singlepage-workspace-343.js';
const chart=patchBrowserChart((await get(chartPath)).raw),work=patchWorkspace((await get(workspacePath)).raw);
new Function(chart);new Function(work.source);
console.log('SIDEBAR_STAGE_NATIVE_ANCHOR='+JSON.stringify({selector:work.countSelector,previousRenderer:work.old}));
const browser=await chromium.launch({headless:true});
const aliases={all:'all',ah:'AH','1x2':'1X2',ou:'O/U',btts:'BTTS',corners:'Corners',cards:'Cards',other:'Other'};
const hasRate=page=>page.evaluate(({selector,aliases})=>Object.fromEntries([...document.querySelectorAll('[data-stat-market]')].filter(b=>aliases[b.dataset.statMarket]&&b.querySelector(selector)).map(b=>[aliases[b.dataset.statMarket],b.querySelector(selector).textContent.trim()])),{selector:work.countSelector,aliases});
const results=[];
try{
 for(const mobile of [false,true]){
  const ctx=await browser.newContext({viewport:{width:mobile?390:1366,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,timezoneId:'Asia/Bangkok',serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[],history=[],calls=[];let detailAllowed=false,simulate=false;
  page.on('pageerror',e=>errors.push(e.message.slice(0,160)));
  page.on('request',r=>{const p=new URL(r.url()).pathname;if(p==='/api/engine/statistics')history.push({detailAllowed});if(p===graphPath)calls.push(r.url())});
  await ctx.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(!['GET','HEAD'].includes(req.method()))return route.abort();
   if(u.origin!==host)return route.continue();
   if(u.pathname===chartPath)return route.fulfill({status:200,contentType:'application/javascript',body:chart});
   if(u.pathname===workspacePath)return route.fulfill({status:200,contentType:'application/javascript',body:work.source});
   if(u.pathname===graphPath){
    const res=await route.fetch();if(res.status()!==200)return route.fulfill({response:res});
    const d=await res.json();if(simulate){d.sidebarWinRates=nextRates;d.sequence=Math.max(d.sequence,seq)+1}else{d.sidebarWinRates=real}
    return route.fulfill({response:res,json:d});
   }
   return route.continue();
  });
  const first=performance.now();
  assert.equal((await page.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000}))?.status(),200);
  await page.waitForFunction(()=>document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource==='receiver'&&!!document.querySelector('[data-b46-win-rate]'),null,{timeout:25000});
  const firstMs=Math.round(performance.now()-first);
  const actual=await hasRate(page);assert.deepEqual(actual,expected,'SIDEBAR_VALUES');
  assert.equal(history.length,0,'EARLY_HISTORY');
  const original=await page.evaluate(()=>({net:document.querySelector('#b46-finance-chart-card')?.dataset.b46Net,view:document.body.dataset.workspaceView,overflow:document.documentElement.scrollWidth>innerWidth+2}));
  assert.equal(original.view,'statistics');assert(!original.overflow);
  await page.screenshot({path:out+'/'+(mobile?'mobile':'desktop')+'.png'});
  if(!mobile){
   // Test actual UI market navigation and graph filters. Sidebar remains lifetime/all-market.
   for(const [routeMarket,m] of [['ah','AH'],['corners','Corners'],['1x2','1X2']]){
    await page.locator('[data-stat-market="'+routeMarket+'"]').first().click();
    await page.waitForFunction(m=>{const c=document.querySelector('#b46-finance-chart-card');return c?.dataset.b46StatisticsSource==='receiver'&&c.dataset.b46Market===m},m,{timeout:20000});
    assert.deepEqual(await hasRate(page),expected);assert.equal(history.length,0);
   }
   await page.locator('[data-b46-range="d7"]').click();await page.waitForFunction(()=>document.querySelector('#b46-finance-chart-card')?.dataset.b46Range==='d7');assert.deepEqual(await hasRate(page),expected);
   await page.locator('[data-b46-mode="rate"]').click();assert.deepEqual(await hasRate(page),expected);
   // Local-only simulated settlement and an older response rejected.
   simulate=true;
   await page.locator('[data-stat-market="ah"]').first().click();
   await page.waitForFunction(({selector,value})=>document.querySelector('[data-stat-market="ah"] '+selector)?.textContent===value,{selector:work.countSelector,value:nextRates.AH.rate.toFixed(2)+'%'},{timeout:20000});
   const expectedNext=Object.fromEntries(SIDEBAR_MARKETS.map(m=>[m,nextRates[m].rate===null?'—':nextRates[m].rate.toFixed(2)+'%']));
   assert.deepEqual(await hasRate(page),expectedNext);
   await page.evaluate(({real,seq})=>window.__B46_SIDEBAR_WINRATES(real,seq),{real,seq});assert.deepEqual(await hasRate(page),expectedNext);
   simulate=false;
  }
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(history.length,0);
  const row={mobile,firstMs,markets:8,graphRequests:calls.length,additionalSidebarRequests:0,historyRequests:history.length,jsErrors:errors.length};results.push(row);console.log('SIDEBAR_STAGE_BROWSER='+JSON.stringify(row));await ctx.close();
 }
 // Home page stays untouched; sidebar is a placeholder until stats graph arrives.
 console.log('SIDEBAR_STAGE_PASS='+JSON.stringify({cases:results,addedBytes:bytes,sourceSequence:seq,productionDeploy:false,mode:'ISOLATED_BROWSER_AND_LOCAL_RECEIVER'}));
}finally{await browser.close()}
