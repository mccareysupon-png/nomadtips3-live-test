import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';

function patch(html){
  assert(html.includes('function cardHtml(f)'),'CARDHTML_MISSING');
  assert(html.includes('b46-pin-v2-mobile-runtime'),'PIN_RUNTIME_MISSING');

  const timed="const timed=live?time:finished?'FT':time;";
  const timedNew="const timed=live?time:finished?'FT':time;const pin=!!window.BALL46_PIN_V2?.isPinned?.(f.id);";
  assert.equal(html.split(timed).length-1,1,'TIMED_ANCHOR_COUNT');
  html=html.replace(timed,timedNew);

  const body='<div class="b46gn-cardbody">';
  const bodyNew='<div class="b46gn-cardbody"><span class="b46-pin-v2-mobile" data-b46-pin-mobile="${esc(f.id)}" data-on="${pin?\'1\':\'0\'}" role="button" tabindex="0" aria-label="${pin?\'Unpin match\':\'Pin match to top\'}">${pin?\'★\':\'☆\'}</span>';
  assert(html.includes(body),'BODY_ANCHOR_MISSING');
  html=html.replace(body,bodyNew);

  const re=/<script id="b46-pin-v2-mobile-runtime">[\s\S]*?<\/script>/;
  assert(re.test(html),'RUNTIME_SCRIPT_MISSING');
  const runtime=`<script id="b46-pin-v2-mobile-runtime">(()=>{'use strict';/* B46_PIN_V2_MOBILE_NATIVE_STAR_20261112 */
function bind(){
 if(document.documentElement.dataset.b46PinV2MobileNativeBound==='1')return;
 document.documentElement.dataset.b46PinV2MobileNativeBound='1';
 document.addEventListener('click',e=>{
   const s=e.target.closest?.('[data-b46-pin-mobile]');
   if(!s)return;
   e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
   window.BALL46_PIN_V2?.toggle?.(s.dataset.b46PinMobile);
 },true);
 document.addEventListener('keydown',e=>{
   const s=e.target.closest?.('[data-b46-pin-mobile]');
   if(!s||!(e.key==='Enter'||e.key===' '))return;
   e.preventDefault();e.stopPropagation();
   window.BALL46_PIN_V2?.toggle?.(s.dataset.b46PinMobile);
 },true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();</script>`;
  html=html.replace(re,runtime);

  assert(html.includes('B46_PIN_V2_MOBILE_NATIVE_STAR_20261112'),'NATIVE_MARKER_MISSING');
  assert(!/b46-pin-v2-mobile-runtime[\s\S]{0,2500}MutationObserver/.test(html),'STAR_RUNTIME_OBSERVER_STILL_PRESENT');
  assert(!/b46-pin-v2-mobile-runtime[\s\S]{0,2500}function paint/.test(html),'STAR_RUNTIME_PAINT_STILL_PRESENT');
  return html;
}

const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CF_ENV_MISSING');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_API_ERROR');return j.result}
const dep=await cf('/scripts/'+SCRIPT+'/deployments?per_page=5');
const active=dep.deployments?.[0]?.versions?.[0]?.version_id;
const ver=await cf('/workers/'+SCRIPT+'/versions/'+active+'?include=modules');
const asset=ver.modules.find(m=>m.name==='assets/index.html');assert(asset,'ACTIVE_ASSET_MISSING');
const activeHtml=Buffer.from(asset.content_base64,'base64').toString('utf8');
console.log('ACTIVE_SOURCE_VERSION='+active);

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({...devices['Pixel 7']});
const page=await ctx.newPage();

await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='ball46.com'&&(u.pathname==='/'||u.pathname==='/index.html')){
    const body=patch(activeHtml);
    return route.fulfill({status:200,contentType:'text/html',body,headers:{'cache-control':'no-store'}});
  }
  return route.continue();
});

