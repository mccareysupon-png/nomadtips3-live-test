import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const summary=[];
try{
 for(const device of [{name:'desktop',width:1440,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
  const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},
   isMobile:device.mobile,hasTouch:device.mobile});
  for(const view of ['predictions','all','1x2','ou','btts']){
   const page=await ctx.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/__b46_prematch_data',async route=>{
    const response=await route.fetch({timeout:28000});
    await new Promise(r=>setTimeout(r,1900));
    await route.fulfill({response});
   });
   const result=await page.goto(base+'?b46pm='+view,{waitUntil:'domcontentloaded',timeout:60000});
   assert(result?.ok(),'HTTP_PAGE_ERROR_'+view);
   const spinner=page.locator('#b46-prematch-panel .b46pm-inline-spinner');
   await spinner.waitFor({state:'visible',timeout:14000});
   const during=await page.evaluate(()=>{
    const panel=document.getElementById('b46-prematch-panel');
    const ring=panel?.querySelector('.b46pm-inline-spinner');
    const old=panel?.textContent?.includes('Data status');
    const content=ring?.closest('.b46pm-scroll-region');
    const r=ring?.getBoundingClientRect(),p=panel?.getBoundingClientRect();
    const native=document.querySelector('section.workspace.singlepage > .workspace-stage');
    const nativeVisible=native?getComputedStyle(native).display!=='none':false;
    return {oldUI:old,contentRing:!!content,spinnerAnimation:getComputedStyle(ring).animationName,
      ringWidth:r.width,panelWidth:p.width,fullscreen:!!document.querySelector('#b46-pm-firstpaint-loader'),
      nativeVisible,sidebar:!!document.querySelector('aside.left-rail'),
      mobileHeader:!!document.getElementById('b46m-teal-shell')};
   });
   assert.equal(during.oldUI,false,'OLD_DATA_STATUS_FLASH_'+device.name+'_'+view);
   assert.equal(during.contentRing,true,'SPINNER_NOT_IN_CONTENT_'+device.name+'_'+view);
   assert(during.spinnerAnimation.includes('b46PMContentOnlySpin'),'MISSING_ROTATION_'+view);
   assert(during.ringWidth<during.panelWidth,'SPINNER_COVERING_PAGE_'+view);
   assert.equal(during.fullscreen,false,'FULLSCREEN_LOADER_REINTRODUCED');
   assert.equal(during.nativeVisible,false,'NATIVE_OLD_UI_FLASH_'+view);
   assert.equal(during.sidebar||during.mobileHeader,true,'NAV_CHROME_HIDDEN_'+device.name);
   await spinner.waitFor({state:'detached',timeout:40000});
   const panel=page.locator('#b46-prematch-panel');
   await panel.waitFor({state:'visible',timeout:10000});
   const after=await panel.evaluate(e=>({old:e.textContent.includes('Data status'),
    loading:!!e.querySelector('.b46pm-inline-spinner'),dataUnavailable:e.textContent.includes('Match data unavailable.'),
    hasContent:!!e.querySelector('.b46pm-performance-subtitle,.b46pm-premium-list,.b46pm-premium-match')}));
   assert.equal(after.old,false,'OLD_UI_AFTER_DATA_'+view);
   assert.equal(after.loading,false,'STUCK_SPINNER_'+view);
   assert.equal(after.dataUnavailable,false,'API_RESULT_UNAVAILABLE_'+view);
   assert.equal(after.hasContent,true,'NO_RENDERED_CONTENT_'+view);
   assert.deepEqual(errors,[],'JS_ERRORS_'+device.name+'_'+view+':'+JSON.stringify(errors));
   summary.push({device:device.name,view,oldUIRemoved:true,inContentSpinner:true,noFullscreen:true,dataReady:true});
   await page.close();
  }
  await ctx.close();
 }
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 await page.route('**/__b46_prematch_data',route=>route.fulfill({status:503,contentType:'text/plain',body:'Temporary unavailable'}));
 await page.goto(base+'?b46pm=1x2',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('#b46-prematch-panel .b46pm-inline-retry').waitFor({state:'visible',timeout:25000});
 assert.equal(await page.locator('#b46-prematch-panel').textContent().then(t=>t.includes('Data status')),false);
 assert.equal(await page.locator('#b46-prematch-panel').textContent().then(t=>t.includes('Match data unavailable.')),true);
 await ctx.close();
 console.log('B46_CONTENT_ONLY_LOADING_BROWSER_QA_PASS '+JSON.stringify({tested:summary.length,summary,errorRetry:true,prodWrites:0,backendWrites:0}));
}finally{await browser.close()}
