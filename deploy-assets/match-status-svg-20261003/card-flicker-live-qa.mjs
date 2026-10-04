import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
const run=process.env.GITHUB_RUN_ID||Date.now();
let boardRequests=0;
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('request',req=>{if(new URL(req.url()).pathname==='/api/engine/board')boardRequests++});
  await page.goto(`https://ball46.com/index.html?stableDomQa=${run}-${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  const asset=await page.request.get(`https://ball46.com/dashboard-v2-stage3.js?stableDomQa=${run}-${Date.now()}`,{headers:{'cache-control':'no-cache'}});
  assert(asset.ok(),'DASHBOARD_ASSET_HTTP_BAD');
  const assetText=await asset.text();
  assert(assetText.includes('B46_STABLE_MATCH_CARD_DOM_20261004'),'STABLE_DOM_MARKER_NOT_LIVE');
  await page.waitForSelector('[data-board-sections] [data-match-id]',{timeout:45000});
  const before=await page.evaluate(()=>{
    const rows=[...document.querySelectorAll('[data-board-sections] [data-match-id]')];
    window.__b46StableDomQa=new Map(rows.map(el=>[String(el.dataset.matchId||''),el]));
    return rows.map(el=>String(el.dataset.matchId||'')).filter(Boolean);
  });
  assert(before.length>0,'NO_MATCH_ROWS_FOR_STABLE_DOM_QA');
  const started=Date.now();
  while(boardRequests<2 && Date.now()-started<50000)await page.waitForTimeout(500);
  assert(boardRequests>=2,`SECOND_BOARD_REFRESH_NOT_OBSERVED:${boardRequests}`);
  await page.waitForTimeout(3500);
  const result=await page.evaluate(ids=>{
    const current=new Map([...document.querySelectorAll('[data-board-sections] [data-match-id]')].map(el=>[String(el.dataset.matchId||''),el]));
    const common=ids.filter(id=>current.has(id));
    const preserved=common.filter(id=>window.__b46StableDomQa?.get(id)===current.get(id));
    return {common,preserved,current:[...current.keys()]};
  },before);
  assert(result.common.length>0,'NO_COMMON_MATCH_AFTER_REFRESH');
  assert.equal(result.preserved.length,result.common.length,`MATCH_CARD_NODE_RECREATED:${JSON.stringify({common:result.common,preserved:result.preserved})}`);
  console.log(JSON.stringify({ok:true,boardRequests,beforeCount:before.length,currentCount:result.current.length,commonCount:result.common.length,preservedCount:result.preserved.length,sample:result.common.slice(0,8)},null,2));
  console.log('BALL46_CARD_FLICKER_LIVE_QA_PASS');
}finally{await browser.close()}