await page.goto('https://ball46.com/?native-star-test='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
await page.waitForSelector('#b46gn-cards [data-b46gn-fixture] [data-b46-pin-mobile]',{state:'visible',timeout:90000});
await page.evaluate(()=>window.BALL46_PIN_V2.clear());
await page.waitForTimeout(400);

const snapshot=()=>page.evaluate(()=>{
  const cards=[...document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]')];
  const stars=[...document.querySelectorAll('#b46gn-cards [data-b46-pin-mobile]')];
  return {
    cards:cards.length,
    stars:stars.length,
    allNative:cards.every(c=>c.querySelector(':scope .b46gn-cardbody > [data-b46-pin-mobile]')),
    runtimeObserver:document.querySelector('#b46-pin-v2-mobile-runtime')?.textContent?.includes('MutationObserver')||false,
    runtimePaint:document.querySelector('#b46-pin-v2-mobile-runtime')?.textContent?.includes('function paint')||false
  };
});

const before=await snapshot();
assert(before.cards>0,'NO_CARDS');
assert.equal(before.stars,before.cards,'STAR_CARD_COUNT_MISMATCH');
assert(before.allNative,'STAR_NOT_NATIVE_CHILD');
assert.equal(before.runtimeObserver,false,'RUNTIME_OBSERVER_PRESENT');
assert.equal(before.runtimePaint,false,'RUNTIME_PAINT_PRESENT');

const star=page.locator('#b46gn-cards [data-b46gn-fixture] [data-b46-pin-mobile]').first();
const card=star.locator('xpath=ancestor::*[@data-b46gn-fixture][1]');
const id=await card.getAttribute('data-b46gn-fixture');
assert(id,'NO_FIXTURE_ID');

const hit=await star.evaluate(el=>{
  const r=el.getBoundingClientRect(), top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2), cs=getComputedStyle(el);
  return {same:top===el||el.contains(top),w:r.width,h:r.height,z:cs.zIndex,color:cs.color,pe:cs.pointerEvents};
});
assert(hit.same,'STAR_NOT_TOP');
assert(hit.w>=30&&hit.h>=30,'STAR_HIT_SMALL');
assert(/49, 212, 163/.test(hit.color),'STAR_NOT_GREEN');

const detail=page.locator('#b46gn-detail');
const detailBefore=await detail.getAttribute('aria-hidden').catch(()=>null);

await star.tap();
await page.waitForTimeout(450);
assert.equal(await page.evaluate(id=>window.BALL46_PIN_V2.isPinned(id),id),true,'PIN_FAILED');

const moved=page.locator('#b46gn-cards [data-b46gn-fixture="'+id+'"] [data-b46-pin-mobile]').first();
await moved.waitFor({state:'visible',timeout:5000});
assert.equal((await moved.textContent())?.trim(),'★','PIN_STAR_NOT_FILLED');

const detailAfter=await detail.getAttribute('aria-hidden').catch(()=>null);
assert(detailAfter==='true'||detailAfter===detailBefore,'DETAIL_OPENED_ON_STAR');

await moved.tap();
await page.waitForTimeout(450);
assert.equal(await page.evaluate(id=>window.BALL46_PIN_V2.isPinned(id),id),false,'UNPIN_FAILED');

// Stress renderer: repeated native refreshes and forced schedule calls.
for(let i=0;i<30;i++){
  await page.evaluate(()=>window.__BALL46_GREEN_NOIR?.refresh?.());
  await page.waitForTimeout(60);
  const s=await snapshot();
  assert.equal(s.stars,s.cards,'STAR_LOST_DURING_REFRESH_'+i);
  assert(s.allNative,'NON_NATIVE_STAR_AFTER_REFRESH_'+i);
}

// Sample continuously across 5s live-refresh window.
const samples=[];
for(let i=0;i<60;i++){
  await page.waitForTimeout(100);
  const s=await snapshot();
  samples.push(s);
  assert.equal(s.stars,s.cards,'STAR_BLINK_SAMPLE_'+i);
}

console.log('NATIVE_STAR_CARD_COUNT_PASS=1 '+JSON.stringify(before));
console.log('NATIVE_STAR_HIT_PASS=1 '+JSON.stringify(hit));
console.log('NATIVE_STAR_PIN_PASS=1');
console.log('NATIVE_STAR_UNPIN_PASS=1');
console.log('NATIVE_STAR_DETAIL_GUARD_PASS=1');
console.log('NATIVE_STAR_REFRESH_STRESS_PASS=1');
console.log('NATIVE_STAR_NO_OBSERVER_LOOP_PASS=1');
console.log('NATIVE_STAR_FIX_TEST_PASS=1');

await page.screenshot({path:'pinned-fixtures-v2-production/mobile-native-star-test.png',fullPage:false});
await browser.close();
