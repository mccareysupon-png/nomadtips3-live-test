import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {patchRate,rateCSS,rateTone} from './win-rate-tone.mjs';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const old='https://ball46-statistics-all-light-test-20261119.mccarey-supon.workers.dev',name='ball46-statistics-winrate-test-20261119',prod='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'AUTH_MISSING');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,opts={}){const r=await fetch(root+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result}
async function active(){const j=await api('/scripts/'+prod+'/deployments?per_page=1');return j.deployments[0].versions}
async function get(base,path){let last;for(let i=0;i<3;i++){try{const r=await fetch(base+path,{signal:AbortSignal.timeout(25000)});if(r.ok)return await r.text();last=Error('HTTP '+path+' '+r.status)}catch(e){last=e}await new Promise(r=>setTimeout(r,1000))}throw last}
const before=await active();
const h=JSON.parse(await get(old,'/health'));
assert.equal(h.mode,'ISOLATED_ALL_STATS_LIGHT_V2');assert.equal(h.marketCount,8);
const paths=['/finance.js','/visual.js','/fast.js','/columns.js','/stage.css','/total-light.css','/wdl.css','/all-market-light.css'];
const blobs=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await get(old,p)])));
for(const k of ['finance','visual','fast','columns'])assert.equal(sha(blobs['/'+k+'.js']),h.sourceHashes[k],'JS_DRIFT '+k);
assert.equal(sha(blobs['/total-light.css']),h.lightSha);assert.equal(sha(blobs['/wdl.css']),h.wdlSha);
assert.equal(sha(blobs['/all-market-light.css']),h.allLightSha);
const initial=await get(old,'/');
const css=rateCSS;
const patches=patchRate({finance:blobs['/finance.js'],visual:blobs['/visual.js'],fast:blobs['/fast.js']});
for(const [k,v]of Object.entries(patches))blobs['/'+k+'.js']=v;
const patchedHashes=Object.fromEntries(Object.entries(patches).map(([k,v])=>[k,sha(v)]));
const page=initial.replace('</head>','<link rel="stylesheet" href="/win-rate-tone.css"></head>');
assert(page!==initial);
fs.mkdirSync('candidate',{recursive:true});
for(const [k,v]of Object.entries(patches)){fs.writeFileSync('candidate/'+k+'.test.js',v);const {spawnSync}=await import('node:child_process');assert.equal(spawnSync(process.execPath,['--check','candidate/'+k+'.test.js'],{stdio:'inherit'}).status,0)}
for(const [v,t]of [['49.9%','red'],['50%','yellow'],['50.0%','yellow'],['50.1%','green'],['—','neutral'],['0.0%','red'],['100.0%','green']])assert.equal(rateTone(v),t);
const markets=[['all','all'],['ah','AH'],['1x2','1X2'],['ou','O/U'],['corners','Corners'],['btts','BTTS'],['cards','Cards'],['other','Other']];
const graphs={};
for(const [id,k]of markets){const g=JSON.parse(await get(old,'/b46-receiver-v1/graph?'+new URLSearchParams({market:k,variant:'all',filter:'all',range:'all'})));assert(g.ok&&g.market===k);assert.equal(g.summary.rows,g.summary.wins+g.summary.pushes+g.summary.losses);graphs[k]=g;}
const proof={...h,mode:'ISOLATED_STATS_WINRATE_V3',rateSha:sha(css),sourceHashes:{...h.sourceHashes,...patchedHashes},productionBefore:before};
const files={'/':{body:page,type:'text/html'},'/index.html':{body:page,type:'text/html'},'/win-rate-tone.css':{body:css,type:'text/css'},'/health':{body:JSON.stringify(proof),type:'application/json'}};
for(const p of paths)files[p]={body:blobs[p],type:p.endsWith('.js')?'application/javascript':'text/css'};
const source='const files='+JSON.stringify(files)+';\nconst graphs='+JSON.stringify(graphs)+';\nexport default {async fetch(req){const u=new URL(req.url),p=u.pathname;const h={"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"};if(!["GET","HEAD"].includes(req.method))return new Response("Test only",{status:405,headers:h});if(p==="/b46-receiver-v1/graph"){const g=graphs[u.searchParams.get("market")];if(!g||["variant","filter","range"].some(k=>u.searchParams.get(k)!=="all"))return new Response("Snapshot supports all time only",{status:404,headers:h});return new Response(req.method==="HEAD"?null:JSON.stringify(g),{headers:{...h,"Content-Type":"application/json"}})}const f=files[p];return f?new Response(req.method==="HEAD"?null:f.body,{headers:{...h,"Content-Type":f.type+"; charset=utf-8"}}):new Response("Test only",{status:404,headers:h})}};';
assert(name!==prod&&name.startsWith('ball46-statistics-winrate-test-'));
const sub=await api('/subdomain'),url='https://'+name+'.'+sub.subdomain+'.workers.dev';
const list=await api('/scripts');assert(Array.isArray(list)&&!list.some(x=>x.id===name),'TEST_WORKER_EXISTS');
const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-18',bindings:[]})],{type:'application/json'}),'metadata.json');form.append('worker.mjs',new Blob([source],{type:'application/javascript+module'}),'worker.mjs');
await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
let ready=false;for(let i=0;i<30;i++){try{if(JSON.parse(await get(url,'/health')).rateSha===sha(css)){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1000))}
assert(ready,'WORKER_NOT_READY');
for(const p of paths)assert.equal(sha(await get(url,p)),sha(blobs[p]),'ASSET_CHANGED '+p);
assert.equal(sha(await get(url,'/win-rate-tone.css')),sha(css));
console.log('WINRATE_WORKER_READY '+url);
fs.mkdirSync('candidate',{recursive:true});fs.writeFileSync('candidate/win-rate-tone.css',css);
fs.writeFileSync('candidate/deployed.json',JSON.stringify({url,cssSha:sha(css),sourceHashes:proof.sourceHashes},null,2));
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
const palettes={light:{green:'rgb(8, 124, 80)',yellow:'rgb(135, 87, 10)',red:'rgb(199, 54, 73)',neutral:'rgb(82, 109, 97)'},dark:{green:'rgb(55, 212, 154)',yellow:'rgb(230, 188, 113)',red:'rgb(255, 103, 121)'}};
async function open(p,id,key,theme,fixture=false){
 for(let attempt=0;attempt<2;attempt++){try{
  await p.goto(url+'/?market='+id+'&theme='+theme,{waitUntil:'load',timeout:30000});
  await p.waitForFunction(k=>{const c=document.getElementById('b46-finance-chart-card');return c?.dataset.b46StatisticsSource==='receiver'&&c?.dataset.b46Market===k},{timeout:20000},key);
  await p.waitForSelector('.f46-overview [data-b46-rate-tone]',{timeout:12000});return;
 }catch(e){console.log('RETRY '+id+' '+theme+' '+attempt);if(attempt===1)throw e}}
}
async function inspect(p){
 return p.evaluate(()=>{
 const c=document.querySelector('#b46-finance-chart-card'),o=c.querySelector('.f46-overview');
 const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 return {theme:document.documentElement.dataset.theme,rows:c.dataset.b46Settled,rate:[...o.querySelectorAll('[data-b46-rate-tone]')].filter(visible).map(e=>({text:e.textContent,tone:e.dataset.b46RateTone,color:getComputedStyle(e).color})),wdl:[...o.querySelectorAll('[data-b46-wdl]')].map(e=>e.textContent),overviewBG:getComputedStyle(o).backgroundImage,oldVisible:!!o.querySelector('.f46-metrics')?.getBoundingClientRect().width}
 });
}
function verify(v,expected,theme,label){
 assert.equal(v.theme,theme);assert(v.rate.length>0,'RATE_MISSING '+label);
 for(const item of v.rate){assert.equal(item.text,expected,'RATE_VALUE '+label);const t=rateTone(expected);assert.equal(item.tone,t,'RATE_TONE '+label);if(t!=='neutral'||theme==='light')assert.equal(item.color,palettes[theme][t],'RATE_COLOR '+label+' '+JSON.stringify(item))}
}
try{
 const p=await browser.newPage();await p.setViewport({width:1440,height:950});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 for(const [id,key]of markets){
  const g=graphs[key],rate=g.series.rate.at(-1)?.value,expected=Number.isFinite(rate)?rate.toFixed(1)+'%':'—';
  await open(p,id,key,'light');const l=await inspect(p);assert.equal(l.rows,String(g.summary.rows));verify(l,expected,'light',id);
  if(g.summary.rows)assert.deepEqual(l.wdl.map(x=>Number(x.replace(/,/g,''))),[g.summary.wins,g.summary.pushes,g.summary.losses]);
  await p.screenshot({path:'candidate/'+id+'-light.png'});
  await p.click('.test-theme-toggle');await p.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  const d=await inspect(p);verify(d,expected,'dark',id);assert.deepEqual(d.wdl,l.wdl);
  await p.screenshot({path:'candidate/'+id+'-dark.png'});
  results.push({id,expected,light:l,dark:d});console.log('MARKET_RATE_PASS '+JSON.stringify({id,expected,light:l.rate,dark:d.rate}));
 }
 assert.deepEqual(errors,[]);
 // Independent browser-only boundary fixtures. Requests are intercepted solely on this isolated Worker page;
 // real snapshot endpoints and production are never written to.
 const q=await browser.newPage();await q.setViewport({width:1440,height:950});let fixtureValue=50;
 await q.setRequestInterception(true);
 q.on('request',req=>{const u=new URL(req.url());if(u.origin===url&&u.pathname==='/b46-receiver-v1/graph'){const g=structuredClone(graphs.AH);g.series.rate[g.series.rate.length-1].value=fixtureValue;void req.respond({status:200,contentType:'application/json',body:JSON.stringify(g)})}else void req.continue()});
 for(const n of [49.9,50,50.1]){fixtureValue=n;await open(q,'ah','AH','light',true);const expected=n.toFixed(1)+'%';const l=await inspect(q);verify(l,expected,'light','fixture '+n);await q.click('.test-theme-toggle');await q.waitForFunction(()=>document.documentElement.dataset.theme==='dark');const d=await inspect(q);verify(d,expected,'dark','fixture '+n);console.log('BOUNDARY_PASS '+JSON.stringify({expected,light:l.rate,dark:d.rate}));if(n===50){await q.screenshot({path:'candidate/boundary-50-dark.png'});await q.click('.test-theme-toggle');await q.screenshot({path:'candidate/boundary-50-light.png'})}}
}finally{await browser.close()}
const after=await active();assert.deepEqual(after,before,'PRODUCTION_CHANGED');
fs.writeFileSync('candidate/report.json',JSON.stringify({url,proof,productionAfter:after,productionUnchanged:true,results,boundary:[49.9,50,50.1]},null,2));
console.log('WINRATE_TEST_PASS '+JSON.stringify({url,cases:results.map(r=>({id:r.id,value:r.expected,tone:rateTone(r.expected)})),productionUnchanged:true}));
