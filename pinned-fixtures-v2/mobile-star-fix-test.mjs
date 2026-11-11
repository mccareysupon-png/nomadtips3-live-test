import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';

const NEW_GREEN='#31d4a3';

function patchHtml(html){
  assert(html.includes('B46_PIN_V2_MOBILE_20261111'),'MOBILE_PIN_V2_MISSING');
  html=html.replace(
    '#b46gn-cards .b46-pin-v2-mobile{position:absolute;z-index:auto;left:8px;right:auto;top:50%;transform:translateY(-50%);width:22px;height:22px;display:grid;place-items:center;border-radius:50%;font:700 18px/1 Arial,sans-serif;color:#d4a900;background:rgba(4,18,16,.58);cursor:pointer;user-select:none;touch-action:manipulation}',
    '#b46gn-cards .b46-pin-v2-mobile{position:absolute;z-index:12;left:6px;right:auto;top:50%;transform:translateY(-50%);width:30px;height:30px;display:grid;place-items:center;border-radius:50%;font:700 19px/1 Arial,sans-serif;color:#31D4A3;background:rgba(4,18,16,.72);cursor:pointer;user-select:none;touch-action:manipulation;pointer-events:auto!important;-webkit-tap-highlight-color:transparent}'
  );
  html=html.replace(
    '#b46gn-cards .b46-pin-v2-mobile[data-on="1"]{color:#f2c94c;text-shadow:0 0 8px rgba(242,201,76,.28)}',
    '#b46gn-cards .b46-pin-v2-mobile[data-on="1"]{color:#31D4A3;text-shadow:0 0 8px rgba(49,212,163,.32)}'
  );
  html=html.replace(
    "function bind(){const r=document.querySelector('#b46gn-results');if(!r||r.dataset.b46PinV2Bound==='1')return false;r.dataset.b46PinV2Bound='1';r.addEventListener('click',e=>{const s=e.target.closest('[data-b46-pin-mobile]');if(!s)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();window.BALL46_PIN_V2?.toggle?.(s.dataset.b46PinMobile);requestAnimationFrame(paint)},true);",
    "function bind(){const r=document.querySelector('#b46gn-results');if(!r||document.documentElement.dataset.b46PinV2MobileBound==='1')return false;document.documentElement.dataset.b46PinV2MobileBound='1';document.addEventListener('click',e=>{const s=e.target.closest?.('[data-b46-pin-mobile]');if(!s)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();window.BALL46_PIN_V2?.toggle?.(s.dataset.b46PinMobile);requestAnimationFrame(paint)},true);"
  );
  html=html.replace(
    "s.setAttribute('aria-label',on?'Unpin match':'Pin match to top')",
    "s.setAttribute('aria-label',on?'Unpin match':'Pin match to top');s.setAttribute('role','button');s.tabIndex=0"
  );
  html=html.replace(
    "document.addEventListener('ball46:pin-v2',()=>requestAnimationFrame(paint));paint();return true}",
    "document.addEventListener('keydown',e=>{const s=e.target.closest?.('[data-b46-pin-mobile]');if(!s||!(e.key==='Enter'||e.key===' '))return;e.preventDefault();e.stopPropagation();window.BALL46_PIN_V2?.toggle?.(s.dataset.b46PinMobile);requestAnimationFrame(paint)},true);document.addEventListener('ball46:pin-v2',()=>requestAnimationFrame(paint));paint();return true}"
  );
  assert(html.includes('z-index:12'),'ZINDEX_PATCH_MISSING');
  assert(html.includes('color:#31D4A3'),'GREEN_PATCH_MISSING');
  assert(html.includes("document.addEventListener('click'"),'DOCUMENT_CAPTURE_MISSING');
  return html;
}

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({...devices['Pixel 7']});
const page=await ctx.newPage();

let detailOpened=0;
page.on('console',msg=>{ if(msg.text().includes('MOBILE_STAR_TEST')) console.log(msg.text()); });

