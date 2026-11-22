import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
const host='https://ball46-sidebar-initial-winrate-test-20261122.mccarey-supon.workers.dev';
const h=await fetch(host+'/__sidebar_initial_health');
assert(h.ok);const meta=await h.json();
assert.equal(meta.scope,'ISOLATED_TEST_ONLY');
assert.equal(meta.productionWrites,0);
assert.equal(meta.graphRequestsAdded,0);
const ss=await fetch(host+'/__b46_sidebar_initial_snapshot');
assert(ss.ok,'MONITOR_CACHE_UNAVAILABLE_'+ss.status);
const snapshot=(await ss.json()).snapshot;
assert(snapshot&&Number.isSafeInteger(snapshot.sequence));
console.log('B46_MONITOR_CACHE '+JSON.stringify({sequence:snapshot.sequence,rates:snapshot.rates}));
const browser=await chromium.launch({headless:true});
try {
 for(const type of ['desktop-dark','desktop-light','mobile-dark']){
  const mobile=type.startsWith('mobile');
  const page=await browser.newPage(mobile?{...devices['iPhone 13'],serviceWorkers:'block'}:{viewport:{width:1440,height:950},serviceWorkers:'block'});
  const errors=[],graphCalls=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,250)));
  page.on('request',r=>{if(r.url().includes('/b46-receiver-v1/graph'))graphCalls.push(r.url())});
  await page.addInitScript(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),type.endsWith('dark')?'dark':'light');
  for(let i=0;i<(mobile?2:5);i++){
   await page.goto(host+'/?view=live&sidebarInitialQa='+type+'-'+i,{waitUntil:'domcontentloaded',timeout:70000});
   if(mobile){
    assert.equal(await page.locator('[data-b46-rate-snapshot]').count(),0,'MOBILE_SHOULD_STAY_NATIVE');
    continue;
   }
   await page.waitForFunction(()=>window.__b46SidebarFirstPaintState?.source==='monitor-cache',null,{timeout:35000});
   const report=await page.evaluate(()=>{
    const x=[...document.querySelectorAll('.left-rail [data-b46-rate-snapshot]')];
    const s=window.__b46SidebarFirstPaintState;
    return {count:x.length,labels:x.map(e=>e.textContent.trim()),sequence:s.sequence,source:s.source,requested:s.requested,updated:s.updated};
   });
   assert.equal(report.count,8,'EIGHT_MARKETS');
   assert.equal(report.source,'monitor-cache');
   assert.equal(report.requested,1,'NO_DUPLICATE_FIRST_PAINT_REQUEST');
   for(let n=0;n<8;n++){
    const k=['all','1x2','ah','ou','btts','corners','cards','other'][n];
    const rate=snapshot.rates[k];
    if(rate!==null)assert.notEqual(report.labels[n],'—','MISSING_RATE_'+k);
   }
   console.log('B46_SIDEBAR_FIRST_PAINT_PASS '+JSON.stringify({type,attempt:i+1,...report}));
  }
  assert.deepEqual(errors,[],'PAGE_ERRORS_'+type);
  console.log('B46_SIDEBAR_BROWSER_PASS '+JSON.stringify({type,graphRequests:graphCalls.length}));
  await page.close();
 }
} finally {await browser.close()}
