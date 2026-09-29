const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const CSS='/tmp/b46-divider-predeploy/candidate/dashboard-v2-tune.css';
const OUT='/tmp/b46-divider-preview';
fs.mkdirSync(OUT,{recursive:true});
const tune=fs.readFileSync(CSS,'utf8');
const expectedImages={
  win:'scorebar-win-20260929a.webp',
  loss:'scorebar-loss-20260929a.webp',
  draw:'scorebar-draw-20260929a.webp',
  pending:'scorebar-pending-20260929a.webp'
};
function transparent(v){return v==='rgba(0, 0, 0, 0)'||v==='transparent';}
async function runView(browser,width,height,name){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  const page=await ctx.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/dashboard-v2-tune.css*',r=>r.fulfill({status:200,contentType:'text/css; charset=utf-8',body:tune}));
  await page.goto('https://www.ball46.com/?dividerpreview='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('[data-workspace-scorebar-slot]',{state:'attached',timeout:30000});
  await page.waitForTimeout(800);
  const mobile=width<=760;
  if(!mobile){
    await page.evaluate(()=>{
      document.querySelector('#divider-preview-grid')?.remove();
      const slot=document.querySelector('[data-workspace-scorebar-slot]');
      const host=document.createElement('div');
      host.id='divider-preview-grid';
      host.className='workspace-scorebar-grid';
      host.style.cssText='width:100%;margin-top:8px;';
      const states=['win','loss','draw','pending','win','loss','draw','pending','win','loss'];
      const labels=['WIN','LOSS','DRAW','PENDING','WIN','LOSS','DRAW','PENDING','WIN','LOSS'];
      states.forEach((s,i)=>{
        const d=document.createElement('div');
        d.className=s==='pending'?'workspace-scorebar-cell workspace-scorebar-pending':'workspace-scorebar-cell workspace-scorebar-signal-result outcome-'+s;
        d.dataset.dividerTest=s;
        d.innerHTML='<span class="workspace-scorebar-meta"><i>'+labels[i]+'</i><b>1–0</b></span><span class="workspace-scorebar-match">Ball46 · Divider Test</span><span class="workspace-scorebar-pick"><strong>Full Time</strong><em>ENTRY @ 1.90</em></span><span class="workspace-scorebar-details"><span class="workspace-scorebar-detail-entry"><i>ENTRY</i><b>0–0</b></span><span class="workspace-scorebar-detail-minute">55\'</span><span class="workspace-scorebar-detail-current"><i>NOW</i><b>1–0</b></span></span>';
        host.appendChild(d);
      });
      slot.after(host);
    });
    await page.waitForTimeout(250);
  }
  const state=await page.evaluate((mobile)=>{
    const slot=document.querySelector('[data-workspace-scorebar-slot]');
    const grid=slot?.querySelector('.workspace-scorebar-grid');
    const live=[...(slot?.querySelectorAll('.workspace-scorebar-cell')||[])];
    const host=document.querySelector('#divider-preview-grid');
    const synthetic=host?[...host.children]:[];
    const style=(el)=>{if(!el)return null;const cs=getComputedStyle(el),r=el.getBoundingClientRect();return{
      cls:el.className,width:r.width,height:r.height,scrollHeight:el.scrollHeight,boxSizing:cs.boxSizing,
      borderRightWidth:cs.borderRightWidth,borderRightStyle:cs.borderRightStyle,borderRightColor:cs.borderRightColor,
      backgroundImage:cs.backgroundImage,backgroundSize:cs.backgroundSize,backgroundPosition:cs.backgroundPosition
    }};
    return {
      mobile,
      slotDisplay:slot?getComputedStyle(slot).display:null,
      slotHeight:slot?.getBoundingClientRect().height??null,
      gridHeight:grid?.getBoundingClientRect().height??null,
      liveCount:live.length,
      live:live.map(style),
      syntheticCount:synthetic.length,
      synthetic:synthetic.map(style)
    };
  },mobile);
  if(mobile){
    if(state.slotDisplay!=='none')throw new Error(name+': mobile scorebar visibility changed: '+state.slotDisplay);
  } else {
    if(state.liveCount!==10)throw new Error(name+': live count '+state.liveCount);
    if(Math.abs(state.slotHeight-120)>1.5||Math.abs(state.gridHeight-118)>1.5)throw new Error(name+': base geometry drift '+JSON.stringify(state));
    if(state.syntheticCount!==10)throw new Error(name+': synthetic count '+state.syntheticCount);
    for(let i=0;i<9;i++){
      for(const [kind,card] of [['live',state.live[i]],['synthetic',state.synthetic[i]]]){
        if(card.borderRightWidth!=='1px')throw new Error(name+': '+kind+' '+i+' width '+card.borderRightWidth);
        if(card.borderRightStyle!=='solid')throw new Error(name+': '+kind+' '+i+' style '+card.borderRightStyle);
        if(!transparent(card.borderRightColor))throw new Error(name+': '+kind+' '+i+' color '+card.borderRightColor);
        if(Math.abs(card.height-118)>1.5)throw new Error(name+': '+kind+' '+i+' height '+card.height);
      }
    }
    const last=state.synthetic[9];
    if(last.borderRightWidth!=='0px'&&last.borderRightStyle!=='none')throw new Error(name+': last card gained divider '+JSON.stringify(last));
    const firstByState={};
    state.synthetic.forEach(c=>{for(const s of ['win','loss','draw','pending'])if(c.cls.includes(s)&&!firstByState[s])firstByState[s]=c;});
    for(const [s,file] of Object.entries(expectedImages)){
      const c=firstByState[s]; if(!c)throw new Error(name+': missing synthetic '+s);
      if(!c.backgroundImage.includes(file))throw new Error(name+': '+s+' image mapping lost '+c.backgroundImage);
      if(!c.backgroundSize.split(',').some(v=>v.trim()==='cover'))throw new Error(name+': '+s+' not cover '+c.backgroundSize);
      if(c.scrollHeight>c.height+1.5)throw new Error(name+': '+s+' overflow '+JSON.stringify(c));
    }
    await page.locator('#divider-preview-grid').screenshot({path:path.join(OUT,name+'-synthetic.png')});
  }
  await page.screenshot({path:path.join(OUT,name+'-page.png'),fullPage:false});
  await ctx.close();
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
    for(const x of report)if(x.errors.length)throw new Error(x.name+': page errors '+JSON.stringify(x.errors));
    fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
    console.log('DIVIDER_PREVIEW_PASS');
  } finally { await browser.close(); }
})().catch(e=>{fs.writeFileSync(path.join(OUT,'error.txt'),String(e.stack||e));console.error(e.stack||e);process.exit(1)});
