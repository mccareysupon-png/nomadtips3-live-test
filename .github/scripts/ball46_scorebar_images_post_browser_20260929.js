const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const OUT='/tmp/b46-scorebar-images-post-browser'; fs.mkdirSync(OUT,{recursive:true});
const expected=['scorebar-win-20260929a.webp','scorebar-loss-20260929a.webp','scorebar-draw-20260929a.webp','scorebar-pending-20260929a.webp'];

async function inspect(browser,width,height,name){
 const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}); const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
 await page.goto('https://www.ball46.com/?scorebarimgactual='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('[data-workspace-scorebar-slot]',{state:'attached',timeout:30000});
 await page.waitForTimeout(1000);
 const mobile=width<=760;
 const base=await page.evaluate(()=>{const slot=document.querySelector('[data-workspace-scorebar-slot]');const grid=slot?.querySelector('.workspace-scorebar-grid');const cards=[...(slot?.querySelectorAll('.workspace-scorebar-cell')||[])];const r=e=>e?e.getBoundingClientRect():null;const c=e=>e?getComputedStyle(e):null;return{display:c(slot)?.display??null,slotH:r(slot)?.height??null,gridH:r(grid)?.height??null,count:cards.length,firstCardH:r(cards[0])?.height??null};});
 if(mobile){
  if(base.display!=='none')throw new Error(name+': mobile scorebar visibility changed');
  await page.screenshot({path:path.join(OUT,name+'-page.png'),fullPage:false}); await ctx.close(); return {name,width,height,base,previewCards:[],errors:errs};
 }
 if(base.count!==10)throw new Error(name+': expected 10 live scorebar cells, got '+base.count);
 if(Math.abs(base.slotH-120)>1.5||Math.abs(base.gridH-118)>1.5||Math.abs(base.firstCardH-118)>1.5)throw new Error(name+': live geometry changed '+JSON.stringify(base));

 // Client-only fixture placed AFTER the live scorebar, so live renderer cannot delete/replace it.
 await page.evaluate(()=>{
  document.querySelector('#scorebar-image-post-grid')?.remove();
  const slot=document.querySelector('[data-workspace-scorebar-slot]');
  const host=document.createElement('div'); host.id='scorebar-image-post-grid';
  host.style.cssText='display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:0;width:100%;margin:8px 0 0;height:118px;';
  const cards=[
   ['workspace-scorebar-cell workspace-scorebar-signal-result outcome-win','WIN','2–1','OVER 2.50 @ 1.80','0–0','55\'','2–1'],
   ['workspace-scorebar-cell workspace-scorebar-signal-result outcome-loss','LOSS','0–2','HOME -0.50 @ 1.91','0–0','55\'','0–2'],
   ['workspace-scorebar-cell workspace-scorebar-signal-result outcome-draw','DRAW','1–1','AWAY 0 @ 1.90','0–1','70\'','1–1'],
   ['workspace-scorebar-cell workspace-scorebar-pending','PENDING · 74\'','1–0','OVER 7.50 @ 1.85','C 6 (3–3)','68\'','C 8 (4–4)']
  ];
  for(const c of cards){const d=document.createElement('div');d.className=c[0];d.innerHTML='<span class="workspace-scorebar-meta"><i>'+c[1]+'</i><b>'+c[2]+'</b></span><span class="workspace-scorebar-match">HOME TEAM · AWAY TEAM</span><span class="workspace-scorebar-pick"><strong>TEST MARKET</strong><em>'+c[3]+'</em></span><span class="workspace-scorebar-details" data-scorebar-details="1"><span class="workspace-scorebar-detail-entry"><i>ENTRY</i><b>'+c[4]+'</b></span><span class="workspace-scorebar-detail-minute">'+c[5]+'</span><span class="workspace-scorebar-detail-current"><i>NOW</i><b>'+c[6]+'</b></span></span>';host.appendChild(d);}
  for(let i=0;i<6;i++){const p=document.createElement('div');p.className='workspace-scorebar-cell placeholder';p.innerHTML='<span>—</span><span class="away">—</span>';host.appendChild(p);}
  slot.after(host);
 });
 await page.waitForTimeout(150);
 const state=await page.evaluate(()=>{const host=document.querySelector('#scorebar-image-post-grid');const all=host?[...host.children]:[];const cards=all.filter(c=>!c.classList.contains('placeholder'));return{slotCount:all.length,cards:cards.map(c=>({cls:c.className,rect:{width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height},backgroundImage:getComputedStyle(c).backgroundImage,backgroundSize:getComputedStyle(c).backgroundSize,backgroundPosition:getComputedStyle(c).backgroundPosition,scrollHeight:c.scrollHeight}))};});
 if(state.slotCount!==10||state.cards.length!==4)throw new Error(name+': client fixture shape bad '+JSON.stringify(state));
 state.cards.forEach((c,i)=>{
  if(!c.backgroundImage.includes(expected[i]))throw new Error(name+': wrong image mapping '+JSON.stringify(c));
  const sizes=c.backgroundSize.split(',').map(x=>x.trim()); if(!sizes.length||!sizes.every(x=>x==='cover'))throw new Error(name+': background-size not cover '+c.backgroundSize);
  if(!c.backgroundPosition.includes('72%'))throw new Error(name+': background-position drift '+c.backgroundPosition);
  if(c.rect.height<117||c.rect.height>119||c.scrollHeight>c.rect.height+1.5)throw new Error(name+': fixture overflow '+JSON.stringify(c));
 });
 for(const file of expected){const resp=await page.request.get('https://www.ball46.com/'+file+'?postbrowser='+Date.now(),{headers:{'Cache-Control':'no-cache'}});if(resp.status()!==200)throw new Error(name+': '+file+' HTTP '+resp.status());const body=await resp.body();if(body.length<512)throw new Error(name+': '+file+' suspicious bytes '+body.length);}
 await page.locator('#scorebar-image-post-grid').screenshot({path:path.join(OUT,name+'-statuses.png')});
 await page.screenshot({path:path.join(OUT,name+'-page.png'),fullPage:false}); await ctx.close(); return {name,width,height,base,previewCards:state.cards,errors:errs};
}

(async()=>{const b=await chromium.launch({headless:true});try{const report=[];report.push(await inspect(b,1920,900,'desktop-1920'));report.push(await inspect(b,1440,900,'desktop-1440'));report.push(await inspect(b,1000,850,'tablet-1000'));report.push(await inspect(b,390,844,'mobile-390'));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log('SCOREBAR_IMAGES_POST_BROWSER_PASS');console.log(JSON.stringify(report,null,2));}finally{await b.close();}})().catch(e=>{fs.writeFileSync(path.join(OUT,'error.txt'),String(e.stack||e));console.error(e.stack||e);process.exit(1)});
