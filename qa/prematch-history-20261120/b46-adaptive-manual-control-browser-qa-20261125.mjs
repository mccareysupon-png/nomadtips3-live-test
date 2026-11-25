import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const token=process.env.CLOUDFLARE_API_TOKEN;
assert(token,'OWNER_TEST_CREDENTIAL_MISSING');
const auth='Bearer '+createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const host='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
async function api(method='GET',body=null,path='/adaptive-control-api-test'){
 const r=await fetch(host+path,{method,headers:{authorization:auth,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(25000)});
 const j=await r.json().catch(()=>null);return {status:r.status,json:j};
}
const before=await api();
assert.equal(before.status,200,'ADMIN_API_GET_FAILED');
assert.equal(before.json.formulas.length,42);
const smoke='A10';
const f=before.json.formulas.find(x=>x.formula===smoke);
assert(f&&f.settled===0&&f.mode==='RUN'&&!f.autoEnabled,'SMOKE_FORMULA_HAS_STATE; NOT SAFE TO TOUCH');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
await mkdir('/tmp/b46-adaptive-control-qa',{recursive:true});
const results=[];
try{
 for(const device of [{name:'PC',width:1440,height:900,mobile:false},{name:'Mobile',width:390,height:844,mobile:true}]){
  const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},isMobile:device.mobile,hasTouch:device.mobile});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());
  const response=await page.goto(host+'/adaptive-control-test',{waitUntil:'domcontentloaded',timeout:45000});
  assert(response?.ok(),'PAGE_UNAVAILABLE_'+device.name);
  assert.equal(await page.locator('#login').isVisible(),true,'LOGIN_MISSING_'+device.name);
  await page.locator('#key').fill(auth.slice(7));
  await page.locator('#signin').click();
  await page.waitForSelector('#dashboard:not([hidden])',{timeout:35000});
  assert.equal(await page.locator('#rows tr').count(),42,'NOT_42_ROWS_'+device.name);
  assert.equal(await page.locator('#rows .wlbar').count(),42,'HORIZONTAL_BARS_MISSING_'+device.name);
  await page.locator('[data-show="B02"]').click();
  await page.waitForFunction(()=>document.querySelector('#detailTitle')?.textContent?.startsWith('B02'),null,{timeout:10000});
  const stats=await page.locator('#detailStats').innerText();
  assert(stats.includes('Max DD')&&stats.includes('U'),'DD_ANALYSIS_MISSING_'+device.name);
  assert(await page.locator('#chart polyline').count()===1,'LINE_CHART_MISSING_'+device.name);
  // Run/Pause actual smoke on a formula that has no research outcomes; restore to RUN.
  await page.locator('[data-show="'+smoke+'"]').click();
  await page.locator('#pauseSelected').click();
  await page.waitForFunction(()=>document.querySelector('#detailTitle')?.textContent?.includes('PAUSED_MANUAL'),null,{timeout:20000});
  const paused=await api();
  assert.equal(paused.json.formulas.find(x=>x.formula===smoke).mode,'PAUSED_MANUAL');
  assert.equal((await api('GET',null,'/adaptive-control-active-test')).status,200);
  await page.screenshot({path:'/tmp/b46-adaptive-control-qa/'+device.name.toLowerCase()+'-paused.png',fullPage:true});
  await page.locator('#runSelected').click();
  await page.waitForFunction(()=>document.querySelector('#detailTitle')?.textContent?.includes('RUN'),null,{timeout:20000});
  const restored=await api();
  assert.equal(restored.json.formulas.find(x=>x.formula===smoke).mode,'RUN');
  if(device.name==='PC'){
    await page.locator('#ddLimit').fill('3.5');
    await page.locator('#minSettled').fill('5');
    await page.locator('#autoEnabled').check();
    await page.locator('#savePolicy').click();
    await page.waitForFunction(()=>document.querySelector('#riskExplain')?.textContent?.includes('3.5'),null,{timeout:20000});
    let updated=await api();assert.equal(updated.json.formulas.find(x=>x.formula===smoke).autoEnabled,true);
    await page.locator('#autoEnabled').uncheck();
    await page.locator('#ddLimit').fill('3');
    await page.locator('#savePolicy').click();
    await page.waitForFunction(()=>document.querySelector('#riskExplain')?.textContent?.includes('3.0'),null,{timeout:20000});
    updated=await api();assert.equal(updated.json.formulas.find(x=>x.formula===smoke).autoEnabled,false);
  }
  assert.deepEqual(errors,[],'PAGE_JS_ERRORS_'+device.name);
  await page.screenshot({path:'/tmp/b46-adaptive-control-qa/'+device.name.toLowerCase()+'-running.png',fullPage:true});
  results.push({device:device.name,rows:42,barCharts:42,manualPauseRun:true,policyChange:device.name==='PC',jsErrors:0});
  await ctx.close();
 }
 const dot=await api('POST',{formula:'B02',action:'PAUSE_IF_DD'},'/adaptive-control-dot-test');
 assert.equal(dot.status,403,'DOT_UNEXPECTEDLY_AUTHORIZED');
 const final=await api();
 assert.equal(final.json.summary.running,42);
 assert.equal(final.json.summary.autoEnabled,0);
 assert.equal(final.json.formulas.length,42);
 const research=await api('GET',null,'/ou-adaptive-research-state-test');
 assert.equal(research.json?.formulas?.length,42);
 console.log('B46_ADAPTIVE_CONTROL_BROWSER_QA_PASS '+JSON.stringify({results,dotNotConfigured:true,formulas:42,allRunning:true,noAutoPoliciesEnabled:true,shadowFormulaCount:research.json.formulas.length,providerCalls:0,productionWrites:0}));
}finally{
 try{
  const state=await api();
  const rec=state.json?.formulas?.find(x=>x.formula===smoke);
  if(rec?.autoEnabled)await api('POST',{formula:smoke,action:'SET_POLICY',autoEnabled:false,ddLimit:3,minSettled:5});
  if(rec?.mode!=='RUN')await api('POST',{formula:smoke,action:'RUN'});
 }catch(e){console.warn('CLEANUP_FAILED '+String(e))}
 await browser.close();
}
