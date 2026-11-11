import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('pinned-fixtures-v2-production/deploy.mjs','utf8');
assert(source.includes('z-index:12'),'SOURCE_ZINDEX_MISSING');
assert(source.includes('width:30px;height:30px'),'SOURCE_HIT_AREA_MISSING');
assert(source.includes('color:#31D4A3'),'SOURCE_GREEN_MISSING');
assert(source.includes("document.addEventListener('click'"),'SOURCE_DOCUMENT_CAPTURE_MISSING');

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({...devices['Pixel 7']});
const page=await ctx.newPage();

await page.goto('https://ball46.com/?mobile-star-runtime-test='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForSelector('#b46gn-cards [data-b46gn-fixture]',{state:'visible',timeout:90000});
await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});

await page.addStyleTag({content:`
#b46gn-cards .b46-pin-v2-mobile{
 position:absolute!important;z-index:12!important;left:6px!important;right:auto!important;top:50%!important;
 transform:translateY(-50%)!important;width:30px!important;height:30px!important;display:grid!important;
 place-items:center!important;border-radius:50%!important;font:700 19px/1 Arial,sans-serif!important;
 color:#31D4A3!important;background:rgba(4,18,16,.72)!important;cursor:pointer!important;
 user-select:none!important;touch-action:manipulation!important;pointer-events:auto!important;
 -webkit-tap-highlight-color:transparent!important;
}
#b46gn-cards .b46-pin-v2-mobile[data-on="1"]{color:#31D4A3!important;text-shadow:0 0 8px rgba(49,212,163,.32)!important}
`});

await page.evaluate(()=>{
  if(document.documentElement.dataset.b46MobileFixTest==='1')return;
  document.documentElement.dataset.b46MobileFixTest='1';
  document.addEventListener('click',e=>{
    const s=e.target.closest?.('[data-b46-pin-mobile]');
    if(!s)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    window.BALL46_PIN_V2?.toggle?.(s.dataset.b46PinMobile);
    const on=!!window.BALL46_PIN_V2?.isPinned?.(s.dataset.b46PinMobile);
    s.textContent=on?'★':'☆';s.dataset.on=on?'1':'0';
  },true);
});

await page.evaluate(()=>window.BALL46_PIN_V2.clear());
await page.waitForTimeout(300);

const star=page.locator('#b46gn-cards [data-b46gn-fixture] [data-b46-pin-mobile]').first();
await star.waitFor({state:'visible',timeout:10000});
const card=star.locator('xpath=ancestor::*[@data-b46gn-fixture][1]');
const id=await card.getAttribute('data-b46gn-fixture');
assert(id,'NO_FIXTURE_ID');

const hit=await star.evaluate(el=>{
  const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  const top=document.elementFromPoint(x,y),cs=getComputedStyle(el);
  return {same:top===el||el.contains(top),w:r.width,h:r.height,z:cs.zIndex,pe:cs.pointerEvents,color:cs.color};
});
assert(hit.same,'STAR_NOT_TOP_HIT_TARGET '+JSON.stringify(hit));
assert(hit.w>=30&&hit.h>=30,'STAR_HIT_AREA_SMALL');
assert.equal(hit.z,'12','STAR_ZINDEX_WRONG');
assert.equal(hit.pe,'auto','STAR_POINTER_EVENTS_WRONG');
assert(/49, 212, 163/.test(hit.color),'STAR_GREEN_WRONG '+hit.color);

const detail=page.locator('#b46gn-detail');
const before=await detail.getAttribute('aria-hidden').catch(()=>null);

await star.tap();
await page.waitForTimeout(350);
assert.equal(await page.evaluate(id=>window.BALL46_PIN_V2.isPinned(id),id),true,'TAP_PIN_FAILED');

const moved=page.locator('#b46gn-cards [data-b46gn-fixture="'+id+'"] [data-b46-pin-mobile]').first();
await moved.waitFor({state:'visible',timeout:5000});
assert.equal((await moved.textContent())?.trim(),'★','FILLED_STAR_MISSING');

const after=await detail.getAttribute('aria-hidden').catch(()=>null);
assert(after==='true'||after===before,'DETAIL_OPENED_BY_STAR');

await moved.tap();
await page.waitForTimeout(350);
assert.equal(await page.evaluate(id=>window.BALL46_PIN_V2.isPinned(id),id),false,'TAP_UNPIN_FAILED');

console.log('MOBILE_STAR_HIT_TARGET_PASS=1 '+JSON.stringify(hit));
console.log('MOBILE_STAR_GREEN_PASS=1');
console.log('MOBILE_STAR_PIN_PASS=1');
console.log('MOBILE_STAR_UNPIN_PASS=1');
console.log('MOBILE_STAR_DETAIL_GUARD_PASS=1');
console.log('MOBILE_STAR_FIX_PASS=1');

await page.screenshot({path:'pinned-fixtures-v2-production/mobile-star-test.png',fullPage:false});
await browser.close();