await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='ball46.com'&&(u.pathname==='/'||u.pathname==='/index.html')){
    const r=await route.fetch();
    const body=patchHtml(await r.text());
    return route.fulfill({response:r,body,headers:{...r.headers(),'cache-control':'no-store'}});
  }
  return route.continue();
});

await page.goto('https://ball46.com/?mobile-star-fix-test='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
await page.waitForSelector('#b46gn-cards [data-b46gn-fixture] [data-b46-pin-mobile]',{state:'visible',timeout:90000});
await page.evaluate(()=>window.BALL46_PIN_V2.clear());
await page.waitForTimeout(500);

const star=page.locator('#b46gn-cards [data-b46gn-fixture] [data-b46-pin-mobile]').first();
const card=star.locator('xpath=ancestor::*[@data-b46gn-fixture][1]');
const id=await card.getAttribute('data-b46gn-fixture');
assert(id,'FIXTURE_ID_MISSING');

const hit=await star.evaluate(el=>{
  const r=el.getBoundingClientRect();
  const x=r.left+r.width/2,y=r.top+r.height/2;
  const top=document.elementFromPoint(x,y);
  const cs=getComputedStyle(el);
  return {
    same:top===el||el.contains(top),
    topTag:top?.tagName,
    topClass:top?.className,
    color:cs.color,
    zIndex:cs.zIndex,
    pointerEvents:cs.pointerEvents,
    w:r.width,h:r.height
  };
});
assert(hit.same,'STAR_NOT_TOP_HIT_TARGET '+JSON.stringify(hit));
assert.equal(hit.zIndex,'12','STAR_ZINDEX');
assert.equal(hit.pointerEvents,'auto','STAR_POINTER_EVENTS');
assert(Math.round(hit.w)>=30&&Math.round(hit.h)>=30,'STAR_HIT_AREA_TOO_SMALL');
assert(/49, 212, 163/.test(hit.color),'STAR_NOT_LOGO_GREEN '+hit.color);

const detail=page.locator('#b46gn-detail');
const beforeHidden=await detail.getAttribute('aria-hidden').catch(()=>null);

await star.tap();
await page.waitForTimeout(500);

assert(window !== undefined);
const state=await page.evaluate(id=>({
  pinned:window.BALL46_PIN_V2.isPinned(id),
  stored:window.BALL46_PIN_V2.getIds().includes(id)
}),id);
assert(state.pinned&&state.stored,'TAP_DID_NOT_PIN');

const movedStar=page.locator('#b46gn-cards [data-b46gn-fixture="'+id+'"] [data-b46-pin-mobile]').first();
await movedStar.waitFor({state:'visible',timeout:5000});
assert.equal((await movedStar.textContent())?.trim(),'★','FILLED_STAR_NOT_PAINTED');

const afterHidden=await detail.getAttribute('aria-hidden').catch(()=>null);
assert(afterHidden==='true'||afterHidden===beforeHidden,'DETAIL_OPENED_FROM_STAR_TAP');

await movedStar.tap();
await page.waitForTimeout(400);
assert.equal(await page.evaluate(id=>window.BALL46_PIN_V2.isPinned(id),id),false,'SECOND_TAP_DID_NOT_UNPIN');
assert.equal((await page.locator('#b46gn-cards [data-b46gn-fixture="'+id+'"] [data-b46-pin-mobile]').first().textContent())?.trim(),'☆','OUTLINE_STAR_NOT_RESTORED');

console.log('MOBILE_STAR_TOP_HIT_TARGET=1 '+JSON.stringify(hit));
console.log('MOBILE_STAR_TAP_PIN_PASS=1');
console.log('MOBILE_STAR_TAP_UNPIN_PASS=1');
console.log('MOBILE_STAR_DETAIL_GUARD_PASS=1');
console.log('MOBILE_STAR_GREEN_PASS=1 '+NEW_GREEN);
console.log('MOBILE_STAR_FIX_TEST_PASS=1');

await page.screenshot({path:'pinned-fixtures-v2/mobile-star-green-fix.png',fullPage:false});
await browser.close();
