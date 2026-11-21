import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const BASE='https://ball46-sidebar-winrate-test-20261121.mccarey-supon.workers.dev';
let health=null;
for(let i=0;i<16;i++){
 try{const r=await fetch(BASE+'/__sidebar_health',{signal:AbortSignal.timeout(8000)});if(r.ok){const j=await r.json();if(j.revision==='SIDEBAR_WINRATE_BOOTSTRAP_20261121_V1'){health=j;break}}}catch{}
 await new Promise(r=>setTimeout(r,1600));
}
assert(health?.ok&&health.scriptSize>2000,'TEST_WORKER_NOT_READY');
const browser=await chromium.launch();
const expectedKeys=['all','1x2','ah','ou','btts','corners','cards','other'];
async function capture(page){
 return page.evaluate(()=>{
  const state=window.__B46_SIDEBAR_HYDRATE;
  const nodes=[...document.querySelectorAll('[data-b46-rate-snapshot]')];
  const values=Object.fromEntries(nodes.map(e=>[e.dataset.b46RateSnapshot,{text:e.textContent.trim(),sequence:Number(e.dataset.b46MonitorSequence),live:e.dataset.b46MonitorLive==='1',title:e.title}]));
  let cache=null;try{cache=JSON.parse(sessionStorage.getItem('b46:receiver-sidebar-rates:v1')||'null')}catch{}
  return {state:{...state},values,cached:cache?.snapshot||null,view:document.body?.dataset?.workspaceView};
 });
}
async function oneCase(mode){
 const context=await browser.newContext({viewport:{width:mode.mobile?390:1440,height:mode.mobile?844:920},serviceWorkers:'block'});
 const page=await context.newPage(),graph=[],history=[],errors=[],graphResponses=[];
 if(mode.theme)await page.addInitScript(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),mode.theme);
 page.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/b46-receiver-v1/graph')graph.push(u.pathname+u.search);if(u.pathname==='/api/engine/statistics')history.push(u.pathname)});
 page.on('pageerror',e=>errors.push(e.message.slice(0,300)));
 page.on('response',r=>{try{if(new URL(r.url()).pathname==='/b46-receiver-v1/graph')graphResponses.push({status:r.status(),headers:{'x-b46-monitor-rates':r.headers()['x-b46-monitor-rates']?.slice(0,200)||null,'content-type':r.headers()['content-type']||null}})}catch{}});
 const res=await page.goto(BASE+'/index.html?sidebarFresh='+mode.label,{waitUntil:'domcontentloaded',timeout:65000});
 assert.equal(res.status(),200,'INDEX_NOT_200_'+mode.label);
 await page.waitForFunction(()=>window.__B46_SIDEBAR_HYDRATE?.initialized===true,{timeout:10000});
 await page.waitForTimeout(2700);
 const beforeClick=await capture(page);
 console.log('SIDEBAR_HYDRATION_EARLY_DIAG',JSON.stringify({label:mode.label,state:beforeClick.state,all:beforeClick.values.all,graph,graphResponses,errors}));
 if(!beforeClick.values.all?.live){
  const probe=await page.evaluate(async()=>{try{const r=await fetch('/b46-receiver-v1/graph?market=all&variant=all&filter=all&range=all');return {status:r.status,header:r.headers.get('x-b46-monitor-rates')?.slice(0,350)||null,contentType:r.headers.get('content-type')}}catch(e){return {error:String(e)}}});
  console.log('SIDEBAR_GRAPH_DIRECT_DIAG',JSON.stringify({label:mode.label,probe}));
 }
 await page.waitForFunction(()=>document.querySelector('[data-b46-rate-snapshot="all"]')?.dataset.b46MonitorLive==='1',null,{timeout:6000});
 const populated=await capture(page);
 assert(populated.cached?.rates&&populated.cached.sequence>=0,'RECEIVER_HEADER_NOT_CACHED_'+mode.label);
 for(const k of expectedKeys){
  assert(populated.values[k],'SIDEBAR_MARKET_MISSING_'+k);
  const v=populated.cached.rates[k];
  const expected=v===null?'—':v.toFixed(2)+'%';
  assert.equal(populated.values[k].text,expected,'MARKET_RATE_MISMATCH_'+mode.label+'_'+k);
 }
 assert(populated.state.requests<=1,'DUPLICATE_BOOTSTRAP_'+mode.label);
 assert(graph.length<=1,'TOO_MANY_GRAPH_REQUESTS_'+mode.label);
 assert.equal(history.length,0,'OPENING_LIVE_FETCHED_HISTORIC_LEDGER_'+mode.label);
 console.log('SIDEBAR_INITIAL_PASS',JSON.stringify({label:mode.label,graph:graph.length,history:history.length,state:populated.state,values:populated.values}));
 await page.reload({waitUntil:'domcontentloaded',timeout:65000});
 await page.waitForFunction(()=>window.__B46_SIDEBAR_HYDRATE?.initialized===true,{timeout:8000});
 const cached=await capture(page);
 assert(cached.state.source==='session'||cached.state.source==='receiver','RELOAD_NOT_CACHE_SEEDED');
 for(const k of ['all','1x2','ah','ou','corners'])assert(cached.values[k]?.live,'RELOAD_NOT_IMMEDIATELY_READY_'+k);
 assert.equal(cached.state.requests,0,'CACHE_RELOAD_ISSUED_EXTRA_GRAPH_GET');
 console.log('SIDEBAR_RELOAD_CACHE_PASS',JSON.stringify({label:mode.label,state:cached.state,all:cached.values.all}));
 await page.goto(BASE+'/index.html?view=statistics&market=1x2',{waitUntil:'domcontentloaded',timeout:65000});
 await page.waitForFunction(()=>document.querySelector('[data-b46-rate-snapshot="all"]')?.dataset.b46MonitorLive==='1',{timeout:8000});
 const stats=await capture(page);
 assert(stats.values.all.text!=='—','STATISTICS_MENU_RATE_LOST_'+mode.label);
 console.log('SIDEBAR_STATISTICS_NAV_PASS',JSON.stringify({label:mode.label,view:stats.view,all:stats.values.all,oneXtwo:stats.values['1x2'],bootRequests:stats.state.requests}));
 assert.equal(errors.length,0,'PAGE_ERRORS_'+mode.label+':'+JSON.stringify(errors));
 await page.screenshot({path:'sidebar-audit/'+mode.label+'.png'});
 await context.close();
}
try{
 for(const mode of [{label:'desktop-dark',mobile:false,theme:'dark'},{label:'mobile-dark',mobile:true,theme:'dark'},{label:'desktop-light',mobile:false,theme:'light'}])await oneCase(mode);
 const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 const pg=await ctx.newPage();
 await pg.route('**/b46-receiver-v1/graph**',route=>route.abort('failed'));
 await pg.goto(BASE+'/index.html?sidebarFailureCase=1',{waitUntil:'domcontentloaded',timeout:65000});
 await pg.waitForFunction(()=>window.__B46_SIDEBAR_HYDRATE?.initialized===true,{timeout:8000});
 await pg.waitForTimeout(1200);
 const failed=await capture(pg);
 assert.equal(failed.state.lastSequence,null,'FAIL_CLOSED_RECEIVER_FAILURE_EXPECTED');
 assert.equal(failed.values.all.text,'—','FALSE_RATE_SHOWN_WITHOUT_SNAPSHOT');
 console.log('SIDEBAR_FAILURE_FAIL_CLOSED_PASS',JSON.stringify({state:failed.state,all:failed.values.all}));
 await ctx.close();
 console.log('BALL46_SIDEBAR_WINRATE_TEST_SUCCESS');
}finally{await browser.close()}
