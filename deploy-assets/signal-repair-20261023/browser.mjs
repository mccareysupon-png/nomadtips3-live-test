import assert from'node:assert/strict';
import{readFile,writeFile}from'node:fs/promises';
import{chromium}from'playwright-core';
const dir='deploy-assets/signal-repair-20261023/audit',c=JSON.parse(await readFile(dir+'/candidate.json','utf8'));
assert(c.ok&&!c.trafficChanged&&c.preview);
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const results=[],out={at:new Date().toISOString(),preview:c.preview,tests:[],ok:false};
try{
 for(const t of[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:t.width,height:t.height},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push('JS:'+e.message));
  page.on('response',r=>{if(r.status()>=500)errors.push('HTTP:'+r.status()+':'+r.url())});
  const responsePromise=page.waitForResponse(r=>r.url().includes('/api/engine/signals'),{timeout:45000});
  const r=await page.goto(c.preview+'/signal.html?repairPreview='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  assert.equal(r.status(),200,'HTML_HTTP_'+t.name);
  const response=await responsePromise;
  assert.equal(response.status(),200,'SIGNALS_FETCH_HTTP_'+t.name);
  const body=await response.json();assert(body.ok===true&&Array.isArray(body.signals),'SIGNAL_API_INVALID_'+t.name);
  await page.waitForFunction(n=>{
    const el=document.querySelector('[data-next-signal-list]');
    const status=document.querySelector('[data-next-signal-state]');
    return !!el&&el.innerText.trim()!=='' && (n===0?el.innerText.includes('No active live signals'):el.querySelectorAll('.next-signal-card').length>0);
  },body.signals.length,{timeout:30000});
  const rendered=await page.evaluate(()=>{
   const el=document.querySelector('[data-next-signal-list]');
   return{cards:el?.querySelectorAll('.next-signal-card').length||0,listText:el?.innerText.slice(0,750),
     bodyText:document.body.innerText.slice(0,280),statusText:document.querySelector('[data-next-stat-state]')?.innerText||null,
     scriptMarker:!!document.querySelector('script[src*="signal-next.js?v=343-next-production-v1-b46-signal-standalone-fetch-20261023"]')};
  });
  assert.equal(rendered.scriptMarker,true,'VERSIONED_SCRIPT_MISSING_'+t.name);
  assert(!rendered.listText.includes('Waiting for active signals'),'STILL_WAITING_'+t.name);
  assert.equal(errors.filter(e=>e.startsWith('JS:')).length,0,'JS_ERRORS_'+t.name);
  const pass=body.signals.length===0?rendered.listText.includes('No active live signals'):rendered.cards>=1;
  assert(pass,'LIVE_SIGNAL_NOT_RENDERED_'+t.name);
  out.tests.push({name:t.name,pass,apiSignals:body.signals.length,rendered,errors:errors.slice(0,10)});
  await context.close();
 }
 out.ok=true;console.log('B46_SIGNAL_BROWSER_QA='+JSON.stringify({ok:true,preview:c.preview,tests:out.tests}));
}catch(e){out.error=String(e.stack||e);console.error('B46_SIGNAL_BROWSER_QA_FAIL='+String(e.message||e));process.exitCode=1}
finally{await browser.close();await writeFile(dir+'/browser.json',JSON.stringify(out,null,2))}
