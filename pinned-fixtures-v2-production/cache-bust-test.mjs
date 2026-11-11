import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';

const OLD='b46-screen-refresh-5s-20261104';
const NEW='b46-pin-v2-20261111';

async function run(label,opts){
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext(opts);
  const page=await ctx.newPage();
  let requestedNew=0;

  await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.hostname!=='ball46.com')return route.continue();

    if(req.resourceType()==='document'&&(u.pathname==='/'||u.pathname==='/index.html')){
      const r=await route.fetch();
      let html=await r.text();
      assert(html.includes(OLD),'OLD_VERSION_NOT_IN_HTML');
      html=html.replaceAll(OLD,NEW);
      return route.fulfill({response:r,body:html,headers:{...r.headers(),'cache-control':'no-store'}});
    }

    if(u.pathname==='/dashboard-v2-stage3-featured-facts-20261013a.js'&&u.searchParams.get('v')===NEW){
      requestedNew++;
      const old=new URL(req.url());
      old.searchParams.set('v',OLD);
      old.searchParams.set('pinv2-cache-bust-test',Date.now().toString());
      const r=await page.request.get(old.href,{headers:{'cache-control':'no-cache'}});
      const body=await r.text();
      assert(body.includes('B46_PIN_V2_FRESH_20261111'),'PIN_V2_MISSING_FROM_FRESH_DASHBOARD');
      return route.fulfill({status:r.status(),headers:r.headers(),body});
    }
    return route.continue();
  });

  await page.goto('https://ball46.com/?cache-bust-test='+label+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  const selector=label.startsWith('MOBILE')?'#b46gn-cards [data-b46-pin-mobile]':'[data-board-sections] [data-b46-pin-v2]';
  await page.waitForSelector(selector,{state:'visible',timeout:90000});
  assert(requestedNew>0,'NEW_VERSION_NOT_REQUESTED');
  const star=await page.locator(selector).first().evaluate(el=>({text:el.textContent,visible:!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)}));
  assert(star.visible&&['☆','★'].includes(star.text),'STAR_NOT_VISIBLE');
  console.log(label+'_CACHE_BUST_PASS=1 '+JSON.stringify({requestedNew,star}));
  await browser.close();
}
await run('DESKTOP',{viewport:{width:1440,height:1000}});
await run('MOBILE',{...devices['Pixel 7']});
console.log('PIN_V2_CACHE_BUST_TEST_PASS=1');
