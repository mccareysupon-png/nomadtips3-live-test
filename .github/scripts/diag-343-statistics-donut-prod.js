const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  const signalPayload={ok:true,signals:[{fixtureId:'diag-stat-1',id:'diag-sig-1',createdAt:1000,market:'ft_ah',marketLabel:'Asian Handicap - Full Time',selection:'HOME',line:.25,odds:1.825,bookmaker:'Bet365',home:{name:'HOME FC'},away:{name:'AWAY FC'},league:{country:'TEST',name:'Diag League'},mirrorMinute:73,mirrorScore:{home:2,away:0},liveStatistics:{attacks:{home:28,away:53},dangerousAttacks:{home:21,away:30},shotsOnTarget:{home:3,away:1},shotsOffTarget:{home:2,away:3},corners:{home:4,away:5},possession:{home:30,away:70}},entryStats:{attacks:{home:18,away:40},dangerousAttacks:{home:10,away:26},shotsOnTarget:{home:2,away:1},shotsOffTarget:{home:1,away:3},corners:{home:2,away:5},possession:{home:28,away:72}},entryMinute:50,entryScore:{home:1,away:0},evidence:{count:3,required:3,mode:'OR',side:'HOME',items:[]}}],mirror:{hubAgeMs:500}};
  await page.route('**/api/engine/signals**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(signalPayload)}));
  await page.route('**/api/engine/statistics**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,total:0,win:0,loss:0,winRate:null,rows:[],markets:{},byMarket:{},settlementRevision:'TEST'})}));
  await page.route('**/api/engine/history**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,rows:[]})}));
  const base=process.env.TARGET_URL;
  await page.goto(base+'/statistics.html?diag='+Date.now(),{waitUntil:'networkidle',timeout:45000});
  await page.waitForSelector('.statistics-live-mirror .active-signal-card',{timeout:30000});
  await page.locator('.statistics-live-mirror .active-signal-card').first().click();
  await page.waitForTimeout(1500);
  const before=await page.evaluate(()=>({
    global:window.NOMAD_SIGNAL_ENTRY_DONUT?.version||null,
    scripts:[...document.scripts].map(s=>s.src).filter(Boolean),
    rows:document.querySelectorAll('.statistics-live-mirror .signal-entry-block .signal-entry-detail-grid section:first-child .signal-mirror-row').length,
    donuts:document.querySelectorAll('.statistics-live-mirror [data-entry-donut="343-entry-donut-v1"] .signal-entry-donut-item').length,
    expanded:document.querySelector('.statistics-live-mirror .active-signal-card')?.getAttribute('aria-expanded')
  }));
  const manual=await page.evaluate(()=>{try{window.NOMAD_SIGNAL_ENTRY_DONUT?.refresh(document);return true}catch(e){return String(e)}});
  await page.waitForTimeout(200);
  const after=await page.evaluate(()=>({rows:document.querySelectorAll('.statistics-live-mirror .signal-entry-block .signal-entry-detail-grid section:first-child .signal-mirror-row').length,donuts:document.querySelectorAll('.statistics-live-mirror [data-entry-donut="343-entry-donut-v1"] .signal-entry-donut-item').length}));
  console.log('STAT DONUT DIAG',JSON.stringify({before,manual,after,errors},null,2));
  if(before.global!=='343-entry-donut-v1')throw Error('DONUT_GLOBAL_MISSING');
  if(after.donuts!==6)throw Error('MANUAL_REFRESH_FAILED');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
