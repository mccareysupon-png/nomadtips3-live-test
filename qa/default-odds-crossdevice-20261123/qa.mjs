import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
const base='https://ball46-default-odds-crossdevice-test-20261123.mccarey-supon.workers.dev';
let ok=false;
for(let n=0;n<20;n++){try{const r=await fetch(base+'/__crossdevice_health');if(r.ok){const d=await r.json();assert.equal(d.scope,'ISOLATED_TEST_ONLY');assert.equal(d.noApiCallsAdded,true);assert(!d.styles.includes('min-width:1024px'));assert(!d.styles.includes('html:root[data-theme="dark"]'));ok=true;break}}catch{}await new Promise(r=>setTimeout(r,1400))}
assert(ok,'TEST_WORKER_NOT_READY');
const browser=await chromium.launch({headless:true});
try{
 for(const mode of ['desktop-light','mobile-light','mobile-dark','mobile-reduced']){
  const mobile=mode.startsWith('mobile'),reduce=mode.endsWith('reduced');
  const ctx=await browser.newContext(mobile?{...devices['iPhone 13'],reducedMotion:reduce?'reduce':'no-preference',serviceWorkers:'block'}:{viewport:{width:1440,height:950},reducedMotion:'no-preference',serviceWorkers:'block'});
  const page=await ctx.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),mode.includes('light')?'light':'dark');
  const resp=await page.goto(base+'/?view=live&qaCrossDevice='+mode,{waitUntil:'domcontentloaded',timeout:75000});assert(resp?.ok(),'PAGE_NOT_OK');
  await page.waitForFunction(()=>window.__b46OddsCrossDeviceStats?.ready===true,{timeout:45000}).catch(()=>{});
  const result=await page.evaluate(async ()=>{
   const wait=n=>new Promise(r=>setTimeout(r,n));
   const box=document.createElement('div');box.className='match-row';box.setAttribute('data-match-id','B46_CROSS_DEVICE_LOCAL_FIXTURE');box.style.cssText='position:fixed;left:2px;top:200px;width:220px;min-height:60px;z-index:99999';
   box.innerHTML='<div class="market-cell market-cell-1x2" title="QA"><div class="b46-v3-quote"><strong data-b46-align="1x2-H" data-nomad-odds-raw="1.80">1.80</strong></div></div>';
   document.body.append(box);const q=box.querySelector('.b46-v3-quote'),n=q.querySelector('strong');
   await wait(350);const initial=q.getAttribute('data-b46-odds-move');
   n.setAttribute('data-nomad-odds-raw','1.90');n.textContent='1.90';await wait(250);
   const up={move:q.getAttribute('data-b46-odds-move'),animation:getComputedStyle(q).animationName,color:getComputedStyle(n).color};
   n.setAttribute('data-nomad-odds-raw','1.75');n.textContent='1.75';await wait(250);
   const down={move:q.getAttribute('data-b46-odds-move'),animation:getComputedStyle(q).animationName,color:getComputedStyle(n).color};
   const stats=window.__b46OddsCrossDeviceStats||null;box.remove();return {initial,up,down,stats};
  });
  assert.equal(result.initial,null,'INITIAL_FAKE_ANIMATION_'+mode);
  if(!reduce){
   assert.equal(result.up.move,'up','MISSING_UP_'+mode);
   assert.equal(result.down.move,'down','MISSING_DOWN_'+mode);
   assert.equal(result.up.animation,'b46-odds-card-pulse-6x','UP_ANIMATION_'+mode);
   assert.equal(result.down.animation,'b46-odds-card-pulse-6x','DOWN_ANIMATION_'+mode);
  }else{
   assert.equal(result.up.move,null,'REDUCED_MOTION_UP');
   assert.equal(result.down.move,null,'REDUCED_MOTION_DOWN');
  }
  assert.deepEqual(errors,[],'PAGE_ERRORS_'+mode);
  console.log('B46_DEFAULT_ODDS_CROSS_DEVICE_PASS '+JSON.stringify({mode,up:result.up.move,down:result.down.move,flashes:result.stats?.flashes??0}));
  await ctx.close();
 }
}finally{await browser.close()}
