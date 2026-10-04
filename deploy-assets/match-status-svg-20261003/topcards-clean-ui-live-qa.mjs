import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
mkdirSync('audit',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(`https://ball46.com/index.html?topcardsCleanQa=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.workspace-scorebar-grid .workspace-scorebar-cell',{timeout:45000});
  const inspect=()=>page.evaluate(()=>{
    const grid=document.querySelector('.workspace-scorebar-grid');
    const cells=[...document.querySelectorAll('.workspace-scorebar-grid .workspace-scorebar-cell')];
    const sample=cells.find(x=>!x.classList.contains('placeholder'))||cells[0];
    const win=document.querySelector('.workspace-scorebar-signal-result.outcome-win');
    const loss=document.querySelector('.workspace-scorebar-signal-result.outcome-loss');
    const pending=document.querySelector('.workspace-scorebar-pending');
    const pick=el=>{if(!el)return null;const s=getComputedStyle(el);return{height:s.height,borderRadius:s.borderRadius,backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage,boxShadow:s.boxShadow,accent:s.getPropertyValue('--b46-card-accent').trim()}};
    const g=getComputedStyle(grid),s=sample?getComputedStyle(sample):null,m=sample?.querySelector('.workspace-scorebar-match'),ms=m?getComputedStyle(m):null;
    return{count:cells.length,grid:{height:g.height,gap:g.gap,overflowX:g.overflowX,columns:g.gridTemplateColumns},sample:s?{height:s.height,borderRadius:s.borderRadius,backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage,textShadow:s.textShadow}:null,matchFont:ms?.fontSize||null,win:pick(win),loss:pick(loss),pending:pick(pending)};
  });
  const before=await inspect();
  assert.equal(before.count,10,'TOPCARD_COUNT_CHANGED');
  assert.equal(before.grid.gap,'8px','TOPCARD_GAP_BAD');
  assert.equal(before.grid.overflowX,'auto','TOPCARD_SCROLL_CONTRACT_BAD');
  assert.equal(before.sample.borderRadius,'11px','TOPCARD_RADIUS_BAD');
  assert.equal(before.sample.backgroundColor,'rgb(17, 25, 34)','TOPCARD_BACKGROUND_BAD');
  assert(!/webp/i.test(before.sample.backgroundImage||''),'TOPCARD_PHOTO_BACKGROUND_STILL_ACTIVE');
  assert(Number.parseFloat(before.matchFont)>=9.5,'TOPCARD_MATCH_FONT_TOO_SMALL');
  if(before.win)assert.equal(before.win.accent,'#22c55e','WIN_ACCENT_BAD');
  if(before.loss)assert.equal(before.loss.accent,'#ef4444','LOSS_ACCENT_BAD');
  if(before.pending)assert.equal(before.pending.accent,'#f59e0b','PENDING_ACCENT_BAD');
  await page.screenshot({path:'audit/topcards-clean-ui-live.png',fullPage:false});
  await page.waitForTimeout(32000);
  const after=await inspect();
  assert.equal(after.count,10,'TOPCARD_COUNT_CHANGED_AFTER_REFRESH');
  assert.equal(after.sample.borderRadius,'11px','TOPCARD_STYLE_LOST_AFTER_REFRESH');
  assert(!/webp/i.test(after.sample.backgroundImage||''),'TOPCARD_PHOTO_RETURNED_AFTER_REFRESH');
  console.log(JSON.stringify({ok:true,before,after},null,2));
  console.log('BALL46_TOPCARDS_CLEAN_UI_LIVE_QA_PASS');
}finally{await browser.close()}
