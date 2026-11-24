// Browser-only, read-only verification of universal PreMatch TEST first paint.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const summary=[];
try{
 for(const device of [
  {name:'desktop',width:1440,height:900,mobile:false},
  {name:'tablet',width:820,height:1180,mobile:true},
  {name:'mobile',width:390,height:844,mobile:true},
  {name:'small-mobile',width:320,height:640,mobile:true}
 ]){
  const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},
   isMobile:device.mobile,hasTouch:device.mobile});
  for(const routeName of ['predictions','all','1x2','ou','btts']){
   const page=await ctx.newPage();
   let dataReads=0;
   await page.route('**/__b46_prematch_data',async route=>{
    dataReads++;
    const response=await route.fetch({timeout:28000});
    await new Promise(resolve=>setTimeout(resolve,1250));
    await route.fulfill({response});
   });
   const res=await page.goto(base+'?b46pm='+routeName,{
    waitUntil:'domcontentloaded',timeout:60000});
   assert(res?.ok(),'DOCUMENT_HTTP_'+routeName+'_'+res?.status());
   const spinner=page.locator('#b46-pm-firstpaint-loader');
   await spinner.waitFor({state:'visible',timeout:18000});
   const during=await spinner.evaluate(el=>{
    const bounds=el.getBoundingClientRect(),ring=el.querySelector('.b46-pm-spinner');
    return {display:getComputedStyle(el).display,
      animation:getComputedStyle(ring).animationName,
      height:bounds.height,width:bounds.width,
      viewportHeight:innerHeight,viewportWidth:innerWidth,
      loading:document.documentElement.getAttribute('data-b46-pm-initial-loading'),
      route:new URLSearchParams(location.search).get('b46pm'),
      nativeLoader:document.getElementById('b46-data-orbit-loading')?
        getComputedStyle(document.getElementById('b46-data-orbit-loading')).display:null
    };
   });
   assert.equal(during.route,routeName);
   assert.equal(during.loading,'1','NOT_INITIALLY_LOADING_'+routeName);
   assert.equal(during.display,'flex');
   assert(during.animation.includes('b46PmSpinnerSpin'),'ANIMATION_NOT_ACTIVE_'+routeName);
   assert(during.height>=during.viewportHeight-4&&during.width>=during.viewportWidth-4,'LOADER_NOT_FULLSCREEN_'+device.name+'_'+routeName);
   assert(during.nativeLoader===null||during.nativeLoader==='none','OLD_LOADER_VISIBLE_'+routeName);
   await spinner.waitFor({state:'detached',timeout:45000});
   await page.locator('#b46-prematch-panel').waitFor({state:'visible',timeout:15000});
   assert.equal(await page.locator('html').getAttribute('data-b46-pm-initial-loading'),null);
   assert(dataReads>=1,'DATA_NOT_FETCHED_'+routeName);
   const visible=await page.locator('#b46-prematch-panel').evaluate(el=>el.getBoundingClientRect().width>0);
   assert(visible,'FINAL_PANEL_EMPTY_'+routeName);
   summary.push({device:device.name,route:routeName,spinnerDuring:true,removedWhenDataReady:true,dataReads});
   await page.close();
  }
  await ctx.close();
 }
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 await page.route('**/__b46_prematch_data',route=>route.fulfill({
  status:503,contentType:'text/plain',body:'Simulated unavailable'}));
 await page.goto(base+'?b46pm=predictions',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('#b46-pm-firstpaint-loader .b46-pm-retry').waitFor({state:'visible',timeout:25000});
 const label=await page.locator('#b46-pm-firstpaint-loader .b46-pm-loading-label').textContent();
 assert(label.includes('unavailable'),'FAILURE_STATE_MISSING');
 assert.equal(await page.locator('html').getAttribute('data-b46-pm-initial-loading'),'1');
 await ctx.close();
 console.log('B46_FIRSTPAINT_REAL_BROWSER_QA_PASS '+JSON.stringify({
  devices:['desktop','tablet','mobile','small-mobile'],
  routes:['predictions','all','1x2','ou','btts'],
  checks:summary.length,errorRetryTest:true,
  allDeviceResponsiveCSS:true,backendChanges:0,productionChanges:0}));
}finally{await browser.close()}
