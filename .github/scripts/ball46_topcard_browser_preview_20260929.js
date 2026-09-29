const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const ROOT='ball46-topcard-candidate-20260929';
const candidateJs=fs.readFileSync(path.join(ROOT,'dashboard-v2-stage3.js'),'utf8');
const candidateCss=fs.readFileSync(path.join(ROOT,'dashboard-v2-tune.css'),'utf8');
const OUT='ball46-topcard-preview-20260929'; fs.mkdirSync(OUT,{recursive:true});

async function preparePage(browser, viewport, name){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  const page=await context.newPage();
  const pageErrors=[]; page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.route('**/dashboard-v2-stage3.js*',r=>r.fulfill({status:200,contentType:'application/javascript; charset=utf-8',body:candidateJs}));
  await page.route('**/dashboard-v2-tune.css*',r=>r.fulfill({status:200,contentType:'text/css; charset=utf-8',body:candidateCss}));
  await page.goto('https://www.ball46.com/?preview_topcard=20260929',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('[data-workspace-scorebar-slot]',{timeout:30000});
  if(viewport.width>760){
    await page.waitForFunction(()=>document.querySelectorAll('[data-scorebar-details="1"]').length>0,null,{timeout:30000});
  }
  const state=await page.evaluate(()=>{
    const slot=document.querySelector('[data-workspace-scorebar-slot]');
    const grid=slot?.querySelector('.workspace-scorebar-grid');
    const cards=[...(slot?.querySelectorAll('.workspace-scorebar-cell')||[])];
    const populated=cards.filter(c=>!c.classList.contains('placeholder'));
    const cs=e=>e?getComputedStyle(e):null, rect=e=>e?e.getBoundingClientRect():null;
    return {
      slotDisplay:slot?cs(slot).display:null,
      slotHeight:slot?rect(slot).height:null,
      gridHeight:grid?rect(grid).height:null,
      cardCount:cards.length,
      populatedCount:populated.length,
      detailsCount:slot?.querySelectorAll('[data-scorebar-details="1"]').length||0,
      cards:populated.map(c=>{
        const d=c.querySelector('.workspace-scorebar-details'),m=c.querySelector('.workspace-scorebar-meta');
        const cr=rect(c),dr=rect(d),mr=rect(m);
        return {text:c.innerText.replace(/\n+/g,' | '),height:cr.height,scrollHeight:c.scrollHeight,detailBottom:dr?.bottom??null,cardBottom:cr.bottom,metaTop:mr?.top??null,cardTop:cr.top};
      })
    };
  });
  if(viewport.width>760){
    if(state.cardCount!==10)throw new Error(name+': expected 10 scorebar cells, got '+state.cardCount);
    if(state.detailsCount<1)throw new Error(name+': no detail rows rendered');
    if(Math.abs(state.slotHeight-120)>1.5)throw new Error(name+': slot height '+state.slotHeight+' != 120');
    if(Math.abs(state.gridHeight-118)>1.5)throw new Error(name+': grid height '+state.gridHeight+' != 118');
    for(const c of state.cards){
      if(Math.abs(c.height-118)>1.5)throw new Error(name+': card height '+c.height+' != 118');
      if(c.detailBottom!==null && c.detailBottom>c.cardBottom+0.75)throw new Error(name+': detail clipped vertically '+JSON.stringify(c));
      if(c.scrollHeight>c.height+1.5)throw new Error(name+': vertical overflow '+JSON.stringify(c));
      const topOffset=c.metaTop-c.cardTop; if(topOffset<3||topOffset>9)throw new Error(name+': existing score/time row moved unexpectedly offset='+topOffset);
    }
  } else if(state.slotDisplay!=='none') throw new Error(name+': mobile scorebar visibility changed; expected hidden');
  await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:false});
  return {context,page,state,pageErrors};
}

(async()=>{
 const browser=await chromium.launch({headless:true});
 const report={generatedAt:new Date().toISOString(),productionMutated:false,assetMode:'live Ball46 with candidate JS/CSS intercepted in browser only',views:{}};
 try{
   const desktop=await preparePage(browser,{width:1440,height:900},'desktop-1440'); report.views.desktop=desktop.state;
   // Prove the shared top card survives switching to Statistics without changing the card structure.
   const before=await desktop.page.locator('[data-workspace-scorebar-slot]').innerHTML();
   await desktop.page.locator('[data-stat-market="all"]').click();
   await desktop.page.waitForSelector('[data-workspace-panel="statistics"]:not([hidden])',{timeout:10000});
   const afterStats=await desktop.page.locator('[data-workspace-scorebar-slot]').innerHTML();
   if(!afterStats.includes('data-scorebar-details="1"'))throw new Error('statistics view lost top-card details');
   report.sharedAcrossStatistics=before===afterStats;
   await desktop.page.screenshot({path:path.join(OUT,'desktop-statistics-1440.png'),fullPage:false});
   // Signal view uses the same shared top slot.
   await desktop.page.locator('[data-workspace-view="signal"]').click();
   await desktop.page.waitForTimeout(300);
   const afterSignal=await desktop.page.locator('[data-workspace-scorebar-slot]').innerHTML();
   if(!afterSignal.includes('data-scorebar-details="1"'))throw new Error('signal view lost top-card details');
   report.sharedAcrossSignal=before===afterSignal;
   await desktop.page.screenshot({path:path.join(OUT,'desktop-signal-1440.png'),fullPage:false});
   await desktop.context.close();
   const tablet=await preparePage(browser,{width:1000,height:850},'tablet-1000'); report.views.tablet=tablet.state; await tablet.context.close();
   const mobile=await preparePage(browser,{width:390,height:844},'mobile-390'); report.views.mobile=mobile.state; await mobile.context.close();
   fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
   console.log('BROWSER_PREVIEW_OK'); console.log(JSON.stringify(report,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
