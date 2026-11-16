import {createRequire} from 'node:module';
const require=createRequire(new URL('../deploy-assets/ball46-statistics-fast-v1-20261116/.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');
const base='https://ball46-production.mccarey-supon.workers.dev';
const terms=['Loading statistics','Preparing recorded results','Your game. In numbers.','Waiting for verified results'];
const inspect=()=>{
  const $=s=>document.querySelector(s);
  const rect=e=>{const r=e?.getBoundingClientRect();return r?{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}:null};
  const css=e=>e?{display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,opacity:getComputedStyle(e).opacity}:null;
  const count=s=>document.querySelectorAll(s).length;
  const interesting=terms.flatMap(term=>[...document.querySelectorAll('body *')].filter(e=>e.children.length===0&&e.textContent?.includes(term)).slice(0,4).map(e=>({
    term,el:e.tagName,cls:String(e.className).slice(0,100),id:e.id,
    rect:rect(e),parent:e.parentElement?.outerHTML.slice(0,420),
    ancestor:e.parentElement?.parentElement?.outerHTML.slice(0,250)
  })));
  const root=$('#b46-finance-chart-card'),ov=root?.querySelector('.f46-overview'),
    metrics=root?.querySelector('.f46-metrics'),details=root?.querySelector('.f46-details'),
    stage=$('.sp-stats-content'),summary=root?.querySelector('.b46-stage-summary-grid'),
    current=$('[data-sp-market-title]'),shell=root?.querySelector('.b46-perf-shell');
  return {
    url:location.href, view:document.body?.dataset.workspaceView,
    diag:window.__B46_FAST_V1_DIAG||null,
    root:{rect:rect(root),cls:root?.className,text:root?.textContent?.slice(0,1400)},
    overview:{rect:rect(ov),css:css(ov),text:ov?.textContent?.slice(0,1400),children:[...ov?.children||[]].map(e=>({tag:e.tagName,cls:String(e.className),css:css(e),rect:rect(e),text:e.textContent?.slice(0,100)}))},
    metrics:{rect:rect(metrics),css:css(metrics),text:metrics?.textContent?.slice(0,800),html:metrics?.outerHTML?.slice(0,2200)},
    details:{rect:rect(details),css:css(details),text:details?.textContent?.slice(0,600)},
    summary:{count:count('.b46-stage-summary-item'),rect:rect(summary)},
    native:{svg:count('#b46-finance-chart-card svg.f46-svg'),stage:css(stage),stageClasses:stage?.className,shell:css(shell)},
    legacy:{matches:interesting, loaders:[...document.querySelectorAll('[class*="load"],[class*="skeleton"],[class*="pending"]')].slice(0,55).map(e=>({cls:String(e.className).slice(0,110),text:e.textContent?.slice(0,85),css:css(e),rect:rect(e)}))},
    stats:window.BALL46_STATISTICS_DATA?.getSnapshot?.() ? 
       (()=>{const d=window.BALL46_STATISTICS_DATA.getSnapshot();return {ok:d.ok,ledgerTotal:d.ledgerTotal,rows:d.ledgerRows?.length,total:d.total}})():null,
    counts:{preview:count('#b46-fast-v1-preview'),oldTrend:count('.sp-trend:not(.b46-fast-v1-host)'),recordTable:count('.sp-history-table')},
    other:[...document.querySelectorAll('[data-sp-market],[data-stat-market],.sp-stats-header,.sp-stats-loading')].slice(0,25).map(e=>({cls:String(e.className).slice(0,100),id:e.id,text:e.textContent.slice(0,70),css:css(e)}))
  };
};
const browser=await chromium.launch({headless:true});
try{
 for(const test of [{name:'TOTAL',path:'/?view=statistics'},
                     {name:'1X2',path:'/?view=statistics&market=1x2'}]){
 const ctx=await browser.newContext({viewport:{width:1600,height:920},timezoneId:'Asia/Bangkok'});
 const page=await ctx.newPage(),errors=[],statuses=[];
 page.on('pageerror',e=>errors.push(e.message.slice(0,180)));
 page.on('response',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')statuses.push(r.status())});
 await page.goto(base+test.path,{waitUntil:'domcontentloaded',timeout:55000});
 for(const [name,pause] of [['EARLY',350],['MID',2500],['LATE',9000]]){
   await page.waitForTimeout(pause);
   const state=await page.evaluate(inspect);
   console.log('B46_UI_REGRESSION='+JSON.stringify({test:test.name,phase:name,state,errors,statuses:statuses.slice(-20)}));
   await page.screenshot({path:'b46-audit-'+test.name+'-'+name+'.png',fullPage:false});
 }
 if(test.name==='1X2'){
   await page.waitForTimeout(2000);
   const nav=await page.evaluate(()=>({
      route:location.href,classes:document.querySelector('#b46-finance-chart-card')?.className,
      shell:document.querySelector('#b46-finance-chart-card .b46-perf-shell')?.outerHTML?.slice(0,4000),
      overview:document.querySelector('#b46-finance-chart-card .f46-overview')?.outerHTML?.slice(0,7500)
   }));
   console.log('B46_1X2_EXTRA='+JSON.stringify(nav));
 }
 await ctx.close();
 }
 const u='https://www.ball46.com/longterm-performance-343.js';
 const source=await fetch(u,{signal:AbortSignal.timeout(24000)}); const raw=await source.text();
 console.log('B46_NATIVE_CHART_SOURCE_META='+JSON.stringify({status:source.status,bytes:raw.length}));
 for(const term of ['function render(','function chartHtml(','function renderKpis(','f46-overview','f46-metrics','function ensureCard(','function filteredRows(']){
   const i=raw.indexOf(term);
   if(i>=0)console.log('B46_NATIVE_CHART_SOURCE='+JSON.stringify({term,context:raw.slice(Math.max(0,i-150),i+3500)}));
 }
 const pageSource=await fetch('https://www.ball46.com/singlepage-workspace-343.js',{signal:AbortSignal.timeout(24000)});
 const pageRaw=await pageSource.text();
 console.log('B46_NATIVE_WORKSPACE_SOURCE_META='+JSON.stringify({status:pageSource.status,bytes:pageRaw.length}));
 for(const term of ['Loading statistics…','Loading statistics','Preparing recorded results','function startStatistics()','function renderStatistics(']){
   const i=pageRaw.indexOf(term);
   if(i>=0)console.log('B46_NATIVE_WORKSPACE_SOURCE='+JSON.stringify({term,context:pageRaw.slice(Math.max(0,i-400),i+2100)}));
 }
}finally{await browser.close()}
