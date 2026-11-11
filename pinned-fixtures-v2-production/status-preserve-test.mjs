import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';

const DASH='/dashboard-v2-stage3-featured-facts-20261013a.js';
const VERSION='b46-screen-refresh-5s-20261104';

function one(src,a,b,label){
  const n=src.split(a).length-1;
  assert.equal(n,1,label+'_COUNT_'+n);
  return src.replace(a,b);
}

function patchDash(src){
  assert(src.includes('B46_PIN_V2_FRESH_20261111'),'CURRENT_PIN_V2_MISSING');

  const oldRender="  b46PinPruneKnown();const rows=visibleRows(),nativeOrder=b46PinNativeOrder(rows),pinned=nativeOrder.filter(f=>b46PinRenderHas(fixtureKey(f))),normal=rows.filter(f=>!b46PinRenderHas(fixtureKey(f))),order=['live','scheduled','unknown','finished'],html=[],structure=[];\n  if(pinned.length){structure.push(['pinned',pinned.length,1,pinned.map(fixtureKey)]);html.push('<section class=\"status-section b46-pin-v2-section\" data-status-section=\"pinned\"><header class=\"status-head\"><div><i class=\"status-dot upcoming\"></i><h2>PINNED MATCHES</h2></div><b>'+pinned.length+'</b></header><section class=\"league-block\">'+pinned.map(rowHtml).join('')+'</section></section>')}";
  const newRender="  /* B46_PIN_V2_PRESERVE_STATUS_TEST_20261111 */b46PinPruneKnown();const rows=visibleRows(),order=['live','scheduled','unknown','finished'],html=[],structure=[];";
  src=one(src,oldRender,newRender,'REMOVE_PINNED_SECTION');

  src=one(src,
    "    const all=normal.filter(f=>classify(f)===key);",
    "    const statusRows=rows.filter(f=>classify(f)===key),all=[...statusRows.filter(f=>b46PinRenderHas(fixtureKey(f))),...statusRows.filter(f=>!b46PinRenderHas(fixtureKey(f)))];",
    'STATUS_PIN_ORDER'
  );

  const oldFreeze="function b46PinRenderHas(id){id=String(id||'');if(b46PinExpanded()){if(!b46PinFrozen){b46PinFrozen=new Set([...document.querySelectorAll('.b46-pin-v2-section .match-row[data-match-id]')].map(r=>String(r.dataset.matchId||'')).filter(Boolean))}return b46PinFrozen.has(id)}b46PinFrozen=null;return b46PinHas(id)}";
  const newFreeze="function b46PinRenderHas(id){id=String(id||'');if(b46PinExpanded()){if(!b46PinFrozen){b46PinFrozen=new Set([...document.querySelectorAll('.match-row[data-match-id] [data-b46-pin-v2][aria-pressed=\"true\"]')].map(s=>String(s.closest('.match-row[data-match-id]')?.dataset.matchId||'')).filter(Boolean))}return b46PinFrozen.has(id)}b46PinFrozen=null;return b46PinHas(id)}";
  src=one(src,oldFreeze,newFreeze,'EXPANDED_FREEZE');

  assert(!src.includes('PINNED MATCHES'),'PINNED_SECTION_STILL_PRESENT');
  return src;
}

function patchHtml(html){
  assert(html.includes('B46_PIN_V2_MOBILE_20261111'),'CURRENT_MOBILE_PIN_V2_MISSING');
  const old="const all=visibleRows(),pinned=all.filter(x=>window.BALL46_PIN_V2?.isPinned?.(x.id)),rest=all.filter(x=>!window.BALL46_PIN_V2?.isPinned?.(x.id)),liveOnly=rest.filter(x=>x.kind==='live');const ordered=[...pinned,...((key==='all'&&liveOnly.length)?[...liveOnly,...rest.filter(x=>x.kind!=='live')]:rest)];";
  const neu="const all=visibleRows(),pinFirst=list=>[...list.filter(x=>window.BALL46_PIN_V2?.isPinned?.(x.id)),...list.filter(x=>!window.BALL46_PIN_V2?.isPinned?.(x.id))],ordered=key==='all'?['live','scheduled','unknown','finished'].flatMap(kind=>pinFirst(all.filter(x=>x.kind===kind))):pinFirst(all);/* B46_PIN_V2_PRESERVE_STATUS_MOBILE_TEST_20261111 */";
  return one(html,old,neu,'MOBILE_STATUS_ORDER');
}

