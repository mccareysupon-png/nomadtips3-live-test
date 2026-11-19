import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {patchAll,wdlCSS} from './presentation-all-markets.mjs';
const dir='candidate',name='ball46-statistics-all-ui-test-20261119',prod='ball46-production',origin='https://ball46.com',old='https://ball46-total-light-test-20261119.mccarey-supon.workers.dev';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'AUTH_MISSING');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,opts={}){const r=await fetch(root+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result}
async function active(){const j=await api('/scripts/'+prod+'/deployments?per_page=1');return j.deployments[0].versions}
async function get(base,path){let last;for(let i=0;i<3;i++){try{const r=await fetch(base+path,{signal:AbortSignal.timeout(35000)});if(r.ok)return await r.text();last=Error('HTTP '+path+' '+r.status)}catch(e){last=e}await new Promise(r=>setTimeout(r,1500))}throw last}
const before=await active();
console.log('PRODUCTION_BASELINE '+JSON.stringify(before));
fs.mkdirSync(dir,{recursive:true});
const [healthText,basePage,stageCSS,lightCSS,finBase,visBase,fast,columns,prodPage]=await Promise.all([
 get(old,'/health'),get(old,'/'),get(old,'/stage.css'),get(old,'/total-light.css'),
 get(old,'/finance.js'),get(old,'/visual.js'),get(origin,'/b46-statistics-fast-v1-20261116.js'),
 get(origin,'/b46-statistics-columns-20261102.js?v=1&b46_static=413437e50211b7debaadb3d474eef3d8c1db8733557c816dd9422787432d4ada'),
 get(origin,'/index.html?view=statistics')]);
const health=JSON.parse(healthText);
assert.equal(health.mode,'ISOLATED_TOTAL_DUAL_THEME_TEST');
assert.equal(sha(lightCSS),'62e48f27bfdd9f18537c727d4ab78a6c6436189cf3b496e17e99d6e4f13ed3f1');
const patches=patchAll({finance:finBase,visual:visBase,fast,columns,html:prodPage});
const hashes={};
for(const [key,s]of Object.entries(patches)){hashes[key]=sha(s);const f=dir+'/'+key+(key==='html'?'.test.html':'.test.js');fs.writeFileSync(f,s);if(key!=='html')assert.equal(spawnSync(process.execPath,['--check',f],{stdio:'inherit'}).status,0)}
fs.writeFileSync(dir+'/wdl.css',wdlCSS);
fs.writeFileSync(dir+'/total-light.css',lightCSS);
console.log('SOURCE_PATCH_PASS '+JSON.stringify(hashes));
// Confirm that the approved original inputs still match the current live finance/visual code.
const originalFinance=await get(origin,'/longterm-performance-343.js?v=daily-date-axis-v9-20261012&b46_static=822f3d9d271a948d6b862eb7732f8797dcedbcc743cd63f3094f217b537b22bf&b46_finance=22409caa83fa0671');
const originalVisual=await get(origin,'/b46-statistics-card-20261116.js');
assert.equal(sha(originalFinance),'29e09c10270f1a4e849f94de011362cbf82cf20524f69946ca819061cce72590','FINANCE_ORIGINAL_DRIFT');
assert.equal(sha(originalVisual),'aae0dcb8a119554038c933f0bac8696b56ae4dac1b897a388ad87190841ae59b','VISUAL_ORIGINAL_DRIFT');
// Capture verified, read-only current Receiver snapshots for the actual eight markets.
const markets=[['all','all','TOTAL'],['ah','AH','AH'],['1x2','1X2','1X2'],['ou','O/U','O/U'],['corners','Corners','CORNERS'],['btts','BTTS','BTTS'],['cards','Cards','CARDS'],['other','Other','OTHER']];
const graphs={};
for(const [id,apiMarket]of markets){
 const p='/b46-receiver-v1/graph?'+new URLSearchParams({market:apiMarket,variant:'all',filter:'all',range:'all'});
 const g=JSON.parse(await get(origin,p)),s=g.summary;
 assert(g.ok&&g.source==='RECEIVER'&&g.market===apiMarket&&g.variant==='all'&&g.filter==='all'&&g.range==='all','RECEIVER_CONTRACT '+id);
 assert(Number.isSafeInteger(s.rows)&&[s.wins,s.pushes,s.losses].every(n=>Number.isSafeInteger(n)&&n>=0)&&s.rows===s.wins+s.pushes+s.losses,'RECEIVER_COUNTS '+id);
 graphs[apiMarket]=g;console.log('MARKET_SNAPSHOT '+JSON.stringify({id,sequence:g.sequence,rows:s.rows,w:s.wins,d:s.pushes,l:s.losses,stake:s.stake}));
}
const nav='<nav class="test-markets" aria-label="Test market pages">'+markets.map(([id,key,label])=>'<a data-stat-market="'+id+'" href="?market='+id+'">'+label+'</a>').join('')+'</nav>';
const navCSS='.test-markets{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.test-markets a{color:inherit;padding:8px 12px;border:1px solid #9aafa49c;border-radius:7px;text-decoration:none;font-weight:650}.test-markets a.active{background:#16875b;color:#fff}.test-caption{line-height:1.5}';
const routeJS='(()=>{const names='+JSON.stringify(Object.fromEntries(markets.map(([id,k,label])=>[id,label])))+';const q=new URLSearchParams(location.search),m=q.get("market")||"all";document.querySelector("[data-sp-market-title]").textContent=(names[m]||"TOTAL")+" · Statistics";document.querySelectorAll(".test-markets a").forEach(a=>{const selected=a.dataset.statMarket===m;a.classList.toggle("active",selected);if(selected)a.setAttribute("aria-current","page");a.href="?market="+a.dataset.statMarket+"&theme="+document.documentElement.dataset.theme});document.querySelector(".test-theme-toggle").addEventListener("click",()=>{document.querySelectorAll(".test-markets a").forEach(a=>{a.href="?market="+a.dataset.statMarket+"&theme="+document.documentElement.dataset.theme})})})();';
let page=basePage.replace('<title>BALL46 · TOTAL TEST ONLY</title>','<title>BALL46 · STATISTICS UI TEST ONLY</title>').replace('ISOLATED TOTAL TEST · READ ONLY · SNAPSHOT','ISOLATED STATISTICS UI TEST · READ ONLY · SNAPSHOT');
page=page.replace(/<p class="test-caption">[\s\S]*?<\/p>/,'<p class="test-caption">Verified Receiver snapshots · '+new Date().toISOString()+' · All eight markets, All time. No production calls from this test page.</p>'+nav);
page=page.replace('</head>','<link rel="stylesheet" href="/wdl.css"><style>'+navCSS+'</style></head>').replace('<script src="/visual.js" defer>','<script>'+routeJS+'</script><script src="/visual.js" defer>').replace('<script src="/finance.js" defer>','<script src="/fast.js" defer></script><script src="/columns.js" defer></script><script src="/finance.js" defer>');
assert(page.includes('/fast.js')&&page.includes('/wdl.css')&&page.includes('test-markets'));
const proof={mode:'ISOLATED_ALL_STATS_UI_TEST',snapshot:true,sourceHashes:hashes,lightSha:sha(lightCSS),wdlSha:sha(wdlCSS),marketCount:markets.length,productionBefore:before};
const files={'/':{body:page,type:'text/html'},'/index.html':{body:page,type:'text/html'},'/finance.js':{body:patches.finance,type:'application/javascript'},'/visual.js':{body:patches.visual,type:'application/javascript'},'/fast.js':{body:patches.fast,type:'application/javascript'},'/columns.js':{body:patches.columns,type:'application/javascript'},'/stage.css':{body:stageCSS,type:'text/css'},'/total-light.css':{body:lightCSS,type:'text/css'},'/wdl.css':{body:wdlCSS,type:'text/css'},'/health':{body:JSON.stringify(proof),type:'application/json'}};
const source='const files='+JSON.stringify(files)+';\nconst graphs='+JSON.stringify(graphs)+';\nexport default {async fetch(req){const u=new URL(req.url),p=u.pathname;const h={"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"};if(!["GET","HEAD"].includes(req.method))return new Response("Test only",{status:405,headers:h});if(p==="/b46-receiver-v1/graph"){const g=graphs[u.searchParams.get("market")];if(!g||["variant","filter","range"].some(k=>u.searchParams.get(k)!=="all"))return new Response("Snapshot supports all time only",{status:404,headers:h});return new Response(req.method==="HEAD"?null:JSON.stringify(g),{headers:{...h,"Content-Type":"application/json"}})}const f=files[p];return f?new Response(req.method==="HEAD"?null:f.body,{headers:{...h,"Content-Type":f.type+"; charset=utf-8"}}):new Response("Test only",{status:404,headers:h})}};';
const list=await api('/scripts');assert(Array.isArray(list)&&!list.some(x=>x.id===name),'TEST_WORKER_EXISTS');
assert(name!==prod&&name.startsWith('ball46-statistics-all-ui-test-'));
const sub=await api('/subdomain');const url='https://'+name+'.'+sub.subdomain+'.workers.dev';
const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-18',bindings:[]})],{type:'application/json'}),'metadata.json');form.append('worker.mjs',new Blob([source],{type:'application/javascript+module'}),'worker.mjs');
await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
let ready=false;for(let i=0;i<30;i++){try{const h=JSON.parse(await get(url,'/health'));if(h.wdlSha===proof.wdlSha){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1000))}
assert(ready,'TEST_WORKER_NOT_READY');
for(const [p,expected]of [['/finance.js',hashes.finance],['/visual.js',hashes.visual],['/fast.js',hashes.fast],['/columns.js',hashes.columns],['/wdl.css',sha(wdlCSS)],['/total-light.css',sha(lightCSS)]])assert.equal(sha(await get(url,p)),expected);
console.log('ALL_STATS_TEST_WORKER_READY '+url);
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
const numeric=s=>Number(s.replace(/,/g,''));
try{
 const p=await browser.newPage();await p.setViewport({width:1440,height:950});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 const dark=['rgb(55, 212, 154)','rgb(230, 188, 113)','rgb(255, 103, 121)'],light=['rgb(8, 124, 80)','rgb(135, 87, 10)','rgb(199, 54, 73)'];
 for(const [id,key]of markets){
  const g=graphs[key],s=g.summary;
  await p.goto(url+'/?market='+id+'&theme=light',{waitUntil:'load',timeout:30000});
  await p.waitForFunction(k=>{const c=document.getElementById('b46-finance-chart-card');return c?.dataset.b46StatisticsSource==='receiver'&&c?.dataset.b46Market===k},{timeout:10000},key);
  if(!s.rows){results.push({market:id,empty:true,rows:0});continue}
  await p.waitForSelector('[data-key="wpl"] [data-b46-wdl="win"]',{timeout:10000});
  await p.evaluate(()=>{window.__originalOverview=document.querySelector('.f46-overview')});
  for(const theme of ['light','dark']){
   if(theme==='dark')await p.click('.test-theme-toggle');
   const v=await p.evaluate(()=>{
    const c=document.getElementById('b46-finance-chart-card'),o=c.querySelector('.f46-overview');
    const w=o.querySelector('[data-key="wpl"]'),stake=o.querySelector('[data-key="stake"]');
    const vals=[...w.querySelectorAll('[data-b46-wdl]')].map(e=>({text:e.textContent,key:e.dataset.b46Wdl,color:getComputedStyle(e).color}));
    const bars=[...o.querySelectorAll('.b46-stage-outcomes-segment,.b46-v1-market-track>span')].map(e=>({key:e.dataset.result,count:Number(e.dataset.count),color:getComputedStyle(e).backgroundColor}));
    const label=w.querySelector('.b46-stage-summary-label,small')?.textContent,stakeLabel=stake.querySelector('.b46-stage-summary-label,small')?.textContent,stakeValue=stake.querySelector('strong,b')?.textContent;
    const legend=o.querySelector('.b46-stage-outcomes-legend,.b46-v1-market-legend')?.innerText;
    return {theme:document.documentElement.dataset.theme,label,stakeLabel,stakeValue,vals,bars,legend,overviewBG:getComputedStyle(o).backgroundImage,stable:window.__originalOverview===o,oldVisible:!!o.querySelector('.f46-metrics')?.getBoundingClientRect().width};
   });
   assert.equal(v.theme,theme);assert.equal(v.label,'W · D · L');assert.equal(v.stakeLabel,'UNITS USED');
   assert.deepEqual(v.vals.map(x=>numeric(x.text)),[s.wins,s.pushes,s.losses]);assert.deepEqual(v.vals.map(x=>x.key),['win','draw','loss']);
   assert.deepEqual(v.vals.map(x=>x.color),theme==='light'?light:dark,'WDL_COLOR '+id+' '+theme);
   assert.equal(Number(v.stakeValue.replace(/[^\d.]/g,'')),Math.round(s.stake),'STAKE_VALUE '+id);
   assert(/\bDRAW\b/.test(v.legend)&&!/\bPUSH\b/i.test(v.legend),'DRAW_LEGEND '+id);
   assert.deepEqual(v.bars.map(x=>x.count),[s.wins,s.pushes,s.losses]);
   assert.deepEqual(v.bars.map(x=>x.color),theme==='light'?light:dark,'OUTCOME_COLOR '+id+' '+theme);
   if(id==='all'){assert(!v.oldVisible);assert(v.stable);if(theme==='light')assert(v.overviewBG.includes('255, 255, 255'))}
   results.push({market:id,rows:s.rows,...v});console.log('MARKET_THEME_PASS '+id+' '+theme);
   if(id==='all'||id==='ah'||id==='ou')await p.screenshot({path:dir+'/'+id+'-'+theme+'.png'});
  }
 }
 assert.deepEqual(errors,[],'BROWSER_ERRORS');
 // Verify settlement display changes without changing the underlying PUSH data.
 await p.evaluate(()=>{const c={settled:true,res:'PUSH',league:'QA',date:'QA',market:'AH',pick:'Home',line:'0',odds:'2.00',bookmaker:'QA',entryScore:'0-0',entryHtml:'',finalScore:'1-1',finalCorners:'',resultSource:''};const html=window.B46_STAT_COLUMNS.row({id:'qa',fixtureId:'qa',home:{name:'QA Home'},away:{name:'QA Away'}},c);const host=document.createElement('tbody');host.innerHTML=html;const row=host.querySelector('tr'),badge=row.querySelector('[data-result-state]');const data=JSON.parse(row.dataset.b46StatDisplay);if(badge.textContent!=='DRAW'||badge.dataset.resultState!=='PUSH'||data.rawResult!=='PUSH')throw Error('RAW_PUSH_CHANGED');});
 // Wait through a normal refresh in TOTAL and verify DOM identity and both labels remain intact.
 await p.goto(url+'/?market=all&theme=light',{waitUntil:'load',timeout:30000});
 await p.waitForSelector('[data-key="wpl"] [data-b46-wdl="win"]',{timeout:10000});
 await p.evaluate(()=>{window.__refreshOverview=document.querySelector('.f46-overview')});await new Promise(r=>setTimeout(r,16000));
 assert(await p.evaluate(()=>window.__refreshOverview===document.querySelector('.f46-overview')),'TOTAL_REFRESH_RECREATED');
 await p.screenshot({path:dir+'/TOTAL-final.png'});
}finally{await browser.close()}
const after=await active();assert.deepEqual(after,before,'PRODUCTION_CHANGED_DURING_TEST');
const report={...proof,url,productionAfter:after,productionUnchanged:true,results,totalRefreshStable:true,rawPushPreserved:true,previewOnly:true};
fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));console.log('ALL_STATS_UI_PASS '+JSON.stringify({url,cases:results.map(r=>({market:r.market,theme:r.theme,empty:r.empty,rows:r.rows})),productionUnchanged:true}));
