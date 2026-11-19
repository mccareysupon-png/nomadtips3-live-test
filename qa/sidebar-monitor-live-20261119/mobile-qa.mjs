import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const {chromium,devices}=createRequire(new URL('./.runtime/package.json',import.meta.url))('playwright');
const host='https://50ba3b70-ball46-production.mccarey-supon.workers.dev';
const out=process.env.RUNNER_TEMP+'/sidebar-mobile-proof';await mkdir(out,{recursive:true});
const keys=['all','1x2','ah','ou','btts','corners','cards','other'];
const browser=await chromium.launch({headless:true});
const reports=[];
try{
 for(const [name,profile] of [['iphone',devices['iPhone 13']],['android',devices['Pixel 7']]]){
  const context=await browser.newContext({...profile,serviceWorkers:'block'});
  await context.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
  const p=await context.newPage(),errors=[],headers=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('response',r=>{if(r.url().includes('/b46-receiver-v1/graph')){const h=r.headers()['x-b46-monitor-rates'];if(h)try{headers.push(JSON.parse(h))}catch{}}});
  try{
   await p.goto(host+'/index.html?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
   await p.waitForFunction(()=>document.querySelectorAll('[data-b46-rate-snapshot]').length===8&&[...document.querySelectorAll('[data-sp-table-body] tr')].some(r=>r.cells.length>=4),null,{timeout:90000});
   await p.waitForFunction(()=>[...document.querySelectorAll('[data-b46-rate-snapshot]')].every(e=>e.dataset.b46MonitorLive==='1'),null,{timeout:60000});
   const info=async()=>p.evaluate(()=>{
    const nav=document.querySelector('[data-stat-market="all"]');
    const ancestor=[];let e=nav;while(e&&ancestor.length<9){const r=e.getBoundingClientRect(),s=getComputedStyle(e);ancestor.push({tag:e.tagName,id:e.id,cl:typeof e.className==='string'?e.className:'',display:s.display,visibility:s.visibility,width:r.width,x:r.x});e=e.parentElement}
    const buttons=[...document.querySelectorAll('button,[role="button"],a,[aria-controls]')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&r.y<180&&r.bottom>0&&r.x<innerWidth&&r.right>0&&s.visibility==='visible'}).slice(0,40).map(e=>({html:e.outerHTML.slice(0,450),text:e.innerText?.slice(0,60),id:e.id,attrs:[...e.attributes].map(a=>[a.name,a.value])}));
    return {ancestor,buttons};
   });
   console.log('MOBILE_MENU_DISCOVERY '+JSON.stringify({name,...await info()}));
   const all=p.locator('[data-stat-market="all"]').first();
   async function openMenu(){
    if(await all.isVisible()&&await all.evaluate(e=>{const r=e.getBoundingClientRect();return r.x>=-1&&r.right<=innerWidth+1&&r.width>0}))return true;
    const options=await p.evaluate(()=>{
     const nodes=[...document.querySelectorAll('button,[role="button"],a,[aria-controls]')];
     return nodes.map((e,i)=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);const f=[e.id,e.className,e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('aria-controls'),e.getAttribute('data-action'),...Array.from(e.attributes).map(a=>a.name+'='+a.value),e.innerText].join(' ');return {i,f,x:r.x,y:r.y,w:r.width,h:r.height,visible:r.width>0&&r.height>0&&r.y<180&&r.bottom>0&&r.x>=-1&&r.right<=innerWidth+1&&s.visibility==='visible'};}).filter(x=>x.visible&&/menu|sidebar|drawer|hamburger|nav-toggle|filter-toggle|☰|≡/i.test(x.f)&&!/member|language|theme|odds|close|backdrop/i.test(x.f)).sort((a,b)=>a.y-b.y||a.x-b.x);
    });
    for(const option of options.slice(0,6)){
     console.log('MOBILE_MENU_TRY '+JSON.stringify({name,option}));
     const button=p.locator('button,[role="button"],a,[aria-controls]').nth(option.i);
     try{await button.click({timeout:3000});await p.waitForTimeout(350)}catch{continue}
     if(await all.isVisible()&&await all.evaluate(e=>{const r=e.getBoundingClientRect();return r.x>=-1&&r.right<=innerWidth+1&&r.width>0}))return true;
    }
    return false;
   }
   assert(await openMenu(),'MOBILE_MENU_NOT_OPEN');
   const view=await p.evaluate(()=>{
    const labels=[...document.querySelectorAll('[data-b46-rate-snapshot]')].map(e=>{
      const r=e.getBoundingClientRect(),s=getComputedStyle(e),b=e.closest('[data-stat-market]'),br=b.getBoundingClientRect(),native=b.querySelector('b');
      return {k:e.dataset.b46RateSnapshot,v:e.textContent,seq:e.dataset.b46MonitorSequence,live:e.dataset.b46MonitorLive,font:s.fontSize,weight:s.fontWeight,color:s.color,visible:r.width>0&&r.height>0&&s.visibility==='visible'&&r.left>=0&&r.right<=innerWidth+1,fits:r.left>=br.left&&r.right<=br.right+1,oldHidden:getComputedStyle(native).visibility==='hidden'};
    });return {labels,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,rows:[...document.querySelectorAll('[data-sp-table-body] tr')].filter(r=>r.cells.length>=4).length,graph:!!document.querySelector('#b46-finance-chart-card')};
   });
   console.log('MOBILE_VISIBLE_RESULT '+JSON.stringify({name,...view,errors}));
   assert.equal(view.labels.length,8);assert(view.labels.every(x=>x.visible&&x.fits&&x.oldHidden&&x.live==='1'&&x.font==='10px'&&x.weight==='700'),'MOBILE_LABEL_STYLE_OR_FIT');
   const snapshot=headers.findLast(x=>String(x.sequence)===view.labels[0].seq);assert(snapshot,'NO_REAL_HEADER_PARITY');
   for(const l of view.labels){const v=snapshot.rates[l.k];assert.equal(l.v,v===null?'—':v.toFixed(2)+'%','RATE_PARITY '+l.k)}
   assert(view.rows>0,'HISTORY_ROWS_MISSING');assert(view.graph,'GRAPH_CARD_MISSING');
   await p.screenshot({path:out+'/'+name+'-sidebar.png',fullPage:false});
   const nav=[];
   for(const k of keys){
    assert(await openMenu(),'REOPEN_MENU '+k);
    const b=p.locator('[data-stat-market="'+k+'"]').first();await b.click({timeout:5000});
    await p.waitForFunction(m=>document.querySelector('[data-stat-market].active')?.dataset.statMarket===m,k,{timeout:10000});
    const result=await p.evaluate(()=>({active:document.querySelector('[data-stat-market].active')?.dataset.statMarket,rows:[...document.querySelectorAll('[data-sp-table-body] tr')].filter(r=>r.cells.length>=4).length,graph:!!document.querySelector('#b46-finance-chart-card')}));
    assert(result.graph,'GRAPH_MISSING '+k);nav.push(result);
   }
   assert.deepEqual(errors,[],'BROWSER_ERRORS');reports.push({name,width:view.width,labels:view.labels,nav,errors,rows:view.rows});console.log('MOBILE_QA_PASS '+JSON.stringify(reports.at(-1)));
  }catch(e){console.log('MOBILE_QA_FAILURE '+JSON.stringify({name,error:e.message,errors,headerCount:headers.length,diagnostic:await info().catch(()=>null)}));await p.screenshot({path:out+'/'+name+'-failure.png',fullPage:false}).catch(()=>{});throw e}finally{await context.close()}
 }
}finally{await browser.close()}
