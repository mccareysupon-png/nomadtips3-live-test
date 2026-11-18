import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {patchVisual} from './sidebar-winrate-visual-hotfix.mjs';
const {chromium}=createRequire(new URL('./.runtime/package.json',import.meta.url))('playwright');
const host='https://www.ball46.com',script='/singlepage-workspace-343.js',out=process.env.RUNNER_TEMP+'/sidebar-visual-hotfix';
await mkdir(out,{recursive:true});
const r=await fetch(host+script,{headers:{'user-agent':'Mozilla/5.0 B46-VisualQA','cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});assert.equal(r.status,200);
const code=patchVisual(await r.text());new Function(code);
const b=await chromium.launch({headless:true});
const alias={all:'all','1x2':'1X2',ah:'AH',ou:'O/U',corners:'Corners',btts:'BTTS',cards:'Cards',other:'Other'};
const order=['all','1x2','ah','ou','corners','btts','cards','other'];
const text=v=>v===null?'—':v.toFixed(2)+'%';
const color=v=>v===null?'rgb(145, 170, 155)':Number(v.toFixed(2))>50?'rgb(34, 197, 94)':Number(v.toFixed(2))<50?'rgb(248, 113, 113)':'rgb(250, 204, 21)';
try{
 for(const mobile of [false,true]){
  const ctx=await b.newContext({viewport:{width:mobile?390:1612,height:mobile?844:856},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const p=await ctx.newPage(),errors=[],seen=new Map(),history=[],graphs=[];let intercepted=0;
  p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/engine/statistics')history.push(u.pathname);if(u.pathname==='/b46-receiver-v1/graph')graphs.push(u.pathname)});
  p.on('response',async r=>{if(new URL(r.url()).pathname==='/b46-receiver-v1/graph'&&r.status()===200)try{const d=await r.json();if(d.sidebarWinRates)seen.set(d.sequence,d.sidebarWinRates)}catch{}});
  await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(!['GET','HEAD'].includes(req.method()))return route.abort();if(['ball46.com','www.ball46.com'].includes(u.hostname)&&u.pathname===script){intercepted++;return route.fulfill({status:200,contentType:'application/javascript',body:code})}return route.continue()});
  async function inspect(m){
   await p.waitForFunction(m=>{const c=document.querySelector('#b46-finance-chart-card');return c?.dataset.b46StatisticsSource==='receiver'&&c.dataset.b46Market===m&&document.querySelectorAll('[data-b46-win-rate]').length===8},m,{timeout:25000});
   const d=await p.evaluate(()=>({seq:Number(document.querySelector('#b46-finance-chart-card')?.dataset.b46Sequence),rows:[...document.querySelectorAll('[data-stat-market] b')].map(e=>({market:e.closest('[data-stat-market]').dataset.statMarket,text:e.textContent,display:e.dataset.b46Display??null,zero:e.dataset.b46Zero??null,font:parseFloat(getComputedStyle(e).fontSize),after:getComputedStyle(e,'::after').content,color:getComputedStyle(e).color})),status:[...document.querySelectorAll('[data-status-filter] b')].map(e=>({text:e.textContent,display:e.dataset.b46Display??null,after:getComputedStyle(e,'::after').content})),detail:!!document.querySelector('[data-b46-legacy-details]')?.getClientRects().length}));
   for(let i=0;i<20&&!seen.has(d.seq);i++)await p.waitForTimeout(100);
   const rates=seen.get(d.seq);assert(rates,'GRAPH_RESPONSE_MISSING');
   assert.deepEqual(d.rows.map(x=>x.market),order);
   for(const x of d.rows){const v=rates[alias[x.market]].rate;assert.equal(x.text,text(v));assert.equal(x.color,color(v));assert(x.font>=9,'INVISIBLE_FONT '+x.market);assert.equal(x.after,'none','LEGACY_PSEUDO '+x.market);assert.equal(x.display,null);assert.equal(x.zero,null)}
   if(!mobile)assert(d.status.some(x=>/^\d+$/.test(x.text.trim())&&x.display!==null),'LEGACY_STATUS_FORMATTER_REMOVED');
   assert.equal(history.length,0,'EARLY_HISTORY');assert.equal(errors.length,0,JSON.stringify(errors));assert(d.detail,'DETAIL_BUTTON_MISSING');
   return d;
  }
  await p.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
  const d=await inspect('all');assert(intercepted>0);
  await p.screenshot({path:out+'/'+(mobile?'mobile':'desktop')+'.png'});
  if(!mobile){
   await p.locator('[data-stat-market="corners"]').click();await inspect('Corners');
   await p.locator('[data-stat-market="1x2"]').click();await inspect('1X2');
   await p.waitForTimeout(16000);await inspect('1X2');
   // Simulate a fresh legacy count attribute independently of graph update then navigate.
   await p.evaluate(()=>{for(const x of document.querySelectorAll('[data-stat-market] b')){x.dataset.b46Display='0';x.dataset.b46Zero='1'}});
   await p.locator('[data-stat-market="all"]').click();await inspect('all');
   await p.screenshot({path:out+'/desktop-after-refresh.png'});
  }
  console.log('VISUAL_HOTFIX_PASS='+JSON.stringify({mobile,sequence:d.seq,rows:d.rows,historyButton:d.detail,statusFormatterPreserved:true,historyRequests:history.length,graphRequests:graphs.length,jsErrors:errors.length,productionDeploy:false}));
  await ctx.close();
 }
}finally{await b.close()}
