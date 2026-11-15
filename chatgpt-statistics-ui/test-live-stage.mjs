// Real public-page browser smoke QA, staging only. Never submits data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(new URL('./.runtime/package.json', import.meta.url));
const { chromium }=require('playwright');
const base='https://ball46-chat-statistics-live-ui-test-20261115.mccarey-supon.workers.dev';
const browser=await chromium.launch({headless:true});
const report=[];
try {
  for (const profile of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]) {
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},ignoreHTTPSErrors:false,timezoneId:'Asia/Bangkok'});
    const page=await context.newPage();const errors=[],httpErrors=[];
    page.on('pageerror',e=>errors.push(String(e.message).slice(0,300)));
    page.on('response',r=>{if(r.status()>=400 && httpErrors.length<12)httpErrors.push([r.status(),new URL(r.url()).pathname])});
    const entry=await page.goto(base+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:45000});
    assert(entry?.status()===200,profile.name+':STAGE_HTML_NOT_200:'+entry?.status());
    // UI may take seconds to receive real ledger from Production read-only APIs.
    const ready=await page.locator('#b46-finance-chart-card .f46-card').waitFor({state:'visible',timeout:60000})
      .then(()=>true).catch(()=>false);
    const state=await page.evaluate(() => {
      const host=document.querySelector('#b46-finance-chart-card');
      const card=host?.querySelector('.f46-card');
      const line=host?.querySelector('.f46-line');
      const img=host?.querySelector('svg.f46-svg');
      return {
        title:document.title,stageCss:!!document.querySelector('link[data-b46-staging-overlay]'),
        cardFound:!!card,chartFound:!!img,
        grid:card?getComputedStyle(card).display:null,
        columns:card?getComputedStyle(card).gridTemplateColumns:null,
        stroke:line?getComputedStyle(line).strokeWidth:null,
        frontend:document.querySelector('#b46-finance-chart-card')?.getAttribute('data-f46-visual')||null,
        noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth+1
      };
    });
    report.push({profile:profile.name,entryStatus:entry.status(),ready,state,errors:errors.slice(0,5),httpErrors});
    await page.screenshot({path:'/tmp/b46-chat-real-stage-'+profile.name+'.png',fullPage:false});
    await context.close();
  }
} finally {await browser.close()}
for(const x of report) console.log('B46_REAL_STAGE_QA',JSON.stringify(x));
const desktop=report.find(x=>x.profile==='desktop'),mobile=report.find(x=>x.profile==='mobile');
assert(desktop.state.stageCss && mobile.state.stageCss,'STAGING_CSS_NOT_INJECTED');
assert(desktop.state.cardFound && mobile.state.cardFound,'REAL_STATISTICS_CARD_NOT_VISIBLE');
assert(desktop.state.grid==='grid','REAL_DESKTOP_CHART_NOT_GRID');
assert(desktop.state.stroke==='1px','REAL_CHART_STROKE_NOT_1PX');
assert(desktop.state.noHorizontalOverflow && mobile.state.noHorizontalOverflow,'HORIZONTAL_OVERFLOW');
console.log('REAL_STAGING_BROWSER_QA=PASS');
