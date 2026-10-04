import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
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
    return{
      count:cells.length,
      actualCount:cells.filter(x=>!x.classList.contains('placeholder')).length,
      grid:{height:gs.height,gap:gs.gap,overflowX:gs.overflowX,gridTemplateColumns:gs.gridTemplateColumns},
      sample:one(sample),
      win:one(document.querySelector('.workspace-scorebar-signal-result.outcome-win')),
      loss:one(document.querySelector('.workspace-scorebar-signal-result.outcome-loss')),
      draw:one(document.querySelector('.workspace-scorebar-signal-result.outcome-draw')),
      pending:one(document.querySelector('.workspace-scorebar-pending')),
      css:[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.href)
    };
  });
  const verify=(d,label)=>{
    assert.equal(d.count,10,`${label}:TOPCARD_COUNT_BAD`);
    assert.equal(d.grid.height,'100px',`${label}:TOPCARD_GRID_HEIGHT_BAD`);
    assert.equal(d.grid.gap,'8px',`${label}:TOPCARD_GAP_BAD`);
    assert.equal(d.grid.overflowX,'auto',`${label}:TOPCARD_SCROLL_BAD`);
    assert.equal(d.sample?.height,'90px',`${label}:TOPCARD_HEIGHT_BAD`);
    assert.equal(d.sample?.borderRadius,'11px',`${label}:TOPCARD_RADIUS_BAD`);
    assert.equal(d.sample?.backgroundColor,'rgb(17, 25, 34)',`${label}:TOPCARD_BG_BAD`);
    assert(!/webp/i.test(d.sample?.backgroundImage||''),`${label}:PHOTO_BACKGROUND_STILL_ACTIVE`);
    if(d.sample?.matchFont!==null)assert(Number.parseFloat(d.sample.matchFont)>=9.5,`${label}:MATCH_FONT_TOO_SMALL:${d.sample.matchFont}`);
    if(d.win)assert.equal(d.win.accent,'#22c55e',`${label}:WIN_ACCENT_BAD`);
    if(d.loss)assert.equal(d.loss.accent,'#ef4444',`${label}:LOSS_ACCENT_BAD`);
    if(d.pending)assert.equal(d.pending.accent,'#f59e0b',`${label}:PENDING_ACCENT_BAD`);
  };
  const before=await inspect();verify(before,'BEFORE');
  const cssUrl=before.css.find(x=>x.includes('/dashboard-v2-tune.css'));
  assert(cssUrl,'DASHBOARD_TUNE_STYLESHEET_NOT_LOADED');
  const cssResp=await page.request.get(cssUrl+(cssUrl.includes('?')?'&':'?')+`qa=${Date.now()}`,{headers:{'cache-control':'no-cache'}});
  assert(cssResp.ok(),'DASHBOARD_TUNE_HTTP_BAD');
  const cssText=await cssResp.text();
  assert(cssText.includes('B46_TOPCARDS_CLEAN_UI_20261004'),'TOPCARDS_MARKER_NOT_PUBLIC');
  await page.waitForTimeout(32000);
  const after=await inspect();verify(after,'AFTER_REFRESH');
  await page.screenshot({path:'audit/topcards-postdeploy-live.png',fullPage:false});
  const data={ok:true,markerPublic:true,before,after};
  writeFileSync('audit/topcards-postdeploy-diagnostic.json',JSON.stringify(data,null,2));
  console.log(JSON.stringify(data,null,2));
  console.log('BALL46_TOPCARDS_POSTDEPLOY_QA_PASS');
}finally{await browser.close()}
