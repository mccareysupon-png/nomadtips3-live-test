import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const prod='ball46-production',name='ball46-sidebar-spacing-test-20261119',prior='https://ball46-sidebar-leagues-test-20261119.mccarey-supon.workers.dev',origin='https://ball46.com';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;assert(account&&token);const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,opts={}){const r=await fetch(root+p,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF '+p+' '+r.status);return j.result}
async function active(){return (await api('/scripts/'+prod+'/deployments?per_page=1')).deployments[0].versions}
async function get(base,path,verify=()=>true){for(let i=0;i<18;i++){try{const r=await fetch(base+path+'?qa='+process.env.GITHUB_RUN_ID+'-'+i,{signal:AbortSignal.timeout(12000)});if(r.ok){const t=await r.text();if(verify(t))return t}}catch{}await sleep(1000)}throw Error('HTTP '+base+path)}
const before=await active();console.log('PRODUCTION_BEFORE '+JSON.stringify(before));fs.mkdirSync('evidence',{recursive:true});
const spacing=fs.readFileSync('qa/sidebar-spacing-20261119/sidebar-spacing.css','utf8'),focus=fs.readFileSync('qa/sidebar-spacing-20261119/sidebar-focus.css','utf8');
const assets={};for(const path of ['/base.css','/preview.css','/sidebar-colors.css','/sidebar-depth.css','/leagues-toggle.css','/leagues-toggle.js'])assets[path]=await get(prior,path);
assert.equal(sha(assets['/sidebar-depth.css']),'3acac63ff9d099f45beef6db159efca5b05b90d86b09ec5d816b1cdd1f2b6a8e');assert.equal(sha(assets['/leagues-toggle.js']),'223ac87b985fa04efdf68e4efab8e6140a76611b42dbecf92ee01dfa42d30771');
const old=await get(prior,'/',t=>t.includes('SIDEBAR · LEAGUES TEST'));
const page=old.replace('SIDEBAR · LEAGUES TEST','SIDEBAR · SPACING & FOCUS TEST').replace('</head>','<link rel="stylesheet" href="/sidebar-spacing.css"><link rel="stylesheet" href="/sidebar-focus.css"></head>');
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const scope='aside.left-rail[data-b46-sidebar="1"]',sel=scope+' :is([data-b46-sidebar-row],button[data-league-filter],a[data-b46-member-entry="rail"])';
const all='[data-b46-sidebar-row="status-all"]',live='[data-b46-sidebar-row="status-live"]',stat='[data-b46-sidebar-row="stat-all"]',stat2='[data-b46-sidebar-row="stat-1x2"]',league='[data-league-filter]';
const cases=[];
async function inspect(p){return p.evaluate(sel=>[...document.querySelectorAll(sel)].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),c=k=>{const x=e.querySelector(k);return x?getComputedStyle(x).color:null};return{key:e.dataset.b46SidebarRow||e.dataset.leagueFilter||'member',active:e.classList.contains('active'),hover:e.matches(':hover'),visible:r.width>0&&r.height>0,bg:s.backgroundColor,shadow:s.boxShadow,transform:s.transform,margin:s.marginBlockStart,top:r.top,bottom:r.bottom,width:r.width,height:r.height,label:c('.league-label')||c(':scope>span:first-child'),count:c(':scope>b'),rate:c('[data-b46-rate-snapshot]')}}),sel)}
const transparent='rgba(0, 0, 0, 0)',palette={dark:{active:'rgba(80, 145, 105, 0.22)',hover:'rgba(70, 120, 90, 0.16)'},light:{active:'rgba(65, 120, 85, 0.18)',hover:'rgba(70, 130, 95, 0.12)'}};
function only(rows,key,bg){const cards=rows.filter(e=>e.visible&&e.bg!==transparent&&e.shadow!=='none');assert.deepEqual(cards.map(x=>x.key),key?[key]:[],'VISIBLE_CARDS '+JSON.stringify(cards.map(x=>[x.key,x.bg,x.hover])));if(key)assert.equal(cards[0].bg,bg);}
async function configure(p,theme,view,selected){await p.evaluate(({theme,view,selected,sel})=>{document.documentElement.dataset.theme=theme;document.body.dataset.workspaceView=view;for(const e of document.querySelectorAll(sel)){e.classList.toggle('active',selected.includes(e.dataset.b46SidebarRow||e.dataset.leagueFilter||'member'));e.removeAttribute('aria-current');e.removeAttribute('aria-pressed')}},{theme,view,selected,sel});}
async function off(p){await p.mouse.move(1000,20);await sleep(260)}
async function hover(p,selector){await p.$eval(selector,e=>e.scrollIntoView({block:'center'}));await p.hover(selector);await sleep(260)}
function gap(rows,a,b){const x=rows.find(e=>e.key===a),y=rows.find(e=>e.key===b);return y.top-x.bottom}
async function exercise(p,theme){
 const pal=palette[theme];await configure(p,theme,'live',['status-all','stat-all']);await off(p);
 let state=await inspect(p);only(state,'status-all',pal.active);assert(gap(state,'status-all','status-live')>=3,'GAP_IDLE '+gap(state,'status-all','status-live'));
 await hover(p,live);state=await inspect(p);only(state,'status-live',pal.hover);assert(gap(state,'status-all','status-live')>=2,'GAP_HOVER');assert(state.find(e=>e.key==='status-all').active);
 await off(p);only(await inspect(p),'status-all',pal.active);
 await configure(p,theme,'statistics',['status-all','stat-all']);await off(p);only(await inspect(p),'stat-all',pal.active);
 await hover(p,stat2);only(await inspect(p),'stat-1x2',pal.hover);await off(p);only(await inspect(p),'stat-all',pal.active);
 const key=await p.$eval(league,e=>e.dataset.leagueFilter);await configure(p,theme,'live',['status-all','stat-all',key]);await off(p);only(await inspect(p),key,pal.active);
 await configure(p,theme,'signal',['status-all','stat-all','status-signal',key]);await off(p);only(await inspect(p),'status-signal',pal.active);
 await configure(p,theme,'live',['status-all']);await off(p);await hover(p,live);state=await inspect(p);only(state,'status-live',pal.hover);
 return {theme,gap:gap(state,'status-all','status-live'),rows:state.length,focus:'single',activeRestored:true};
}
try{
 // Read the actual production page, then freeze its rendered DOM and styles for deterministic state comparisons.
 const p=await b.newPage();await p.setViewport({width:1440,height:1000});await p.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID,{waitUntil:'domcontentloaded',timeout:45000});await p.waitForSelector(scope+' [data-league-filter]',{timeout:30000});await p.waitForFunction(()=>[...document.styleSheets].some(s=>s.href?.includes('b46-sidebar-depth-20261119-v2.css')),{timeout:15000});
 const snap=await p.evaluate(scope=>({side:document.querySelector(scope).outerHTML,rootClass:document.documentElement.className,css:[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n')}catch{return ''}}).join('\n')}),scope);
 await p.close();
 const markup='<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+snap.css.replace(/@import[^;]+;/gi,'')+'</style></head><body data-workspace-view="live"><main class="dash-shell"><section class="workspace singlepage">'+snap.side.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'</section></main></body></html>';
 for(const [device,width,height]of [['pc',1440,1000],['mobile',390,844]]){
 const q=await b.newPage();await q.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});await q.setContent(markup,{waitUntil:'domcontentloaded'});await q.evaluate(cls=>document.documentElement.className=cls,snap.rootClass);
 // Preserve original colors and row dimensions; compare identical states with and without the new CSS.
 for(const theme of ['dark','light']){
 await configure(q,theme,'live',['status-all','stat-all']);await off(q);const baseline=await inspect(q);
 const tag=await q.addStyleTag({content:spacing+'\n'+focus});await sleep(260);const next=await inspect(q);
 for(let i=0;i<next.length;i++){const x=next[i],r=baseline[i];for(const k of ['key','label','count','rate','width','height','active'])assert.equal(x[k],r[k],'PRESERVE '+device+' '+theme+' '+x.key+' '+k);if(device==='mobile')for(const k of ['bg','shadow','transform','margin','top','bottom'])assert.equal(x[k],r[k],'MOBILE '+x.key+' '+k)}
 if(device==='pc'){const result=await exercise(q,theme);cases.push({device,...result});console.log('CASE_PASS '+JSON.stringify(cases.at(-1)))}else{cases.push({device,theme,unchanged:true,rows:next.length});console.log('CASE_PASS '+JSON.stringify(cases.at(-1)))}
 await tag.evaluate(e=>e.remove());await off(q);
 }
 await q.close()
 }
 // Isolated snapshot preview, retaining previously approved LEAGUES JS.
 const proof={mode:'ISOLATED_SIDEBAR_SPACING_FOCUS',spacingSha:sha(spacing),focusSha:sha(focus),cases:cases.length,productionBefore:before};
 const files={'/':{body:page,type:'text/html'},'/index.html':{body:page,type:'text/html'},'/sidebar-spacing.css':{body:spacing,type:'text/css'},'/sidebar-focus.css':{body:focus,type:'text/css'},'/health':{body:JSON.stringify(proof),type:'application/json'}};for(const [k,v]of Object.entries(assets))files[k]={body:v,type:k.endsWith('.js')?'application/javascript':'text/css'};
 const worker='const files='+JSON.stringify(files)+';\nexport default {async fetch(req){const p=new URL(req.url).pathname,f=files[p];if(!["GET","HEAD"].includes(req.method)||!f)return new Response("Test only",{status:404});return new Response(req.method==="HEAD"?null:f.body,{headers:{"Content-Type":f.type+"; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"}})}};';
 assert(name!==prod&&name.startsWith('ball46-sidebar-spacing-test-'));const existing=(await api('/scripts')).some(w=>w.id===name);const sub=await api('/subdomain'),url='https://'+name+'.'+sub.subdomain+'.workers.dev';
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-18',bindings:[]})],{type:'application/json'}),'metadata.json');form.append('worker.mjs',new Blob([worker],{type:'application/javascript+module'}),'worker.mjs');
 if(!existing){await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});}
 for(const [path,item]of Object.entries(files))await get(url,path,t=>t===item.body);
 const q=await b.newPage();await q.setViewport({width:1440,height:1000});let ready=false;for(let i=0;i<12;i++){try{const r=await q.goto(url+(i%2?'/index.html':'/')+'?qa='+process.env.GITHUB_RUN_ID+'-'+i,{waitUntil:'domcontentloaded',timeout:15000});assert(r?.ok(),'HTTP '+r?.status());await q.waitForSelector('.b46-leagues-toggle',{timeout:8000});await q.waitForFunction(()=>[...document.styleSheets].some(s=>s.href?.includes('/sidebar-focus.css'))&&[...document.styleSheets].some(s=>s.href?.includes('/sidebar-spacing.css')),{timeout:6000});ready=true;break}catch(e){console.log('NAV_RETRY '+i+' '+e.message);await sleep(1000)}}assert(ready,'PREVIEW_UNAVAILABLE');
 for(const theme of ['dark','light']){const result=await exercise(q,theme);await q.screenshot({path:'evidence/pc-'+theme+'-hover.png'});await off(q);await q.screenshot({path:'evidence/pc-'+theme+'-active.png'});console.log('PREVIEW_PASS '+JSON.stringify(result))}
 await q.$eval('.b46-leagues-toggle',e=>e.click());await sleep(250);assert.equal(await q.$eval('[data-league-filters]',e=>getComputedStyle(e).display),'none');await q.$eval('.b46-leagues-toggle',e=>e.click());await sleep(250);assert.notEqual(await q.$eval('[data-league-filters]',e=>getComputedStyle(e).display),'none');
 await q.close();assert.deepEqual(await active(),before,'PRODUCTION_CHANGED');fs.writeFileSync('evidence/report.json',JSON.stringify({url,proof,cases,productionUnchanged:true},null,2));console.log('SIDEBAR_SPACING_READY '+JSON.stringify({url,cases:cases.length,productionUnchanged:true,spacingSha:proof.spacingSha,focusSha:proof.focusSha}));
}finally{await b.close()}
