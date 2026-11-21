import {chromium} from 'playwright';
const browser=await chromium.launch();
const origins=[
 ['production','https://ball46.com/?view=live'],
 ['fullmarket-test','https://ball46-fullmarket-odds-v3-test-20261121.mccarey-supon.workers.dev/?view=live']
];
const sampleCode=()=>{
 const scrolling=document.scrollingElement;
 const els=['.board-sections','.status-section[data-status-section="live"]','.workspace-main','.workspace-panel','.workspace-content','.board-main','.matches-area','.match-list','.match-row.active','.match-expanded','.expand-full-market-card','.expand-flow-card'];
 const snap={at:Math.round(performance.now()),body:document.body.dataset.workspaceView,doc:Math.round(scrolling.scrollTop),win:Math.round(window.scrollY),inner:window.innerHeight,docHeight:Math.round(scrolling.scrollHeight),docAnchor:getComputedStyle(document.documentElement).overflowAnchor,active:document.querySelector('.match-row.active')?.dataset.matchId||null,expanded:document.querySelectorAll('.match-expanded').length,defaultMovement:document.querySelectorAll('.b46-v3-quote[data-b46-odds-move]').length,fullMovement:document.querySelectorAll('[data-b46-fmb-odds-move]').length,defaultStats:window.__b46OddsMovementStats?{scans:window.__b46OddsMovementStats.scans,flashes:window.__b46OddsMovementStats.flashes}:null,fullStats:window.__b46FullMarketOddsV3Stats?{scans:window.__b46FullMarketOddsV3Stats.scans,flashes:window.__b46FullMarketOddsV3Stats.flashes}:null};
 for(const sel of els){
  const e=document.querySelector(sel);if(!e)continue;
  const r=e.getBoundingClientRect(),s=getComputedStyle(e);
  snap[sel]={top:Math.round(r.top*10)/10,height:Math.round(r.height*10)/10,scroll:Math.round(e.scrollTop),scrollHeight:Math.round(e.scrollHeight),clientHeight:e.clientHeight,overflow:s.overflowY,anchor:s.overflowAnchor,position:s.position};
 }
 return snap;
};
try{
 for(const [name,url] of origins){
  const p=await browser.newPage({viewport:{width:1440,height:850},serviceWorkers:'block'});
  const exceptions=[],net=[];
  p.on('pageerror',e=>exceptions.push(e.message.slice(0,220)));
  p.on('response',r=>{const u=r.url();if(/api\/full-market|api\/engine|api\/hub/.test(u))net.push({path:new URL(u).pathname,status:r.status()})});
  await p.addInitScript(()=>{
   try{localStorage.setItem('nomad343_dashboard_theme_v1','dark')}catch{}
   window.__b46Audit={events:[],long:[],shifts:[],wheel:[],errors:[],started:performance.now()};
   try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__b46Audit.long.push({at:Math.round(e.startTime),ms:Math.round(e.duration)})}).observe({type:'longtask',buffered:true})}catch{}
   try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__b46Audit.shifts.push({at:Math.round(e.startTime),value:e.value})}).observe({type:'layout-shift',buffered:true})}catch{}
   document.addEventListener('wheel',e=>window.__b46Audit.wheel.push({at:Math.round(performance.now()),dy:e.deltaY}),{passive:true,capture:true});
  });
  await p.goto(url,{waitUntil:'domcontentloaded',timeout:70000});
  await p.waitForFunction(()=>document.querySelectorAll('.status-section[data-status-section="live"] .match-row[data-match-id]').length>=5&&window.__b46OddsMovementStats?.ready===true,null,{timeout:55000});
  await p.waitForTimeout(750);
  const first=await p.evaluate(sampleCode);
  const rows=p.locator('.status-section[data-status-section="live"] .match-row[data-match-id]');
  const nth=Math.min(12,(await rows.count())-2),target=rows.nth(nth);
  await target.scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  await p.mouse.wheel(0,520);await p.waitForTimeout(500);
  const scrolled=await p.evaluate(sampleCode);
  // Native Default quote update is browser-only and triggers the original V3 as an incoming odd.
  const quote=await p.evaluate(()=>{
   const vals=[...document.querySelectorAll('.status-section[data-status-section="live"] .b46-v3-quote strong[data-nomad-odds-raw]')].filter(e=>Number(e.getAttribute('data-nomad-odds-raw'))>1.1);
   const e=vals[0];if(!e)return null;
   const prev=e.getAttribute('data-nomad-odds-raw'),next=(Number(prev)+.07).toFixed(2);
   e.setAttribute('data-nomad-odds-raw',next);e.textContent=next;
   return {value:prev,next,row:e.closest('[data-match-id]')?.dataset.matchId};
  });
  await p.waitForTimeout(500);
  const afterQuote=await p.evaluate(sampleCode);
  // Let the real live data refresh run for several seconds with the user scrolled.
  const samples=[];
  for(let i=0;i<7;i++){await p.waitForTimeout(1050);samples.push(await p.evaluate(sampleCode))}
  // Scroll and expand a match while retaining the viewport anchor.
  await target.scrollIntoViewIfNeeded();await p.waitForTimeout(260);
  const beforeOpen=await p.evaluate(sampleCode);
  await target.click({position:{x:80,y:35},force:true});
  await p.waitForFunction(()=>document.querySelector('.match-expanded'),null,{timeout:20000}).catch(()=>{});
  const openSamples=[];for(let i=0;i<9;i++){await p.waitForTimeout(250);openSamples.push(await p.evaluate(sampleCode))}
  // Select the first supported bookmaker; tests only existing UI/GET.
  const btn=p.locator('.expand-full-market-card .fmb-tab.has-data[data-fmb-book]').first();
  const bookmaker=await btn.count()>0;
  if(bookmaker){await btn.click({force:true}).catch(()=>{});await p.waitForTimeout(650)}
  const afterBook=await p.evaluate(sampleCode);
  // Simulate real user wheel during expanded panels.
  await p.mouse.wheel(0,480);await p.waitForTimeout(400);
  const afterWheel=await p.evaluate(sampleCode);
  const audit=await p.evaluate(()=>window.__b46Audit);
  const output={name,quote,nth,bookmaker,first,scrolled,afterQuote,samples, beforeOpen, openSamples,afterBook,afterWheel, audits:{wheel:audit.wheel.slice(0,10),long:audit.long.slice(-18),shifts:audit.shifts.slice(-25),errors:exceptions},api:net.slice(-15)};
  console.log('B46_SCROLL_JITTER_DIAGNOSTIC '+JSON.stringify(output).slice(0,54000));
  await p.screenshot({path:'fullmarket-scroll-'+name+'.png'});
  await p.close();
 }
}finally{await browser.close()}