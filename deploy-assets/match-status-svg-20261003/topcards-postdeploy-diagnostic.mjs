import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if(!executablePath)throw new Error('PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
mkdirSync('audit',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(`https://ball46.com/index.html?topcardsPostDeploy=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.workspace-scorebar-grid .workspace-scorebar-cell',{timeout:45000});
  await page.waitForTimeout(2000);
  const inspect=()=>page.evaluate(()=>{
    const grid=document.querySelector('.workspace-scorebar-grid');
    const cells=[...document.querySelectorAll('.workspace-scorebar-grid .workspace-scorebar-cell')];
    const actual=cells.find(x=>!x.classList.contains('placeholder'))||null;
    const sample=actual||cells[0]||null;
    const one=el=>{if(!el)return null;const s=getComputedStyle(el),m=el.querySelector('.workspace-scorebar-match'),ms=m?getComputedStyle(m):null;return{className:el.className,text:(el.innerText||'').slice(0,240),height:s.height,minHeight:s.minHeight,width:s.width,padding:s.padding,border:s.border,borderRadius:s.borderRadius,backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage,boxShadow:s.boxShadow,textShadow:s.textShadow,opacity:s.opacity,accent:s.getPropertyValue('--b46-card-accent').trim(),matchFont:ms?.fontSize||null}};
    const gs=getComputedStyle(grid);
    return{count:cells.length,actualCount:cells.filter(x=>!x.classList.contains('placeholder')).length,grid:{height:gs.height,gap:gs.gap,overflowX:gs.overflowX,gridTemplateColumns:gs.gridTemplateColumns},sample:one(sample),win:one(document.querySelector('.workspace-scorebar-signal-result.outcome-win')),loss:one(document.querySelector('.workspace-scorebar-signal-result.outcome-loss')),draw:one(document.querySelector('.workspace-scorebar-signal-result.outcome-draw')),pending:one(document.querySelector('.workspace-scorebar-pending')),css:[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.href)};
  });
  const validate=(d,label)=>{
    const errors=[];
    if(d.count!==10)errors.push(`${label}:TOPCARD_COUNT:${d.count}`);
    if(d.grid.height!=='100px')errors.push(`${label}:GRID_HEIGHT:${d.grid.height}`);
    if(d.grid.gap!=='8px')errors.push(`${label}:GAP:${d.grid.gap}`);
    if(d.grid.overflowX!=='auto')errors.push(`${label}:OVERFLOW_X:${d.grid.overflowX}`);
    if(d.sample?.height!=='90px')errors.push(`${label}:CARD_HEIGHT:${d.sample?.height}`);
    if(d.sample?.borderRadius!=='11px')errors.push(`${label}:RADIUS:${d.sample?.borderRadius}`);
    if(d.sample?.backgroundColor!=='rgb(17, 25, 34)')errors.push(`${label}:BG:${d.sample?.backgroundColor}`);
    if(/webp/i.test(d.sample?.backgroundImage||''))errors.push(`${label}:PHOTO_BACKGROUND:${d.sample?.backgroundImage}`);
    if(d.sample?.matchFont!==null&&Number.parseFloat(d.sample.matchFont)<9.5)errors.push(`${label}:MATCH_FONT:${d.sample.matchFont}`);
    if(d.win&&d.win.accent!=='#22c55e')errors.push(`${label}:WIN_ACCENT:${d.win.accent}`);
    if(d.loss&&d.loss.accent!=='#ef4444')errors.push(`${label}:LOSS_ACCENT:${d.loss.accent}`);
    if(d.pending&&d.pending.accent!=='#f59e0b')errors.push(`${label}:PENDING_ACCENT:${d.pending.accent}`);
    return errors;
  };
  const before=await inspect();
  const cssUrl=before.css.find(x=>x.includes('/dashboard-v2-tune.css'))||null;
  let markerPublic=false,cssHttp=null;
  if(cssUrl){const r=await page.request.get(cssUrl+(cssUrl.includes('?')?'&':'?')+`qa=${Date.now()}`,{headers:{'cache-control':'no-cache'}});cssHttp=r.status();if(r.ok())markerPublic=(await r.text()).includes('B46_TOPCARDS_CLEAN_UI_20261004')}
  await page.waitForTimeout(32000);
  const after=await inspect();
  await page.screenshot({path:'audit/topcards-postdeploy-live.png',fullPage:false});
  const errors=[...validate(before,'BEFORE'),...validate(after,'AFTER_REFRESH')];
  if(!cssUrl)errors.push('DASHBOARD_TUNE_STYLESHEET_NOT_LOADED');
  if(cssHttp!==200)errors.push(`DASHBOARD_TUNE_HTTP:${cssHttp}`);
  if(!markerPublic)errors.push('TOPCARDS_MARKER_NOT_PUBLIC');
  const data={ok:errors.length===0,markerPublic,cssHttp,errors,before,after};
  writeFileSync('audit/topcards-postdeploy-diagnostic.json',JSON.stringify(data,null,2));
  console.log(JSON.stringify(data,null,2));
  console.log('BALL46_TOPCARDS_POSTDEPLOY_OBSERVATION_DONE');
}finally{await browser.close()}
