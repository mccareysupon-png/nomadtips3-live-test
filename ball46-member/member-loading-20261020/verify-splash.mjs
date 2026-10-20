import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {join} from 'node:path';

// Browser integration only: mock authenticated REST responses in isolated Playwright
// context. Cloudflare Access/OTP/Stripe remain untouched on the actual site.
export async function verifySplash(host,html,stage,outDir){
 const browser=await chromium.launch({headless:true});
 const screenshots=[];
 const markets=['ALL','AH','1X2','O/U','CORNERS','BTTS','CARDS','OTHER'];
 const stats={signals:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,pending:0,live:0,void:0,unresolved:0,winRate:null,pnl:0};
 const daily={ok:true,signals:[],summary:Object.fromEntries(markets.map(x=>[x,stats])),signalCount:0};
 try{
   for(const width of [320,390,768,1280]){
     const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'no-preference'});
     const errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.route(u=>u.pathname==='/member',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
     await page.route(u=>u.pathname==='/api/member/session',async r=>{
       await new Promise(resolve=>setTimeout(resolve,1450));
       await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,member:{id:'preview-test-id',status:'ACTIVE',displayName:'Member Test',role:'MEMBER',accessType:'LIFETIME'}})});
     });
     await page.route(u=>u.pathname==='/api/member/daily',async r=>{
       await new Promise(resolve=>setTimeout(resolve,1550));
       await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(daily)});
     });
     const res=await page.goto(host+'/member',{waitUntil:'domcontentloaded',timeout:45000});
     assert.equal(res.status(),200,'MOCK_PAGE_NOT_200');
     const overlay=page.locator('#b46-member-loading');
     await overlay.waitFor({state:'visible',timeout:10000});
     const signature=await page.evaluate(()=>{
       const el=document.querySelector('#b46-member-loading'), ring=el.querySelector('.b46-ml-ring'),logo=el.querySelector('.b46-ml-wordmark');
       const c=getComputedStyle(el),a=getComputedStyle(ring);
       return {logo:logo.textContent.trim(),ringAnimation:a.animationName,duration:a.animationDuration,background:c.backgroundImage,text:el.querySelector('.b46-ml-status').textContent};
     });
     assert(signature.logo.includes('ball46')&&signature.logo.includes('MEMBER'),'BRAND_WORDMARK_WRONG');
     assert(signature.ringAnimation.includes('b46-ml-rotate'),'CSS_ROTATION_MISSING');
     assert.equal(signature.text,'LOADING MEMBER DATA','LOADING_TEXT_MISMATCH');
     const before=join(outDir,stage+'-loading-'+width+'.png');
     await page.screenshot({path:before});screenshots.push(before);
     await page.waitForFunction(()=>!document.querySelector('#b46-member-loading'),{timeout:16000});
     assert.equal(await page.locator('#memberName').textContent(),'Member Test','MEMBER_AUTH_RENDER_REGRESSION');
     assert.equal(await page.locator('#marketTabs .market-tab').count(),8,'MARKETS_RENDER_REGRESSION');
     assert.equal(await page.locator('#dailySummary').isVisible(),true,'STATISTICS_NOT_RENDERED');
     const box=await page.evaluate(()=>document.documentElement.scrollWidth);
     assert(box<=width+3,'HORIZONTAL_OVERFLOW:'+width+':'+box);
     assert.equal(errors.length,0,'MEMBER_JS_ERRORS:'+errors.join('; '));
     const after=join(outDir,stage+'-ready-'+width+'.png');
     await page.screenshot({path:after});screenshots.push(after);
     await page.close();
   }
   // Error must be actionable: no infinite overlay on failed daily API.
   const page=await browser.newPage({viewport:{width:390,height:850}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route(u=>u.pathname==='/member',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
   await page.route(u=>u.pathname==='/api/member/session',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,member:{status:'ACTIVE',displayName:'Test',id:'test'}})}));
   await page.route(u=>u.pathname==='/api/member/daily',r=>r.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'}));
   await page.goto(host+'/member',{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('#b46-member-loading.b46-ml-failed').waitFor({state:'visible',timeout:9000});
   assert.equal(await page.locator('.b46-ml-retry').isVisible(),true,'RETRY_CONTROL_MISSING');
   assert.equal(await page.locator('.b46-ml-status').textContent(),'MEMBER DATA UNAVAILABLE','API_ERROR_NOT_REFLECTED');
   assert(errors.length===0,'MEMBER_FATAL_JS:'+errors.join(';'));
   const failed=join(outDir,stage+'-failed-390.png');
   await page.screenshot({path:failed});screenshots.push(failed);
   await page.close();
 } finally {await browser.close()}
 return {stage,checkedWidths:[320,390,768,1280],pass:true,tests:'Brand and CSS animation, loading before data, hiding only after render, actual 8 markets, summary, error retry, no JS exceptions or overflow',screenshots};
}
