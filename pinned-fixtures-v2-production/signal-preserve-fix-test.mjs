import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';

const DASH='/dashboard-v2-stage3-featured-facts-20261013a.js';
const VERSION='b46-screen-refresh-5s-20261104';

function patchDash(src){
  const old="if(pinned.length){structure.push(['pinned',pinned.length,1,pinned.map(fixtureKey)]);html.push('<section class=\"status-section b46-pin-v2-section\" data-status-section=\"pinned\"><header class=\"status-head\"><div><i class=\"status-dot upcoming\"></i><h2>PINNED MATCHES</h2></div><b>'+pinned.length+'</b></header><section class=\"league-block\">'+pinned.map(rowHtml).join('')+'</section></section>')}";
  const neu="if(pinned.length){const pinnedGroups=groupByLeague(pinned);structure.push(['pinned',pinned.length,1,pinnedGroups.map(([league,list])=>[league,list.map(fixtureKey)])]);html.push('<section class=\"status-section b46-pin-v2-section\" data-status-section=\"pinned\"><header class=\"status-head\"><div><i class=\"status-dot upcoming\"></i><h2>PINNED MATCHES</h2></div><b>'+pinned.length+'</b></header>'+pinnedGroups.map(([league,list])=>'<section class=\"league-block\"><header class=\"league-head\"><strong>'+esc(league)+'</strong><span>'+list.length+' match'+(list.length===1?'':'es')+'</span></header>'+list.map(rowHtml).join('')+'</section>').join('')+'</section>')}";
  const n=src.split(old).length-1;
  assert.equal(n,1,'PINNED_RENDER_ANCHOR_COUNT_'+n);
  const out=src.replace(old,neu);
  assert(out.includes('const pinnedGroups=groupByLeague(pinned)'),'GROUPED_PIN_RENDER_MISSING');
  return out;
}

async function installPatch(page){
  await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.hostname==='ball46.com'&&u.pathname===DASH&&u.searchParams.get('v')===VERSION){
      const r=await route.fetch();
      const src=patchDash(await r.text());
      return route.fulfill({response:r,body:src,headers:{...r.headers(),'cache-control':'no-store'}});
    }
    return route.continue();
  });
}

