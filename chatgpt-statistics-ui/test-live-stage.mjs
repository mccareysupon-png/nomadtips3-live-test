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
    let ready=false,loadAttempts=0;
    for(let attempt=0;attempt<3;attempt++){
      loadAttempts=attempt+1;
      ready=await page.locator('#b46-finance-chart-card .f46-card')
        .waitFor({state:'visible',timeout:20000}).then(()=>true).catch(()=>false);
      if(ready)break;
      if(attempt<2)await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    }
    console.log('B46_CHART_READY_ATTEMPTS',JSON.stringify({profile:profile.name,ready,loadAttempts}));
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

    // Regression: visible at first paint is NOT enough; detect the old UI overwriting later.
    const history=[{seconds:0,...state}];
    for(const seconds of [2,5,11]){
      await page.waitForTimeout(seconds===2?2000:seconds===5?3000:6000);
      history.push(await page.evaluate(seconds=>{
        const host=document.querySelector('#b46-finance-chart-card');
        const card=host?.querySelector('.f46-card');
        const line=host?.querySelector('.f46-line');
        const svg=host?.querySelector('svg.f46-svg');
        return {seconds,cardFound:!!card,chartFound:!!svg,
          visible:!!card && !!card.getClientRects().length,
          display:card?getComputedStyle(card).display:null,
          columns:card?getComputedStyle(card).gridTemplateColumns:null,
          stroke:line?getComputedStyle(line).strokeWidth:null,
          css:!!document.querySelector('link[data-b46-staging-overlay]'),
          styleCount:document.querySelectorAll('head style').length,
          chartNodes:document.querySelectorAll('#b46-finance-chart-card').length,
          overflow:document.documentElement.scrollWidth>innerWidth+1
        };
      },seconds));
    }
    console.log('B46_TIMELINE',JSON.stringify({profile:profile.name,history}));
    assert(history.every(s=>s.cardFound && s.chartFound && s.stroke==='1px'),'CHART_FLASH_OR_OVERRIDDEN_'+profile.name);
    assert(history.every(s=>profile.name==='mobile'||s.display==='grid'),'DESKTOP_GRID_OVERRIDDEN');

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
