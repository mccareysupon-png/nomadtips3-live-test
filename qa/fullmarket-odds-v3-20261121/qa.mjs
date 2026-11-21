import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
import {fullMarketOddsStyles,fullMarketOddsScript} from './fullmarket-odds-v3.mjs';
const base='https://ball46-fullmarket-odds-v3-test-20261121.mccarey-supon.workers.dev';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const health=async()=>{
 for(let n=0;n<30;n++){
  try{
   const r=await fetch(base+'/__fullmarket_health?qa='+Date.now(),{signal:AbortSignal.timeout(16000)});
   if(r.ok){const h=await r.json();if(h.scope==='ISOLATED_TEST_ONLY'&&h.styles===fullMarketOddsStyles&&h.script===fullMarketOddsScript)return h}
  }catch{}
  await pause(1400);
 }
 throw Error('ISOLATED_WORKER_NOT_DEPLOYED');
};
await health();
assert(!fullMarketOddsScript.includes('window.fetch='),'NO_FETCH_MONKEY_PATCH');
assert(!fullMarketOddsScript.includes('fetch('),'NO_API_FETCH');
const browser=await chromium.launch();
try{
 for(const mode of ['desktop-dark','desktop-light','mobile-dark']){
  const desktop=mode.startsWith('desktop'),dark=mode.endsWith('dark');
  const ctx=await browser.newContext(desktop?{viewport:{width:1440,height:950},serviceWorkers:'block'}:{...devices['iPhone 13'],viewport:{width:390,height:844},serviceWorkers:'block'});
  const p=await ctx.newPage(),errors=[];
  await p.addInitScript(theme=>localStorage.setItem('nomad343_dashboard_theme_v1',theme),dark?'dark':'light');
  await p.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
  p.on('pageerror',e=>errors.push(e.message.slice(0,350)));
  const html=await p.goto(base+'/?view=live&qaFullMarketV3='+mode+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
  assert(html?.ok(),'TEST_PAGE_NOT_OK_'+mode);
  await p.waitForFunction(()=>window.__b46FullMarketOddsV3Stats?.ready===true&&document.querySelector('.match-row[data-match-id]'),null,{timeout:55000});
  const native=await p.evaluate(()=>({
   defaultOddsV3:!!document.getElementById('b46-odds-flash-production'),
   defaultOddsStats:!!window.__b46OddsMovementStats,
   fullMarketInjected:!!document.getElementById('b46-fullmarket-odds-v3-style-test')&&!!document.getElementById('b46-fullmarket-odds-v3-script-test'),
   rowCount:document.querySelectorAll('.match-row[data-match-id]').length,
   view:document.body.dataset.workspaceView
  }));
  assert(native.defaultOddsV3&&native.defaultOddsStats&&native.fullMarketInjected,'DEFAULT_V3_OR_TEST_MISSING_'+mode);
  assert.equal(native.view,'live','WRONG_WORKSPACE_'+mode);
  const rows=p.locator('.status-section[data-status-section="live"] .match-row[data-match-id]');
  assert(await rows.count()>0,'NO_NATIVE_ROWS_'+mode);
  let loaded=false;let fixture=null;
  for(let n=0;n<Math.min(5,await rows.count());n++){
   const row=rows.nth(n);fixture=await row.getAttribute('data-match-id');
   await row.click({position:{x:95,y:35},force:true}).catch(()=>{});
   try{await p.waitForFunction(()=>document.querySelector('.expand-full-market-card .fmb-tab.has-data[data-fmb-book]'),null,{timeout:12000});loaded=true;break}catch{}
  }
  assert(loaded,'FULLMARKET_BOOKMAKERS_NOT_AVAILABLE_'+mode);
  const buttons=p.locator('.expand-full-market-card .fmb-tab.has-data[data-fmb-book]');
  const count=await buttons.count();assert(count>=2,'NOT_ENOUGH_BOOKMAKERS_'+mode);
  const bookA=await buttons.first().getAttribute('data-fmb-book');
  await buttons.first().click({force:true});
  await p.waitForFunction(()=>document.querySelector('.expand-full-market-card .fmb-panel:not([hidden]) .fmb-market[data-market="1x2"] tbody tr'),null,{timeout:10000});
  await p.waitForTimeout(300);
  const probe=await p.evaluate(()=>{
   const c=document.querySelector('.expand-full-market-card'),m=c.querySelector('.fmb-market[data-market="1x2"]');
   const tr=[...m.querySelectorAll('tbody tr')].find(x=>x.querySelector('th')?.textContent.trim().toUpperCase()==='LIVE');
   return {fixture:c.closest('[data-expanded-match]')?.getAttribute('data-expanded-match'),book:c.querySelector('.fmb-tab.active')?.getAttribute('data-fmb-book'),bookmakers:c.querySelectorAll('.fmb-tab.has-data').length,markets:c.querySelectorAll('.fmb-market[data-market]').length,liveValues:tr?[...tr.querySelectorAll('td')].map(x=>x.textContent.trim()):[],initialFlash:c.querySelectorAll('td[data-b46-fmb-odds-move]').length,stats:{...window.__b46FullMarketOddsV3Stats}};
  });
  console.log('B46_FULLMARKET_V3_BASELINE_'+mode+' '+JSON.stringify(probe));
  assert.equal(probe.initialFlash,0,'INITIAL_FLASH_'+mode);
  assert(probe.stats.baselines>0,'NO_BASELINE_'+mode);
  assert(probe.bookmakers>=2&&probe.markets>=3,'MISSING_BOOKS_OR_MARKETS_'+mode);
  const liveCells=p.locator('.expand-full-market-card .fmb-market[data-market="1x2"] tbody tr').filter({has:p.locator('th:text-is("LIVE")')}).locator('td');
  const priceIndex=await liveCells.evaluateAll(els=>els.findIndex(e=>Number(e.textContent.trim())>1&&Number(e.textContent.trim())<1000));
  assert(priceIndex>=0,'NO_VALID_LIVE_1X2_PRICE_CELL_'+mode);
  const cell=liveCells.nth(priceIndex);
  const init=await cell.evaluate(td=>{const r=td.getBoundingClientRect();return {value:td.textContent.trim(),width:r.width,height:r.height,font:getComputedStyle(td).fontSize,color:getComputedStyle(td).color}});
  assert(Number(init.value)>1,'LIVE_PRICE_INVALID_'+mode);
  const set=async v=>cell.evaluate((td,x)=>{td.textContent=x.toFixed(2)},v);
  const up=Number((Number(init.value)+.07).toFixed(2));
  await set(up);
  await p.waitForTimeout(300);
  const checkMove=await cell.evaluate(td=>{
   const a=getComputedStyle(td,'::after'),s=getComputedStyle(td),r=td.getBoundingClientRect();
   return {dir:td.getAttribute('data-b46-fmb-odds-move'),color:s.color,background:s.backgroundColor,animation:s.animationName,period:s.animationDuration,loops:s.animationIterationCount,arrow:a.content,arrowBg:a.backgroundColor,arrowClip:a.clipPath,arrowWidth:a.width,arrowHeight:a.height,arrowLeft:a.left,arrowTop:a.top,w:r.width,h:r.height,stats:{...window.__b46FullMarketOddsV3Stats}};
  });
  console.log('B46_FULLMARKET_V3_UP_'+mode+' '+JSON.stringify(checkMove));
  if(desktop&&dark){
   assert.equal(checkMove.dir,'up','UP_NOT_DETECTED');
   assert.equal(checkMove.color,'rgb(121, 225, 172)','UP_COLOR_WRONG');
   assert.equal(checkMove.arrowBg,'rgb(121, 225, 172)','UP_ARROW_WRONG');
   assert(checkMove.arrowClip.startsWith('polygon(50%'),'UP_ARROW_NOT_TRIANGLE');
   assert.equal(checkMove.arrowWidth,'5px');assert.equal(checkMove.arrowHeight,'5px');
   assert.equal(checkMove.animation,'b46-fmb-odds-pulse-6x');assert.equal(checkMove.period,'1s');assert.equal(checkMove.loops,'6');
   assert.equal(checkMove.w,init.width,'QUOTE_WIDTH_CHANGED_ON_UP');assert.equal(checkMove.h,init.height,'QUOTE_HEIGHT_CHANGED_ON_UP');
   assert.equal(checkMove.stats.sourceRequestsAdded,0);
   await p.waitForTimeout(6100);
   assert.equal(await cell.getAttribute('data-b46-fmb-odds-move'),null,'SIX_SECOND_CLEANUP_FAILED');
   const down=Number(init.value); // preserve valid odds above 1.00 even when the original live quote is 1.01
   await set(down);
   await p.waitForTimeout(300);
   const downState=await cell.evaluate(td=>({dir:td.getAttribute('data-b46-fmb-odds-move'),color:getComputedStyle(td).color,clip:getComputedStyle(td,'::after').clipPath,stats:{...window.__b46FullMarketOddsV3Stats}}));
   assert.equal(downState.dir,'down','DOWN_NOT_DETECTED');
   assert.equal(downState.color,'rgb(255, 159, 165)','DOWN_COLOR_WRONG');
   assert(/^polygon\(0(?:px)? 0(?:px)?,/.test(downState.clip),'DOWN_ARROW_WRONG_'+downState.clip);
   await p.screenshot({path:'qa-fullmarket-v3-updown.png'});
   // Historical OPEN/CLOSE must NEVER react: they are not current quotes.
   const oldPrice=p.locator('.expand-full-market-card .fmb-market[data-market="1x2"] tbody tr').filter({has:p.locator('th:text-is("OPEN")')}).locator('td').first();
   await oldPrice.evaluate(td=>td.textContent=(Number(td.textContent)+.08).toFixed(2));
   await p.waitForTimeout(180);
   assert.equal(await oldPrice.getAttribute('data-b46-fmb-odds-move'),null,'HISTORICAL_PRICE_FLASHED');
   // Change an AH LINE and quote together: this is a new line, not comparable odds.
   const ah=await p.evaluate(()=>{
    const tr=[...document.querySelectorAll('.expand-full-market-card .fmb-market[data-market="asian_handicap"] tbody tr')].find(r=>r.querySelector('th')?.textContent.trim()==='LIVE');
    if(!tr)return {skipped:true};
    const td=[...tr.querySelectorAll('td')],line=td[0],price=td[1],before=price?.textContent.trim();
    if(!line||!price||!Number(before))return {skipped:true};
    line.textContent=String(Number(line.textContent||0)+.25);
    price.textContent=(Number(before)+.08).toFixed(2);
    return {skipped:false};
   });
   await p.waitForTimeout(300);
   if(!ah.skipped)assert.equal(await p.locator('.expand-full-market-card .fmb-market[data-market="asian_handicap"] tbody tr').filter({has:p.locator('th:text-is("LIVE")')}).locator('td').nth(1).getAttribute('data-b46-fmb-odds-move'),null,'AH_LINE_CHANGED_FALSE_FLASH');
  }else{
   assert.equal(checkMove.dir,null,'MOVEMENT_OUTSIDE_DEFAULT_V3_SCOPE_'+mode);
  }
  // Switching bookmaker is a new baseline, not a price change of the previous bookmaker.
  const bookB=await buttons.nth(1).getAttribute('data-fmb-book');
  await buttons.nth(1).click({force:true});
  await p.waitForTimeout(450);
  const switchState=await p.evaluate(()=>({
   book:document.querySelector('.fmb-tab.active')?.getAttribute('data-fmb-book'),
   active:document.querySelectorAll('.expand-full-market-card td[data-b46-fmb-odds-move]').length,
   stats:{...window.__b46FullMarketOddsV3Stats}
  }));
  assert.equal(switchState.book,bookB,'BOOK_SWITCH_FAILED_'+mode);
  assert.equal(switchState.active,0,'FALSE_FLASH_ON_BOOK_SWITCH_'+mode);
  const switchBack=p.locator('.expand-full-market-card .fmb-tab[data-fmb-book="'+bookA+'"]');
  await switchBack.click({force:true});await p.waitForTimeout(350);
  assert.equal(await p.locator('.expand-full-market-card td[data-b46-fmb-odds-move]').count(),0,'FALSE_FLASH_ON_RETURN_TO_BOOK_'+mode);
  // No false movement when native bookmaker panel re-renders at exactly same price.
  await p.evaluate(()=>{const panel=document.querySelector('.expand-full-market-card .fmb-panel');panel.innerHTML=panel.innerHTML});
  await p.waitForTimeout(350);
  assert.equal(await p.locator('.expand-full-market-card td[data-b46-fmb-odds-move]').count(),0,'FALSE_FLASH_ON_PANEL_RERENDER_'+mode);
  const after=await p.evaluate(()=>({...window.__b46FullMarketOddsV3Stats}));
  console.log('B46_FULLMARKET_V3_TEST_PASS '+JSON.stringify({mode,fixture,bookmakers:count,bookA,bookB,marketCount:probe.markets,initialFlash:0,defaultUnchanged:true,noAddedApi:after.sourceRequestsAdded===0,priceMovementDesktopDarkOnly:true,upDownTested:desktop&&dark}));
  assert.deepEqual(errors,[],'BROWSER_ERRORS_'+mode+':'+JSON.stringify(errors));
  await p.close();await ctx.close();
 }
}finally{await browser.close()}
