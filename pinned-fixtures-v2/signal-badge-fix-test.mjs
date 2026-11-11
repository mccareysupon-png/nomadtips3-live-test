import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';

const DASH='/dashboard-v2-stage3-featured-facts-20261013a.js';
const VER='b46-screen-refresh-5s-20261104';

function patch(src){
  assert(src.includes('B46_PIN_V2_FRESH_20261111'),'PIN_V2_SOURCE_MISSING');
  const anchor="function b46PinPaint(row){if(!row)return;";
  const replacement=`function b46PinSignalBadge(row){const host=row?.querySelector?.('.signal-inline-stack[data-inline-signal-count]');if(!host)return;const n=Number(host.getAttribute('data-inline-signal-count'));let badge=host.querySelector(':scope > .b46-league-market-signal-count');if(!Number.isInteger(n)||n<=0){badge?.remove();return;}if(!badge){badge=document.createElement('span');badge.className='b46-league-market-signal-count';badge.innerHTML='<i aria-hidden="true"></i><b></b><span></span>';host.append(badge);}const number=String(n),label=n===1?'Signal':'Signals';if(badge.children[1].textContent!==number)badge.children[1].textContent=number;if(badge.children[2].textContent!==label)badge.children[2].textContent=label;badge.setAttribute('aria-label',number+' active '+label.toLowerCase())}
window.__B46_PIN_SIGNAL_BADGE_TEST=b46PinSignalBadge;
/* B46_PIN_V2_SIGNAL_BADGE_FIX_TEST_20261111 */
function b46PinPaint(row){if(!row)return;b46PinSignalBadge(row);`;
  const count=src.split(anchor).length-1;
  assert.equal(count,1,'PIN_PAINT_ANCHOR_COUNT_'+count);
  return src.replace(anchor,replacement);
}

async function run(label,opts){
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext(opts);
  const page=await ctx.newPage();

  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='ball46.com'&&u.pathname===DASH&&u.searchParams.get('v')===VER){
      const r=await route.fetch();
      const body=patch(await r.text());
      return route.fulfill({response:r,body,headers:{...r.headers(),'cache-control':'no-store'}});
    }
    return route.continue();
  });

  await page.goto('https://ball46.com/?pin-signal-fix-test='+label+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111'&&typeof window.__B46_PIN_SIGNAL_BADGE_TEST==='function',null,{timeout:90000});
  await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});

  // Unit-level DOM proof: same badge decorator must work without league-head.
  const unit=await page.evaluate(()=>{
    const row=document.createElement('article');
    row.className='match-row';
    row.innerHTML='<div class="signal-inline-stack" data-inline-signal-count="2"><div class="signal-cell"></div></div>';
    window.__B46_PIN_SIGNAL_BADGE_TEST(row);
    const badge=row.querySelector('.b46-league-market-signal-count');
    return badge?{text:badge.textContent.trim(),aria:badge.getAttribute('aria-label')}:null;
  });
  assert(unit,'UNIT_BADGE_NOT_CREATED');
  assert.equal(unit.aria,'2 active signals','UNIT_BADGE_ARIA');
  console.log(label+'_UNIT_BADGE_PASS=1 '+JSON.stringify(unit));

  // Real-signal integration when current live data has one.
  const real=page.locator('[data-board-sections] .match-row[data-match-id]').filter({has:page.locator('.signal-inline-stack[data-inline-signal-count]')});
  const count=await real.count();
  let testedReal=false;
  for(let i=0;i<count;i++){
    const row=real.nth(i);
    const n=Number(await row.locator('.signal-inline-stack').getAttribute('data-inline-signal-count'));
    if(!Number.isInteger(n)||n<=0)continue;
    const id=await row.getAttribute('data-match-id');
    await page.evaluate(()=>window.BALL46_PIN_V2.clear());
    await page.waitForTimeout(150);
    const before=await page.locator('.match-row[data-match-id="'+id+'"] .b46-league-market-signal-count').first().textContent().catch(()=>null);
    await page.locator('.match-row[data-match-id="'+id+'"] [data-b46-pin-v2]').click();
    await page.waitForTimeout(350);
    const moved=page.locator('[data-status-section="pinned"] .match-row[data-match-id="'+id+'"]');
    await moved.waitFor({state:'attached',timeout:5000});
    const hostCount=Number(await moved.locator('.signal-inline-stack').getAttribute('data-inline-signal-count'));
    const badge=moved.locator('.b46-league-market-signal-count');
    assert.equal(await badge.count(),1,'REAL_BADGE_MISSING_AFTER_PIN');
    const after=(await badge.textContent()||'').trim();
    assert.equal(hostCount,n,'REAL_SIGNAL_COUNT_CHANGED');
    assert(after.includes(String(n)),'REAL_BADGE_COUNT_TEXT_WRONG');
    console.log(label+'_REAL_SIGNAL_PIN_PASS=1 '+JSON.stringify({id,n,before,after}));
    testedReal=true;break;
  }
  if(!testedReal)console.log(label+'_REAL_SIGNAL_SKIPPED_NO_ACTIVE_SIGNAL=1');

  // No extra fetch caused synchronously by the helper itself.
  const delta=await page.evaluate(()=>{
    const row=document.createElement('article');row.innerHTML='<div class="signal-inline-stack" data-inline-signal-count="1"></div>';
    let n=0;const orig=window.fetch;window.fetch=(...a)=>{n++;return orig(...a)};
    try{window.__B46_PIN_SIGNAL_BADGE_TEST(row);return n}finally{window.fetch=orig}
  });
  assert.equal(delta,0,'BADGE_HELPER_API_DELTA_'+delta);
  console.log(label+'_API_DELTA_ON_BADGE='+delta);

  await browser.close();
}

await run('DESKTOP',{viewport:{width:1440,height:1000}});
await run('MOBILE',{...devices['Pixel 7']});
console.log('PIN_V2_SIGNAL_BADGE_FIX_TEST_PASS=1');
