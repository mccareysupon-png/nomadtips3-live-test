import {chromium,devices} from 'playwright';

const KEY='ball46_pinned_fixtures_v2';

async function desktop(browser){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await ctx.newPage();
  await page.goto('https://ball46.com/?pinv2-prod-qa=desktop-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  await page.waitForSelector('[data-board-sections] .match-row[data-match-id] [data-b46-pin-v2]',{state:'visible',timeout:90000});
  await page.evaluate(()=>window.BALL46_PIN_V2.clear());
  await page.waitForTimeout(300);

  let rows=page.locator('[data-board-sections] .match-row[data-match-id]');
  if(await rows.count()<6)throw new Error('DESKTOP_TOO_FEW_ROWS');
  const sample=rows.nth(1),star=sample.locator('[data-b46-pin-v2]'),kit=sample.locator('.teams-cell .team-kit-icon').first();
  const [rb,sb,kb]=await Promise.all([sample.boundingBox(),star.boundingBox(),kit.boundingBox()]);
  if(!rb||!sb||!kb)throw new Error('DESKTOP_POSITION_BOX_MISSING');
  const rowCy=rb.y+rb.height/2,starCy=sb.y+sb.height/2,gap=kb.x-(sb.x+sb.width);
  if(Math.abs(rowCy-starCy)>2)throw new Error('DESKTOP_STAR_NOT_CENTERED');
  if(gap<4)throw new Error('DESKTOP_STAR_OVERLAP_'+gap);

  const target=rows.nth(5);const id=await target.getAttribute('data-match-id');
  const syncFetch=await target.locator('[data-b46-pin-v2]').evaluate(el=>{let n=0;const f=window.fetch;window.fetch=(...a)=>{n++;return f(...a)};try{el.click();return n}finally{window.fetch=f}});
  await page.waitForTimeout(300);
  if(syncFetch!==0)throw new Error('DESKTOP_PIN_SYNC_FETCH_'+syncFetch);
  if(await rows.first().getAttribute('data-match-id')!==id)throw new Error('DESKTOP_NOT_PINNED_TOP');
  if(await page.locator('.match-row[data-match-id="'+id+'"]').count()!==1)throw new Error('DESKTOP_DUPLICATE');
  const stored=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'[]'),KEY);
  if(!stored.includes(id))throw new Error('DESKTOP_STORAGE_MISSING');

  // Expanded isolation + Full Market/Event Flow preservation.
  await page.locator('.match-row[data-match-id="'+id+'"]').evaluate(el=>el.click());
  const expanded=page.locator('.match-expanded[data-expanded-match]').last();
  await expanded.waitFor({state:'attached',timeout:15000});
  const expandedId=await expanded.getAttribute('data-expanded-match');
  await expanded.locator('[data-full-market-card]').waitFor({state:'attached',timeout:15000});
  await expanded.locator('.expand-flow-card').waitFor({state:'attached',timeout:15000});
  const topBefore=await rows.first().getAttribute('data-match-id');
  const extra=rows.nth(3);const extraId=await extra.getAttribute('data-match-id');
  await extra.locator('[data-b46-pin-v2]').evaluate(el=>el.click());
  await page.waitForTimeout(250);
  if(await expanded.getAttribute('data-expanded-match')!==expandedId)throw new Error('DESKTOP_EXPANDED_CHANGED');
  if(await rows.first().getAttribute('data-match-id')!==topBefore)throw new Error('DESKTOP_REORDER_WHILE_EXPANDED');
  if(await expanded.locator('[data-full-market-card]').count()!==1)throw new Error('DESKTOP_FULLMARKET_LOST');
  if(await expanded.locator('.expand-flow-card').count()!==1)throw new Error('DESKTOP_EVENTFLOW_LOST');

  await page.screenshot({path:'pinned-fixtures-v2-production/desktop-production.png',fullPage:false});
  console.log('DESKTOP_PROD_PASS=1 '+JSON.stringify({id,rowCenter:rowCy,starCenter:starCy,gap}));
  await ctx.close();
}

