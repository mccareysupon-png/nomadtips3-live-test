import {chromium,devices} from 'playwright';

async function run(label,opts){
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext(opts);
 const page=await ctx.newPage();
 await page.goto('https://ball46.com/?pin-signal-diag='+label+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
 await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});
 await page.evaluate(()=>window.BALL46_PIN_V2.clear());
 await page.waitForTimeout(2500);

 const rows=page.locator('[data-board-sections] .match-row[data-match-id]');
 let idx=-1;
 for(let i=0;i<await rows.count();i++){
   if(await rows.nth(i).locator('.signal-inline-stack,.signal-cell').count()){idx=i;break}
 }
 if(idx<0){console.log(label+'_NO_SIGNAL_ROW=1');await browser.close();return}
 const row=rows.nth(idx),id=await row.getAttribute('data-match-id');

 async function snap(tag){
   const data=await page.locator('.match-row[data-match-id="'+id+'"]').evaluate(el=>{
     const sig=el.querySelector('.signal-inline-stack,.signal-cell');
     const cell=sig?.closest('.signal-cell')||sig;
     const cs=cell?getComputedStyle(cell):null;
     return {
       id:el.dataset.matchId,
       parentStatus:el.closest('[data-status-section]')?.getAttribute('data-status-section')||null,
       rowClass:el.className,
       rowHtml:el.outerHTML,
       signalHtml:sig?.outerHTML||null,
       signalText:sig?.textContent?.trim()||null,
       signalStyle:cs?{display:cs.display,visibility:cs.visibility,opacity:cs.opacity,width:cs.width,height:cs.height,overflow:cs.overflow,position:cs.position}:null,
       signalRect:sig?(()=>{const r=sig.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})():null
     };
   });
   console.log(tag+'='+JSON.stringify(data));
   return data;
 }
 const before=await snap(label+'_BEFORE');
 await row.locator('[data-b46-pin-v2]').click();
 await page.waitForTimeout(600);
 const after=await snap(label+'_AFTER');
 console.log(label+'_SIGNAL_PRESERVED='+(before.signalText===after.signalText&&!!after.signalHtml?1:0));
 await page.screenshot({path:'pinned-fixtures-v2-production/'+label.toLowerCase()+'-signal-after-pin.png',fullPage:false});
 await browser.close();
}
await run('DESKTOP',{viewport:{width:1440,height:1000}});
await run('MOBILE',{...devices['Pixel 7']});
