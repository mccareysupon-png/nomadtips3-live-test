import assert from'node:assert/strict';
import{createHash}from'node:crypto';
import{chromium}from'playwright-core';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const wanted='a456929a-3350-4376-ad8a-65da47c04291';
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{authorization:'Bearer '+T},signal:AbortSignal.timeout(40000)}),j=await r.json();
assert.equal(j.success,true);assert.deepEqual(j.result.deployments[0].versions,[{version_id:wanted,percentage:100}]);
const sha=x=>createHash('sha256').update(x).digest('hex'),paths={'/':'8ba4fec5f99a16ed363e747f0cac5b4c6d0289f17173962d30be19566844fdc7','/dashboard-v2-stage3-featured-facts-20261013a.js':'e4d2e2147d396e50a5515c9129683cde6ca991ecc4ee5396597504a4a5e571e4'};
for(const host of['https://ball46.com','https://www.ball46.com'])for(const [p,h]of Object.entries(paths)){
 const z=await fetch(host+p+'?independentCornerCheck='+Date.now(),{signal:AbortSignal.timeout(35000)}),b=Buffer.from(await z.arrayBuffer());
 assert.equal(z.status,200);assert.equal(sha(b),h,'WRONG_PRODUCTION_ASSET_'+p);
}
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const views=[];
try{
 for(const d of[{name:'desktop',width:1366,height:768},{name:'mobile',width:390,height:844}]){
  const page=await browser.newPage({viewport:{width:d.width,height:d.height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const nav=await page.goto('https://ball46.com/?verifyFeaturedCorner='+Date.now(),{waitUntil:'domcontentloaded',timeout:65000});
  assert.equal(nav.status(),200);
  await page.waitForTimeout(6500);
  const info=await page.evaluate(()=>({hasFeatured:!!document.querySelector('.featured-card[data-featured]'),newScript:!!document.querySelector('script[src*="entry-corners-20261024"]'),hasBody:document.body.innerText.length>300,cornersShowing:[...document.querySelectorAll('.feature-signal-meta')].map(x=>x.innerText).filter(x=>x.includes('Entry Corners')).slice(0,5)}));
  assert(info.hasFeatured&&info.newScript&&info.hasBody,d.name+'_NO_FEATURED_SCRIPT');
  assert.deepEqual(errors,[],d.name+'_SCRIPT_ERRORS');
  views.push({name:d.name,...info});
  await page.close();
 }
}finally{await browser.close()}
console.log('B46_CORNER_FINAL_VERIFIED='+JSON.stringify({at:new Date().toISOString(),workerVersion:wanted,domains:2,paths:Object.keys(paths),views,ok:true}));
