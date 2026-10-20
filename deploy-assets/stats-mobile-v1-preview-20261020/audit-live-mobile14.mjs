import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const version='0040cded-b1d9-414c-9195-157109381090';
const u='https://api.cloudflare.com/client/v4/accounts/'+acct+'/workers/scripts/ball46-production/deployments?per_page=1';
async function active(){const r=await fetch(u,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_QUERY_FAILED');return j.result.deployments[0].versions}
mkdirSync('audit/live',{recursive:true});
let before=await active();assert.equal(before.length,1);assert.equal(before[0].version_id,version,'ACTIVE_WORKER_CHANGED_OR_NOT_PROMOTED');
console.log('LIVE_MOBILE14_ACTIVE_BEFORE',JSON.stringify(before));
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
const report={productionVersion:version,checks:[],created:new Date().toISOString()};
try{
for(const [width,forced] of [[320,null],[360,null],[390,null],[390,'light'],[430,null],[768,null],[1440,null],[1440,'light']]){
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e).slice(0,240)));
 try{
  await p.setViewport({width,height:950,deviceScaleFactor:1,isMobile:width<=767});
  await p.setCacheEnabled(false);
  if(forced)await p.evaluateOnNewDocument(t=>{try{localStorage.setItem('nomad343_dashboard_theme_v1',t)}catch(e){}},forced);
  await p.goto('https://ball46.com/?view=statistics&b46_mobile14_liveqa='+width+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:85000});
  await p.waitForFunction(()=>document.querySelector('.sp-stats-content')&&document.querySelectorAll('.sp-kpis .sp-kpi').length===8&&document.querySelectorAll('.b46-perf-kpis .b46-perf-kpi').length===6,{timeout:50000,polling:400});
  if(width<=767)await p.waitForFunction(()=>document.querySelectorAll('.b46m14-card').length===14&&document.querySelectorAll('.b46m-hcard').length===12,{timeout:22000,polling:350});
  if(width>=1024)await p.waitForFunction(()=>document.querySelectorAll('.b46v23-micro-card').length===14,{timeout:18000,polling:350});
  await new Promise(r=>setTimeout(r,1100));
  const j=await p.evaluate(()=>{
   const root=document.querySelector('.sp-stats-content'),grid=root.querySelector('.b46m14-grid'),cards=[...root.querySelectorAll('.b46m14-card')],original=[...root.querySelectorAll('.sp-kpis .sp-kpi'),...root.querySelectorAll('.b46-perf-kpis .b46-perf-kpi')];
   const expected=original.map((e,i)=>[e.querySelector('span')?.textContent.trim(),e.querySelector(i<8?'strong':'b')?.textContent.trim()]);
   const actual=cards.map(e=>[e.querySelector('.b46m14-label')?.textContent,e.querySelector('.b46m14-value')?.textContent]);
   const y=cards.map(e=>Math.round(e.getBoundingClientRect().top));
   const cols=[...new Set(y)].map(z=>y.filter(a=>a===z).length);
   const rect=grid?.getBoundingClientRect();
   return{
    theme:document.documentElement.dataset.theme,documentWidth:document.documentElement.scrollWidth,innerWidth,
    mobileMarker:!!document.getElementById('b46-mobile-stats-clean-v1-20261020'),
    gridMarker:!!window.__b46Mobile14Kpi7x2Installed, cards:cards.length,rows:cols,
    equality:JSON.stringify(actual)===JSON.stringify(expected),
    originalCount:original.length,hiddenTop:getComputedStyle(root.querySelector('.sp-kpis')).display,
    hiddenPerf:getComputedStyle(root.querySelector('.b46-perf-kpis')).display,
    gridWidth:Math.round(rect?.width||0),gridScroll:grid?.scrollWidth||0,
    clipped:cards.filter(e=>{const v=e.querySelector('.b46m14-value');return v.scrollWidth>v.clientWidth+2||v.scrollHeight>v.clientHeight+2}).map(e=>e.dataset.index),
    mobileMatchCards:document.querySelectorAll('.b46m-hcard').length,
    oldTable:getComputedStyle(document.querySelector('.sp-table-wrap')).display,
    pcCards:document.querySelectorAll('.b46v23-micro-card').length,
    pcRibbon:getComputedStyle(root.querySelector('.b46v23-strip')||root).display,
    settled:Number.parseInt(document.querySelector('[data-sp-kpi="total"]')?.textContent?.replace(/[^0-9]/g,''),10),
    chart:!!document.querySelector('.b46-perf-chart-wrap svg,.b46-perf-chart-wrap canvas')
   };
  });
  assert(j.mobileMarker&&j.gridMarker,'MOBILE_RELEASE_MARKER_MISSING');
  assert.equal(j.originalCount,14,'STATISTIC_SOURCE_COUNT_CHANGED');
  assert(j.documentWidth<=width+5,'HORIZONTAL_OVERFLOW '+width+' '+j.documentWidth);
  assert(j.chart&&j.settled>0,'CHART_OR_LIVE_DATA_MISSING');
  if(width<=767){
   assert.equal(j.cards,14,'MOBILE_14_KPI_MISSING '+width);
   assert.deepEqual(j.rows,[7,7],'KPI_MOBILE_ROWS_NOT_7_BY_2 '+width);
   assert(j.equality,'DISPLAYED_MOBILE_VALUES_NOT_EQUAL_SOURCE '+width);
   assert(j.hiddenTop==='none'&&j.hiddenPerf==='none','DUPLICATED_OLD_KPI_GROUPS '+width);
   assert(j.gridScroll<=j.gridWidth+2,'MOBILE_14_GRID_OVERFLOW '+width);
   assert.deepEqual(j.clipped,[],'MOBILE_14_CARD_VALUE_CLIPPING '+width);
   assert.equal(j.mobileMatchCards,12,'MATCH_HISTORY_CARDS_NOT_VISIBLE '+width);
   assert.equal(j.oldTable,'none','OLD_WIDE_TABLE_STILL_VISIBLE '+width);
   await p.evaluate(()=>document.querySelectorAll('.b46m14-card')[11].click());
   const tapped=await p.evaluate(()=>{
    const d=document.querySelector('.b46m14-detail');
    return{value:d.querySelector('.b46m14-detail-value')?.textContent,hidden:d.hidden,
    full:document.querySelectorAll('.b46-perf-kpis .b46-perf-kpi')[3]?.querySelector('b')?.textContent?.trim()};
   });
   assert(!tapped.hidden&&tapped.value===tapped.full,'FULL_WPL_VALUE_ON_TAP_MISMATCH '+width);
  }else{
   assert.equal(j.cards,0,'MOBILE_GRID_LEAKED_TO_PC_OR_TABLET');
   if(width>=1024){assert.equal(j.pcCards,14,'PC_14_ROW_LOST');assert.equal(j.pcRibbon,'block','PC_14_ROW_HIDDEN')}
  }
  assert.deepEqual(errors,[],'PAGE_RUNTIME_ERRORS '+width);
  await p.screenshot({path:'audit/live/'+width+(forced?'-'+forced:'-default')+'.png',fullPage:width<=767});
  console.log('LIVE_MOBILE14_BROWSER_PASS',JSON.stringify({width,forced,...j}));
  report.checks.push({width,forced,...j});
 }finally{await p.close()}
}
}finally{await browser.close()}
const after=await active();assert.deepEqual(after,before,'WORKER_CHANGED_DURING_LIVE_QA');
report.activeAfter=after;report.success=true;writeFileSync('audit/live/report.json',JSON.stringify(report,null,2));
console.log('BALL46_STATS_MOBILE14_LIVE_VERIFIED_SUCCESS',JSON.stringify({version,widths:[320,360,390,430],cols:[7,7],pcPreserved:true,lightModeTested:true}));
