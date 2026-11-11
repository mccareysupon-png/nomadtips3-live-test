
const stressBrowser=await chromium.launch({headless:true});
try{
  // Desktop: multi-pin stable order, persistence, and expanded-card isolation.
  {
    const ctx=await stressBrowser.newContext({viewport:{width:1440,height:1000}});
    const page=await ctx.newPage();await install(page);
    await page.goto('https://ball46.com/?pinv2test=stress-desktop-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>window.BALL46_PIN_V2_TEST?.version==='fresh-v2-test',null,{timeout:90000});
    await page.waitForSelector('[data-board-sections] .match-row[data-match-id] [data-b46-pin-v2]',{state:'visible',timeout:90000});
    await page.evaluate(()=>window.BALL46_PIN_V2_TEST.clear());await page.waitForTimeout(300);

    let rows=page.locator('[data-board-sections] .match-row[data-match-id]');
    const ids=await rows.evaluateAll(ns=>ns.map(n=>n.dataset.matchId));
    if(ids.length<9)throw new Error('STRESS_DESKTOP_TOO_FEW_'+ids.length);
    const expected=[ids[1],ids[4],ids[7]];
    const baseBox=await rows.nth(1).boundingBox();

    // Pin in reverse click order; displayed pinned block must preserve native match order.
    for(const id of [ids[7],ids[4],ids[1]]){
      const ok=await page.evaluate(id=>window.BALL46_PIN_V2_TEST.toggle(id),id);
      if(ok!==true)throw new Error('STRESS_DESKTOP_TOGGLE_FAIL_'+id);
      await page.waitForTimeout(180);
    }
    rows=page.locator('[data-board-sections] .match-row[data-match-id]');
    const top3=await rows.evaluateAll(ns=>ns.slice(0,3).map(n=>n.dataset.matchId));
    if(JSON.stringify(top3)!==JSON.stringify(expected))throw new Error('STRESS_DESKTOP_MULTI_ORDER_'+JSON.stringify({top3,expected}));
    for(const id of expected){
      if(await page.locator('.match-row[data-match-id="'+id+'"]').count()!==1)throw new Error('STRESS_DESKTOP_DUP_'+id);
    }
    const pinnedBox=await page.locator('.match-row[data-match-id="'+expected[0]+'"]').boundingBox();
    if(Math.abs(pinnedBox.width-baseBox.width)>2||Math.abs(pinnedBox.height-baseBox.height)>2)throw new Error('STRESS_DESKTOP_GEOMETRY');

    // Reload persistence. Live fixture ordering may legitimately change during reload,
    // so verify stored pin state + visible pinned priority instead of frozen fixture positions.
    await page.reload({waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>window.BALL46_PIN_V2_TEST?.getIds?.().length===3,null,{timeout:90000});
    await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'visible',timeout:90000});
    await page.waitForTimeout(300);
    rows=page.locator('[data-board-sections] .match-row[data-match-id]');
    const storedAfter=await page.evaluate(()=>window.BALL46_PIN_V2_TEST.getIds());
    for(const id of expected){if(!storedAfter.includes(id))throw new Error('STRESS_DESKTOP_RELOAD_STORAGE_'+id)}
    const visibleIds=await rows.evaluateAll(ns=>ns.map(n=>n.dataset.matchId));
    const visiblePinned=await page.locator('.b46-pin-v2-section .match-row[data-match-id]').evaluateAll(ns=>ns.map(n=>n.dataset.matchId));
    const survivingStored=visibleIds.filter(id=>storedAfter.includes(id));
    if(!visiblePinned.length)throw new Error('STRESS_DESKTOP_RELOAD_NO_VISIBLE_PINNED');
    if(JSON.stringify(visiblePinned)!==JSON.stringify(survivingStored))throw new Error('STRESS_DESKTOP_RELOAD_PRIORITY_'+JSON.stringify({visiblePinned,survivingStored,storedAfter}));

    // Open one currently visible pinned card, verify Event Flow + Full Market stay attached.
    const openId=visiblePinned[0];
    await page.locator('.match-row[data-match-id="'+openId+'"]').evaluate(el=>el.click());
    const expanded=page.locator('.match-expanded[data-expanded-match]').last();
    await expanded.waitFor({state:'attached',timeout:15000});
    const expandedId=await expanded.getAttribute('data-expanded-match');
    await expanded.locator('[data-full-market-card]').waitFor({state:'attached',timeout:15000});
    await expanded.locator('.expand-flow-card').waitFor({state:'attached',timeout:15000});
    const topBeforeExtra=await rows.first().getAttribute('data-match-id');

    const extraId=visibleIds.find(id=>!storedAfter.includes(id));
    if(!extraId)throw new Error('STRESS_NO_UNPINNED_EXTRA');
    const extraStar=page.locator('.match-row[data-match-id="'+extraId+'"] [data-b46-pin-v2]');
    await extraStar.click({force:true});
    await page.waitForTimeout(250);
    if(!await page.evaluate(id=>window.BALL46_PIN_V2_TEST.isPinned(id),extraId))throw new Error('STRESS_EXPANDED_PIN_STATE_MISSING');
    if(await rows.first().getAttribute('data-match-id')!==topBeforeExtra)throw new Error('STRESS_REORDERED_WHILE_EXPANDED');
    if(await expanded.getAttribute('data-expanded-match')!==expandedId)throw new Error('STRESS_EXPANDED_ID_CHANGED');
    if(await expanded.locator('[data-full-market-card]').count()!==1)throw new Error('STRESS_FULLMARKET_LOST');
    if(await expanded.locator('.expand-flow-card').count()!==1)throw new Error('STRESS_EVENTFLOW_LOST');

    console.log('STRESS_DESKTOP_PASS=1 '+JSON.stringify({expected,expandedId,extraId}));
    await page.screenshot({path:'pinned-fixtures-v2/desktop-stress-expanded.png',fullPage:false});
    await ctx.close();
  }

  // Mobile: multi-pin stable order, geometry, and detail opening remains normal.
  {
    const ctx=await stressBrowser.newContext({...devices['Pixel 7']});
    const page=await ctx.newPage();await install(page);
    await page.goto('https://ball46.com/?pinv2test=stress-mobile-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>window.BALL46_PIN_V2_TEST?.version==='fresh-v2-test',null,{timeout:90000});
    await page.waitForSelector('#b46gn-cards [data-b46gn-fixture] [data-b46-pin-mobile]',{state:'visible',timeout:90000});
    await page.evaluate(()=>window.BALL46_PIN_V2_TEST.clear());await page.waitForTimeout(350);

    let cards=page.locator('#b46gn-cards [data-b46gn-fixture]');
    const ids=await cards.evaluateAll(ns=>ns.map(n=>n.dataset.b46gnFixture));
    if(ids.length<9)throw new Error('STRESS_MOBILE_TOO_FEW_'+ids.length);
    const expected=[ids[1],ids[4],ids[7]];
    const baseBox=await cards.nth(1).boundingBox();

    for(const id of [ids[7],ids[4],ids[1]]){
      await page.evaluate(id=>window.BALL46_PIN_V2_TEST.toggle(id),id);
      await page.waitForTimeout(220);
    }
    cards=page.locator('#b46gn-cards [data-b46gn-fixture]');
    const top3=await cards.evaluateAll(ns=>ns.slice(0,3).map(n=>n.dataset.b46gnFixture));
    if(JSON.stringify(top3)!==JSON.stringify(expected))throw new Error('STRESS_MOBILE_MULTI_ORDER_'+JSON.stringify({top3,expected}));
    const pinnedBox=await page.locator('[data-b46gn-fixture="'+expected[0]+'"]').boundingBox();
    if(Math.abs(pinnedBox.width-baseBox.width)>2||Math.abs(pinnedBox.height-baseBox.height)>2)throw new Error('STRESS_MOBILE_GEOMETRY');

    // Normal card tap still opens detail; star overlay has not broken the card action.
    await page.locator('[data-b46gn-fixture="'+expected[0]+'"] .b46gn-cardbody').click();
    const dialog=page.locator('#b46gn-detail');
    await page.waitForFunction(()=>document.querySelector('#b46gn-detail')?.getAttribute('aria-hidden')==='false',null,{timeout:10000});
    if(await dialog.locator('[data-b46gn-detailbody]').count()!==1)throw new Error('STRESS_MOBILE_DETAIL_BODY_LOST');
    await page.screenshot({path:'pinned-fixtures-v2/mobile-stress-detail.png',fullPage:false});
    await page.locator('[data-b46gn-dismiss]').click();
    await page.waitForFunction(()=>document.querySelector('#b46gn-detail')?.getAttribute('aria-hidden')==='true',null,{timeout:10000});

    console.log('STRESS_MOBILE_PASS=1 '+JSON.stringify({expected}));
    await ctx.close();
  }

  console.log('PINNED_FIXTURES_V2_STRESS_PASS=1');
}finally{await stressBrowser.close()}