async function mobile(browser){
  const ctx=await browser.newContext({...devices['Pixel 7']});
  const page=await ctx.newPage();
  await page.goto('https://ball46.com/?pinv2-prod-qa=mobile-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  await page.waitForSelector('#b46gn-cards [data-b46gn-fixture] [data-b46-pin-mobile]',{state:'visible',timeout:90000});
  await page.evaluate(()=>window.BALL46_PIN_V2.clear());
  await page.waitForTimeout(400);

  let cards=page.locator('#b46gn-cards [data-b46gn-fixture]');
  if(await cards.count()<6)throw new Error('MOBILE_TOO_FEW_CARDS');
  const sample=cards.nth(1),body=sample.locator('.b46gn-cardbody'),star=sample.locator('[data-b46-pin-mobile]'),kit=sample.locator('.b46gn-team img').first();
  const [bb,sb,kb]=await Promise.all([body.boundingBox(),star.boundingBox(),kit.boundingBox()]);
  if(!bb||!sb||!kb)throw new Error('MOBILE_POSITION_BOX_MISSING');
  const bodyCy=bb.y+bb.height/2,starCy=sb.y+sb.height/2,gap=kb.x-(sb.x+sb.width);
  if(Math.abs(bodyCy-starCy)>3)throw new Error('MOBILE_STAR_NOT_CENTERED');
  if(gap<4)throw new Error('MOBILE_STAR_OVERLAP_'+gap);
  const z=await star.evaluate(el=>getComputedStyle(el).zIndex);
  if(z!=='auto')throw new Error('MOBILE_STAR_Z_'+z);

  const target=cards.nth(5),id=await target.getAttribute('data-b46gn-fixture');
  const syncFetch=await target.locator('[data-b46-pin-mobile]').evaluate(el=>{let n=0;const f=window.fetch;window.fetch=(...a)=>{n++;return f(...a)};try{el.click();return n}finally{window.fetch=f}});
  await page.waitForTimeout(450);
  if(syncFetch!==0)throw new Error('MOBILE_PIN_SYNC_FETCH_'+syncFetch);
  cards=page.locator('#b46gn-cards [data-b46gn-fixture]');
  if(await cards.first().getAttribute('data-b46gn-fixture')!==id)throw new Error('MOBILE_NOT_PINNED_TOP');
  if((await page.locator('#b46gn-detail').getAttribute('aria-hidden'))!=='true')throw new Error('MOBILE_STAR_OPENED_DETAIL');

  await page.screenshot({path:'pinned-fixtures-v2-production/mobile-production.png',fullPage:false});
  console.log('MOBILE_PROD_PASS=1 '+JSON.stringify({id,bodyCenter:bodyCy,starCenter:starCy,gap,z}));
  await ctx.close();
}

async function lifecycle(browser){
  const ctx=await browser.newContext({viewport:{width:1200,height:800}});
  await ctx.addInitScript(key=>localStorage.setItem(key,JSON.stringify(['__stale_fixture_should_prune__'])),KEY);
  const page=await ctx.newPage();
  await page.goto('https://ball46.com/?pinv2-prod-qa=lifecycle-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});
  await page.waitForTimeout(500);
  const ids=await page.evaluate(()=>window.BALL46_PIN_V2.getIds());
  if(ids.includes('__stale_fixture_should_prune__'))throw new Error('STALE_PIN_NOT_PRUNED');
  console.log('LIFECYCLE_PRUNE_PASS=1');
  await ctx.close();
}

const browser=await chromium.launch({headless:true});
try{
  await desktop(browser);
  await mobile(browser);
  await lifecycle(browser);
  console.log('PIN_V2_PRODUCTION_QA_PASS=1');
}finally{await browser.close()}
