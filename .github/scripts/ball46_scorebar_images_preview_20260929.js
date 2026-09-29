const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const CAND='ball46-scorebar-images-candidate-20260929';
const OUT='/tmp/ball46-scorebar-images-preview';
fs.mkdirSync(OUT,{recursive:true});
const tune=fs.readFileSync(path.join(CAND,'dashboard-v2-tune.css'),'utf8');
const assets={
  'scorebar-win-20260929a.webp':'scorebar-win-20260929a.webp',
  'scorebar-loss-20260929a.webp':'scorebar-loss-20260929a.webp',
  'scorebar-draw-20260929a.webp':'scorebar-draw-20260929a.webp',
  'scorebar-pending-20260929a.webp':'scorebar-pending-20260929a.webp'
};

async function runView(browser,width,height,name){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
 const page=await context.newPage();
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/dashboard-v2-tune.css*',r=>r.fulfill({status:200,contentType:'text/css; charset=utf-8',body:tune}));
 for(const [url,file] of Object.entries(assets)){
   const body=fs.readFileSync(file);
   await page.route('**/'+url,r=>r.fulfill({status:200,contentType:'image/webp',body}));
 }
 await page.goto('https://www.ball46.com/?scorebar_images_preview=20260929',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('[data-workspace-scorebar-slot]',{state:'attached',timeout:30000});
 await page.waitForTimeout(1200);
 const mobile=width<=760;
 if(!mobile){
   await page.evaluate(()=>{
     document.querySelector('#scorebar-image-preview-grid')?.remove();
     const slot=document.querySelector('[data-workspace-scorebar-slot]');
     const host=document.createElement('div');
     host.id='scorebar-image-preview-grid';
     // Mirror the real scorebar geometry: 10 equal slots, not four oversized demo cards.
     host.style.cssText='display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:0;width:100%;margin:8px 0 0;height:118px;';
     const cards=[
       ['workspace-scorebar-cell workspace-scorebar-signal-result outcome-win','WIN','2–1','HOME TEAM · AWAY TEAM','OVER 2.50 @ 1.80','ENTRY','1–0','62\'','FT','2–1'],
       ['workspace-scorebar-cell workspace-scorebar-signal-result outcome-loss','LOSS','0–2','HOME TEAM · AWAY TEAM','HOME -0.50 @ 1.91','ENTRY','0–0','55\'','FT','0–2'],
       ['workspace-scorebar-cell workspace-scorebar-signal-result outcome-draw','DRAW','1–1','HOME TEAM · AWAY TEAM','AWAY 0 @ 1.90','ENTRY','0–1','70\'','FT','1–1'],
       ['workspace-scorebar-cell workspace-scorebar-pending','PENDING · 74\'','1–0','HOME TEAM · AWAY TEAM','OVER 7.50 @ 1.85','ENTRY','C 6 (3–3)','68\'','NOW','C 8 (4–4)']
     ];
     for(const c of cards){
       const d=document.createElement('div');d.className=c[0];
       d.innerHTML='<span class="workspace-scorebar-meta"><i>'+c[1]+'</i><b>'+c[2]+'</b></span><span class="workspace-scorebar-match">'+c[3]+'</span><span class="workspace-scorebar-pick"><strong>TEST MARKET</strong><em>'+c[4]+'</em></span><span class="workspace-scorebar-details" data-scorebar-details="1"><span class="workspace-scorebar-detail-entry"><i>'+c[5]+'</i><b>'+c[6]+'</b></span><span class="workspace-scorebar-detail-minute">'+c[7]+'</span><span class="workspace-scorebar-detail-current"><i>'+c[8]+'</i><b>'+c[9]+'</b></span></span>';
       host.appendChild(d);
     }
     for(let i=0;i<6;i++){
       const p=document.createElement('div');
       p.className='workspace-scorebar-cell placeholder';
       p.innerHTML='<span>—</span><span class="away">—</span>';
       host.appendChild(p);
     }
     slot.after(host);
   });
   await page.waitForTimeout(300);
 }
 const state=await page.evaluate((mobile)=>{
   const slot=document.querySelector('[data-workspace-scorebar-slot]');
   const host=document.querySelector('#scorebar-image-preview-grid');
   const all=host?[...host.children]:[];
   const cards=all.filter(c=>!c.classList.contains('placeholder'));
   return {
     slotDisplay:getComputedStyle(slot).display,
     mobile,
     syntheticSlotCount:all.length,
     previewCards:cards.map(c=>({
       cls:c.className,
       rect:{width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height},
       backgroundImage:getComputedStyle(c).backgroundImage,
       backgroundSize:getComputedStyle(c).backgroundSize,
       backgroundPosition:getComputedStyle(c).backgroundPosition,
       overflow:getComputedStyle(c).overflow,
       scrollHeight:c.scrollHeight
     })),
     livePopulated:[...slot.querySelectorAll('.workspace-scorebar-cell:not(.placeholder)')].map(c=>({cls:c.className,bg:getComputedStyle(c).backgroundImage}))
   };
 },mobile);
 if(mobile){
   if(state.slotDisplay!=='none')throw new Error(name+': mobile scorebar visibility changed');
 }else{
   if(state.syntheticSlotCount!==10)throw new Error(name+': expected ten synthetic slots');
   if(state.previewCards.length!==4)throw new Error(name+': expected four populated synthetic status cards');
   const expected=['scorebar-win-20260929a.webp','scorebar-loss-20260929a.webp','scorebar-draw-20260929a.webp','scorebar-pending-20260929a.webp'];
   state.previewCards.forEach((c,i)=>{
     if(!c.backgroundImage.includes(expected[i]))throw new Error(name+': wrong image mapping '+JSON.stringify(c));
     const sizes=c.backgroundSize.split(',').map(x=>x.trim());
     if(!sizes.length||!sizes.every(x=>x==='cover'))throw new Error(name+': background-size not cover on every layer: '+c.backgroundSize);
     if(c.rect.height<117||c.rect.height>119)throw new Error(name+': card height drift '+c.rect.height);
     if(c.scrollHeight>c.rect.height+1.5)throw new Error(name+': card content overflow '+JSON.stringify(c));
   });
   const host=page.locator('#scorebar-image-preview-grid');
   await host.screenshot({path:path.join(OUT,name+'-statuses.png')});
 }
 await page.screenshot({path:path.join(OUT,name+'-page.png'),fullPage:false});
 await context.close();
 return {name,width,height,state,errors};
}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
   const report=[];
   report.push(await runView(browser,1920,900,'desktop-1920'));
   report.push(await runView(browser,1440,900,'desktop-1440'));
   report.push(await runView(browser,1000,850,'tablet-1000'));
   report.push(await runView(browser,390,844,'mobile-390'));
   fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
   console.log('SCOREBAR_IMAGE_PREVIEW_OK');
   console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
