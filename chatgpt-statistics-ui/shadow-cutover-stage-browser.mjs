// Browser-isolated staging: identical production assets, staged read responses.
// No production or staging Worker mutation. No browser access to credentials.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildStage,createAdapter} from './shadow-cutover-stage-adapter.mjs';
import {MARKET_GROUPS} from './market-groups-stage.mjs';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');
const stage=await buildStage(),adapter=createAdapter(stage);
const routes=['/b46-fast-v1/head','/b46-fast-v1/chart','/api/engine/statistics','/_stage/pending','/_stage/market'];
assert.equal(adapter.getMode(),'legacy');
assert.equal(adapter.response('/b46-fast-v1/head').source,'legacy');
adapter.setMode('receiver');
for(const m of MARKET_GROUPS){
 const q=adapter.response('/_stage/market','market='+encodeURIComponent(m));assert.equal(q.status,200);assert.equal(q.body.total,stage.next.markets[m].total);
}
const pending=adapter.response('/_stage/pending');assert.equal(pending.body.count,stage.next.pending.length);assert(pending.body.rows.every(x=>x.status==='PENDING'));
assert.equal(adapter.response('/_stage/market','market=invalid').status,400);
adapter.setAvailable(false);assert.equal(adapter.response('/b46-fast-v1/head').source,'legacy');assert.equal(adapter.response('/b46-fast-v1/chart').source,'legacy');
adapter.setAvailable(true);adapter.setMode('legacy');assert.equal(adapter.response('/b46-fast-v1/head').source,'legacy');
console.log('STAGE_KILL_SWITCH='+JSON.stringify({default:'legacy',manual:'PASS',simulatedUnavailable:'PASS',productionConfigChanged:false}));
const browser=await chromium.launch({headless:true});
const cases=[{name:'pc-total',market:null,width:1366,height:900},{name:'mobile-total',market:null,width:390,height:844,mobile:true},{name:'pc-ah',market:'ah',width:1366,height:900},{name:'pc-1x2',market:'1x2',width:1366,height:900}];
const host='https://www.ball46.com';
async function run(c,mode){
 adapter.setMode(mode);
 const ctx=await browser.newContext({viewport:{width:c.width,height:c.height},isMobile:!!c.mobile,hasTouch:!!c.mobile,timezoneId:'Asia/Bangkok',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[],calls=[],blocked=[];
 page.on('pageerror',e=>errors.push(e.message.slice(0,180)));
 await ctx.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(!['GET','HEAD'].includes(req.method())){blocked.push({method:req.method(),path:u.pathname});return route.abort();}
  if(u.origin===host&&routes.includes(u.pathname)){
   const x=adapter.response(u.pathname,u.search);
   calls.push({path:u.pathname,source:x.source,bytes:Buffer.byteLength(JSON.stringify(x.body))});
   return route.fulfill({status:x.status,contentType:'application/json',headers:{'cache-control':'no-store','x-b46-stage-source':x.source??'invalid'},body:JSON.stringify(x.body)});
  }
  return route.continue();
 });
 try{
  const t=Date.now();
  const res=await page.goto(host+'/?view=statistics'+(c.market?'&market='+c.market:''),{waitUntil:'domcontentloaded',timeout:65000});
  assert.equal(res?.status(),200);
  if(!c.market)await page.waitForFunction(()=>window.__B46_FAST_V1_DIAG?.status==='fast-preview-visible',null,{timeout:25000});
  else await page.waitForFunction(()=>window.BALL46_STATISTICS_DATA?.getSnapshot?.()?.ok===true&&!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length,null,{timeout:90000});
  const paint=Date.now()-t;
  const read=()=>page.evaluate(()=>{
   const card=document.querySelector('#b46-finance-chart-card'),hidden=document.querySelector('.sp-kpis'),d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
   const fast=card?.querySelector('#b46-fast-v1-preview');
   const content=fast||card;
   const text=el=>el?.textContent?.trim().replace(/\s+/g,' ')??'';
   return {cardCount:document.querySelectorAll('#b46-finance-chart-card').length,chart:!!content?.querySelector('svg')?.getClientRects().length,hiddenOld:!!hidden&&getComputedStyle(hidden).display==='none',overflow:document.documentElement.scrollWidth>innerWidth+2,metric:[...content?.querySelectorAll('.b46-fast-stat,.f46-metrics>div,.b46-perf-kpi,.b46-stage-summary-item')??[]].filter(e=>e.getClientRects().length).map(text),net:text(content?.querySelector('.b46-fast-net,[data-f46-value]')),activeMarket:document.querySelector('[data-stat-market].active')?.dataset.statMarket??null,rows:d?.ledgerRows?.length??null,total:d?.total??null,pending:d?.pending??null};
  });
  const first=await read();
  assert(first.cardCount===1&&first.chart&&first.hiddenOld&&!first.overflow&&first.metric.length>=4,c.name+':UI_CONTRACT');
  const historyBefore=calls.filter(x=>x.path==='/api/engine/statistics').length;
  if(!c.market)assert.equal(historyBefore,0,c.name+':FIRST_PAINT_READS_HISTORY');
  let details=null;
  if(c.name==='pc-total'){
   await page.locator('#b46-fast-v1-preview .b46-fast-details').click();
   await page.waitForFunction(()=>{const d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();return d?.ok===true&&d.ledgerRows?.length===d.ledgerTotal&&!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length&&!document.querySelector('#b46-fast-v1-preview')},null,{timeout:100000});
   details=await read();assert.equal(details.rows,stage.next.raw.length);assert.equal(details.total,stage.summary.total);
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  assert(calls.length>0&&calls.every(x=>x.source===mode),c.name+':NOT_USING_STAGING_SOURCE');
  const result={profile:c.name,mode,firstPaintMs:paint,historyBefore,historyCalls:calls.filter(x=>x.path==='/api/engine/statistics').length,first,details,jsErrors:errors.length,blockedWrites:blocked.length};
  console.log('STAGE_BROWSER_CASE='+JSON.stringify(result));return result;
 }finally{await ctx.close()}
}
try{
 let passed=0;
 for(const c of cases){
  const old=await run(c,'legacy'),next=await run(c,'receiver');
  assert.deepEqual(next.first,old.first,c.name+':FIRST_RENDER_DIFF');
  assert.deepEqual(next.details,old.details,c.name+':DETAILS_RENDER_DIFF');
  passed++;
 }
 console.log('STAGE_BROWSER_PARITY='+JSON.stringify({passed,total:cases.length,productionSourceChanged:false,mode:'BROWSER_ISOLATED',marketEndpointGroups:MARKET_GROUPS.length,rollbackTested:true}));
}finally{adapter.setMode('legacy');await browser.close();}
