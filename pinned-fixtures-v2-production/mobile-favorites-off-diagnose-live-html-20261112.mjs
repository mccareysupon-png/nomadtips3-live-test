import {chromium,devices} from 'playwright';
const origin='https://ball46.com/';
const stage='https://ball46-mobile-favorites-stage-20261112.mccarey-supon.workers.dev/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({...devices['Pixel 7']});
const resp=await page.goto(origin+'?livehtmlsource='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
const html=await resp.text();
console.log('LIVE_BROWSER_HTML_STATUS='+resp.status()+' LENGTH='+html.length);
const marks=[
 'B46_PIN_V2_MOBILE_20261111',
 'B46_PIN_V2_MOBILE_RUNTIME_20261111',
 'b46-pin-v2-mobile-runtime',
 'B46_PIN_V2_FRESH_20261111',
 'const all=visibleRows()',
 'const signature=ordered.map',
 "document.addEventListener('ball46:pin-v2',schedule)",
 'B46_PIN_V2_MOBILE_TAP_GREEN_20261112',
 'B46_PIN_V2_INSTANT_STAR_20261112',
 'window.BALL46_PIN_V2?.isPinned?.(x.id)',
 'id="b46gn-results"',
 'b46gn-cards'
];
for(const mark of marks){const idx=html.indexOf(mark);console.log('MARK '+JSON.stringify(mark)+' '+idx+(idx>=0?' CONTEXT='+JSON.stringify(html.slice(Math.max(0,idx-230),idx+330)):' '))}
for(const path of ['/statistics.html','/settings.html','/b46-visual-suite-20261030.js','/api/engine/board']){
  for(const [label,host] of [['origin',origin],['stage',stage]]){
    try {const r=await fetch(host+path+'?probe='+Date.now());console.log('GET '+label+' '+path+' '+r.status+' '+r.headers.get('content-type'))}
    catch(e){console.log('GET '+label+' '+path+' ERROR '+String(e).slice(0,130))}
  }
}
await browser.close();
