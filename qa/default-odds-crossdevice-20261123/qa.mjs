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
   document.body.append(box);box.style.setProperty('display','block','important');box.style.setProperty('visibility','visible','important');const cell=box.querySelector('.market-cell');cell.style.setProperty('display','block','important');const q=box.querySelector('.b46-v3-quote'),n=q.querySelector('strong');q.style.setProperty('display','inline-block','important');q.style.setProperty('visibility','visible','important');n.style.setProperty('display','inline-block','important');
   await wait(350);const initial=q.getAttribute('data-b46-odds-move');
   n.setAttribute('data-nomad-odds-raw','1.90');n.textContent='1.90';await wait(250);
   const up={move:q.getAttribute('data-b46-odds-move'),animation:getComputedStyle(q).animationName,color:getComputedStyle(n).color};
   n.setAttribute('data-nomad-odds-raw','1.75');n.textContent='1.75';await wait(250);
   const down={move:q.getAttribute('data-b46-odds-move'),animation:getComputedStyle(q).animationName,color:getComputedStyle(n).color};
   const stats=window.__b46OddsCrossDeviceStats||null;const rect={q:q.getBoundingClientRect().toJSON(),n:n.getBoundingClientRect().toJSON()};const native={rows:document.querySelectorAll('.match-row[data-match-id]').length,quotes:document.querySelectorAll('.match-row[data-match-id] .market-cell .b46-v3-quote strong[data-nomad-odds-raw]').length,marketCells:document.querySelectorAll('.market-cell').length,sample:document.querySelector('.match-row[data-match-id] .market-cell')?.outerHTML.slice(0,1900),row:document.querySelector('.match-row[data-match-id]')?.outerHTML.slice(0,2800)};const theme=document.documentElement.getAttribute('data-theme');const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;box.remove();return {initial,up,down,stats,rect,theme,reduced,native};
  });
  console.log('CROSSDEVICE_DEBUG '+JSON.stringify({mode,...result}));
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
  if(mobile){
   await page.waitForFunction(()=>document.querySelectorAll('.match-row[data-match-id] .market-quote strong[data-nomad-odds-raw]').length>0,null,{timeout:40000});
   const nativeProof=await page.evaluate(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const real=document.querySelector('.match-row[data-match-id] .market-cell-1x2');
    if(!real)return {error:'NO_REAL_MOBILE_MARKET'};
    const clone=document.createElement('article');clone.className='match-row';clone.dataset.matchId='B46_NATIVE_MOBILE_QA_ONLY';
    clone.style.cssText='position:fixed;left:5px;top:260px;z-index:100000;width:250px';
    clone.style.setProperty('display','block','important');
    const cell=real.cloneNode(true);cell.style.setProperty('display','block','important');clone.append(cell);document.body.append(clone);
    const quote=clone.querySelector('.market-quote'),n=quote?.querySelector('strong[data-nomad-odds-raw]');
    if(!n){clone.remove();return {error:'REAL_MOBILE_MARKUP_MISMATCH'}}
    n.setAttribute('data-nomad-odds-raw','1.80');n.textContent='1.80';
    await wait(400);
    const initial=quote.getAttribute('data-b46-mobile-odds-move');
    n.setAttribute('data-nomad-odds-raw','1.90');n.textContent='1.90';await wait(280);
    const up={direction:quote.getAttribute('data-b46-mobile-odds-move'),animation:getComputedStyle(quote).animationName,loops:getComputedStyle(quote).animationIterationCount,color:getComputedStyle(n).color};
    n.setAttribute('data-nomad-odds-raw','1.70');n.textContent='1.70';await wait(280);
    const down={direction:quote.getAttribute('data-b46-mobile-odds-move'),animation:getComputedStyle(quote).animationName,loops:getComputedStyle(quote).animationIterationCount,color:getComputedStyle(n).color};
    const stats={...window.__b46NativeMobileOddsStats};clone.remove();return {initial,up,down,stats};
   });
   console.log('B46_NATIVE_MOBILE_MARKUP_PROOF '+JSON.stringify({mode,...nativeProof}));
   assert(!nativeProof.error,'REAL_MOBILE_DOM_NOT_SUPPORTED_'+nativeProof.error);
   assert.equal(nativeProof.initial,null,'NATIVE_INITIAL_PHANTOM_'+mode);
   if(!reduce){
    assert.equal(nativeProof.up.direction,'up','NATIVE_MOBILE_UP_MISSING_'+mode);
    assert.equal(nativeProof.down.direction,'down','NATIVE_MOBILE_DOWN_MISSING_'+mode);
    assert.equal(nativeProof.up.animation,'b46-mobile-odds-pulse-6x','NATIVE_MOBILE_ANIMATION_MISSING_'+mode);
    assert.equal(nativeProof.down.loops,'6','NATIVE_MOBILE_SIX_PULSES_MISSING_'+mode);
   }else{
    assert.equal(nativeProof.up.direction,null,'REDUCED_MOTION_NATIVE_UP');
    assert.equal(nativeProof.down.direction,null,'REDUCED_MOTION_NATIVE_DOWN');
   }
  }
  assert.deepEqual(errors,[],'PAGE_ERRORS_'+mode);
  console.log('B46_DEFAULT_ODDS_CROSS_DEVICE_PASS '+JSON.stringify({mode,up:result.up.move,down:result.down.move,flashes:result.stats?.flashes??0}));
  await ctx.close();
 }
}finally{await browser.close()}