async function install(page){
  await page.route(u=>u.hostname==='ball46.com'&&u.pathname===DASH&&u.searchParams.get('v')===VERSION,async route=>{
    const r=await route.fetch();
    await route.fulfill({response:r,body:patchDash(await r.text()),headers:{...r.headers(),'cache-control':'no-store'}});
  });
  await page.route(u=>u.hostname==='ball46.com'&&(u.pathname==='/'||u.pathname==='/index.html'),async route=>{
    const r=await route.fetch();
    await route.fulfill({response:r,body:patchHtml(await r.text()),headers:{...r.headers(),'cache-control':'no-store'}});
  });
}

async function desktop(browser){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await ctx.newPage();await install(page);
  await page.goto('https://ball46.com/?pin-preserve-status=desktop-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  await page.waitForSelector('[data-board-sections] .match-row[data-match-id] [data-b46-pin-v2]',{state:'visible',timeout:90000});
  await page.evaluate(()=>window.BALL46_PIN_V2.clear());await page.waitForTimeout(400);

  const snap=()=>page.evaluate(()=>({
    total:document.querySelectorAll('[data-board-sections] .match-row[data-match-id]').length,
    pinnedSection:document.querySelectorAll('[data-status-section="pinned"]').length,
    live:[...document.querySelectorAll('[data-status-section="live"] .match-row[data-match-id]')].map(r=>r.dataset.matchId),
    scheduled:[...document.querySelectorAll('[data-status-section="scheduled"] .match-row[data-match-id]')].map(r=>r.dataset.matchId),
    finished:[...document.querySelectorAll('[data-status-section="finished"] .match-row[data-match-id]')].map(r=>r.dataset.matchId),
  }));

  const before=await snap();
  assert.equal(before.pinnedSection,0,'DESKTOP_PINNED_SECTION_PRESENT_BEFORE');

  if(before.live.length){
    const id=before.live[Math.min(1,before.live.length-1)];
    const beforeLiveCount=before.live.length;
    await page.locator('.match-row[data-match-id="'+id+'"] [data-b46-pin-v2]').click();
    await page.waitForTimeout(350);
    const after=await snap();
    assert.equal(after.live.length,beforeLiveCount,'DESKTOP_LIVE_COUNT_CHANGED');
    assert.equal(after.total,before.total,'DESKTOP_TOTAL_CHANGED');
    assert.equal(after.pinnedSection,0,'DESKTOP_PINNED_SECTION_CREATED');
    assert.equal(after.live[0],id,'DESKTOP_PINNED_LIVE_NOT_FIRST_IN_LIVE');
    console.log('DESKTOP_LIVE_PRESERVE_PASS=1 '+JSON.stringify({id,beforeLiveCount,afterLiveCount:after.live.length}));
    await page.locator('.match-row[data-match-id="'+id+'"] [data-b46-pin-v2]').click();
    await page.waitForTimeout(250);
  }

  const mid=await snap();
  if(mid.scheduled.length>2){
    const id=mid.scheduled[2];
    const liveBefore=[...mid.live],schedCount=mid.scheduled.length;
    await page.locator('.match-row[data-match-id="'+id+'"] [data-b46-pin-v2]').click();
    await page.waitForTimeout(350);
    const after=await snap();
    assert.deepEqual(after.live,liveBefore,'DESKTOP_LIVE_AFFECTED_BY_UPCOMING_PIN');
    assert.equal(after.scheduled.length,schedCount,'DESKTOP_SCHEDULED_COUNT_CHANGED');
    assert.equal(after.scheduled[0],id,'DESKTOP_PINNED_UPCOMING_NOT_FIRST_IN_UPCOMING');
    assert.equal(after.pinnedSection,0,'DESKTOP_PINNED_SECTION_CREATED_BY_UPCOMING');
    console.log('DESKTOP_UPCOMING_PRESERVE_PASS=1 '+JSON.stringify({id,schedCount}));
  }

  // Expanded card stays attached while a new pin state is recorded.
  const liveNow=(await snap()).live;
  if(liveNow.length>=2){
    const openId=liveNow[0],otherId=liveNow[1];
    await page.locator('.match-row[data-match-id="'+openId+'"]').evaluate(el=>el.click());
    const ex=page.locator('.match-expanded[data-expanded-match]').last();
    await ex.waitFor({state:'attached',timeout:15000});
    const exId=await ex.getAttribute('data-expanded-match');
    await page.locator('.match-row[data-match-id="'+otherId+'"] [data-b46-pin-v2]').evaluate(el=>el.click());
    await page.waitForTimeout(300);
    assert.equal(await ex.getAttribute('data-expanded-match'),exId,'DESKTOP_EXPANDED_CHANGED');
    console.log('DESKTOP_EXPANDED_PRESERVE_PASS=1');
  }

  await page.screenshot({path:'pinned-fixtures-v2-production/status-preserve-desktop.png',fullPage:false});
  await ctx.close();
}

async function mobile(browser){
  const ctx=await browser.newContext({...devices['Pixel 7']});
  const page=await ctx.newPage();await install(page);
  await page.goto('https://ball46.com/?pin-preserve-status=mobile-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  await page.waitForSelector('#b46gn-cards [data-b46gn-fixture] [data-b46-pin-mobile]',{state:'visible',timeout:90000});
  await page.evaluate(()=>window.BALL46_PIN_V2.clear());await page.waitForTimeout(500);

  const getCards=()=>page.evaluate(()=>[...document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]')].map(c=>({
    id:c.dataset.b46gnFixture,
    kind:c.querySelector('.b46gn-cardhead')?.dataset.kind||''
  })));

  const before=await getCards();
  const live=before.filter(x=>x.kind==='live');
  if(live.length){
    const id=live[Math.min(1,live.length-1)].id;
    const liveCount=live.length;
    await page.locator('[data-b46gn-fixture="'+id+'"] [data-b46-pin-mobile]').click({force:true});
    await page.waitForTimeout(450);
    const after=await getCards();
    const afterLive=after.filter(x=>x.kind==='live');
    assert.equal(afterLive.length,liveCount,'MOBILE_LIVE_COUNT_CHANGED');
    assert.equal(afterLive[0].id,id,'MOBILE_PINNED_LIVE_NOT_FIRST_LIVE');
    const firstNonLive=after.findIndex(x=>x.kind!=='live');
    assert(firstNonLive<0||after.slice(0,firstNonLive).every(x=>x.kind==='live'),'MOBILE_STATUS_ORDER_BROKEN');
    console.log('MOBILE_LIVE_PRESERVE_PASS=1 '+JSON.stringify({id,liveCount}));
  }

  const cards2=await getCards();
  const sched=cards2.filter(x=>x.kind==='scheduled');
  if(sched.length>2){
    const id=sched[2].id;
    const liveIdsBefore=cards2.filter(x=>x.kind==='live').map(x=>x.id);
    await page.locator('[data-b46gn-fixture="'+id+'"] [data-b46-pin-mobile]').click({force:true});
    await page.waitForTimeout(450);
    const after=await getCards();
    assert.deepEqual(after.filter(x=>x.kind==='live').map(x=>x.id),liveIdsBefore,'MOBILE_LIVE_CHANGED_BY_UPCOMING_PIN');
    assert.equal(after.filter(x=>x.kind==='scheduled')[0]?.id,id,'MOBILE_PINNED_UPCOMING_NOT_FIRST_SCHEDULED');
    console.log('MOBILE_UPCOMING_PRESERVE_PASS=1 '+JSON.stringify({id}));
  }

  await page.screenshot({path:'pinned-fixtures-v2-production/status-preserve-mobile.png',fullPage:false});
  await ctx.close();
}

const browser=await chromium.launch({headless:true});
try{
  await desktop(browser);
  await mobile(browser);
  console.log('PIN_V2_STATUS_PRESERVE_TEST_PASS=1');
}finally{await browser.close()}
