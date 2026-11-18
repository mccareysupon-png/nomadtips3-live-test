import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const {chromium}=createRequire(new URL('./.runtime/package.json',import.meta.url))('playwright');
const host='https://www.ball46.com',out=process.env.RUNNER_TEMP+'/market-diagnosis';
await mkdir(out,{recursive:true});
const markets=[['all','all'],['corners','Corners'],['1x2','1X2'],['ah','AH'],['ou','O/U'],['btts','BTTS'],['cards','Cards'],['other','Other']];
const headers={'cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-MarketReadOnly'};
for(const [m,key] of markets){
 try{const r=await fetch(host+'/b46-receiver-v1/graph?'+new URLSearchParams({market:key,variant:'all',filter:'all',range:'all'}),{headers,signal:AbortSignal.timeout(12000)});const d=await r.json();console.log('MARKET_API='+JSON.stringify({key,status:r.status,keys:Object.keys(d),source:d.source,market:d.market,sequence:d.sequence,summary:d.summary,counts:d.counts,series:Object.fromEntries(Object.entries(d.series??{}).map(([k,v])=>[k,{length:v.length,invalid:v.filter(p=>!Number.isFinite(p.date)||!Number.isFinite(p.value)).length}])),winRateField:d.sidebarWinRates??null}));}catch(e){console.log('MARKET_API_ERROR='+JSON.stringify({key,error:String(e.message)}))}
}
for(const path of ['/singlepage-workspace-343.js','/longterm-performance-343.js']){
 const r=await fetch(host+path,{headers,signal:AbortSignal.timeout(20000)}),s=await r.text();
 console.log('MARKET_SOURCE='+JSON.stringify({path,status:r.status,winRateHook:s.includes('__B46_SIDEBAR_WINRATES'),historyRestore:s.includes('b46:history-restore-progress')||s.includes('__B46_HISTORY_RESTORE_QUEUED')}));
 const names=path.includes('workspace')?['function renderStats','function renderGraph','function renderVariants','function renderFilters','function setView','function renderStatHeader','function rowsForMarket']:['function render(force','function renderFromStats','function ensureCard','function routeFilter','function active','function boot','function refreshSoon'];
 for(const n of names){const i=s.indexOf(n);if(i<0)continue;let j=s.indexOf('\nfunction ',i+1);if(j<0||j-i>2500)j=i+2500;console.log('MARKET_SOURCE_FN='+JSON.stringify({n,code:s.slice(i,j)}))}
}
const b=await chromium.launch({headless:true});
try{
 const ctx=await b.newContext({viewport:{width:1612,height:900},serviceWorkers:'block'});
 const p=await ctx.newPage(),errors=[],network=[],warnings=[];
 p.on('pageerror',e=>errors.push({message:e.message,stack:e.stack?.slice(0,800)}));
 p.on('console',m=>{if(['warning','error'].includes(m.type()))warnings.push(m.text().slice(0,300))});
 p.on('response',async r=>{const u=new URL(r.url());if(u.pathname==='/b46-receiver-v1/graph'){let d;try{d=await r.json()}catch{}network.push({q:u.search,status:r.status(),source:d?.source,market:d?.market,rows:d?.summary?.rows,at:Date.now()})}});
 await ctx.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 await p.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
 async function inspect(){return p.evaluate(()=>{
  const c=document.querySelector('#b46-finance-chart-card'),panel=document.querySelector('[data-workspace-panel="statistics"]'),content=document.querySelector('.sp-stats-content'),t=document.querySelector('[data-sp-table-body]'),s=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
  const vis=e=>e?{display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,hidden:e.hidden??null,height:Math.round(e.getBoundingClientRect().height),width:Math.round(e.getBoundingClientRect().width)}:null;
  return {url:location.href,selected:document.querySelector('[data-stat-market].active')?.dataset.statMarket,chart:c?{source:c.dataset.b46StatisticsSource,market:c.dataset.b46Market,settled:c.dataset.b46Settled,box:vis(c),shell:vis(c.querySelector('[data-b46-perf-shell]')),plot:vis(c.querySelector('.f46-plot')),text:c.innerText.slice(0,350)}:null,panel:vis(panel),content:vis(content),body:document.body.dataset.workspaceView,sidebar:[...document.querySelectorAll('[data-stat-market] b')].map(x=>x.textContent),records:document.querySelector('[data-sp-record-count]')?.textContent,tableRows:[...(t?.querySelectorAll('tr')??[])].filter(x=>x.cells.length>=4).length,tableBox:vis(t),snapshot:s?.ledgerRows?.length??null,loading:document.querySelector('[data-sp-feed-state]')?.textContent}
 })}
 async function test(m,key,click){
  const start=Date.now(),before=network.length;
  if(click)await p.locator('[data-stat-market="'+m+'"]').click({timeout:5000});
  let matched=false;
  try{await p.waitForFunction(k=>{const c=document.querySelector('#b46-finance-chart-card');return c?.dataset.b46StatisticsSource==='receiver'&&c.dataset.b46Market===k&&c.getBoundingClientRect().height>0},key,{timeout:11000});matched=true}catch{}
  await p.waitForTimeout(500);
  const d=await inspect();console.log('MARKET_BROWSER='+JSON.stringify({m,key,matched,ms:Date.now()-start,...d,network:network.slice(before),errors:errors.slice(-4),warnings:warnings.slice(-4)}));
  if(m==='corners'||!matched)await p.screenshot({path:out+'/'+m+'.png',fullPage:true}).catch(()=>{});
 }
 await test('all','all',false);
 // Reproduce a click while history is still loading.
 await test('corners','Corners',true);
 try{await p.waitForFunction(()=>window.BALL46_STATISTICS_DATA?.getSnapshot?.()?.ledgerRows?.length>0,null,{timeout:40000})}catch{}
 console.log('MARKET_AFTER_HISTORY='+JSON.stringify({...(await inspect()),errors:errors.slice(-6),warnings:warnings.slice(-6)}));
 for(const [m,key] of markets.slice(2))await test(m,key,true);
 await test('corners','Corners',true);await test('all','all',true);
 console.log('MARKET_DIAG_DONE='+JSON.stringify({errors:errors.slice(-10),warnings:warnings.slice(-10),network,productionWrites:0}));
 await ctx.close();
}finally{await b.close()}
