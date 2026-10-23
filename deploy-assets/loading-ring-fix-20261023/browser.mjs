import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const candidate=JSON.parse(await readFile('audit/candidate.json','utf8'));
assert(candidate.ok&&candidate.trafficChanged===false&&candidate.candidate&&candidate.preview,'CANDIDATE_NOT_SAFE');
const results=[],browser=await chromium.launch({headless:true,args:['--disable-gpu-sandbox']});
let bad=false;
for(const mobile of [false,true])for(const reduce of [false,true]){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,reducedMotion:reduce?'reduce':'no-preference'});
 const page=await ctx.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.abort('blockedbyclient'));
 let result={mobile,reduce};
 try{
  const res=await page.goto(candidate.preview+'/?loadingRingBrowserQA='+Date.now(),{waitUntil:'domcontentloaded',timeout:40000});
  assert.equal(res.status(),200,'PREVIEW_PAGE_NOT_200');
  await page.locator('#b46-data-orbit-loading .b46-orbit-ring').waitFor({state:'attached',timeout:10000});
  const liveCSS=await page.evaluate(()=>document.querySelector('#b46-global-data-orbit-style-20261019')?.textContent);
  assert(liveCSS?.includes('@keyframes b46-orbit-rotate-20261019'),'LIVE_LOADER_CSS_MISSING');
  const fixture=await ctx.newPage();
  await fixture.setContent('<!doctype html><html><head><style>'+liveCSS+'</style></head><body><div id="b46-data-orbit-loading"><div class="b46-orbit-stack"><span class="b46-orbit-ring"></span></div></div></body></html>');
  const sample=()=>fixture.evaluate(()=>{const ring=document.querySelector('#b46-data-orbit-loading .b46-orbit-ring');if(!ring)return null;const css=getComputedStyle(ring,'::before');return{animationName:css.animationName,animationDuration:css.animationDuration,animationTimingFunction:css.animationTimingFunction,transform:css.transform,visibility:getComputedStyle(document.querySelector('#b46-data-orbit-loading')).visibility,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}});
  const first=await sample();await fixture.waitForTimeout(720);const second=await sample();result={...result,first,second,errors,source:'real candidate CSS in isolated visible DOM fixture'};
  assert(first&&second,'RING_FIXTURE_MISSING');
  await fixture.close();
  assert.equal(first.reducedMotion,reduce,'MOTION_EMULATION_FAILED');
  assert.equal(first.animationName,'b46-orbit-rotate-20261019','ANIMATION_DISABLED');
  assert.equal(first.animationTimingFunction,'linear','NONLINEAR_ROTATION');
  assert.equal(first.animationDuration,reduce?'6s':'2.8s','WRONG_DURATION');
  assert.notEqual(first.transform,second.transform,'TRANSFORM_NOT_MOVING');
  result.pass=true;
 }catch(e){result.pass=false;result.error=e.message;bad=true;}
 results.push(result);await page.close();await ctx.close();
}
await browser.close();
const data={at:new Date().toISOString(),url:candidate.preview,activeBefore:candidate.before.id,scenarios:results,ok:!bad};await writeFile('audit/browser.json',JSON.stringify(data,null,2));
console.log('BALL46_RING_BROWSER_RESULTS='+JSON.stringify({ok:data.ok,scenarios:results.map(x=>({mobile:x.mobile,reduce:x.reduce,pass:x.pass,error:x.error,first:x.first,second:x.second}))}));
if(bad)process.exitCode=1;
