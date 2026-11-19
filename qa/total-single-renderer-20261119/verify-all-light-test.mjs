import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const old='https://ball46-statistics-all-ui-test-20261119.mccarey-supon.workers.dev',name='ball46-statistics-all-light-test-20261119',prod='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'AUTH_MISSING');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,opts={}){const r=await fetch(root+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result}
async function active(){const j=await api('/scripts/'+prod+'/deployments?per_page=1');return j.deployments[0].versions}
async function get(base,path){let last;for(let i=0;i<3;i++){try{const r=await fetch(base+path,{signal:AbortSignal.timeout(25000)});if(r.ok)return await r.text();last=Error('HTTP '+path+' '+r.status)}catch(e){last=e}await new Promise(r=>setTimeout(r,1000))}throw last}
const before=await active();
const h=JSON.parse(await get(old,'/health'));
assert.equal(h.mode,'ISOLATED_ALL_STATS_UI_TEST');assert.equal(h.marketCount,8);
const paths=['/finance.js','/visual.js','/fast.js','/columns.js','/stage.css','/total-light.css','/wdl.css'];
const blobs=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await get(old,p)])));
for(const k of ['finance','visual','fast','columns'])assert.equal(sha(blobs['/'+k+'.js']),h.sourceHashes[k],'JS_DRIFT '+k);
assert.equal(sha(blobs['/total-light.css']),h.lightSha);assert.equal(sha(blobs['/wdl.css']),h.wdlSha);
const css=fs.readFileSync('qa/total-single-renderer-20261119/all-market-light.css','utf8');
const initial=await get(old,'/');
const page=initial.replace('</head>','<link rel="stylesheet" href="/all-market-light.css"><style>html[data-theme="light"]{background:#edf3ef!important;min-height:100%}html[data-theme="light"] body{min-height:100vh;background:#edf3ef!important}</style></head>');
assert(page!==initial);
const markets=[['all','all'],['ah','AH'],['1x2','1X2'],['ou','O/U'],['corners','Corners'],['btts','BTTS'],['cards','Cards'],['other','Other']];
const graphs={};
for(const [id,k]of markets){const g=JSON.parse(await get(old,'/b46-receiver-v1/graph?'+new URLSearchParams({market:k,variant:'all',filter:'all',range:'all'})));assert(g.ok&&g.market===k);assert.equal(g.summary.rows,g.summary.wins+g.summary.pushes+g.summary.losses);graphs[k]=g;}
const proof={...h,mode:'ISOLATED_ALL_STATS_LIGHT_V2',allLightSha:sha(css),productionBefore:before};
const files={'/':{body:page,type:'text/html'},'/index.html':{body:page,type:'text/html'},'/all-market-light.css':{body:css,type:'text/css'},'/health':{body:JSON.stringify(proof),type:'application/json'}};
for(const p of paths)files[p]={body:blobs[p],type:p.endsWith('.js')?'application/javascript':'text/css'};
const source='const files='+JSON.stringify(files)+';\nconst graphs='+JSON.stringify(graphs)+';\nexport default {async fetch(req){const u=new URL(req.url),p=u.pathname;const h={"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"};if(!["GET","HEAD"].includes(req.method))return new Response("Test only",{status:405,headers:h});if(p==="/b46-receiver-v1/graph"){const g=graphs[u.searchParams.get("market")];if(!g||["variant","filter","range"].some(k=>u.searchParams.get(k)!=="all"))return new Response("Snapshot supports all time only",{status:404,headers:h});return new Response(req.method==="HEAD"?null:JSON.stringify(g),{headers:{...h,"Content-Type":"application/json"}})}const f=files[p];return f?new Response(req.method==="HEAD"?null:f.body,{headers:{...h,"Content-Type":f.type+"; charset=utf-8"}}):new Response("Test only",{status:404,headers:h})}};';
assert(name!==prod&&name.startsWith('ball46-statistics-all-light-test-'));
const sub=await api('/subdomain'),url='https://'+name+'.'+sub.subdomain+'.workers.dev';
const list=await api('/scripts');assert(Array.isArray(list)&&list.some(x=>x.id===name),'TEST_WORKER_MISSING');
let ready=false;for(let i=0;i<30;i++){try{if(JSON.parse(await get(url,'/health')).allLightSha===sha(css)){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1000))}
assert(ready,'WORKER_NOT_READY');
for(const p of paths)assert.equal(sha(await get(url,p)),sha(blobs[p]),'ASSET_CHANGED '+p);
assert.equal(sha(await get(url,'/all-market-light.css')),sha(css));
console.log('ALL_LIGHT_WORKER_READY '+url);
fs.mkdirSync('candidate',{recursive:true});fs.writeFileSync('candidate/all-market-light.css',css);
fs.writeFileSync('candidate/deployed.json',JSON.stringify({url,cssSha:sha(css),sourceHashes:h.sourceHashes},null,2));
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
const light=['rgb(8, 124, 80)','rgb(135, 87, 10)','rgb(199, 54, 73)'];
const dark=['rgb(55, 212, 154)','rgb(230, 188, 113)','rgb(255, 103, 121)'];
const isLight=s=>{const rgb=[...s.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g)].filter(m=>m[4]!=='0');return rgb.length>0&&rgb.every(m=>Math.min(+m[1],+m[2],+m[3])>=220)};
async function open(p,base,id,key,theme){
 for(let attempt=0;attempt<3;attempt++){try{
 await p.bringToFront();await p.goto(base+'/?market='+id+'&theme='+theme,{waitUntil:'load',timeout:30000});
 await p.waitForFunction(k=>{const c=document.getElementById('b46-finance-chart-card');return c?.dataset.b46StatisticsSource==='receiver'&&c?.dataset.b46Market===k},{timeout:22000},key);
 if(graphs[key].summary.rows)await p.waitForSelector('[data-key="wpl"] [data-b46-wdl="win"]',{timeout:12000});
 return;
 }catch(e){console.log('RETRY '+id+' '+theme+' '+attempt+' '+JSON.stringify(await p.evaluate(()=>({url:location.href,card:document.getElementById('b46-finance-chart-card')?.dataset,body:document.body.innerText.slice(0,500)}))));if(attempt===2)throw e}}

}
async function inspect(p){
 return p.evaluate(()=>{
  const c=document.querySelector('#b46-finance-chart-card'),a=c.querySelector('.f46-card'),o=c.querySelector('.f46-overview');
  const style=(e,pseudo)=>{if(!e)return null;const s=getComputedStyle(e,pseudo);return {bg:s.backgroundColor,image:s.backgroundImage,color:s.color,border:s.borderColor,shadow:s.boxShadow,content:pseudo?s.content:null,display:s.display}};
  const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return [r.width,r.height]};
  const selectors=['.f46-card','.f46-overview','.f46-heading','.f46-controls','.f46-plot','.f46-foot','.b46-stage-outcomes','.b46-stage-summary-item','.b46-v1-market-outcomes','.b46-v1-market-detail','.f46-metrics>div'];
  const surfaces=Object.fromEntries(selectors.map(sel=>[sel,style(c.querySelector(sel))]));
  const nums=[...c.querySelectorAll('[data-key="wpl"] [data-b46-wdl]')].map(e=>({text:e.textContent,color:getComputedStyle(e).color}));
  const axis=c.querySelector('.f46-axis'),grid=c.querySelector('.f46-grid'),line=c.querySelector('.f46-line');
  return {theme:document.documentElement.dataset.theme,rows:c.dataset.b46Settled,surfaces,before:style(a,'::before'),after:style(a,'::after'),labels:o?.innerText,nums,geometry:[rect(a),rect(o),rect(c.querySelector('.f46-plot'))],axis:axis?getComputedStyle(axis).fill:null,grid:grid?getComputedStyle(grid).stroke:null,line:line?getComputedStyle(line).stroke:null};
 });
}
try{
 const p=await browser.newPage();await p.setViewport({width:1440,height:950});
 const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 for(const [id,key]of markets){
   const s=graphs[key].summary;
   await open(p,old,id,key,'dark'); const initialDark=await inspect(p);
   await open(p,url,id,key,'light'); const bright=await inspect(p);
   assert.equal(bright.theme,'light');assert.equal(bright.rows,String(s.rows));
   assert.deepEqual(bright.geometry,initialDark.geometry,'GEOMETRY '+id);
   assert.deepEqual(bright.labels,initialDark.labels,'TEXT_CHANGED '+id);
   for(const sel of ['.f46-card','.f46-overview','.b46-stage-outcomes','.b46-stage-summary-item','.b46-v1-market-outcomes','.b46-v1-market-detail','.f46-metrics>div']){
     const v=bright.surfaces[sel];if(!v||v.display==='none')continue;
     assert(isLight(v.image==='none'?v.bg:v.image),'NOT_LIGHT '+id+' '+sel+' '+JSON.stringify(v));
   }
   for(const x of [bright.before,bright.after])if(x&&x.content!=='none'&&x.content!=='normal'&&x.display!=='none')assert(isLight(x.image==='none'?x.bg:x.image),'PSEUDO_DARK '+id+' '+JSON.stringify(x));
   if(s.rows){assert.deepEqual(bright.nums.map(x=>x.color),light);assert.deepEqual(bright.nums.map(x=>Number(x.text.replace(/,/g,''))),[s.wins,s.pushes,s.losses]);assert.equal(bright.axis,'rgb(82, 109, 97)');assert.equal(bright.grid,'rgb(220, 231, 224)')}
   const first=await p.evaluate(()=>{window.__themeOverview=document.querySelector('.f46-overview');return true});
   await p.screenshot({path:'candidate/'+id+'-light.png'});
   await p.click('.test-theme-toggle');await p.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
   const afterDark=await inspect(p);
   assert.deepEqual(afterDark,initialDark,'DARK_CHANGED '+id);
   if(s.rows)assert.deepEqual(afterDark.nums.map(x=>x.color),dark);
   assert(await p.evaluate(()=>window.__themeOverview===document.querySelector('.f46-overview')),'THEME_REBUILT '+id);
   await p.screenshot({path:'candidate/'+id+'-dark.png'});
   results.push({id,rows:s.rows,light:bright,darkUnchanged:true});console.log('LIGHT_DARK_PASS '+id+' rows='+s.rows);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close()}
const after=await active();assert.deepEqual(after,before,'PRODUCTION_CHANGED');
fs.writeFileSync('candidate/report.json',JSON.stringify({url,proof,productionAfter:after,productionUnchanged:true,results},null,2));
console.log('ALL_MARKET_LIGHT_PASS '+JSON.stringify({url,cases:results.map(x=>({id:x.id,rows:x.rows,darkUnchanged:x.darkUnchanged})),productionUnchanged:true}));
