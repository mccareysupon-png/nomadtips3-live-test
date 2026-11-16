// Browser QA used BEFORE and AFTER owner-approved Production UI-only activation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');

export async function verifyBrowser(host,label,auditDir){
  const browser=await chromium.launch({headless:true});
  const checks=[];
  try{
    const context=await browser.newContext({viewport:{width:1366,height:900},timezoneId:'Asia/Bangkok'});
    const page=await context.newPage(),errors=[],statisticsRequests=[];
    page.on('pageerror',error=>errors.push(error.message.slice(0,200)));
    page.on('request',request=>{
      if(new URL(request.url()).pathname==='/api/engine/statistics')
        statisticsRequests.push(request.method());
    });
    const started=Date.now();
    const response=await page.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:65000});
    assert.equal(response?.status(),200,label+':ENTRY_HTTP');
    await page.waitForFunction(()=>{
      const card=document.querySelector('#b46-finance-chart-card');
      return document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item').length===8 &&
        document.querySelectorAll('#b46-finance-chart-card .b46-stage-outcomes-segment').length===3 &&
        !!card?.querySelector('svg.f46-svg')?.getClientRects().length;
    },null,{timeout:150000});
    for(const width of [1366,1024,1640]){
      await page.setViewportSize({width,height:900});
      await page.waitForFunction(()=>document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item').length===8,null,{timeout:15000});
      await page.waitForTimeout(250);
      const data=await page.evaluate(()=>{
        const root=document.querySelector('#b46-finance-chart-card'),card=root?.querySelector('.f46-card');
        const overview=root?.querySelector('.f46-overview'),head=overview?.firstElementChild;
        const panel=overview?.querySelector('.b46-stage-outcomes'),grid=overview?.querySelector('.b46-stage-summary-grid');
        const filter=[...document.querySelectorAll('.sp-stats-content > .sp-filters')].find(e=>getComputedStyle(e).display!=='none');
        const strip=document.querySelector('.b46v23-strip');
        const dimensions=e=>e?.getBoundingClientRect();
        const h=dimensions(head),p=dimensions(panel),g=dimensions(grid),o=dimensions(overview),
          f=dimensions(filter),c=dimensions(card);
        const tiles=[...grid?.querySelectorAll('.b46-stage-summary-item')||[]];
        const segments=[...panel?.querySelectorAll('.b46-stage-outcomes-segment')||[]];
        const actualSettled=Number(strip?.querySelector('.b46v23-micro-card .b46v23-value')
          ?.textContent?.replace(/[^0-9]/g,''));
        return {
          settled:actualSettled,
          metrics:tiles.map(e=>({key:e.dataset.key,value:e.querySelector('strong')?.textContent?.trim()})),
          outcomes:segments.map(e=>({result:e.dataset.result,count:Number(e.dataset.count)})),
          stripHidden:strip&&getComputedStyle(strip).display==='none',
          outcomeVisible:panel&&getComputedStyle(panel).display==='flex'&&p.width>100,
          overlap:!h||!p||!g||!o||h.bottom>p.top+2||p.bottom>g.top+2||g.bottom>o.bottom+2,
          overflow:document.documentElement.scrollWidth>innerWidth+2 ||
            tiles.some(e=>e.scrollWidth>e.clientWidth+2)||panel?.scrollWidth>panel?.clientWidth+2,
          marketGap:f&&c?Math.round(f.top-c.bottom):null,
          graphVisible:!!root?.querySelector('svg.f46-svg')?.getClientRects().length,
          fontSize:getComputedStyle(root.querySelector('.f46-value')).fontSize
        };
      });
      assert.deepEqual(data.metrics.map(x=>x.key),['roi','rate','odds','days','unsettled','wpl','stake','drawdown'],label+':METRICS_'+width);
      assert.deepEqual(data.outcomes.map(x=>x.result),['win','push','loss'],label+':OUTCOMES_'+width);
      assert(data.outcomes.every(x=>Number.isSafeInteger(x.count)&&x.count>0),label+':OUTCOME_COUNT');
      assert.equal(data.outcomes.reduce((s,x)=>s+x.count,0),data.settled,label+':OUTCOME_PARITY');
      assert(data.outcomeVisible&&data.stripHidden&&data.graphVisible&&!data.overlap&&!data.overflow,label+':LAYOUT_'+width+':'+JSON.stringify(data));
      assert(data.marketGap>=0&&data.marketGap<=29,label+':FILTER_GAP_'+width+':'+data.marketGap);
      assert(parseFloat(data.fontSize)<=23,label+':PROFIT_FONT_'+width);
      await page.screenshot({path:auditDir+'/'+label+'-pc-'+width+'.png',fullPage:false});
      checks.push({width,gap:data.marketGap,settled:data.settled,outcomes:data.outcomes,fontSize:data.fontSize});
    }
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(400);
    const mobile=await page.evaluate(()=>({
      summaryTiles:document.querySelectorAll('#b46-finance-chart-card .b46-stage-summary-item').length,
      outcomeBars:document.querySelectorAll('#b46-finance-chart-card .b46-stage-outcomes-segment').length,
      chartVisible:!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length
    }));
    assert.equal(mobile.summaryTiles,0,label+':MOBILE_UNREQUESTED_LAYOUT');
    assert.equal(mobile.outcomeBars,0,label+':MOBILE_UNREQUESTED_OUTCOMES');
    assert(mobile.chartVisible,label+':MOBILE_CHART_NOT_VISIBLE');
    assert.equal(errors.length,0,label+':JAVASCRIPT_ERRORS:'+JSON.stringify(errors));
    await page.screenshot({path:auditDir+'/'+label+'-mobile-390.png',fullPage:false});
    await context.close();
    return{host,label,loadMs:Date.now()-started,checks,mobile,pageErrors:errors,statisticsApiRequests:statisticsRequests.length};
  }finally{await browser.close()}
}
