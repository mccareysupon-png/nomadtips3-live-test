import {chromium,devices} from 'playwright';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,12);
const origin='https://ball46.com/';
const stage='https://ball46-mobile-favorites-stage-20261112.mccarey-supon.workers.dev/';
for (const [label,url] of [['origin',origin],['stage',stage]]){
 const r=await fetch(url+'?diagnostic='+Date.now(),{headers:{'cache-control':'no-cache'}});
 const html=await r.text();
 console.log('FETCH_'+label.toUpperCase()+'='+JSON.stringify({status:r.status,bytes:html.length,sha:hash(html),pin:html.includes('B46_PIN_V2_MOBILE_20261111'),stageMark:html.includes('B46_MOBILE_FAVORITES_OFF_STAGE_20261112'),mobileCards:html.includes('b46gn-cards'),scripts:(html.match(/<script/g)||[]).length,mobileSort:html.includes("window.BALL46_PIN_V2?.isPinned?.(x.id)"),inlineStars:html.includes('b46-pin-v2-mobile-runtime')}));
}
const browser=await chromium.launch({headless:true});
for (const [label,url] of [['origin',origin],['stage',stage]]){
 const ctx=await browser.newContext({...devices['Pixel 7']});
 const p=await ctx.newPage();
 const errors=[],badRequests=[];
 p.on('pageerror',e=>errors.push(e.stack?.slice(0,1200)||String(e)));
 p.on('requestfailed',r=>badRequests.push({url:r.url().slice(0,180),err:r.failure()?.errorText}));
 p.on('response',r=>{if(r.status()>=400&&badRequests.length<12)badRequests.push({url:r.url().slice(0,180),status:r.status()})});
 try {
  const r=await p.goto(url+'?diagbrowser='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForTimeout(8000);
  const d=await p.evaluate(()=>({
    title:document.title,
    cards:document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]').length,
    rows:document.querySelectorAll('.match-row[data-match-id]').length,
    pinLoaded:!!window.BALL46_PIN_V2,
    hasB46gn:!!document.querySelector('#b46gn-cards'),
    scripts:[...document.scripts].map(s=>({src:s.src?.slice(0,160),size:s.textContent?.length})).slice(-15)
  }));
  console.log('BROWSER_'+label.toUpperCase()+'='+JSON.stringify({http:r.status(),data:d,errors:errors.slice(0,8),badRequests:badRequests.slice(0,10)}));
 }catch(e){console.log('BROWSER_'+label.toUpperCase()+'_FAILED='+String(e))}
 await ctx.close();
}
await browser.close();
