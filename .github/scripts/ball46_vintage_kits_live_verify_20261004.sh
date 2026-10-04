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
report.board={ok:board?.ok===true,fixtures:Array.isArray(board?.fixtures)?board.fixtures.length:null};
const index=(await publicFile('/index.html','text/html')).toString('utf8');
const kits=(await publicFile('/team-kits-343.js','javascript')).toString('utf8');
report.assets={loader:index.includes(`team-kits-343.js?v=${VERSION}`),kitVersion:kits.includes(`const VERSION='${VERSION}'`)};
assert(report.assets.loader,'LIVE_INDEX_KIT_LOADER_MISSING');
assert(report.assets.kitVersion,'LIVE_KIT_ASSET_VERSION_WRONG');

const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
report.ui=[];
try{
  for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
    const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
    const errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||'failed'}));
    await page.goto(`${origin}/index.html?vintageLiveVerify=${Date.now()}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(v=>window.NOMAD_TEAM_KITS_343?.version===v,VERSION,{timeout:45000});
    await page.waitForTimeout(8000);
    const data=await page.evaluate(()=>{
      const api=window.NOMAD_TEAM_KITS_343;
      api?.refresh?.();
      const cards=[...document.querySelectorAll('.match-card .fixture-scoreboard')].map(b=>b.closest('.match-card')).filter(Boolean);
      const rows=cards.map((card,i)=>{
        const hs=card.querySelector('.home-slot'),as=card.querySelector('.away-slot');
        const hn=hs?.querySelector('.team-name'),an=as?.querySelector('.team-name');
        const hi=hs?.querySelector('.team-kit-icon'),ai=as?.querySelector('.team-kit-icon');
        return {
          i,
          home:(hn?.textContent||'').trim(),away:(an?.textContent||'').trim(),
          homeKit:hi?.dataset.kit||null,awayKit:ai?.dataset.kit||null,
          homeBefore:Boolean(hi&&hn&&hi.nextElementSibling===hn),
          awayBefore:Boolean(ai&&an&&ai.nextElementSibling===an),
          homeVisible:Boolean(hi&&getComputedStyle(hi).display!=='none'&&hi.getBoundingClientRect().width>0),
          awayVisible:Boolean(ai&&getComputedStyle(ai).display!=='none'&&ai.getBoundingClientRect().width>0)
        };
      });
      return {version:api?.version||null,variantCount:api?.variantCount||null,realCount:cards.length,rows};
    });
    const bad=data.rows.filter(r=>!r.homeBefore||!r.awayBefore||!r.homeVisible||!r.awayVisible||!r.homeKit||!r.awayKit);
    report.ui.push({viewport:vp.name,...data,badCount:bad.length,badRows:bad.slice(0,20),pageErrors:errors,requestFailures:failed.filter(x=>/team-kits-343\.js/i.test(x.url))});
    await page.screenshot({path:`${out}/${vp.name}.png`,fullPage:true});
    await page.close();
  }
} finally { await browser.close(); }

for(const row of report.ui){
  assert.equal(row.version,VERSION,`KIT_VERSION_WRONG:${row.viewport}`);
  assert.equal(row.variantCount,24,`KIT_VARIANT_COUNT_WRONG:${row.viewport}`);
  assert.equal(row.badCount,0,`LIVE_CARD_KIT_PLACEMENT_BAD:${row.viewport}`);
  assert.equal(row.requestFailures.length,0,`KIT_ASSET_REQUEST_FAILED:${row.viewport}`);
}
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
NODE
