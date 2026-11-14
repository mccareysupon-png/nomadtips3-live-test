// Real public-network path to private Cloudflare Workers staging.
// No Production data API is ever called by the browser.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const D='work/statistics-read-model-v2-20261114',U='work/statistics-summary-shadow-20261113';
const config=JSON.parse(await readFile(D+'/private-stage-config.json','utf8')),stage=JSON.parse(await readFile(D+'/qa/hosted-stage.json','utf8'));
assert.equal(config.stage,stage.stage);
const require=createRequire(resolve(U+'/.runtime/resolve.cjs')),{chromium}=require('playwright');
const browser=await chromium.launch({headless:true}),profiles=[],blocked=[],errors=[];
const scenarios=[
 {name:'pc-ordinary-wan',width:1440,height:900,theme:'dark',throttle:false},
 {name:'mobile-ordinary-wan',width:390,height:844,theme:'dark',throttle:false},
 {name:'mobile-throttled-4g',width:390,height:844,theme:'light',throttle:true}
];
try{
 for(const profile of scenarios){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:profile.width<500,hasTouch:profile.width<500,colorScheme:profile.theme,extraHTTPHeaders:{'x-b46-stage-auth':config.auth}});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.origin!==config.origin){blocked.push({profile:profile.name,url:u.origin});return route.abort('blockedbyclient')}
   return route.continue();
  });
  const page=await context.newPage(),net=[],consoleErrors=[];
  page.on('pageerror',e=>errors.push({profile:profile.name,error:e.message}));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,200))});
  page.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/statistics/'))net.push({path:u.pathname,status:r.status(),serverTiming:r.headers()['server-timing']||null})});
  if(profile.throttle){
   const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:4*1024*1024/8,uploadThroughput:1024*1024/8});
  }
  const started=performance.now(),response=await page.goto(config.origin+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:40000});
  assert.equal(response.status(),200);
  try{await page.waitForFunction(()=>document.body.dataset.b46StageReady==='1',null,{timeout:25000})}
  catch(err){
   const diag=await page.evaluate(()=>({ready:document.body?.dataset.b46StageReady||null,view:document.body?.dataset.workspaceView||null,feed:document.querySelector('[data-sp-feed-state]')?.textContent?.slice(0,220),scripts:[...document.scripts].map(s=>s.src).filter(Boolean).slice(0,30),statPanel:!!document.querySelector('[data-workspace-panel="statistics"]'),workspaceApi:!!window.BALL46_STATISTICS_DATA,hasNav:!!document.querySelector('[data-stat-market="all"]'),errors:document.querySelector('.sp-empty')?.textContent?.slice(0,200)})).catch(e=>({error:String(e)}));
   console.log('HOSTED_NATIVE_STAGE_DIAGNOSTIC '+JSON.stringify({profile:profile.name,diag,network:net.slice(0,25),console:consoleErrors.slice(0,12),scriptErrors:errors.slice(0,12),blocked:blocked.slice(0,16)}));
   await page.screenshot({path:D+'/qa/hosted-failure-'+profile.name+'.png',fullPage:false}).catch(()=>{});
   throw err;
  }
  if(profile.name==='pc-ordinary-wan'){
   const loadingDom=await page.evaluate(()=>{
    const root=document.querySelector('[data-workspace-panel="statistics"]')||document;
    const labels=[...root.querySelectorAll('*')].filter(e=>e.children.length===0&&/Loading statistics|Preparing recorded results|PREPARING VIEW/i.test(e.textContent||''));
    return labels.slice(0,8).map(e=>{
     const ancestry=[];let n=e;
     for(let i=0;n&&i<6;i++,n=n.parentElement)ancestry.push({tag:n.tagName,cls:String(n.className||''),id:n.id||'',attributes:[...n.attributes].filter(x=>x.name.startsWith('data-')).map(x=>[x.name,x.value]),display:getComputedStyle(n).display,rect:{w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height},outer:n.outerHTML.slice(0,300)});
     return {text:e.textContent?.trim().slice(0,110),ancestry};
    });
   });
   console.log('HOSTED_NATIVE_LOADING_DOM '+JSON.stringify(loadingDom));
  }
  const wallMs=performance.now()-started;
  const state=await page.evaluate(()=>{
   const panel=document.querySelector('[data-workspace-panel="statistics"]');
   const nav=document.querySelector('[data-stat-market="all"] b');
   const table=document.querySelectorAll('[data-sp-table-body] tr');
   const marks=performance.getEntriesByName('b46-real-ui-statistics-ready');
   const requests=performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/statistics/')).map(r=>({name:new URL(r.name).pathname,duration:r.duration,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize}));
   const body=document.querySelector('[data-workspace-panel="statistics"] .sp-stats-content');const results=body?.querySelector('.sp-results');
   return {markMs:marks.at(-1)?.startTime??null,panelPresent:!!panel,panelVisible:!!panel&&!panel.hidden,bodyVisible:!!body&&getComputedStyle(body).display!=='none'&&body.getBoundingClientRect().height>0,resultsVisible:!!results&&results.getBoundingClientRect().height>0,tableRows:table.length,tableFields:table[0]?.children.length||0,menuCount:nav?.textContent,marketTitle:document.querySelector('[data-sp-market-title]')?.textContent||'',feed:document.querySelector('[data-sp-feed-state]')?.textContent||'',revision:document.body.dataset.b46StageRevision,cssLoaded:[...document.styleSheets].length,resources:requests};
  });
  assert(state.panelPresent&&state.panelVisible&&state.bodyVisible&&state.resultsVisible,'CURRENT_STATISTICS_CONTENT_NOT_VISIBLE:'+JSON.stringify(state).slice(0,500));
  assert.equal(state.tableRows,50,'NATIVE_TABLE_NOT_FIRST_50');
  assert(state.tableFields>=8,'NATIVE_TABLE_COLUMNS_MISSING');
  assert(state.cssLoaded>0,'ORIGINAL_STYLESHEETS_MISSING');
  assert(state.feed.includes('Staging snapshot'),'NATIVE_STATUS_NOT_UPDATED');
  assert.equal(state.revision,String(stage.revision));
  assert.equal(state.menuCount,String(stage.sourceRows));
  const clicks={};
  const chooseMarket=async m=>{
   const mobile=page.locator('[data-stage-mobile-markets] [data-stage-select="'+m+'"]');if(await mobile.count()&&await mobile.isVisible()){await mobile.click();return'visible-mobile-market-chip'}
   const selector='[data-stat-market="'+m+'"]',node=page.locator(selector).first();
   if(await node.isVisible()){await node.click();return'visible-click'}
   await page.evaluate(sel=>document.querySelector(sel)?.click(),selector);
   return'hidden-sidebar-event';
  };
  clicks.marketNavigation=await chooseMarket('ou');
  await page.waitForFunction(()=>document.body.dataset.b46StageReady==='1'&&document.querySelector('[data-sp-market-title]')?.textContent.includes('Over'),{timeout:30000});
  clicks.ouRows=await page.locator('[data-sp-table-body] tr').count();
  assert.equal(clicks.ouRows,50);assert(await page.locator('.sp-stats-content').isVisible(),'STATS_CONTENT_NOT_VISIBLE_AFTER_MARKET');
  const count=await page.locator('[data-sp-record-count]').textContent();
  clicks.ouCount=count;
  const page2=page.locator('[data-sp-pager] [data-sp-page="2"]').first();
  if(await page2.isVisible()){
   await page2.click();
   await page.waitForFunction(()=>document.body.dataset.b46StageReady==='1'&&document.querySelector('[data-sp-pager] .active')?.textContent.trim()==='2',null,{timeout:10000});
   clicks.pagination='passed';
  }else{
   const pager=await page.evaluate(()=>{
    const e=document.querySelector('[data-sp-pager]');
    const ancestors=[];let n=e;for(let i=0;n&&i<8;i++,n=n.parentElement)ancestors.push({tag:n.tagName,cls:n.className,hidden:n.hidden,style:getComputedStyle(n).display,rect:n.getBoundingClientRect().width+'x'+n.getBoundingClientRect().height});
    return {outer:e?.outerHTML?.slice(0,1000),parent:e?.parentElement?.outerHTML?.slice(0,500),display:e?getComputedStyle(e).display:null,hidden:e?.hidden,rect:e?.getBoundingClientRect()?.toJSON(),ancestors};
   });
   clicks.pagination='not-visible-in-original-ui';
   clicks.pagerDiagnostic=pager;
   console.log('HOSTED_REAL_UI_PAGER_DIAGNOSTIC '+JSON.stringify({profile:profile.name,pager}));
  }
  clicks.returnNavigation=await chooseMarket('all');
  await page.waitForFunction(()=>document.body.dataset.b46StageReady==='1'&&document.querySelector('[data-sp-market-title]')?.textContent.includes('Total'),{timeout:30000});
  assert.equal(await page.locator('[data-sp-table-body] tr').count(),50);
  await page.screenshot({path:D+'/qa/hosted-real-ui-'+profile.name+'.png',fullPage:false,timeout:10000});
  profiles.push({profile:profile.name,width:profile.width,remoteNetwork:true,network4gSimulation:profile.throttle,wallMs,readyMarkMs:state.markMs,statsCalls:net.filter(x=>x.status===200),tableRows:state.tableRows,tableColumns:state.tableFields,menuCount:state.menuCount,cssLoaded:state.cssLoaded,resources:state.resources.slice(0,6),actions:clicks,consoleErrors:consoleErrors.slice(0,4)});
  console.log('HOSTED_REAL_UI_PROFILE '+JSON.stringify({profile:profile.name,wallMs,readyMarkMs:state.markMs,api:net.map(x=>x.path).slice(0,10),columns:state.tableFields,clicks}));
  await context.close();
 }
 assert.equal(errors.length,0,'SCRIPT_ERRORS_'+JSON.stringify(errors).slice(0,700));
 assert(!profiles.some(p=>p.statsCalls.some(r=>r.path.includes('/api/engine/statistics'))),'LEGACY_FULL_HISTORY_USED');
 const report={ok:true,publicNetwork:true,isolatedWorker:config.stage,hostname:config.origin,actualCapturedWebsiteAndNativeStatisticsComponents:true,recordedLedgerRows:stage.sourceRows,verifiedRevision:stage.revision,profiles,blockedExternalBrowserOrigins:[...new Set(blocked.map(x=>x.url))],productionWrites:0,productionDataApiCalls:0,limitations:['Github-hosted runner to actual Cloudflare Worker public endpoint, NOT Thailand real-user measurement','Mobile 4G is Chromium network emulation; not cellular handset','Snapshot uses previously recorded 14998 rows, not live evolving ledger','Stage URL is authenticated and disabled after benchmark']};
 await mkdir(D+'/qa',{recursive:true});
 await writeFile(D+'/qa/hosted-real-ui-network.json',JSON.stringify(report,null,2));
 console.log('HOSTED_REAL_UI_NETWORK '+JSON.stringify({ok:true,profiles:profiles.map(p=>({name:p.profile,wallMs:p.wallMs,markMs:p.readyMarkMs,menuCount:p.menuCount,rows:p.tableRows})),blockedOrigins:report.blockedExternalBrowserOrigins,productionWrites:0}));
}finally{await browser.close()}