async function findSignalRow(page){
  await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});
  for(let attempt=0;attempt<40;attempt++){
    const rows=page.locator('[data-board-sections] .match-row[data-match-id]');
    for(let i=0;i<await rows.count();i++){
      const row=rows.nth(i),host=row.locator('.signal-inline-stack[data-inline-signal-count]');
      if(await host.count()){
        const n=Number(await host.getAttribute('data-inline-signal-count'));
        if(Number.isInteger(n)&&n>0){
          const id=await row.getAttribute('data-match-id');
          const league=(await row.locator('xpath=ancestor::section[contains(@class,"league-block")][1]/header[contains(@class,"league-head")]/strong').textContent().catch(()=>''))?.trim()||'';
          return {id,count:n,league};
        }
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error('NO_SIGNAL_FIXTURE_AVAILABLE');
}

async function desktop(browser){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await ctx.newPage();await installPatch(page);
  await page.goto('https://ball46.com/?signal-pin-grouped-test=desktop-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  await page.evaluate(()=>window.BALL46_PIN_V2.clear());
  const found=await findSignalRow(page);
  const sel='.match-row[data-match-id="'+found.id+'"]';
  await page.locator(sel+' .b46-league-market-signal-count').waitFor({state:'visible',timeout:15000});

  const before=await page.locator(sel).evaluate(el=>({
    status:el.closest('[data-status-section]')?.getAttribute('data-status-section'),
    league:el.closest('.league-block')?.querySelector('.league-head strong')?.textContent?.trim()||'',
    inline:Number(el.querySelector('.signal-inline-stack')?.dataset.inlineSignalCount||0),
    badge:el.querySelector('.b46-league-market-signal-count')?.textContent?.trim()||'',
    label:el.querySelector('.b46-league-market-signal-count')?.getAttribute('aria-label')||''
  }));
  assert(before.badge,'DESKTOP_BADGE_MISSING_BEFORE');

  const syncFetch=await page.locator(sel+' [data-b46-pin-v2]').evaluate(el=>{let n=0;const f=window.fetch;window.fetch=(...a)=>{n++;return f(...a)};try{el.click();return n}finally{window.fetch=f}});
  assert.equal(syncFetch,0,'DESKTOP_PIN_SYNC_FETCH_'+syncFetch);

  await page.locator('.b46-pin-v2-section '+sel+' .b46-league-market-signal-count').waitFor({state:'visible',timeout:15000});
  await page.waitForTimeout(300);

  const after=await page.locator(sel).evaluate(el=>({
    status:el.closest('[data-status-section]')?.getAttribute('data-status-section'),
    league:el.closest('.league-block')?.querySelector('.league-head strong')?.textContent?.trim()||'',
    inline:Number(el.querySelector('.signal-inline-stack')?.dataset.inlineSignalCount||0),
    badge:el.querySelector('.b46-league-market-signal-count')?.textContent?.trim()||'',
    label:el.querySelector('.b46-league-market-signal-count')?.getAttribute('aria-label')||'',
    compact:el.dataset.b46MarketCompact||''
  }));

  assert.equal(after.status,'pinned','DESKTOP_NOT_PINNED');
  assert.equal(after.league,before.league,'DESKTOP_LEAGUE_CHANGED');
  assert.equal(after.inline,before.inline,'DESKTOP_SIGNAL_COUNT_CHANGED');
  assert.equal(after.badge,before.badge,'DESKTOP_SIGNAL_BADGE_CHANGED');
  assert.equal(after.label,before.label,'DESKTOP_SIGNAL_LABEL_CHANGED');
  assert.equal(after.compact,'1','DESKTOP_COMPACT_BADGE_HOOK_NOT_APPLIED');
  assert.equal(await page.locator(sel).count(),1,'DESKTOP_DUPLICATE_CARD');

  await page.screenshot({path:'pinned-fixtures-v2-production/signal-preserve-desktop.png',fullPage:false});
  console.log('DESKTOP_SIGNAL_PRESERVE_PASS=1 '+JSON.stringify({id:found.id,before,after}));
  await ctx.close();
}

async function mobile(browser){
  const ctx=await browser.newContext({...devices['Pixel 7']});
  const page=await ctx.newPage();await installPatch(page);
  await page.goto('https://ball46.com/?signal-pin-grouped-test=mobile-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  await page.evaluate(()=>window.BALL46_PIN_V2.clear());
  const found=await findSignalRow(page);
  const card='#b46gn-cards [data-b46gn-fixture="'+found.id+'"]';
  await page.waitForSelector(card+' [data-b46-pin-mobile]',{state:'visible',timeout:30000});

  const before=await page.locator(card).evaluate(el=>({
    league:el.querySelector('.b46gn-league')?.textContent?.trim()||'',
    indicator:el.querySelector('.b46gn-live')?.textContent?.trim()||''
  }));
  assert(/signal/i.test(before.indicator),'MOBILE_SIGNAL_MISSING_BEFORE_'+before.indicator);

  const syncFetch=await page.locator(card+' [data-b46-pin-mobile]').evaluate(el=>{let n=0;const f=window.fetch;window.fetch=(...a)=>{n++;return f(...a)};try{el.click();return n}finally{window.fetch=f}});
  assert.equal(syncFetch,0,'MOBILE_PIN_SYNC_FETCH_'+syncFetch);
  await page.waitForTimeout(700);

  const after=await page.locator(card).evaluate(el=>({
    league:el.querySelector('.b46gn-league')?.textContent?.trim()||'',
    indicator:el.querySelector('.b46gn-live')?.textContent?.trim()||''
  }));
  const source=await page.locator('.match-row[data-match-id="'+found.id+'"]').evaluate(el=>({
    status:el.closest('[data-status-section]')?.getAttribute('data-status-section'),
    league:el.closest('.league-block')?.querySelector('.league-head strong')?.textContent?.trim()||'',
    inline:Number(el.querySelector('.signal-inline-stack')?.dataset.inlineSignalCount||0),
    badge:el.querySelector('.b46-league-market-signal-count')?.textContent?.trim()||''
  }));

  assert.equal(source.status,'pinned','MOBILE_SOURCE_NOT_PINNED');
  assert.equal(source.inline,found.count,'MOBILE_SOURCE_SIGNAL_COUNT_CHANGED');
  assert(source.badge,'MOBILE_SOURCE_BADGE_MISSING');
  assert.equal(after.league,before.league,'MOBILE_LEAGUE_CHANGED');
  assert.equal(after.indicator,before.indicator,'MOBILE_SIGNAL_INDICATOR_CHANGED');
  assert(/signal/i.test(after.indicator),'MOBILE_SIGNAL_MISSING_AFTER');
  assert.equal(await page.locator(card).count(),1,'MOBILE_DUPLICATE_CARD');

  await page.screenshot({path:'pinned-fixtures-v2-production/signal-preserve-mobile.png',fullPage:false});
  console.log('MOBILE_SIGNAL_PRESERVE_PASS=1 '+JSON.stringify({id:found.id,before,after,source}));
  await ctx.close();
}

const browser=await chromium.launch({headless:true});
try{
  await desktop(browser);
  await mobile(browser);
  console.log('PIN_V2_SIGNAL_PRESERVE_TEST_PASS=1');
}finally{await browser.close()}
