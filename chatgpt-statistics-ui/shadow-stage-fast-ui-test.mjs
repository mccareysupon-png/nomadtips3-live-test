// Real current website assets with intercepted staging reads and candidate fast client.
// No server-side writes, no production Worker mutation, credentials never reach browser.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildStage} from './shadow-cutover-stage-adapter.mjs';
import {createProjection} from './shadow-stage-live-projection.mjs';
import {createStageReadApi} from './shadow-stage-read-api.mjs';
import {patchStageFastUI} from './shadow-stage-fast-ui-patch.mjs';
import {normalizeRow} from './shadow-composite-cursor-stage.mjs';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');
const host='https://www.ball46.com',script='/b46-statistics-fast-v1-20261116.js';
const stage=await buildStage(),projection=createProjection(stage.next.raw,{at:stage.at}),api=createStageReadApi(projection);
const rawClient=await fetch(host+script,{headers:{'cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-Staging-QA'},signal:AbortSignal.timeout(25000)});
assert.equal(rawClient.status,200);
const patched=patchStageFastUI(await rawClient.text());new Function(patched);
const browser=await chromium.launch({headless:true});
const cases=[['all','all'],['ah','AH'],['1x2','1X2'],['ou','O/U'],['corners','Corners'],['btts','BTTS'],['cards','Cards'],['other','Other']];
const metrics=[];
const money=x=>Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const profile=async (routeMarket,market,mobile=false,interactive=false)=>{
 const ctx=await browser.newContext({viewport:{width:mobile?390:1366,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,timezoneId:'Asia/Bangkok',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[],reads=[],historic=[],replaced={count:0};
 page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
 await ctx.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());
  if(!['GET','HEAD'].includes(r.method()))return route.abort();
  if(u.origin!==host)return route.continue();
  if(u.pathname===script){replaced.count++;return route.fulfill({status:200,contentType:'application/javascript',body:patched})}
  if(u.pathname==='/api/engine/statistics'){historic.push(u.search);return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"STAGING_NO_HISTORY_RECOUNT"}'})}
  if(u.pathname.startsWith('/_stage/read/')){
   const start=performance.now(),x=api(u.pathname,u.search,r.method()),body=JSON.stringify(x.body);
   reads.push({path:u.pathname,bytes:Buffer.byteLength(body),ms:performance.now()-start,status:x.status});
   return route.fulfill({status:x.status,contentType:'application/json',headers:{'cache-control':'no-store'},body});
  }
  return route.continue();
 });
 try{
  const start=performance.now();
  const response=await page.goto(host+'/?view=statistics'+(routeMarket==='all'?'':'&market='+routeMarket),{waitUntil:'domcontentloaded',timeout:65000});
  assert.equal(response?.status(),200);
  try{await page.waitForFunction(m=>window.__B46_FAST_V1_DIAG?.status==='fast-preview-visible'&&window.__B46_FAST_V1_DIAG?.market===m,market,{timeout:25000})}
  catch(e){console.log('STAGE_FAST_UI_DIAG='+JSON.stringify({market,mobile,actualUrl:page.url(),diag:await page.evaluate(()=>window.__B46_FAST_V1_DIAG??null),historic:historic.length,replaced:replaced.count,errors}));throw e}
  const ms=Math.round(performance.now()-start);
  const g=projection.readGraph(market),view=await page.evaluate(()=>{
   const card=document.querySelector('#b46-finance-chart-card'),p=card?.querySelector('#b46-fast-v1-preview'),read=k=>p?.querySelector('[data-key="'+k+'"] b')?.textContent??null;
   return {cardCount:document.querySelectorAll('#b46-finance-chart-card').length,graph:!!p?.querySelector('svg')?.getClientRects().length,net:p?.querySelector('.b46-fast-net')?.textContent,rate:read('rate'),settled:read('settled'),pendingButton:p?.querySelector('[data-stage-pending]')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+2,hiddenOld:getComputedStyle(document.querySelector('.sp-kpis')).display==='none'};
  });
  assert(view.cardCount===1&&view.graph&&view.hiddenOld&&!view.overflow);
  assert.equal(view.net,(g.summary.net>=0?'+':'')+money(g.summary.net)+' U');
  assert.equal(view.settled,g.summary.rows.toLocaleString('en-US'));
  assert.equal(view.pendingButton,'Pending ('+projection.pendingPage({market}).pending+')');
  assert.equal(historic.length,0,market+':HISTORY_RECOUNT_ATTEMPT');
  assert(replaced.count>0);assert.equal(errors.length,0,JSON.stringify(errors));
  if(interactive){
   const tap=async loc=>{await loc.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}));await loc.click({timeout:12000})};
   await tap(page.locator('[data-stage-pending]'));
   const p=projection.pendingPage({market});
   await page.waitForFunction(n=>document.querySelectorAll('[data-stage-records="pending"] tr').length===n,p.rows.length,{timeout:12000});
   if(p.rows.length){
    await tap(page.locator('[data-stage-records="pending"] tr').first());
    const d=page.locator('[data-stage-match-detail]');await d.waitFor({timeout:12000});
    assert.deepEqual(JSON.parse(await d.textContent()),JSON.parse(JSON.stringify(p.rows[0])));
   }
   await tap(page.locator('#b46-fast-v1-preview .b46-fast-details:not([data-stage-pending])').first());
   const h=projection.historyPage({market});
   await page.waitForFunction(n=>document.querySelectorAll('[data-stage-records="history"] tr').length===n,h.rows.length,{timeout:12000});
   if(h.rows.length){
    await tap(page.locator('[data-stage-records="history"] tr').first());
    const d=page.locator('[data-stage-match-detail]');await d.waitFor({timeout:12000});
    assert.deepEqual(JSON.parse(await d.textContent()),JSON.parse(JSON.stringify(h.rows[0])));
   }
   if(h.next!=null){
    await tap(page.locator('[data-stage-records="history"] button'));
    await page.waitForFunction(n=>document.querySelectorAll('[data-stage-records="history"] tr').length===n,Math.min(h.total,100),{timeout:12000});
   }
   assert.equal(historic.length,0);
  }
  const result={market,mobile,firstPaintMs:ms,legacyHistoryRequests:historic.length,chart:true,settled:g.summary.rows,pending:projection.pendingPage({market}).pending,detailUI:interactive,jsErrors:errors.length,maxResponseBytes:Math.max(...reads.map(x=>x.bytes))};
  console.log('STAGE_FAST_UI_CASE='+JSON.stringify(result));metrics.push(result);
  return {ctx,page,historic,errors,reads};
 }catch(e){await ctx.close();throw e}
};
try{
 for(const [m,k] of cases){const x=await profile(m,k,false,k==='all');await x.ctx.close()}
 const mob=await profile('all','all',true,true);await mob.ctx.close();
 const x=await profile('all','all',false,false);
 const row={id:'STAGING-UI-LOCAL-ONLY',status:'PENDING',market:'ft_ah',createdAt:Date.now(),odds:2,home:'Stage A',away:'Stage B',league:'STAGING ONLY'};
 const basePending=stage.next.pending.length,initial=projection.readGraph().summary.rows;
 projection.refreshPending({rows:[...stage.next.pending,...stage.next.unresolved,row],pending:basePending+1,unresolved:stage.next.unresolved.length,verifiedAt:Date.now()});
 await x.page.waitForFunction(n=>document.querySelector('[data-stage-pending]')?.textContent==='Pending ('+n+')',basePending+1,{timeout:12000});
 const start=performance.now();
 projection.apply({seq:1,previous:null,next:normalizeRow({...row,status:'SETTLED',result:'WIN',settledAt:Date.now()}),at:Date.now()},row);
 await x.page.waitForFunction(n=>window.__B46_FAST_V1_DIAG?.revisionSequence===1&&document.querySelector('#b46-fast-v1-preview [data-key="settled"] b')?.textContent===n.toLocaleString('en-US'),initial+1,{timeout:12000});
 assert.equal(await x.page.locator('[data-stage-pending]').textContent(),'Pending ('+basePending+')');
 assert.equal(x.historic.length,0);assert.equal(x.errors.length,0);
 console.log('STAGE_FAST_UI_LIVE_CHANGE='+JSON.stringify({uiRefreshMs:Math.round(performance.now()-start),settledDelta:1,pendingDelta:-1,graphNetDelta:1,testEventLocalOnly:true,historyRequests:0}));
 await x.ctx.close();
 console.log('STAGE_FAST_UI_SUMMARY='+JSON.stringify({cases:metrics.length,allGroups:7,pcAndMobile:true,historyReadBeforePaint:0,noProductionWrites:true,scope:'ALL_TIME_MAIN_MARKETS_ONLY; ADVANCED FILTERS NOT MIGRATED'}));
}finally{await browser.close()}
