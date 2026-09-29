const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const OUT='/tmp/b46-scorebar-images-post-browser'; fs.mkdirSync(OUT,{recursive:true});
const expected={
 win:'scorebar-win-20260929a.webp',
 loss:'scorebar-loss-20260929a.webp',
 draw:'scorebar-draw-20260929a.webp',
 pending:'scorebar-pending-20260929a.webp'
};
async function inspect(browser,viewport,name){
 const ctx=await browser.newContext({viewport,serviceWorkers:'block'}); const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
 await page.goto('https://www.ball46.com/?scorebarimgactual='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('[data-workspace-scorebar-slot]',{state:'attached',timeout:30000});
 const base=await page.evaluate(()=>{const slot=document.querySelector('[data-workspace-scorebar-slot]'),grid=slot?.querySelector('.workspace-scorebar-grid'),cards=[...(slot?.querySelectorAll('.workspace-scorebar-cell')||[])],r=e=>e?e.getBoundingClientRect():null,c=e=>e?getComputedStyle(e):null;return{display:slot?c(slot).display:null,slotH:r(slot)?.height??null,gridH:r(grid)?.height??null,count:cards.length,firstCardH:r(cards[0])?.height??null};});
 if(viewport.width>760){
  if(base.count!==10)throw Error(name+': expected 10 cells, got '+base.count);
  if(Math.abs(base.slotH-120)>1.5||Math.abs(base.gridH-118)>1.5||Math.abs(base.firstCardH-118)>1.5)throw Error(name+': geometry changed '+JSON.stringify(base));
  // Client-only status fixture inside the real Production scorebar. This does not mutate Production.
  await page.evaluate(()=>{const slot=document.querySelector('[data-workspace-scorebar-slot]');const states=['win','loss','draw','pending','win','loss','draw','pending','win','loss'];const labels=['WIN','LOSS','DRAW','PENDING','WIN','LOSS','DRAW','PENDING','WIN','LOSS'];slot.innerHTML='<div class="workspace-scorebar-grid">'+states.map((s,i)=>{const cls=s==='pending'?'workspace-scorebar-cell workspace-scorebar-pending':'workspace-scorebar-cell workspace-scorebar-signal-result outcome-'+s;return `<div class="${cls}" data-image-test="${s}"><span class="workspace-scorebar-meta"><i>${labels[i]}</i><b>1–0</b></span><span class="workspace-scorebar-match">Ball46 · Image Test</span><span class="workspace-scorebar-pick"><strong>Full Time</strong><em>ENTRY @ 1.90</em></span><span class="workspace-scorebar-details"><span class="workspace-scorebar-detail-entry"><i>ENTRY</i><b>0–0</b></span><span class="workspace-scorebar-detail-minute">55&#39;</span><span class="workspace-scorebar-detail-current"><i>NOW</i><b>1–0</b></span></span></div>`}).join('')+'</div>';});
  await page.waitForTimeout(300);
  const status=await page.evaluate(async expected=>{const out={};for(const [s,file] of Object.entries(expected)){const el=document.querySelector(`[data-image-test="${s}"]`);const cs=getComputedStyle(el),r=el.getBoundingClientRect();const resp=await fetch('/'+file+'?postbrowser='+Date.now(),{cache:'no-store'});out[s]={backgroundImage:cs.backgroundImage,backgroundSize:cs.backgroundSize,backgroundPosition:cs.backgroundPosition,height:r.height,scrollHeight:el.scrollHeight,http:resp.status,ok:resp.ok,file};}return out;},expected);
  for(const [s,x] of Object.entries(status)){
    if(!x.ok||x.http!==200)throw Error(name+': '+s+' image HTTP '+x.http);
    if(!x.backgroundImage.includes(x.file))throw Error(name+': '+s+' wrong background '+x.backgroundImage);
    if(!x.backgroundSize.split(',').some(v=>v.trim()==='cover'))throw Error(name+': '+s+' not cover '+x.backgroundSize);
    if(Math.abs(x.height-118)>1.5||x.scrollHeight>x.height+1.5)throw Error(name+': '+s+' geometry overflow '+JSON.stringify(x));
  }
  await page.screenshot({path:path.join(OUT,name+'-statuses.png'),fullPage:false});
  await ctx.close(); return {base,status,errs};
 } else {
  if(base.display!=='none')throw Error(name+': mobile scorebar visibility changed');
  await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:false}); await ctx.close(); return {base,status:null,errs};
 }
}
(async()=>{const b=await chromium.launch({headless:true});const report={at:new Date().toISOString(),production:true,syntheticStatusFixtureClientOnly:true,views:{}};try{report.views.desktop1920=await inspect(b,{width:1920,height:900},'desktop-1920');report.views.desktop1440=await inspect(b,{width:1440,height:900},'desktop-1440');report.views.tablet1000=await inspect(b,{width:1000,height:850},'tablet-1000');report.views.mobile390=await inspect(b,{width:390,height:844},'mobile-390');for(const v of Object.values(report.views))if(v.errs?.length)throw Error('page errors: '+JSON.stringify(v.errs));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log('SCOREBAR_IMAGES_POST_BROWSER_PASS');}finally{await b.close();}})().catch(e=>{fs.writeFileSync(path.join(OUT,'error.txt'),String(e.stack||e));console.error(e.stack||e);process.exit(1)});
