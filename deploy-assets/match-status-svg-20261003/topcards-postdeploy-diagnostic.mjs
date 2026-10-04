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
  const data=await page.evaluate(()=>{
    const grid=document.querySelector('.workspace-scorebar-grid');
    const cells=[...document.querySelectorAll('.workspace-scorebar-grid .workspace-scorebar-cell')];
    const sample=cells.find(x=>!x.classList.contains('placeholder'))||cells[0];
    const one=el=>{if(!el)return null;const s=getComputedStyle(el),m=el.querySelector('.workspace-scorebar-match'),ms=m?getComputedStyle(m):null;return{className:el.className,text:(el.innerText||'').slice(0,240),height:s.height,minHeight:s.minHeight,width:s.width,padding:s.padding,border:s.border,borderRadius:s.borderRadius,backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage,boxShadow:s.boxShadow,textShadow:s.textShadow,accent:s.getPropertyValue('--b46-card-accent').trim(),matchFont:ms?.fontSize||null}};
    const gs=getComputedStyle(grid);
    return{
      count:cells.length,
      grid:{height:gs.height,gap:gs.gap,overflowX:gs.overflowX,gridTemplateColumns:gs.gridTemplateColumns},
      sample:one(sample),
      win:one(document.querySelector('.workspace-scorebar-signal-result.outcome-win')),
      loss:one(document.querySelector('.workspace-scorebar-signal-result.outcome-loss')),
      draw:one(document.querySelector('.workspace-scorebar-signal-result.outcome-draw')),
      pending:one(document.querySelector('.workspace-scorebar-pending')),
      css:[...document.styleSheets].map(x=>x.href).filter(Boolean),
      cssMarker:[...document.styleSheets].some(sheet=>{try{return [...sheet.cssRules].some(r=>String(r.cssText||'').includes('B46_TOPCARDS_CLEAN_UI_20261004'))}catch{return false}})
    };
  });
  await page.screenshot({path:'audit/topcards-postdeploy-live.png',fullPage:false});
  writeFileSync('audit/topcards-postdeploy-diagnostic.json',JSON.stringify(data,null,2));
  console.log(JSON.stringify(data,null,2));
  console.log('BALL46_TOPCARDS_POSTDEPLOY_DIAGNOSTIC_DONE');
}finally{await browser.close()}
