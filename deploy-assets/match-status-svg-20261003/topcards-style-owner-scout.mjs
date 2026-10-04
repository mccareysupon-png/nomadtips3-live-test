import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
mkdirSync('audit',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(`https://ball46.com/index.html?topcardsStyleScout=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.workspace-scorebar-grid',{timeout:45000});
  const data=await page.evaluate(()=>{
    const selectors=['.workspace-scorebar-grid','.workspace-scorebar-cell','.workspace-scorebar-meta','.workspace-scorebar-match','.workspace-scorebar-pick','.workspace-scorebar-details','.workspace-scorebar-pending','.workspace-scorebar-signal-result'];
    const matched=[];
    for(const sheet of [...document.styleSheets]){
      let rules=[];try{rules=[...sheet.cssRules]}catch{continue}
      const walk=(list)=>{for(const r of list){if(r.cssRules)walk([...r.cssRules]);if(!r.selectorText)continue;if(selectors.some(s=>r.selectorText.includes(s)))matched.push({href:sheet.href||'INLINE',selector:r.selectorText,cssText:r.cssText})}};
      walk(rules);
    }
    const sample=document.querySelector('.workspace-scorebar-cell');
    const grid=document.querySelector('.workspace-scorebar-grid');
    const cs=sample?getComputedStyle(sample):null,gs=grid?getComputedStyle(grid):null;
    return {
      html:grid?.outerHTML||'',
      matched,
      cellComputed:cs?{display:cs.display,width:cs.width,height:cs.height,minHeight:cs.minHeight,padding:cs.padding,border:cs.border,borderRadius:cs.borderRadius,background:cs.background,boxShadow:cs.boxShadow,fontFamily:cs.fontFamily,fontSize:cs.fontSize,color:cs.color}:null,
      gridComputed:gs?{display:gs.display,gridTemplateColumns:gs.gridTemplateColumns,gap:gs.gap,overflowX:gs.overflowX}:null,
      scripts:[...document.scripts].map(s=>s.src).filter(Boolean),
      styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.href)
    };
  });
  writeFileSync('audit/topcards-style-owner.json',JSON.stringify(data,null,2));
  console.log(JSON.stringify({ok:true,matched:data.matched.length,styles:data.styles,cellComputed:data.cellComputed,gridComputed:data.gridComputed},null,2));
  console.log('BALL46_TOPCARDS_STYLE_OWNER_SCOUT_PASS');
}finally{await browser.close()}
