import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';

function patchHtml(html){
  const guard="const row=block.querySelector(':scope > .match-row'),head=block.querySelector(':scope > .league-head');if(!row||!head)continue;const box=row.getBoundingClientRect();if(!box.width||!box.height)continue;";
  const badgeLoop="for(const r of block.querySelectorAll(':scope > .match-row')){if(r.dataset.b46MarketCompact!=='1'){const h=r.getBoundingClientRect().height;if(!h)continue;r.style.setProperty('--b46-league-market-row-height',h+'px');r.dataset.b46MarketCompact='1';}const host=r.querySelector('.signal-inline-stack');if(!host)continue;const n=Number(host.dataset.inlineSignalCount);let badge=host.querySelector(':scope > .b46-league-market-signal-count');if(!Number.isInteger(n)||n<=0){badge?.remove();continue;}if(!badge){badge=document.createElement('span');badge.className='b46-league-market-signal-count';badge.innerHTML='<i aria-hidden=\"true\"></i><b></b><span></span>';host.append(badge);}const number=String(n),label=n===1?'Signal':'Signals';if(badge.children[1].textContent!==number)badge.children[1].textContent=number;if(badge.children[2].textContent!==label)badge.children[2].textContent=label;const accessible=number+' active '+label.toLowerCase();if(badge.getAttribute('aria-label')!==accessible)badge.setAttribute('aria-label',accessible);}";

  const replacement="const row=block.querySelector(':scope > .match-row'),head=block.querySelector(':scope > .league-head');if(!row)continue;const box=row.getBoundingClientRect();if(!box.width||!box.height)continue;if(!head){"+badgeLoop+"continue;}";
  const n=html.split(guard).length-1;
  assert.equal(n,1,'LEAGUE_HEAD_GUARD_COUNT_'+n);
  const out=html.replace(guard,replacement);
  assert(out.includes("if(!head){"+badgeLoop+"continue;}"),'TEST_PATCH_MISSING');
  return out;
}

async function installPatch(page){
  await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(req.resourceType()==='document'&&u.hostname==='ball46.com'&&(u.pathname==='/'||u.pathname==='/index.html')){
      const r=await route.fetch();
      const html=patchHtml(await r.text());
      return route.fulfill({response:r,body:html,headers:{...r.headers(),'cache-control':'no-store'}});
    }
    return route.continue();
  });
}

