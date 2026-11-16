// Browser-only candidate: replace ONLY fast-client.js in the browser.
 // This QA makes ZERO Cloudflare Worker, Engine, Ledger, or KV writes.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=new URL('./',import.meta.url);
const patch=await readFile(new URL('./fast-client-hotfix-20261116.js',root),'utf8');
await mkdir(new URL('./hotfix-audit/',root),{recursive:true});
const base='https://ball46-production.mccarey-supon.workers.dev';
const browser=await chromium.launch({headless:true});
const scripts=[];
async function makeContext(name,width=1366,height=900,isMobile=false){
  const ctx=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Bangkok',
    isMobile,hasTouch:isMobile});
  const page=await ctx.newPage(),errors=[],api=[];
  page.on('pageerror',e=>errors.push(e.message.slice(0,160)));
  page.on('response',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')api.push(r.status())});
  await page.route('**/b46-statistics-fast-v1-20261116.js*',route=>{
    scripts.push(name);
    return route.fulfill({status:200,contentType:'application/javascript; charset=utf-8',body:patch});
  });
  return {ctx,page,errors,api};
}
async function state(page){
return page.evaluate(()=>{
  const el=s=>document.querySelector(s);
  const rect=e=>{const r=e?.getBoundingClientRect();return r?{x:r.x,y:r.y,w:r.width,h:r.height}:null};
  const visible=e=>!!e?.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  const card=el('#b46-finance-chart-card'),legacy=el('.b46-stats-loader'),overview=card?.querySelector('.f46-overview'),
     market=card?.querySelector('.b46-v1-market-outcomes'),detail=card?.querySelector('.b46-v1-market-detail-grid'),
     metrics=card?.querySelector('.f46-metrics'),preview=el('#b46-fast-v1-preview');
  const outcomes=[...market?.querySelectorAll('.b46-v1-market-track span')||[]].map(x=>Number(x.dataset.count));
  const kpis=[...detail?.children||[]].map(e=>({key:e.dataset.key,text:e.querySelector('b')?.textContent}));
  const nativeKPIs=[...metrics?.children||[]].map(e=>({label:e.querySelector('span')?.textContent,text:e.querySelector('b')?.textContent}));
  const bounds=rect(overview);const parts=overview?[...overview.children].map(e=>({
    cls:e.className||'',rect:rect(e)})):[];
  return {url:location.href,diag:window.__B46_FAST_V1_DIAG,
    bodyMarket:el('[data-stat-market].active')?.dataset.statMarket,
    legacy:{count:document.querySelectorAll('.b46-stats-loader').length,
      display:legacy?getComputedStyle(legacy).display:null,visible:visible(legacy)},
    previewVisible:visible(preview),nativeVisible:visible(el('#b46-finance-chart-card svg.f46-svg')),
    nativeCardCount:document.querySelectorAll('#b46-finance-chart-card').length,
    marketPanel:{present:!!market,visible:visible(market),outcomes,kpis,nativeKPIs,bounds,parts},
    duplicateGraph:!!(preview&&el('#b46-finance-chart-card svg.f46-svg')),
    overflow:document.documentElement.scrollWidth>innerWidth+2};
});
}
const now=Date.now();
try{
  const total=await makeContext('total');
  await total.page.goto(base+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:65000});
  await total.page.waitForFunction(()=>window.__B46_FAST_V1_DIAG?.status==='fast-preview-visible',null,{timeout:20000});
  await total.page.waitForTimeout(400);
  const t=await state(total.page);
  assert.equal(scripts.filter(x=>x==='total').length,1,'FAST_SCRIPT_NOT_REPLACED');
  assert(t.previewVisible&&t.nativeCardCount===1&&!t.legacy.visible,'LEGACY_LOADER_VISIBLE_WITH_VERIFIED_TOTAL');
  assert(!t.duplicateGraph&&!t.overflow,'TOTAL_DUPLICATE_OR_OVERFLOW');
  assert.equal(total.api.length,0,'TOTAL_EARLY_LEDGER_FETCH');
  console.log('B46_HOTFIX_TOTAL='+JSON.stringify({ok:true,legacy:t.legacy,fastMs:t.diag.fastPaintMs,apiBeforeClick:total.api.length,viewport:1366}));
  await total.page.screenshot({path:new URL('./hotfix-audit/total-fast.png',root).pathname,fullPage:false});
  // A slow legacy history load should not re-expose old loading UI while saved
  // verified first paint remains on the screen.
  await total.page.waitForTimeout(1200);
  const stable=await state(total.page);
  assert(!stable.legacy.visible&&stable.previewVisible,'OLD_LOADER_REAPPEARED_AFTER_FAST_PAINT');
  await total.ctx.close();
  for(const test of [{name:'1x2',path:'/?view=statistics&market=1x2'},
                     {name:'ah',path:'/?view=statistics&market=ah'}]){
    const {ctx,page,errors,api}=await makeContext(test.name,1600,900);
    await page.goto(base+test.path,{waitUntil:'domcontentloaded',timeout:65000});
    await page.waitForFunction(()=>!!document.querySelector('#b46-finance-chart-card .b46-v1-market-outcomes')&&
      !!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length,
      null,{timeout:85000});
    const s=await state(page);
    const counts=s.marketPanel.outcomes;
    assert(s.marketPanel.present&&s.marketPanel.visible,'MARKET_OUTCOMES_NOT_VISIBLE_'+test.name);
    assert(counts.length===3&&counts.every(Number.isSafeInteger),'MARKET_OUTCOMES_BAD_COUNTS_'+test.name);
    const settled=Number(s.marketPanel.nativeKPIs.find(x=>x.label==='SETTLED')?.text?.replace(/,/g,''));
    assert.equal(counts.reduce((a,b)=>a+b,0),settled,'MARKET_OUTCOMES_NATIVE_PARITY_'+test.name);
    assert.deepEqual(s.marketPanel.kpis.map(x=>x.key),['stake','drawdown','wpl'],
      'MARKET_EXTRA_KPIS_MISSING_'+test.name);
    assert(s.marketPanel.bounds?.h>0&&!s.overflow&&!s.duplicateGraph,'MARKET_GEOMETRY_'+test.name);
    const boxes=s.marketPanel.parts.map(x=>x.rect).filter(Boolean);
    for(let i=1;i<boxes.length;i++)assert(boxes[i].y>=boxes[i-1].y+boxes[i-1].h-4,
      'MARKET_CARDS_OVERLAP_'+test.name+'_'+i);
    assert.equal(errors.length,0,'MARKET_JS_ERRORS_'+test.name+JSON.stringify(errors));
    console.log('B46_HOTFIX_MARKET='+JSON.stringify({name:test.name,ok:true,settled,
      counts,kpis:s.marketPanel.kpis,bounds:s.marketPanel.bounds,legacyVisible:s.legacy.visible,
      apiCalls:api.length,errors}));
    await page.screenshot({path:new URL('./hotfix-audit/'+test.name+'-enhanced.png',root).pathname,fullPage:false});
    await ctx.close();
  }
  const mobile=await makeContext('mobile',390,844,true);
  await mobile.page.goto(base+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:65000});
  await mobile.page.waitForFunction(()=>window.__B46_FAST_V1_DIAG?.status==='fast-preview-visible',null,{timeout:20000});
  const m=await state(mobile.page);
  assert(m.previewVisible&&!m.legacy.visible&&!m.marketPanel.present&&!m.overflow,
    'MOBILE_FAST_OLD_LOADER_OR_LAYOUT_LEAK');
  console.log('B46_HOTFIX_MOBILE='+JSON.stringify({ok:true,fastMs:m.diag.fastPaintMs,legacy:m.legacy}));
  await mobile.page.screenshot({path:new URL('./hotfix-audit/mobile-fast.png',root).pathname,fullPage:false});
  await mobile.ctx.close();
  console.log('B46_HOTFIX_READONLY_PASS='+JSON.stringify({elapsedMs:Date.now()-now,
    scriptsReplaced:scripts,networkWrites:0,productionWorkerChanged:false}));
}finally{await browser.close()}
