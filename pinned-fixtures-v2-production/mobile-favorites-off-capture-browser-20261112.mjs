// Current public production page capture via real browser only.
// Read-only GET: no login, writes, credentials, or production deployment.
import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const file=process.argv[2]||'tmp-mobile-favorites-current/live-browser-root.html';
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({...devices['Pixel 7']});
  const page=await context.newPage();
  const result=await page.goto('https://ball46.com/?mobile_stage_capture='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  assert(result&&result.ok(),'PUBLIC_PRODUCTION_BROWSER_HTML_NOT_200');
  const html=await result.text();
  for (const marker of [
    'B46_PIN_V2_MOBILE_20261111',
    'b46-pin-v2-mobile-runtime',
    'window.BALL46_PIN_V2?.isPinned?.(x.id)',
    'b46gn-cards',
    '</head>',
    '</body>'
  ]) assert(html.includes(marker),'PRODUCTION_HTML_MARKER_MISSING_'+marker);
  assert(html.length>300000,'UNEXPECTED_OLD_OR_TRUNCATED_BROWSER_HTML');
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,html);
  console.log('LIVE_BROWSER_CAPTURE_HTTP='+result.status());
  console.log('LIVE_BROWSER_CAPTURE_BYTES='+html.length);
  console.log('LIVE_BROWSER_CAPTURE_HAS_REAL_MOBILE_UI=1');
}finally{await browser.close()}
