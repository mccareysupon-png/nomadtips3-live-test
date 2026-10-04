#!/usr/bin/env bash
set -euo pipefail
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
export PLAYWRIGHT_EXECUTABLE_PATH
PLAYWRIGHT_EXECUTABLE_PATH=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
test -n "$PLAYWRIGHT_EXECUTABLE_PATH" || { echo CHROME_MISSING; exit 1; }
npm ci --ignore-scripts --no-audit --no-fund
mkdir -p audit/vintage-kits-live-verify
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { activeVersion, publicFile, origin } from './production.mjs';

const VERSION='343-team-kits-v6-vintage24-frontname-20261004a';
const out='audit/vintage-kits-live-verify';
const report={checkedAt:new Date().toISOString(),activeVersion:await activeVersion(),origin};
const board=JSON.parse((await publicFile('/api/engine/board','json')).toString('utf8'));
const fixtures=Array.isArray(board?.fixtures)?board.fixtures:[];
report.board={ok:board?.ok===true,fixtures:fixtures.length,sample:fixtures.slice(0,3)};
const index=(await publicFile('/index.html','text/html')).toString('utf8');
const kits=(await publicFile('/team-kits-343.js','javascript')).toString('utf8');
report.assets={loader:index.includes(`team-kits-343.js?v=${VERSION}`),kitVersion:kits.includes(`const VERSION='${VERSION}'`)};
assert(report.assets.loader,'LIVE_INDEX_KIT_LOADER_MISSING');
assert(report.assets.kitVersion,'LIVE_KIT_ASSET_VERSION_WRONG');

const pickName=(f,side)=>{
  const cap=side[0].toUpperCase()+side.slice(1);
  const values=[f?.[side]?.name,f?.teams?.[side]?.name,f?.[`${side}_name`],f?.[`team${cap}`],f?.[side]];
  return values.find(v=>typeof v==='string'&&v.trim())?.trim()||null;
};
const targetNames=[];
for(const f of fixtures.slice(0,20)) for(const side of ['home','away']) { const n=pickName(f,side); if(n&&!targetNames.includes(n)) targetNames.push(n); }
report.targetNames=targetNames.slice(0,20);

const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
report.ui=[];
try{
  for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
    const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
    const errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||'failed'}));
    await page.goto(`${origin}/index.html?vintageLiveTrace=${Date.now()}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(v=>window.NOMAD_TEAM_KITS_343?.version===v,VERSION,{timeout:45000});
    await page.waitForTimeout(8000);
    const data=await page.evaluate((names)=>{
      const api=window.NOMAD_TEAM_KITS_343; api?.refresh?.();
      const all=[...document.querySelectorAll('body *')];
      const exact=[];
      for(const name of names){
        for(const el of all){
          if(el.children.length===0 && (el.textContent||'').trim()===name){
            const r=el.getBoundingClientRect();
            if(r.width>0&&r.height>0){
              const chain=[];let p=el;
              for(let i=0;i<5&&p;i++,p=p.parentElement) chain.push({tag:p.tagName,cls:typeof p.className==='string'?p.className:'',id:p.id||'',html:p.outerHTML.slice(0,1800)});
              exact.push({name,tag:el.tagName,cls:typeof el.className==='string'?el.className:'',x:Math.round(r.x),y:Math.round(r.y),chain});
            }
          }
        }
      }
      const likely=[...document.querySelectorAll('[class*="team"],[class*="fixture"],[class*="match"]')].filter(el=>{
        const r=el.getBoundingClientRect(); return r.width>0&&r.height>0;
      }).slice(0,250).map(el=>({tag:el.tagName,cls:typeof el.className==='string'?el.className:'',text:(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,260)}));
      return {version:api?.version||null,variantCount:api?.variantCount||null,exact:exact.slice(0,100),likely};
    },targetNames.slice(0,20));
    report.ui.push({viewport:vp.name,...data,pageErrors:errors,kitRequestFailures:failed.filter(x=>/team-kits-343\.js/i.test(x.url))});
    await page.screenshot({path:`${out}/${vp.name}.png`,fullPage:true});
    await page.close();
  }
} finally { await browser.close(); }
for(const row of report.ui){
  assert.equal(row.version,VERSION,`KIT_VERSION_WRONG:${row.viewport}`);
  assert.equal(row.variantCount,24,`KIT_VARIANT_COUNT_WRONG:${row.viewport}`);
  assert.equal(row.kitRequestFailures.length,0,`KIT_ASSET_REQUEST_FAILED:${row.viewport}`);
}
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({activeVersion:report.activeVersion,board:report.board.fixtures,targetNames:report.targetNames,ui:report.ui.map(x=>({viewport:x.viewport,exact:x.exact.length,likely:x.likely.length}))},null,2));
NODE