async function findSignalDesktopRow(page){
  await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});
  for(let attempt=0;attempt<30;attempt++){
    const rows=page.locator('[data-board-sections] .match-row[data-match-id]');
    for(let i=0;i<await rows.count();i++){
      const row=rows.nth(i);
      const host=row.locator('.signal-inline-stack[data-inline-signal-count]');
      if(await host.count()){
        const n=Number(await host.getAttribute('data-inline-signal-count'));
        if(Number.isInteger(n)&&n>0)return {row,id:await row.getAttribute('data-match-id'),count:n};
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error('NO_SIGNAL_FIXTURE_AVAILABLE');
}

async function desktop(browser){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await ctx.newPage();await installPatch(page);
  await page.goto('https://ball46.com/?signal-pin-test=desktop-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  await page.evaluate(()=>window.BALL46_PIN_V2.clear());
  const found=await findSignalDesktopRow(page);
  await page.waitForTimeout(300);

  const sel='.match-row[data-match-id="'+found.id+'"]';
  const before=await page.locator(sel).evaluate(el=>({
    status:el.closest('[data-status-section]')?.getAttribute('data-status-section'),
    inline:Number(el.querySelector('.signal-inline-stack')?.dataset.inlineSignalCount||0),
    badge:el.querySelector('.b46-league-market-signal-count')?.textContent?.trim()||'',
    badgeLabel:el.querySelector('.b46-league-market-signal-count')?.getAttribute('aria-label')||''
  }));
  assert.equal(before.inline,found.count,'DESKTOP_BEFORE_INLINE_COUNT');
  assert(before.badge,'DESKTOP_BADGE_MISSING_BEFORE_PIN');

  await page.locator(sel+' [data-b46-pin-v2]').click();
  await page.waitForTimeout(500);

  const after=await page.locator(sel).evaluate(el=>({
    status:el.closest('[data-status-section]')?.getAttribute('data-status-section'),
    inline:Number(el.querySelector('.signal-inline-stack')?.dataset.inlineSignalCount||0),
    badge:el.querySelector('.b46-league-market-signal-count')?.textContent?.trim()||'',
    badgeLabel:el.querySelector('.b46-league-market-signal-count')?.getAttribute('aria-label')||''
  }));
  assert.equal(after.status,'pinned','DESKTOP_NOT_MOVED_TO_FAVORITE');
  assert.equal(after.inline,before.inline,'DESKTOP_SIGNAL_COUNT_CHANGED');
  assert.equal(after.badge,before.badge,'DESKTOP_SIGNAL_BADGE_TEXT_CHANGED');
  assert.equal(after.badgeLabel,before.badgeLabel,'DESKTOP_SIGNAL_BADGE_LABEL_CHANGED');

  const apiDelta=await page.locator(sel+' [data-b46-pin-v2]').evaluate(el=>{let n=0;const f=window.fetch;window.fetch=(...a)=>{n++;return f(...a)};try{el.click();return n}finally{window.fetch=f}});
  assert.equal(apiDelta,0,'DESKTOP_UNPIN_ADDED_API');

  await page.screenshot({path:'pinned-fixtures-v2-production/signal-preserve-desktop.png',fullPage:false});
  console.log('DESKTOP_SIGNAL_PRESERVE_PASS=1 '+JSON.stringify({id:found.id,before,after}));
  await ctx.close();
}

async function mobile(browser){
  const ctx=await browser.newContext({...devices['Pixel 7']});
  const page=await ctx.newPage();await installPatch(page);
  await page.goto('https://ball46.com/?signal-pin-test=mobile-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  await page.evaluate(()=>window.BALL46_PIN_V2.clear());
  const found=await findSignalDesktopRow(page);
  await page.waitForSelector('#b46gn-cards [data-b46gn-fixture="'+found.id+'"]',{state:'attached',timeout:30000});
  await page.waitForTimeout(500);

  const cardSel='#b46gn-cards [data-b46gn-fixture="'+found.id+'"]';
  const beforeText=(await page.locator(cardSel+' .b46gn-live').textContent()||'').trim();
  assert(/signal/i.test(beforeText),'MOBILE_SIGNAL_INDICATOR_MISSING_BEFORE_PIN_'+beforeText);

  await page.locator(cardSel+' [data-b46-pin-mobile]').click({force:true});
  await page.waitForTimeout(600);

  const afterText=(await page.locator(cardSel+' .b46gn-live').textContent()||'').trim();
  assert(/signal/i.test(afterText),'MOBILE_SIGNAL_INDICATOR_MISSING_AFTER_PIN_'+afterText);
  assert.equal(afterText,beforeText,'MOBILE_SIGNAL_INDICATOR_CHANGED');

  const desktopSource=await page.locator('.match-row[data-match-id="'+found.id+'"]').evaluate(el=>({
    status:el.closest('[data-status-section]')?.getAttribute('data-status-section'),
    inline:Number(el.querySelector('.signal-inline-stack')?.dataset.inlineSignalCount||0),
    badge:el.querySelector('.b46-league-market-signal-count')?.textContent?.trim()||''
  }));
  assert.equal(desktopSource.status,'pinned','MOBILE_SOURCE_NOT_PINNED');
  assert.equal(desktopSource.inline,found.count,'MOBILE_SOURCE_SIGNAL_COUNT_CHANGED');
  assert(desktopSource.badge,'MOBILE_SOURCE_DESKTOP_BADGE_MISSING');

  await page.screenshot({path:'pinned-fixtures-v2-production/signal-preserve-mobile.png',fullPage:false});
  console.log('MOBILE_SIGNAL_PRESERVE_PASS=1 '+JSON.stringify({id:found.id,beforeText,afterText,desktopSource}));
  await ctx.close();
}

const browser=await chromium.launch({headless:true});
try{
  await desktop(browser);
  await mobile(browser);
  console.log('PIN_V2_SIGNAL_PRESERVE_TEST_PASS=1');
}finally{await browser.close()}
