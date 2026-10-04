#!/usr/bin/env bash
set -euo pipefail
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
export PLAYWRIGHT_EXECUTABLE_PATH
PLAYWRIGHT_EXECUTABLE_PATH=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
test -n "$PLAYWRIGHT_EXECUTABLE_PATH" || { echo CHROME_MISSING; exit 1; }
npm ci --ignore-scripts --no-audit --no-fund
mkdir -p audit/vintage-kits-live-verify
node --input-type=module <<'NODE'
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { activeVersion, publicFile, origin } from './production.mjs';
const VERSION='343-team-kits-v6-vintage24-frontname-20261004a';
const out='audit/vintage-kits-live-verify';
const report={checkedAt:new Date().toISOString(),activeVersion:await activeVersion(),origin};
const board=JSON.parse((await publicFile('/api/engine/board','json')).toString('utf8'));
report.board={ok:board?.ok===true,fixtures:Array.isArray(board?.fixtures)?board.fixtures.length:null};
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
report.ui=[];
try{
  for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
    const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
    await page.goto(`${origin}/index.html?vintageLayoutAudit=${Date.now()}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(v=>window.NOMAD_TEAM_KITS_343?.version===v,VERSION,{timeout:45000});
    await page.waitForTimeout(8000);
    const data=await page.evaluate(()=>{
      const row=document.querySelector('article.match-row');
      const cell=row?.querySelector('.teams-cell');
      const childData=cell?[...cell.children].map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {tag:el.tagName,cls:el.className,text:(el.textContent||'').trim(),display:s.display,position:s.position,gridColumn:s.gridColumn,gridRow:s.gridRow,width:r.width,height:r.height,x:r.x,y:r.y,margin:s.margin,padding:s.padding,fontSize:s.fontSize,lineHeight:s.lineHeight}}):[];
      const s=cell?getComputedStyle(cell):null,r=cell?.getBoundingClientRect();
      return {rowCount:document.querySelectorAll('article.match-row').length,cell:cell?{html:cell.outerHTML,display:s.display,gridTemplateColumns:s.gridTemplateColumns,gridTemplateRows:s.gridTemplateRows,gap:s.gap,columnGap:s.columnGap,rowGap:s.rowGap,alignItems:s.alignItems,width:r.width,height:r.height,children:childData}:null};
    });
    report.ui.push({viewport:vp.name,...data});
    await page.screenshot({path:`${out}/${vp.name}.png`,fullPage:true});
    await page.close();
  }
} finally {await browser.close();}
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
NODE
