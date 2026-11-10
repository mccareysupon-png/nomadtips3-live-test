import {chromium,devices} from 'playwright';
async function test(label,ctxOptions){
 const browser=await chromium.launch({headless:true});const ctx=await browser.newContext(ctxOptions);const page=await ctx.newPage();
 const calls=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/full-market/'))calls.push({url:r.url(),time:Date.now()})});
 await page.goto('https://ball46.com/?lazyprodqa='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{timeout:90000});
 const rows=page.locator('[data-board-sections] .match-row[data-match-id]');let expanded=null;
 for(let i=0;i<Math.min(await rows.count(),15);i++){const row=rows.nth(i);await row.scrollIntoViewIfNeeded();await row.click({timeout:10000}).catch(()=>{});const e=page.locator('.match-expanded[data-expanded-match]').last();if(await e.count()){try{await e.locator('[data-full-market-card] [data-fmb-book]').first().waitFor({timeout:10000});expanded=e;break}catch{}}}
 if(!expanded)throw new Error(label+':NO_EXPANDED_FULL_MARKET');
 const panel=expanded.locator('[data-fmb-panel]');
 if(await panel.locator('.fmb-market').count())throw new Error(label+':TABLE_RENDERED_BEFORE_CLICK');
 const hint=(await panel.textContent())||'';if(!hint.includes('Select a bookmaker'))throw new Error(label+':COLLAPSED_HINT_MISSING');
 const before=calls.length;const btn=expanded.locator('[data-fmb-book]').first();await btn.click();await panel.locator('.fmb-market,table').first().waitFor({timeout:15000});await page.waitForTimeout(600);
 const after=calls.length;if(after!==before)throw new Error(label+':BOOKMAKER_CLICK_ADDED_FULLMARKET_API_CALL');
 await btn.click();await page.waitForTimeout(300);if(await panel.locator('.fmb-market,table').count())throw new Error(label+':SAME_BOOK_DID_NOT_COLLAPSE');
 console.log(label+'_PASS=1 FULLMARKET_API_DELTA_ON_CLICK='+(after-before));await browser.close();
}
await test('DESKTOP',{viewport:{width:1440,height:1100}});
await test('MOBILE',{...devices['Pixel 7']});
console.log('BROWSER_VERIFY_SUCCESS=1');
