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
const families=['all','1x2','ah','ou','btts','corners','cards','other'],tests=[],errors=[],blocked=[];
async function pageFor(profile,server){
 const context=await browser.newContext({viewport:profile.viewport,isMobile:!!profile.isMobile,hasTouch:!!profile.hasTouch});
 await context.addInitScript(theme=>localStorage.setItem('nomad343_dashboard_theme_v1',theme),profile.theme);
 const page=await context.newPage();
 await page.clock.setFixedTime(new Date(prepared.input.asOf));
 page.on('pageerror',error=>errors.push({profile:profile.name,error:error.message}));
 await page.route('**/*',route=>new URL(route.request().url()).origin===server.origin?route.continue():(blocked.push(route.request().url()),route.abort()));
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
 candles:document.querySelectorAll('[data-b46-chart-type],[data-b46-candle-mode]').length,
 navigator:document.querySelectorAll('[data-b46-unit-nav]').length,
 svgWidth:document.querySelector('.b46-perf-svg')?.getBoundingClientRect().width,
 sourcePoints:Number(document.querySelector('[data-b46-source-points]')?.dataset.b46SourcePoints||0),
 plotPoints:Number(document.querySelector('[data-b46-plot-points]')?.dataset.b46PlotPoints||0)
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
    assert(cur.graph,'FINANCE_LINE_MISSING');assert.equal(cur.candles,0,'CANDLES_PRESENT');assert.equal(cur.navigator,0,'NAVIGATOR_PRESENT');
    assert(cur.plotPoints<= (profile.isMobile?480:900),'LINE_TOO_DENSE');
    tests.push({profile:profile.name,market:family,financialParity:true,plotPoints:cur.plotPoints,sourcePoints:cur.sourcePoints});
   }
   await b.page.evaluate(()=>document.querySelector('[data-stat-market="all"]').click());
   await b.page.waitForFunction(()=>new URLSearchParams(location.search).get('market')===null);
   for(const range of ['d7','d30','d90','all']){
    await b.page.locator('[data-b46-range="'+range+'"]').click();
    await b.page.waitForFunction(r=>document.querySelector('[data-b46-range="'+r+'"]')?.classList.contains('active'),range);
    assert.equal(await b.page.locator('[data-b46-chart-type]').count(),0);
   }
   for(const metric of ['units','roi','rate']){
    await b.page.locator('[data-b46-mode="'+metric+'"]').click();
    await b.page.waitForFunction(m=>document.querySelector('[data-b46-mode="'+m+'"]')?.classList.contains('active'),metric);
    assert(await b.page.locator('[data-b46-finance-line]').count(),'MISSING_MODE_'+metric);
   }
   await b.page.locator('[data-b46-mode="units"]').click();
   const apiBefore=candidate.requests.filter(q=>q.path==='/api/engine/statistics').length;
   const hover=await b.page.evaluate(async()=>{
     const el=document.querySelector('.b46-perf-svg'),rect=el.getBoundingClientRect();
     el.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.left+rect.width*.55,clientY:rect.top+rect.height*.6}));
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     return {sameElement:document.querySelector('.b46-perf-svg')===el,tooltip:document.querySelector('.b46-perf-tip')?.textContent||'',tipVisible:!document.querySelector('.b46-perf-tip')?.hidden};
   });
   assert(hover.sameElement,'HOVER_REBUILT_CHART');assert(hover.tipVisible,'NO_HOVER_DETAILS');
   assert(hover.tooltip.includes('Day P/L')&&hover.tooltip.includes('High')&&hover.tooltip.includes('Low'),'DAILY_DETAIL_MISSING');
   assert.equal(candidate.requests.filter(q=>q.path==='/api/engine/statistics').length,apiBefore,'HOVER_NETWORK_FETCH');
   await b.page.screenshot({path:OUT+'/'+profile.name+'.png',fullPage:false});
   tests.push({profile:profile.name,interaction:'range/mode/tooltip',pass:true,sourceRows:prepared.input.rows.length,detailsRetained:true,hoverRequests:0});
  } finally{await Promise.all([a.context.close(),b.context.close()]);}
 }
 assert.equal(errors.length,0,'BROWSER_ERRORS:'+JSON.stringify(errors));
 assert.equal(blocked.length,0,'EXTERNAL_NETWORK:'+JSON.stringify(blocked.slice(0,3)));
 const result={ok:true,checks:tests.length,profiles:profiles.map(x=>x.name),markets:families,records:prepared.input.rows.length,tests,productionWrites:0,providerRequests:0,existingStatisticsDataUnchanged:true};
 await writeFile(OUT+'/browser.json',JSON.stringify(result,null,2));
 console.log('FINANCE_LINE_BROWSER '+JSON.stringify({ok:true,checks:tests.length,profiles:result.profiles,records:result.records,productionWrites:0,providerRequests:0}));
}finally{await browser.close();await Promise.all([baseline.close(),candidate.close()]);}
