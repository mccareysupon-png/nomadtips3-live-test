import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const {chromium,devices}=createRequire(new URL('./.runtime/package.json',import.meta.url))('playwright');
const host='https://50ba3b70-ball46-production.mccarey-supon.workers.dev';
const out=process.env.RUNNER_TEMP+'/sidebar-mobile-proof';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const failures=[];
try{
 for(const [name,profile] of [['iphone',devices['iPhone 13']],['android',devices['Pixel 7']]]){
  const c=await browser.newContext({...profile,serviceWorkers:'block'});
  await c.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
  const p=await c.newPage(),errors=[],headers=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/b46-receiver-v1/graph')){const h=r.headers()['x-b46-monitor-rates'];if(h)try{headers.push(JSON.parse(h))}catch{}}});
  try{
   await p.goto(host+'/index.html?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
   await p.waitForFunction(()=>document.querySelectorAll('[data-b46-rate-snapshot]').length===8&&[...document.querySelectorAll('[data-sp-table-body] tr')].some(r=>r.cells.length>=4),null,{timeout:90000});
   await p.waitForFunction(()=>[...document.querySelectorAll('[data-b46-rate-snapshot]')].every(e=>e.dataset.b46MonitorLive==='1'),null,{timeout:60000});
   const opener=p.locator('[data-b46m-open]');await opener.click();
   await p.waitForFunction(()=>document.querySelector('[data-b46m-open]')?.getAttribute('aria-expanded')==='true',null,{timeout:10000});
   await p.waitForTimeout(400);
   const report=await p.evaluate(()=>{
    const d=document.querySelector('#b46m-drawer');
    const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&getComputedStyle(e).visibility==='visible'};
    const rows=[...d.querySelectorAll('button,a,[role="button"]')].filter(visible).map(e=>({text:e.innerText,html:e.outerHTML.slice(0,1100),width:e.getBoundingClientRect().width}));
    const labels=[...d.querySelectorAll('[data-b46-rate-snapshot]')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {k:e.dataset.b46RateSnapshot,v:e.innerText,seq:e.dataset.b46MonitorSequence,font:s.fontSize,weight:s.fontWeight,color:s.color,visible:visible(e),fits:r.left>=0&&r.right<=innerWidth+1}});
    const desktop=[...document.querySelectorAll('.left-rail [data-b46-rate-snapshot]')].map(e=>({k:e.dataset.b46RateSnapshot,v:e.textContent,seq:e.dataset.b46MonitorSequence,live:e.dataset.b46MonitorLive,visible:visible(e)}));
    return {drawerText:d.innerText,rows,labels,desktop,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,history:document.querySelectorAll('[data-sp-table-body] tr').length,graph:!!document.querySelector('#b46-finance-chart-card')};
   });
   console.log('MOBILE_DRAWER_ACTUAL '+JSON.stringify({name,...report,headers:headers.slice(-1),errors}));
   await p.screenshot({path:out+'/'+name+'-drawer.png',fullPage:false});
   assert.equal(report.labels.length,8,'DRAWER_WINRATE_LABELS_MISSING');
   assert(report.labels.every(x=>x.visible&&x.fits&&x.font==='10px'&&x.weight==='700'),'DRAWER_LABEL_STYLE');
   const live=headers.findLast(s=>String(s.sequence)===report.labels[0].seq);assert(live,'DRAWER_NO_LIVE_HEADER');
   for(const l of report.labels){const v=live.rates[l.k];assert.equal(l.v,v===null?'—':v.toFixed(2)+'%','RATE_PARITY '+l.k)}
   assert(report.history>0&&report.graph);assert.equal(errors.length,0);
   console.log('MOBILE_QA_PASS '+name);
  }catch(e){failures.push({name,error:e.message});console.log('MOBILE_QA_FAILURE '+JSON.stringify({name,error:e.message,errors}));await p.screenshot({path:out+'/'+name+'-failure.png',fullPage:false}).catch(()=>{})}finally{await c.close()}
 }
}finally{await browser.close()}
assert.deepEqual(failures,[],'MOBILE_DISPLAY_NOT_READY');
