const fs=require('fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const views=[['desktop1440',1440,900],['desktop1920',1920,1080],['tablet1000',1000,850]];
 const out={generatedAt:new Date().toISOString(),productionMutated:false,views:{}};
 for(const [name,w,h] of views){
  const page=await browser.newPage({viewport:{width:w,height:h}});
  await page.goto('https://www.ball46.com/?measure_scorebar=20260929',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('[data-workspace-scorebar-slot]',{state:'attached',timeout:30000});
  await page.waitForTimeout(2500);
  const d=await page.evaluate(()=>{
   const slot=document.querySelector('[data-workspace-scorebar-slot]');
   const grid=slot?.querySelector('.workspace-scorebar-grid');
   const cards=[...(slot?.querySelectorAll('.workspace-scorebar-cell')||[])];
   const populated=cards.filter(c=>!c.classList.contains('placeholder'));
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
   const style=e=>{const s=getComputedStyle(e);return {display:s.display,gridTemplateColumns:s.gridTemplateColumns,columnGap:s.columnGap,rowGap:s.rowGap,gap:s.gap,padding:s.padding,backgroundImage:s.backgroundImage,backgroundSize:s.backgroundSize,backgroundPosition:s.backgroundPosition,border:s.border}};
   return {slot:slot?{rect:rect(slot),style:style(slot)}:null,grid:grid?{rect:rect(grid),style:style(grid)}:null,totalCards:cards.length,populatedCards:populated.length,cards:cards.map((c,i)=>({i,rect:rect(c),className:c.className,text:(c.innerText||'').replace(/\n+/g,' | ').slice(0,220),style:style(c)}))};
  });
  out.views[name]=d;
  await page.close();
 }
 await browser.close();
 fs.writeFileSync('ball46-scorebar-measure-20260929.json',JSON.stringify(out,null,2));
 console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
