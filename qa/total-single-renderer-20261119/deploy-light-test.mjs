import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const name='ball46-total-light-test-20261119',prod='ball46-production',old='https://ball46-total-test-20261119.mccarey-supon.workers.dev';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(account&&token,'AUTH_MISSING');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,opts={}){const r=await fetch(root+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(40000)});const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result}
async function active(){const j=await api('/scripts/'+prod+'/deployments?per_page=1');return j.deployments[0].versions}
async function get(base,path){const r=await fetch(base+path,{signal:AbortSignal.timeout(30000)});assert(r.ok,'HTTP '+path+' '+r.status);return r.text()}
const before=await active();
const [html,style,finance,visual,graphText,healthText]=await Promise.all(['/', '/stage.css','/finance.js','/visual.js','/b46-receiver-v1/graph?market=all&variant=all&filter=all&range=all','/health'].map(p=>get(old,p)));
const health=JSON.parse(healthText),graph=JSON.parse(graphText);
assert.equal(health.mode,'ISOLATED_TEST_WORKER_NO_BINDINGS');
assert.equal(sha(finance),'98b2ee71e447acc4e4128fb042a8ddd1d3eb4a86948cfe346d054cb9f7d54000');
assert.equal(sha(visual),'22aceda83f92a736b9888fb374803a3c241cc746b8cf1ea6c1a2c4909f12698e');
assert.equal(graph.sequence,health.sequence);
const light=fs.readFileSync('qa/total-single-renderer-20261119/total-light.css','utf8');
const themeStyle='html[data-theme="light"] body{background:#edf3ef;color:#21352d}html[data-theme="light"] .test-top{background:#fff;border:1px solid #dae7df}html[data-theme="light"] .test-top em{color:#087c50}html[data-theme="light"] .test-label,html[data-theme="light"] .test-caption{color:#526d61}html[data-theme="light"] .f46-details{color:#526d61}.test-theme-toggle{border:1px solid #8ca99a;background:transparent;color:inherit;border-radius:7px;padding:8px 12px;cursor:pointer;font:600 12px system-ui}';
const page=html.replace('data-theme="dark"','data-theme="light"').replace('<link rel="stylesheet" href="/stage.css">','<link rel="stylesheet" href="/stage.css"><link rel="stylesheet" href="/total-light.css"><script>document.documentElement.dataset.theme=new URLSearchParams(location.search).get("theme")==="dark"?"dark":"light";</script>').replace('</head>','<style>'+themeStyle+'</style></head>').replace('</header>','<button class="test-theme-toggle" type="button" onclick="document.documentElement.dataset.theme=document.documentElement.dataset.theme===\'dark\'?\'light\':\'dark\'">Light / Dark</button></header>');
assert(page.includes('/total-light.css')&&page.includes('test-theme-toggle'));
const proof={...health,mode:'ISOLATED_TOTAL_DUAL_THEME_TEST',lightSha:sha(light),productionBefore:before};
const files={'/':{body:page,type:'text/html'},'/index.html':{body:page,type:'text/html'},'/finance.js':{body:finance,type:'application/javascript'},'/visual.js':{body:visual,type:'application/javascript'},'/stage.css':{body:style,type:'text/css'},'/total-light.css':{body:light,type:'text/css'},'/health':{body:JSON.stringify(proof),type:'application/json'}};
const source='const files='+JSON.stringify(files)+';\nconst graph='+JSON.stringify(graph)+';\nexport default {async fetch(req){const u=new URL(req.url),p=u.pathname;const h={"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"};if(!["GET","HEAD"].includes(req.method))return new Response("Test only",{status:405,headers:h});if(p==="/b46-receiver-v1/graph"){if(["market","variant","filter","range"].some(k=>u.searchParams.get(k)!=="all"))return new Response("Snapshot supports TOTAL All time only",{status:404,headers:h});return new Response(req.method==="HEAD"?null:JSON.stringify(graph),{headers:{...h,"Content-Type":"application/json"}})}const f=files[p];return f?new Response(req.method==="HEAD"?null:f.body,{headers:{...h,"Content-Type":f.type+"; charset=utf-8"}}):new Response("Test only",{status:404,headers:h})}};';
const list=await api('/scripts');assert(Array.isArray(list)&&!list.some(x=>x.id===name),'TEST_WORKER_EXISTS');
assert(name!==prod&&name.startsWith('ball46-total-light-test-'));
const sub=await api('/subdomain');const url='https://'+name+'.'+sub.subdomain+'.workers.dev';
const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-18',bindings:[]})],{type:'application/json'}),'metadata.json');form.append('worker.mjs',new Blob([source],{type:'application/javascript+module'}),'worker.mjs');
await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
let ready=false;for(let i=0;i<30;i++){try{const h=JSON.parse(await get(url,'/health'));if(h.lightSha===proof.lightSha){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1000))}
assert(ready,'TEST_WORKER_NOT_READY');
for(const [p,expected]of [['/finance.js',sha(finance)],['/visual.js',sha(visual)],['/total-light.css',sha(light)],['/stage.css',sha(style)]])assert.equal(sha(await get(url,p)),expected);
fs.mkdirSync('candidate',{recursive:true});
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
async function open(address){
 const p=await browser.newPage();await p.setViewport({width:1440,height:1000});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(address,{waitUntil:'load',timeout:30000});await p.waitForSelector('#b46-finance-chart-card[data-b46-total-owner="receiver"] .b46-stage-summary-grid',{timeout:15000});return {p,errors}
}
async function state(p){return p.evaluate(()=>{const c=document.querySelector('#b46-finance-chart-card'),o=c.querySelector('.f46-overview'),a=c.querySelector('.f46-card'),g=c.querySelector('.b46-stage-summary-grid'),tile=g.querySelector('.b46-stage-summary-item'),out=o.querySelector('.b46-stage-outcomes'),color=e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.backgroundImage,s.color,s.borderColor]};return{theme:document.documentElement.dataset.theme,card:color(a),overview:color(o),tile:color(tile),outcomes:color(out),label:color(tile.querySelector('span')),number:color(tile.querySelector('strong')),details:[...g.children].map(e=>[e.dataset.key,e.textContent.trim()]),values:[...g.querySelectorAll('strong')].map(e=>e.textContent),text:c.querySelector('.f46-value').textContent,oldVisible:!!o.querySelector('.f46-metrics')?.getBoundingClientRect().width,geometry:[o.getBoundingClientRect().width,o.getBoundingClientRect().height,g.getBoundingClientRect().width,g.getBoundingClientRect().height]}})}
let baseline,bright,dark;
try{
 const b=await open(old);baseline=await state(b.p);assert.deepEqual(b.errors,[]);await b.p.close();
 const n=await open(url);bright=await state(n.p);
 assert.equal(bright.theme,'light');assert.equal(bright.values.length,8);assert(!bright.oldVisible);
 assert(bright.overview[1].includes('255, 255, 255')&&bright.tile[1].includes('255, 255, 255'),'LIGHT_GRADIENT_NOT_APPLIED');
 assert.equal(bright.card[0],'rgb(255, 255, 255)');
 assert.deepEqual(bright.values,baseline.values);assert.equal(bright.text,baseline.text);
 await n.p.evaluate(()=>{window.__totalOriginalOverview=document.querySelector('.f46-overview')});
 await n.p.screenshot({path:'candidate/TOTAL-light-worker.png'});
 await n.p.$eval('#b46-finance-chart-card .f46-overview',e=>e.scrollIntoView({block:'center'}));await (await n.p.$('#b46-finance-chart-card .f46-overview')).screenshot({path:'candidate/TOTAL-light-card.png'});
 await n.p.click('.test-theme-toggle');await n.p.waitForFunction(()=>document.documentElement.dataset.theme==='dark');dark=await state(n.p);
 for(const k of ['card','overview','tile','outcomes','label','number','geometry','values','text'])assert.deepEqual(dark[k],baseline[k],'DARK_DRIFT '+k);
 await n.p.screenshot({path:'candidate/TOTAL-dark-worker.png'});
 await n.p.click('.test-theme-toggle');await n.p.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 const stable=await n.p.evaluate(()=>window.__totalOriginalOverview===document.querySelector('.f46-overview'));assert(stable,'THEME_TOGGLE_RECREATED_OVERVIEW');assert.deepEqual(n.errors,[]);
}finally{await browser.close()}
const after=await active();assert.deepEqual(after,before,'PRODUCTION_CHANGED_DURING_TEST');
const report={url,sequence:graph.sequence,productionUnchanged:true,financeSha:sha(finance),visualSha:sha(visual),lightSha:sha(light),baseline,bright,dark,darkUnchanged:true,themeToggleStable:true,previewOnly:true};
fs.writeFileSync('candidate/theme-report.json',JSON.stringify(report,null,2));console.log('TOTAL_LIGHT_TEST_PASS '+JSON.stringify(report));
