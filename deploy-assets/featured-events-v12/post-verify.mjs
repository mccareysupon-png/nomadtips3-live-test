import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const pause=n=>new Promise(r=>setTimeout(r,n));
mkdirSync('post-proof',{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const report=[];
try{
for(const [width,mode] of [[1440,'dark'],[390,'dark'],[390,'light']]){
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e).slice(0,260)));
 await page.setViewport({width,height:970,isMobile:width<768,deviceScaleFactor:1});
 try{
  await page.goto('https://ball46.com/?view=all&post_v12_longterm='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.evaluate(t=>document.documentElement.dataset.theme=t,mode);
  await page.waitForSelector('.featured-card[data-featured]',{timeout:45000});
  if(width<768){
    await page.waitForFunction(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]'),{timeout:46000});
    await page.evaluate(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]')?.click());
    await page.waitForSelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card',{timeout:15000});
  }else{
    const row=await page.$('article.match-row[data-match-id]');if(row)await row.click();
  }
  await pause(2500);
  const samples=[];
  for(let i=0;i<(width===390?58:73);i++){
    const a=await page.evaluate(()=>{
      const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):document.querySelector('.right-rail > .featured-card');
      const stats=root?.querySelector('.feature-stats');
      const events=root?.querySelector('.feature-events');
      if(!root||!stats)return {};
      const r=root.getBoundingClientRect(),s=stats.getBoundingClientRect();
      return {t:Math.round(performance.now()),rootHeight:Math.round(r.height*10)/10,rootY:Math.round(r.y*10)/10,
        statsHeight:Math.round(s.height*10)/10,statsCount:stats.querySelectorAll('.stat-row').length,
        oldLegend:stats.querySelectorAll('.b46v11-legend').length,
        home:stats.dataset.v12Home,away:stats.dataset.v12Away,
        head:getComputedStyle(stats,'::before').content,
        eventCount:events?.querySelectorAll('.event-item').length||0,
        eventHeights:[...events?.querySelectorAll('.event-item')||[]].map(x=>Math.round(x.getBoundingClientRect().height*10)/10),
        signalCount:root.querySelectorAll('.feature-signal-main').length,
        score:root.querySelector('[data-featured-score]')?.textContent.trim()};
    });
    samples.push(a);await pause(235);
  }
  const eligible=[];
  for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i];
    if(a.statsCount===b.statsCount&&a.eventCount===b.eventCount&&a.signalCount===b.signalCount&&a.score===b.score&&a.statsCount>0)
      eligible.push(Math.abs(a.rootHeight-b.rootHeight));
  }
  const rootOscillations=eligible.filter(d=>d>10);
  const raw={width,mode,samples:samples.length,eligible:eligible.length,
   oscillations:rootOscillations.length,maxSteadyJump:Math.max(0,...eligible),
   initial:samples[0],last:samples.at(-1),
   eventH:samples.at(-1)?.eventHeights,
   oldLegendAny:samples.some(x=>x.oldLegend!==0),blankTeamAny:samples.filter(x=>x.statsCount>0).some(x=>!x.home),
   issues:errors};
  assert(!raw.oldLegendAny,'V11_RECREATING_DOM_LEGEND');
  assert(!raw.blankTeamAny,'V12_TEAM_LABEL_BLINK');
  assert(!rootOscillations.length,'CARD_HEIGHT_OSCILLATING_WITH_SAME_LIVE_DATA '+JSON.stringify(raw));
  assert((raw.eventH||[]).every(h=>h<=39),'EVENTS_NOT_SINGLE_ROW');
  await page.evaluate(()=>{
   const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):document.querySelector('.right-rail > .featured-card');
   const events=root?.querySelector('.feature-events');
   if(events?.getBoundingClientRect().height>20)events.scrollIntoView({block:'center',behavior:'instant'});
   else root?.scrollIntoView({block:'start',behavior:'instant'});
   document.querySelector('#b46-data-orbit-loading')?.style.setProperty('display','none','important');
   for(const n of document.querySelectorAll('body *')){
    const r=n.getBoundingClientRect(),st=getComputedStyle(n);
    if(n.closest?.('#b46gn-detail'))continue;
    if((st.position==='fixed'||st.position==='sticky')&&r.width>=Math.min(innerWidth-15,330)&&r.height>=180&&/visitor measurement|accept|decline|withdraw/i.test(n.textContent?.slice(0,450)||''))
       n.style.setProperty('display','none','important');
   }
  });
  await page.screenshot({path:'post-proof/production-'+width+'-'+mode+'-events-visible.png',fullPage:false});
  console.log('B46_V12_LONGTERM_PRODUCTION_STABLE_PASS',JSON.stringify(raw));
  report.push(raw);
 }finally{await page.close();}
}
}finally{await browser.close();}
writeFileSync('post-proof/report.json',JSON.stringify(report,null,2));