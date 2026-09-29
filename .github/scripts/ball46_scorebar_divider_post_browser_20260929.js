const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const OUT='/tmp/b46-divider-post-browser'; fs.mkdirSync(OUT,{recursive:true});
const expectedImages={win:'scorebar-win-20260929a.webp',loss:'scorebar-loss-20260929a.webp',draw:'scorebar-draw-20260929a.webp',pending:'scorebar-pending-20260929a.webp'};
function transparent(v){return v==='rgba(0, 0, 0, 0)'||v==='transparent';}
async function inspect(browser,viewport,name){
  const ctx=await browser.newContext({viewport,serviceWorkers:'block'}); const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('https://www.ball46.com/?divideractual='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('[data-workspace-scorebar-slot]',{state:'attached',timeout:30000});
  await page.waitForTimeout(900);
  const mobile=viewport.width<=760;
  if(!mobile){
    await page.evaluate(()=>{
      document.querySelector('#divider-post-grid')?.remove();
      const slot=document.querySelector('[data-workspace-scorebar-slot]');
      const host=document.createElement('div'); host.id='divider-post-grid'; host.className='workspace-scorebar-grid'; host.style.cssText='width:100%;margin-top:8px;';
      const states=['win','loss','draw','pending','win','loss','draw','pending','win','loss'];
      states.forEach((s,i)=>{const d=document.createElement('div');d.className=s==='pending'?'workspace-scorebar-cell workspace-scorebar-pending':'workspace-scorebar-cell workspace-scorebar-signal-result outcome-'+s;d.dataset.dividerPost=s;d.innerHTML='<span class="workspace-scorebar-meta"><i>'+s.toUpperCase()+'</i><b>1–0</b></span><span class="workspace-scorebar-match">Ball46 · Divider Verify</span><span class="workspace-scorebar-pick"><strong>Full Time</strong><em>ENTRY @ 1.90</em></span><span class="workspace-scorebar-details"><span class="workspace-scorebar-detail-entry"><i>ENTRY</i><b>0–0</b></span><span class="workspace-scorebar-detail-minute">55\'</span><span class="workspace-scorebar-detail-current"><i>NOW</i><b>1–0</b></span></span>';host.appendChild(d);});
      slot.after(host);
    });
    await page.waitForTimeout(250);
  }
  const state=await page.evaluate((mobile)=>{
    const slot=document.querySelector('[data-workspace-scorebar-slot]'),grid=slot?.querySelector('.workspace-scorebar-grid');
    const live=[...(slot?.querySelectorAll('.workspace-scorebar-cell')||[])],host=document.querySelector('#divider-post-grid'),synthetic=host?[...host.children]:[];
    const style=el=>{if(!el)return null;const cs=getComputedStyle(el),r=el.getBoundingClientRect();return{cls:el.className,width:r.width,height:r.height,scrollHeight:el.scrollHeight,boxSizing:cs.boxSizing,borderRightWidth:cs.borderRightWidth,borderRightStyle:cs.borderRightStyle,borderRightColor:cs.borderRightColor,backgroundImage:cs.backgroundImage,backgroundSize:cs.backgroundSize,backgroundPosition:cs.backgroundPosition};};
    return{mobile,slotDisplay:slot?getComputedStyle(slot).display:null,slotHeight:slot?.getBoundingClientRect().height??null,gridHeight:grid?.getBoundingClientRect().height??null,liveCount:live.length,live:live.map(style),syntheticCount:synthetic.length,synthetic:synthetic.map(style)};
  },mobile);
  if(mobile){
    if(state.slotDisplay!=='none')throw Error(name+': mobile scorebar changed '+state.slotDisplay);
  }else{
    if(state.liveCount!==10)throw Error(name+': live count '+state.liveCount);
    if(Math.abs(state.slotHeight-120)>1.5||Math.abs(state.gridHeight-118)>1.5)throw Error(name+': geometry '+JSON.stringify(state));
    if(state.syntheticCount!==10)throw Error(name+': synthetic count '+state.syntheticCount);
    for(let i=0;i<9;i++){
      for(const [kind,c] of [['live',state.live[i]],['synthetic',state.synthetic[i]]]){
        if(c.borderRightWidth!=='1px'||c.borderRightStyle!=='solid'||!transparent(c.borderRightColor))throw Error(name+': '+kind+' divider '+i+' '+JSON.stringify(c));
        if(Math.abs(c.height-118)>1.5)throw Error(name+': '+kind+' height '+i+' '+c.height);
      }
    }
    const last=state.synthetic[9];
    if(last.borderRightWidth!=='0px'&&last.borderRightStyle!=='none')throw Error(name+': last divider changed '+JSON.stringify(last));
    const first={};state.synthetic.forEach(c=>{for(const s of Object.keys(expectedImages))if(c.cls.includes(s)&&!first[s])first[s]=c;});
    for(const [s,file] of Object.entries(expectedImages)){
      const c=first[s];if(!c)throw Error(name+': missing '+s);
      if(!c.backgroundImage.includes(file))throw Error(name+': '+s+' image lost '+c.backgroundImage);
      if(!c.backgroundSize.split(',').some(v=>v.trim()==='cover'))throw Error(name+': '+s+' cover lost '+c.backgroundSize);
      if(c.scrollHeight>c.height+1.5)throw Error(name+': '+s+' overflow '+JSON.stringify(c));
      const resp=await page.request.get('https://www.ball46.com/'+file+'?dividerpost='+Date.now());if(!resp.ok())throw Error(name+': '+s+' image HTTP '+resp.status());
    }
    await page.locator('#divider-post-grid').screenshot({path:path.join(OUT,name+'-synthetic.png')});
  }
  await page.screenshot({path:path.join(OUT,name+'-page.png'),fullPage:false});
  await ctx.close(); return {name,viewport,state,errs};
}
(async()=>{const b=await chromium.launch({headless:true});const report={at:new Date().toISOString(),production:true,views:[]};try{
  report.views.push(await inspect(b,{width:1920,height:900},'desktop-1920'));
  report.views.push(await inspect(b,{width:1440,height:900},'desktop-1440'));
  report.views.push(await inspect(b,{width:1000,height:850},'tablet-1000'));
  report.views.push(await inspect(b,{width:390,height:844},'mobile-390'));
  for(const v of report.views)if(v.errs.length)throw Error(v.name+': page errors '+JSON.stringify(v.errs));
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log('DIVIDER_POST_BROWSER_PASS');
}finally{await b.close();}})().catch(e=>{fs.writeFileSync(path.join(OUT,'error.txt'),String(e.stack||e));console.error(e.stack||e);process.exit(1)});
