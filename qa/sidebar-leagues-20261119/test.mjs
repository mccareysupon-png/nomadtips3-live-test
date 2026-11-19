import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const prod='ball46-production',name='ball46-sidebar-leagues-test-20261119',prior='https://ball46-sidebar-depth-test-v2-20261119.mccarey-supon.workers.dev',origin='https://ball46.com';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;assert(account&&token);const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,opts={}){const r=await fetch(root+p,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF '+p+' '+r.status);return j.result}
async function active(){return (await api('/scripts/'+prod+'/deployments?per_page=1')).deployments[0].versions}
async function get(base,path,verify=()=>true){for(let i=0;i<24;i++){try{const r=await fetch(base+path+'?qa='+process.env.GITHUB_RUN_ID+'-'+i,{signal:AbortSignal.timeout(12000)});if(r.ok){const t=await r.text();if(verify(t))return t}}catch{}await sleep(1200)}throw Error('HTTP '+base+path)}
const before=await active();console.log('PRODUCTION_BEFORE '+JSON.stringify(before));fs.mkdirSync('evidence',{recursive:true});
const css=fs.readFileSync('qa/sidebar-leagues-20261119/leagues-toggle.css','utf8'),js=fs.readFileSync('qa/sidebar-leagues-20261119/leagues-toggle.js','utf8');
const old=await get(prior,'/',t=>t.includes('DESKTOP DEPTH V2 TEST')&&t.includes('qa-mobile-layout'));
const assets={};for(const path of ['/base.css','/preview.css','/sidebar-colors.css','/sidebar-depth.css'])assets[path]=await get(prior,path);
assert.equal(sha(assets['/sidebar-depth.css']),'3acac63ff9d099f45beef6db159efca5b05b90d86b09ec5d816b1cdd1f2b6a8e');assert.equal(sha(assets['/sidebar-colors.css']),'591e0b481f261fde65d7f531f8dd6b0e7c2bf172396660c47935f8eb8c49a388');
const page=old.replace('DESKTOP DEPTH V2 TEST','SIDEBAR · LEAGUES TEST').replace('Snapshot · stronger Light Mode · Dark and mobile unchanged.','Snapshot · click the arrow next to LEAGUES · PC only.').replace('</head>','<link rel="stylesheet" href="/leagues-toggle.css"><script defer src="/leagues-toggle.js"></script></head>');
assert(page!==old&&page.includes('/leagues-toggle.js'));
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const card='aside.left-rail[data-b46-sidebar="1"] [data-league-card]',btn=card+' .b46-leagues-toggle',list=card+' [data-league-filters]';
const cases=[];
async function state(p){return p.evaluate(({card,btn,list})=>{const c=document.querySelector(card),e=document.querySelector(btn),l=document.querySelector(list);return{count:l.querySelectorAll('[data-league-filter]').length,selected:[...l.querySelectorAll('[data-league-filter].active')].map(x=>x.dataset.leagueFilter),toggleCount:c.querySelectorAll('.b46-leagues-toggle').length,expanded:e.getAttribute('aria-expanded'),controls:e.getAttribute('aria-controls')===l.id,button:getComputedStyle(e).display,list:getComputedStyle(l).display,height:l.getBoundingClientRect().height,cardHeight:c.getBoundingClientRect().height,rate:[...document.querySelectorAll('[data-b46-rate-snapshot]')].map(x=>[x.textContent,getComputedStyle(x).color]),status:[...document.querySelectorAll('[data-b46-sidebar-row] > b')].map(x=>[x.textContent,getComputedStyle(x).color])}},{card,btn,list})}
async function wait(p,expanded){await p.waitForFunction((selector,v)=>document.querySelector(selector)?.getAttribute('aria-expanded')===String(v),{timeout:10000},btn,expanded);await sleep(190)}
function retained(a,c){assert.equal(c.count,a.count);assert.deepEqual(c.selected,a.selected);assert.equal(c.toggleCount,1);assert(c.controls)}
try{
 // Actual current public page: test in browser only; no changes to production code, data or bindings.
 const p=await b.newPage();await p.setViewport({width:1440,height:1000});await p.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID,{waitUntil:'domcontentloaded',timeout:45000});await p.waitForSelector(list+' [data-league-filter]',{timeout:30000});await p.addStyleTag({content:assets['/sidebar-depth.css']});await p.addStyleTag({content:css});await p.addScriptTag({content:js});await p.waitForSelector(btn,{timeout:12000});await wait(p,true);
 // Freeze the actual list only while checking selector state; no triggering of live app filtering.
 const initial=await state(p);assert(initial.count>0&&initial.controls&&initial.toggleCount===1&&initial.button!=='none'&&initial.list!=='none');
 await p.$eval(btn,e=>e.click());await wait(p,false);const collapsed=await state(p);assert(collapsed.list==='none'&&collapsed.height===0);assert(collapsed.cardHeight<initial.cardHeight,'CARD_GAP');
 await p.$eval(btn,e=>e.click());await wait(p,true);assert((await state(p)).list!=='none');console.log('REAL_DOM_TOGGLE_PASS '+initial.count);await p.close();
 const proof={mode:'ISOLATED_SIDEBAR_LEAGUES',depthSha:sha(assets['/sidebar-depth.css']),cssSha:sha(css),jsSha:sha(js),productionBefore:before};
 const files={'/':{body:page,type:'text/html'},'/index.html':{body:page,type:'text/html'},'/leagues-toggle.css':{body:css,type:'text/css'},'/leagues-toggle.js':{body:js,type:'application/javascript'},'/health':{body:JSON.stringify(proof),type:'application/json'}};for(const [k,v]of Object.entries(assets))files[k]={body:v,type:'text/css'};
 const worker='const files='+JSON.stringify(files)+';\nexport default {async fetch(req){const p=new URL(req.url).pathname,f=files[p];if(!["GET","HEAD"].includes(req.method)||!f)return new Response("Test only",{status:404});return new Response(req.method==="HEAD"?null:f.body,{headers:{"Content-Type":f.type+"; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"}})}};';
 assert(name!==prod&&name.startsWith('ball46-sidebar-leagues-test-'));const all=await api('/scripts');assert(!all.some(w=>w.id===name),'WORKER_EXISTS');const sub=await api('/subdomain');const url='https://'+name+'.'+sub.subdomain+'.workers.dev';
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-18',bindings:[]})],{type:'application/json'}),'metadata.json');form.append('worker.mjs',new Blob([worker],{type:'application/javascript+module'}),'worker.mjs');
 await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
 for(const [path,item] of Object.entries(files))await get(url,path,t=>t===item.body);
 const q=await b.newPage();await q.setViewport({width:1440,height:1000});await q.setCacheEnabled(false);
 async function nav(theme){for(let i=0;i<16;i++){try{const r=await q.goto(url+'/?theme='+theme+'&qa='+process.env.GITHUB_RUN_ID+'-'+i,{waitUntil:'domcontentloaded',timeout:15000});assert(r?.ok());await q.waitForSelector(btn,{timeout:8000});await q.waitForFunction(()=>[...document.styleSheets].some(s=>s.href?.includes('/leagues-toggle.css')),{timeout:6000});return}catch(e){console.log('NAV_RETRY '+i+' '+e.message);await sleep(1000)}}throw Error('PREVIEW_NAV_FAILED')}
 await nav('dark');
 let baseline;
 for(const theme of ['dark','light']){
 await q.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 if((await state(q)).expanded==='false'){await q.$eval(btn,e=>e.click());await wait(q,true)}
 // Actual snapshot menu click retains selected league on collapsing and expanding.
 await q.$eval(list+' [data-league-filter]',e=>e.click());await sleep(220);const a=await state(q);assert(a.selected.length===1&&a.count>0);
 const requests=[];const onreq=r=>requests.push(r.url());q.on('request',onreq);
 await q.$eval(btn,e=>e.click());await wait(q,false);const c=await state(q);retained(a,c);assert(c.height===0&&c.list==='none'&&c.cardHeight<a.cardHeight);assert.deepEqual(c.rate,a.rate);assert.deepEqual(c.status,a.status);
 await q.$eval(btn,e=>e.click());await wait(q,true);const d=await state(q);retained(a,d);assert(d.list!=='none'&&d.height>0);assert.deepEqual(d.rate,a.rate);assert.deepEqual(d.status,a.status);q.off('request',onreq);assert.equal(requests.length,0,'TOGGLE_NETWORK');
 await q.$eval(btn,e=>e.click());await wait(q,false);await q.$eval(btn,e=>e.scrollIntoView({block:'center'}));await q.screenshot({path:'evidence/pc-'+theme+'-collapsed.png'});
 await nav(theme);await wait(q,false);assert((await state(q)).list==='none','PERSIST_RELOAD');
 // Simulate the app replacing the header/list without deleting the selected state or duplicating controls.
 await q.evaluate(card=>{const c=document.querySelector(card);const title=c.querySelector(':scope>.rail-title');title.replaceWith(title.cloneNode(false));const t=c.querySelector(':scope>.rail-title');t.textContent='LEAGUES';const l=c.querySelector(':scope>[data-league-filters]');l.replaceWith(l.cloneNode(true))},card);
 await wait(q,false);const e=await state(q);assert(e.toggleCount===1&&e.controls&&e.list==='none'&&e.count===a.count);
 await q.$eval(btn,e=>e.click());await wait(q,true);await q.$eval(btn,e=>e.scrollIntoView({block:'center'}));await q.screenshot({path:'evidence/pc-'+theme+'-expanded.png'});baseline=await state(q);
 cases.push({device:'pc',theme,leagues:a.count,persistence:true,selectionPreserved:true,noNetwork:true,rerender:true});console.log('LEAGUES_CASE_PASS '+JSON.stringify(cases.at(-1)));
 }
 await q.$eval(btn,e=>e.click());await wait(q,false);
 await q.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await wait(q,true);
 for(const theme of ['dark','light']){await q.evaluate(t=>document.documentElement.dataset.theme=t,theme);const m=await state(q);assert(m.toggleCount===1&&m.button==='none'&&m.list!=='none'&&m.count===baseline.count,'MOBILE_SCOPE');cases.push({device:'mobile',theme,leagues:m.count,unchanged:true});console.log('LEAGUES_CASE_PASS '+JSON.stringify(cases.at(-1)))}
 await q.setViewport({width:1440,height:1000,isMobile:false,hasTouch:false});await wait(q,false);assert((await state(q)).list==='none','DESKTOP_STATE_NOT_RESTORED');
 await q.$eval(btn,e=>e.click());await wait(q,true);await q.close();
 assert.deepEqual(await active(),before,'PRODUCTION_CHANGED');
 fs.writeFileSync('evidence/report.json',JSON.stringify({url,proof,cases,productionUnchanged:true},null,2));console.log('SIDEBAR_LEAGUES_READY '+JSON.stringify({url,cases:cases.length,productionUnchanged:true,depthSha:proof.depthSha,cssSha:proof.cssSha,jsSha:proof.jsSha}));
}finally{await b.close()}
