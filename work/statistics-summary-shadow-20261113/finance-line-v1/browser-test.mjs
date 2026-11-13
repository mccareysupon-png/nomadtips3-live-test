import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {prepareUiReplay,startUiReplay} from '../ui-replay.mjs';
const D='work/statistics-summary-shadow-20261113',OUT=D+'/qa/finance-line-v1';
const require=createRequire(resolve(D+'/.runtime/resolve.cjs')),{chromium}=require('playwright');
const prepared=await prepareUiReplay();
const asset=prepared.resources.get('/longterm-performance-343.js');
assert(asset&&asset.body,'CHART_STATIC_ASSET_MISSING');
const source=await readFile(D+'/finance-line-v1/chart.js');
const patched=new Map(prepared.resources);
patched.set('/longterm-performance-343.js',{...asset,body:source});
const baseline=await startUiReplay({...prepared,resources:new Map(prepared.resources)},{candidate:true});
const candidate=await startUiReplay({...prepared,resources:patched},{candidate:true});
const browser=await chromium.launch({headless:true});
const profiles=[{name:'pc-dark',viewport:{width:1440,height:900},theme:'dark'},{name:'pc-light',viewport:{width:1440,height:900},theme:'light'},{name:'mobile-dark',viewport:{width:390,height:844},theme:'dark',isMobile:true,hasTouch:true},{name:'mobile-light',viewport:{width:390,height:844},theme:'light',isMobile:true,hasTouch:true}];
const families=['all','1x2','ah','ou','btts','corners','cards','other'],tests=[],errors=[],blocked=[],overrides=[];
async function pageFor(profile,server){
 const context=await browser.newContext({viewport:profile.viewport,isMobile:!!profile.isMobile,hasTouch:!!profile.hasTouch});
 await context.addInitScript(theme=>localStorage.setItem('nomad343_dashboard_theme_v1',theme),profile.theme);
 const page=await context.newPage();
 await page.clock.setFixedTime(new Date(prepared.input.asOf));
 page.on('pageerror',error=>errors.push({profile:profile.name,error:error.message}));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(server===candidate&&u.origin===server.origin&&u.pathname==='/longterm-performance-343.js'){overrides.push(u.pathname);return route.fulfill({status:200,contentType:'application/javascript; charset=utf-8',body:source})}if(u.origin===server.origin)return route.continue();blocked.push(route.request().url());return route.abort();});
 await page.goto(server.origin+'/?view=statistics',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('.b46-perf-svg')&&document.querySelectorAll('.b46-perf-kpi').length===6,null,{timeout:60000});
 return {page,context};
}
async function snapshot(page){return page.evaluate(()=>({
 kpis:[...document.querySelectorAll('.b46-perf-kpi')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),
 recordCount:document.querySelector('[data-sp-record-count]')?.textContent,
 theme:document.documentElement.dataset.theme,
 areaBg:getComputedStyle(document.querySelector('.sp-trend')).backgroundColor,
 graph:!!document.querySelector('[data-b46-finance-line]'),
 hasSvg:!!document.querySelector('.b46-perf-svg'),
 empty:document.querySelector('.b46-perf-empty')?.textContent?.trim()||null,
 candles:document.querySelectorAll('[data-b46-chart-type],[data-b46-candle-mode]').length,
 navigator:document.querySelectorAll('[data-b46-unit-nav]').length,
 svgWidth:document.querySelector('.b46-perf-svg')?.getBoundingClientRect().width,
 sourcePoints:Number(document.querySelector('[data-b46-source-points]')?.dataset.b46SourcePoints||0),
 plotPoints:Number(document.querySelector('[data-b46-plot-points]')?.dataset.b46PlotPoints||0),
 chartHead:document.querySelector('.b46-perf-svg')?.outerHTML?.slice(0,300)||null
}));}
try{
 await mkdir(OUT,{recursive:true});
 for(const profile of profiles){
  const a=await pageFor(profile,baseline),b=await pageFor(profile,candidate);
  try{
   for(const family of families){
    if(family!=='all'){
     await Promise.all([a.page.evaluate(m=>document.querySelector('[data-stat-market="'+m+'"]').click(),family),b.page.evaluate(m=>document.querySelector('[data-stat-market="'+m+'"]').click(),family)]);
     await Promise.all([a.page.waitForFunction(m=>new URLSearchParams(location.search).get('market')===m,family),b.page.waitForFunction(m=>new URLSearchParams(location.search).get('market')===m,family)]);
    }
    const old=await snapshot(a.page),cur=await snapshot(b.page);
    assert.deepEqual(cur.kpis,old.kpis,'FINANCIAL_KPI_DRIFT:'+profile.name+':'+family);
    assert.equal(cur.recordCount,old.recordCount,'RESULT_RECORD_COUNT_DRIFT');
    assert.equal(cur.theme,old.theme,'THEME_DRIFT');
    assert.equal(cur.areaBg,old.areaBg,'SURFACE_COLOR_DRIFT');
    if(old.hasSvg){
      assert(cur.graph,'FINANCE_LINE_MISSING:'+JSON.stringify({profile:profile.name,market:family,overrides:overrides.length,chartHead:cur.chartHead,errors:errors.slice(-4)}));
      assert(cur.plotPoints>0&&cur.plotPoints<= (profile.isMobile?480:900),'LINE_TOO_DENSE');
    }else{
      assert(old.empty&&cur.empty&&cur.empty===old.empty,'EMPTY_STATE_DRIFT:'+profile.name+':'+family);
      assert(!cur.hasSvg,'EMPTY_MARKET_SHOULD_NOT_DRAW');
    }
    assert.equal(cur.candles,0,'CANDLES_PRESENT');assert.equal(cur.navigator,0,'NAVIGATOR_PRESENT');
    tests.push({profile:profile.name,market:family,financialParity:true,empty:!!cur.empty,plotPoints:cur.plotPoints,sourcePoints:cur.sourcePoints});
   }
   // Independent visible chart panel: the replayed full Website can keep its
   // Statistics DOM hidden after exercising market navigation. Verify that
   // tooltip/range/metric controls actually work on a visible chart surface.
   const interactionPage=await b.context.newPage();
   interactionPage.on('pageerror',error=>errors.push({profile:profile.name,source:'isolated-visible-chart',error:error.message}));
   await interactionPage.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px system-ui;margin:20px;color:#e6f4ee;background:#141e1c}.sp-trend{display:block;width:100%;max-width:1000px}.b46-perf-chart-wrap{position:relative;width:100%}.b46-perf-svg{display:block;width:100%;height:250px}.b46-perf-tip{position:absolute;min-width:190px;background:#1c2927;padding:8px;border:1px solid #334a42;border-radius:8px;color:#fff;pointer-events:none}.b46-perf-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.b46-perf-kpi{padding:4px}.b46-perf-range button,.b46-perf-mode button{padding:6px}</style></head><body data-workspace-view="statistics"><div data-workspace-panel="statistics"><div data-sp-market-title>All Markets</div><div class="sp-trend"></div></div></body></html>');
   await interactionPage.evaluate(rows=>{window.BALL46_STATISTICS_DATA={load:async()=>({rows}),outcome:r=>r.result};window.BALL46_MARKET_REGISTRY={resolve:()=>null};},prepared.input.rows.slice(0,1500));
   await interactionPage.addScriptTag({content:source.toString()});
   await interactionPage.waitForFunction(()=>document.querySelector('.b46-perf-svg')&&document.querySelectorAll('.b46-perf-kpi').length===6,null,{timeout:15000});
   for(const range of ['d7','d30','d90','all']){
    await interactionPage.locator('[data-b46-range="'+range+'"]').click();
    await interactionPage.waitForFunction(r=>document.querySelector('[data-b46-range="'+r+'"]')?.classList.contains('active'),range);
    assert.equal(await interactionPage.locator('[data-b46-chart-type]').count(),0);
   }
   for(const metric of ['units','roi','rate']){
    await interactionPage.locator('[data-b46-mode="'+metric+'"]').click();
    await interactionPage.waitForFunction(m=>document.querySelector('[data-b46-mode="'+m+'"]')?.classList.contains('active'),metric);
    assert(await interactionPage.locator('[data-b46-finance-line]').count(),'MISSING_MODE_'+metric);
   }
   await interactionPage.locator('[data-b46-mode="units"]').click();
   const apiBefore=candidate.requests.filter(q=>q.path==='/api/engine/statistics').length;
   const svgLocator=interactionPage.locator('.b46-perf-svg');
   const box=await svgLocator.boundingBox();assert(box?.width>20&&box?.height>20,'CHART_NOT_VISIBLE_FOR_HOVER:'+JSON.stringify({profile:profile.name,box}));
   const initialHandle=await svgLocator.elementHandle();
   if(profile.isMobile)await interactionPage.touchscreen.tap(box.x+box.width*.55,box.y+box.height*.6);
   else await interactionPage.mouse.move(box.x+box.width*.55,box.y+box.height*.6);
   await interactionPage.waitForFunction(()=>{const t=document.querySelector('.b46-perf-tip');return t&&!t.hidden},null,{timeout:8000});
   const hover=await interactionPage.evaluate(()=>({tooltip:document.querySelector('.b46-perf-tip')?.textContent||'',tipVisible:!document.querySelector('.b46-perf-tip')?.hidden}));
   assert(hover.tipVisible,'NO_HOVER_DETAILS:'+profile.name);
   assert(await initialHandle.evaluate(el=>el===document.querySelector('.b46-perf-svg')),'HOVER_REBUILT_CHART');
   assert(hover.tooltip.includes('Day P/L')&&hover.tooltip.includes('High')&&hover.tooltip.includes('Low'),'DAILY_DETAIL_MISSING');
   assert.equal(candidate.requests.filter(q=>q.path==='/api/engine/statistics').length,apiBefore,'HOVER_NETWORK_FETCH');
   await interactionPage.screenshot({path:OUT+'/'+profile.name+'.png',fullPage:false});
   await interactionPage.close();
   tests.push({profile:profile.name,interaction:'range/mode/visible mouse-touch tooltip',pass:true,sourceRows:1500,detailsRetained:true,hoverRequests:0});
  } finally{await Promise.all([a.context.close(),b.context.close()]);}
 }
 assert.equal(errors.length,0,'BROWSER_ERRORS:'+JSON.stringify(errors));
 assert(!blocked.some(url=>/\/(?:api\/|v1\/|v2\/|statistics\?|ledger-)/i.test(new URL(url).pathname)),'UNEXPECTED_EXTERNAL_API:'+JSON.stringify(blocked.filter(url=>/\/api\//.test(url)).slice(0,3)));
 const result={ok:true,checks:tests.length,profiles:profiles.map(x=>x.name),markets:families,records:prepared.input.rows.length,tests,blockedThirdPartyStaticRequests:blocked.length,productionWrites:0,providerRequests:0,existingStatisticsDataUnchanged:true};
 await writeFile(OUT+'/browser.json',JSON.stringify(result,null,2));
 console.log('FINANCE_LINE_BROWSER '+JSON.stringify({ok:true,checks:tests.length,profiles:result.profiles,records:result.records,productionWrites:0,providerRequests:0}));
}finally{await browser.close();await Promise.all([baseline.close(),candidate.close()]);}
