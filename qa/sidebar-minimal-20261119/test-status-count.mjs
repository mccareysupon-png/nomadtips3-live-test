import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const origin='https://ball46.com',prod='ball46-production',name='ball46-sidebar-minimal-test-v2-20261119';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;assert(account&&token);
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,opts={}){const r=await fetch(root+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result}
async function active(){return (await api('/scripts/'+prod+'/deployments?per_page=1')).deployments[0].versions}
const before=await active(); console.log('PRODUCTION_BEFORE '+JSON.stringify(before));fs.mkdirSync('evidence',{recursive:true});
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const scope='html:root[data-theme] body .workspace.singlepage > aside.left-rail[data-b46-sidebar="1"]';
const item=':is([data-b46-sidebar-row],button[data-league-filter],a[data-b46-member-entry="rail"])';
const single=scope+' '+item, strong=scope+' '+item+item;
const state=':is(:hover,.active,[aria-current="page"],[aria-pressed="true"])';
const green='var(--sidebar-green,var(--green))';
const clean='background:transparent!important;background-image:none!important;border-color:transparent!important;box-shadow:none!important;';
let css='/* Sidebar only: no cards for hover/active, names only green. */\n'+scope+'{--sidebar-hover:transparent;--sidebar-selected:transparent}\n'+strong+state+'{'+clean+'color:var(--b46-menu-normal)!important;--sidebar-row-ink:var(--b46-menu-normal)!important;}\n'+strong+state+' > b{color:var(--b46-menu-count)!important}\n'+strong+state+' > b[data-b46-zero="1"]{color:var(--b46-menu-count-zero,var(--b46-menu-count))!important}\n'+strong+state+' > [data-b46-rate-snapshot]{color:var(--b46-menu-rate-neutral,var(--b46-menu-normal))!important}\n'+strong+state+' > span:first-child{color:var(--b46-menu-normal)!important}\n'+scope+' [data-b46-sidebar-row][data-b46-sidebar-row][data-b46-sidebar-row]:hover > span:first-child,'+scope+' :is([data-stat-market],[data-workspace-view="signal"])[data-b46-sidebar-row][data-b46-sidebar-row]:is(.active,[aria-current="page"],[aria-pressed="true"]) > span:first-child,html:root[data-theme] body:is([data-workspace-view="live"],:not([data-workspace-view])) .workspace.singlepage > aside.left-rail[data-b46-sidebar="1"] [data-status-filter][data-b46-sidebar-row][data-b46-sidebar-row]:is(.active,[aria-pressed="true"]) > span:first-child{color:'+green+'!important}\n'+scope+' button[data-league-filter][data-league-filter][data-league-filter]'+state+' .league-label,'+scope+' a[data-b46-member-entry="rail"][data-b46-member-entry][data-b46-member-entry]'+state+' .b46-premium-name > span:last-child{color:'+green+'!important}\n'+strong+state+' > span:first-child :is(svg.b46-menu-icon,i.status-dot,i.workspace-nav-mark){color:var(--b46-menu-icon,var(--b46-menu-normal))!important}\n';
const results=[];
try{
 const p=await browser.newPage();await p.setViewport({width:1440,height:1000});await p.setCacheEnabled(false);
 await p.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID,{waitUntil:'domcontentloaded',timeout:45000});
 await p.waitForSelector('aside.left-rail[data-b46-sidebar="1"] button[data-league-filter]',{timeout:30000});
 await new Promise(r=>setTimeout(r,2500));
 const snap=await p.evaluate(()=>{const a=document.querySelector('aside.left-rail[data-b46-sidebar="1"]');const css=[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n')}catch{return ''}}).join('\n');return {side:a.outerHTML,css,rootClass:document.documentElement.className,rootStyle:document.documentElement.getAttribute('style')||'',bodyStyle:document.body.getAttribute('style')||'',count:a.querySelectorAll('button[data-league-filter]').length}});
 assert(snap.count>0);console.log('LEAGUE_COUNT '+snap.count);
 // Use actual public DOM/CSS snapshot in a browser-only static replay to freeze live counter updates.
 const q=await browser.newPage();await q.setViewport({width:1440,height:1100});
 const safeCSS=snap.css.replace(/@import[^;]+;/gi,'');
 const safeSide=snap.side.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/\son\w+="[^"]*"/gi,'');
 const shell='<main class="dash-shell"><section class="workspace singlepage">'+safeSide+'</section></main>';
 const baseHtml='<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><style>'+safeCSS+'</style></head><body data-workspace-view="statistics">'+shell+'</body></html>';
 await q.setContent(baseHtml,{waitUntil:'domcontentloaded'});await q.evaluate(()=>{document.documentElement.className='b46-receiver-graph-ready'});
 const inventory=await q.evaluate(()=>{
 const a=document.querySelector('aside.left-rail[data-b46-sidebar="1"]'),rows=[...a.querySelectorAll('[data-b46-sidebar-row],button[data-league-filter],a[data-b46-member-entry="rail"]')];
 return rows.map((e,i)=>{e.dataset.qaIndex=i;return {i,key:e.getAttribute('data-b46-sidebar-row')||(e.matches('[data-league-filter]')?'league':'member'),label:e.textContent.trim().slice(0,100),active:e.classList.contains('active')}});
 });
 assert.equal(inventory.filter(r=>r.key.startsWith('stat-')).length,8);assert.equal(inventory.filter(r=>r.key.startsWith('status-')).length,6);assert.equal(inventory.filter(r=>r.key==='league').length,snap.count);
 const select='[data-qa-index]';
 async function configure(theme,mode,view='statistics'){
  await q.evaluate(({theme,mode,view})=>{document.documentElement.dataset.theme=theme;document.body.dataset.workspaceView=view;for(const e of document.querySelectorAll('[data-qa-index]')){e.classList.toggle('active',mode==='active');e.removeAttribute('aria-current');e.removeAttribute('aria-pressed')}},{theme,mode,view});
 }
 async function inspect(){return q.evaluate(()=>[...document.querySelectorAll('[data-qa-index]')].map(e=>{
 const st=getComputedStyle(e),label=e.querySelector('.league-label')||e.querySelector('.b46-premium-name > span:last-child')||e.querySelector(':scope > span:first-child'),b=e.querySelector(':scope > b'),rate=e.querySelector(':scope > [data-b46-rate-snapshot]'),icon=e.querySelector('svg.b46-menu-icon');
 const cc=x=>x?getComputedStyle(x).color:null;
 const base={i:Number(e.dataset.qaIndex),key:e.getAttribute('data-b46-sidebar-row')||(e.matches('[data-league-filter]')?'league':'member'),ink:st.color,label:cc(label),count:cc(b),rate:cc(rate),rateText:rate?.textContent?.trim(),rateInline:rate?.style.getPropertyValue('color'),icon:cc(icon),bg:st.backgroundColor,img:st.backgroundImage,border:st.borderTopColor,shadow:st.boxShadow,green:st.getPropertyValue('--sidebar-green').trim(),w:e.offsetWidth,h:e.offsetHeight};
 if(b&&b.hasAttribute('data-b46-zero')){const old=b.getAttribute('data-b46-zero');b.setAttribute('data-b46-zero','1');base.countZero=cc(b);b.setAttribute('data-b46-zero','0');base.countNonzero=cc(b);b.setAttribute('data-b46-zero',old)}
 return base;
 }))}
 const baselines={};
 for(const theme of ['dark','light']){
  await configure(theme,'normal');const rows=await inspect();baselines[theme]=rows;
  // CSS variables for actual normal colors, including zero counts. No dependency on changing Win Rate values.
  const groups=new Map();
  for(const r of rows){const key=r.key;if(!groups.has(key))groups.set(key,r);else if(key==='league'){assert.equal(r.count,groups.get(key).count,'LEAGUE_COUNT_PALETTE');assert.equal(r.ink,groups.get(key).ink,'LEAGUE_INK_PALETTE')}}
  for(const [key,r]of groups){
   const sel=key==='league'?'button[data-league-filter]':key==='member'?'a[data-b46-member-entry="rail"]':'[data-b46-sidebar-row="'+key+'"]';
   const root=scope.replace('[data-theme]','[data-theme="'+theme+'"]');
   const decl='--b46-menu-normal:'+r.ink+';--b46-menu-count:'+(r.countNonzero||r.count||r.ink)+';--b46-menu-count-zero:'+(r.countZero||r.count||r.ink)+';--b46-menu-rate-neutral:'+r.ink+';--b46-menu-icon:'+(r.icon||r.ink)+';';
   css+=root+' '+sel+'{'+decl+'}\n';
  }
 }
 // Reuse byte-exact approved sidebar CSS; append only the MATCH STATUS number exception.
 const old='https://ball46-sidebar-minimal-test-20261119.mccarey-supon.workers.dev';
 const hp=await fetch(old+'/health',{signal:AbortSignal.timeout(20000)});assert(hp.ok);
 const previous=await hp.json(),cp=await fetch(old+'/sidebar-minimal.css',{signal:AbortSignal.timeout(20000)});assert(cp.ok);
 css=await cp.text();assert.equal(previous.mode,'ISOLATED_SIDEBAR_MINIMAL');assert.equal(sha(css),previous.cssSha);assert.equal(sha(css),'815d7015fe4a636a9727366d19312333333c2b95fbfd72123065692e94e5b5f6');
 const countOverride='\n/* MATCH STATUS only: count follows the selected/hovered name. Never targets statistics rates or league counts. */\n'+scope+' .b46-mobile-status-menu button[data-b46-sidebar-row^="status-"][data-b46-sidebar-row][data-b46-sidebar-row]:hover > b,'+scope+' .b46-mobile-status-menu button[data-workspace-view="signal"][data-b46-sidebar-row^="status-"][data-b46-sidebar-row]:is(.active,[aria-current="page"],[aria-pressed="true"]) > b,html:root[data-theme] body:is([data-workspace-view="live"],:not([data-workspace-view])) .workspace.singlepage > aside.left-rail[data-b46-sidebar="1"] .b46-mobile-status-menu button[data-status-filter][data-b46-sidebar-row^="status-"][data-b46-sidebar-row]:is(.active,[aria-current="page"],[aria-pressed="true"]) > b{color:'+green+'!important}\n';
 css+=countOverride;fs.writeFileSync('evidence/match-status-count.css',countOverride);console.log('BASE_CSS_VERIFIED '+previous.cssSha);
 // Explicitly use original rate renderer inline semantic colors in a controlled browser-only test fixture when current API values are unavailable.
 await q.evaluate(()=>{for(const [k,v,c]of [['all','58.13%','#16a06d'],['1x2','49.37%','#f05b6b'],['ah','50.00%','#d6a53a'],['ou','59.13%','#16a06d'],['btts','—','inherit'],['corners','61.39%','#16a06d'],['cards','—','inherit'],['other','—','inherit']]){const e=document.querySelector('[data-b46-rate-snapshot="'+k+'"]');if(e){e.textContent=v;e.style.setProperty('color',c,'important')}}});
 const cdp=await q.createCDPSession();await cdp.send('DOM.enable');await cdp.send('CSS.enable');const doc=await cdp.send('DOM.getDocument');const nodes=(await cdp.send('DOM.querySelectorAll',{nodeId:doc.root.nodeId,selector:select})).nodeIds;assert.equal(nodes.length,inventory.length);
 const force=async v=>{for(let i=0;i<nodes.length;i+=35)await Promise.all(nodes.slice(i,i+35).map(nodeId=>cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:v})))};
 const norm=async(theme,view)=>{await configure(theme,'normal',view);await force([]);return inspect()};
 const baselineRates={};for(const theme of ['dark','light']){baselineRates[theme]={};for(const view of ['statistics','live'])baselineRates[theme][view]=await norm(theme,view)}
 await q.addStyleTag({content:css});
 for(const theme of ['dark','light'])for(const view of ['statistics','live']){
  const base=baselineRates[theme][view];
  await configure(theme,'normal',view);await force(['hover']);
  for(const mode of ['hover','active']){
   if(mode==='active'){await force([]);await configure(theme,'active',view)}
   const now=await inspect();assert.equal(now.length,base.length);
   for(let i=0;i<now.length;i++){const a=now[i],b=base[i],key=a.key;
    const shouldGreen=mode==='hover'||key==='league'||key==='member'||key.startsWith('stat-')||key==='status-signal'||(view==='live'&&key.startsWith('status-'));
    assert.equal(a.bg,'rgba(0, 0, 0, 0)','BG '+theme+' '+view+' '+mode+' '+key);assert.equal(a.img,'none','IMAGE '+key);assert.equal(a.shadow,'none','SHADOW '+key);assert.equal(a.border,'rgba(0, 0, 0, 0)','BORDER '+key);
    if(shouldGreen){const rgb=await q.evaluate(v=>{const x=document.createElement('span');x.style.color=v;document.body.append(x);const c=getComputedStyle(x).color;x.remove();return c},a.green);assert.equal(a.label,rgb,'LABEL '+theme+' '+view+' '+mode+' '+key)}
    assert.equal(a.rate,b.rate,'RATE '+key+' '+theme+' '+mode);assert.equal(a.rateText,b.rateText,'VALUE '+key);assert.equal(a.count,key.startsWith('status-')&&shouldGreen?a.label:b.count,'COUNT '+key+' '+theme+' '+mode);if(key.startsWith('status-')&&shouldGreen){assert.equal(a.countZero,a.label,'ZERO_COUNT '+key);assert.equal(a.countNonzero,a.label,'NONZERO_COUNT '+key);}assert.equal(a.icon,b.icon,'ICON '+key);assert.equal(a.w,b.w);assert.equal(a.h,b.h);
   }
   results.push({theme,view,mode,rows:now.length,leagues:snap.count,ratesPreserved:8,statusCountsGreen:true});console.log('STATE_PASS '+JSON.stringify(results.at(-1)));
  }
 }
 await force([]);await configure('dark','normal','statistics');await q.evaluate(()=>document.querySelector('[data-stat-market="all"]').classList.add('active'));
 await q.screenshot({path:'evidence/sidebar-dark.png'});
 await q.evaluate(()=>document.documentElement.dataset.theme='light');await q.screenshot({path:'evidence/sidebar-light.png'});
 fs.writeFileSync('evidence/sidebar-minimal.css',css);fs.writeFileSync('evidence/baseline.json',JSON.stringify(baselines,null,2));
 // Capture verified preview first and release background tabs to avoid Chromium throttling.
 const previewSide=await q.evaluate(()=>{const a=document.querySelector('aside.left-rail');a.querySelectorAll('[data-qa-index]').forEach(e=>e.removeAttribute('data-qa-index'));a.querySelectorAll('a').forEach(e=>{e.removeAttribute('href');e.removeAttribute('target')});return a.outerHTML});
 await q.close();await p.close();console.log('SNAPSHOT_READY');
 const real=await browser.newPage();await real.setViewport({width:1440,height:1000});await real.bringToFront();
 await real.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID,{waitUntil:'domcontentloaded',timeout:45000});
 await real.waitForSelector('aside.left-rail[data-b46-sidebar="1"] [data-b46-sidebar-row="stat-1x2"]',{timeout:25000});
 await real.addStyleTag({content:css});
 const c=await real.createCDPSession();await c.send('DOM.enable');await c.send('CSS.enable');const d=await c.send('DOM.getDocument');const n=await c.send('DOM.querySelector',{nodeId:d.root.nodeId,selector:'[data-b46-sidebar-row="stat-1x2"]'});assert(n.nodeId);await c.send('CSS.forcePseudoState',{nodeId:n.nodeId,forcedPseudoClasses:['hover']});
 const actual=await real.evaluate(()=>{document.documentElement.dataset.theme='dark';const e=document.querySelector('[data-b46-sidebar-row="stat-1x2"]'),b=document.querySelector('[data-b46-sidebar-row="stat-all"]');return [e,b].map(x=>({key:x.dataset.b46SidebarRow,bg:getComputedStyle(x).backgroundColor,label:getComputedStyle(x.querySelector(':scope > span:first-child')).color,rate:x.querySelector('[data-b46-rate-snapshot]')?.textContent}))});
 assert(actual.every(a=>a.bg==='rgba(0, 0, 0, 0)'&&a.label==='rgb(59, 213, 142)'),'REAL_PAGE_STYLE '+JSON.stringify(actual));console.log('REAL_PAGE_PASS '+JSON.stringify(actual));await real.close();
 // Publish verified snapshot; no production API or bindings.
 const previewCSS='html,body{margin:0;min-height:100%;font-family:Inter,Arial,sans-serif}body{padding:12px;background:#13271e;color:#edf4ef}html[data-theme="light"] body{background:#edf3ef;color:#21352d}.qa-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;font-size:12px}.qa-head button{background:transparent;color:inherit;border:1px solid #779387;border-radius:7px;padding:8px;cursor:pointer}.qa-shell .dash-shell,.qa-shell .workspace.singlepage{display:block!important;position:relative!important;margin:0!important;padding:0!important;width:100%!important;max-width:none!important;min-width:0!important}.qa-shell .workspace.singlepage > aside.left-rail{display:block!important;position:relative!important;width:268px!important;max-width:100%!important;min-width:0!important;height:calc(100vh - 98px)!important;max-height:none!important;overflow-y:auto!important;visibility:visible!important;transform:none!important;inset:auto!important}.qa-shell .left-rail button,.qa-shell .left-rail a{cursor:pointer}';
 const page='<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BALL46 · Sidebar test</title><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/preview.css"><link rel="stylesheet" href="/sidebar-minimal.css"></head><body data-workspace-view="statistics"><div class="qa-head"><strong>BALL46 · SIDEBAR TEST</strong><button id="theme">Light / Dark</button><span>Snapshot · MATCH STATUS counts follow green Hover / Active; sample Win Rate values.</span></div><div class="qa-shell"><main class="dash-shell"><section class="workspace singlepage">'+previewSide+'</section></main></div><script>const root=document.documentElement;root.dataset.theme=new URLSearchParams(location.search).get("theme")==="light"?"light":"dark";document.querySelector("#theme").onclick=()=>root.dataset.theme=root.dataset.theme==="dark"?"light":"dark";const rows=[...document.querySelectorAll("aside [data-b46-sidebar-row],aside button[data-league-filter],aside a[data-b46-member-entry=rail]")];for(const e of rows)e.addEventListener("click",ev=>{ev.preventDefault();for(const r of rows)r.classList.remove("active");e.classList.add("active");document.body.dataset.workspaceView=e.hasAttribute("data-stat-market")?"statistics":e.dataset.workspaceView==="signal"?"signal":"live"});</script></body></html>';
 const proof={mode:'ISOLATED_SIDEBAR_MINIMAL_V2',baseCssSha:previous.cssSha,cssSha:sha(css),rows:inventory.length,leagueCount:snap.count,stateCases:results.length,productionBefore:before};
 const files={'/':{body:page,type:'text/html'},'/index.html':{body:page,type:'text/html'},'/base.css':{body:safeCSS,type:'text/css'},'/preview.css':{body:previewCSS,type:'text/css'},'/sidebar-minimal.css':{body:css,type:'text/css'},'/health':{body:JSON.stringify(proof),type:'application/json'}};
 const worker='const files='+JSON.stringify(files)+';\nexport default {async fetch(req){const p=new URL(req.url).pathname,f=files[p];if(!["GET","HEAD"].includes(req.method)||!f)return new Response("Test only",{status:404});return new Response(req.method==="HEAD"?null:f.body,{headers:{"Content-Type":f.type+"; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"}})}};';
 const list=await api('/scripts');assert(!list.some(w=>w.id===name),'WORKER_EXISTS');assert(name!==prod&&name.startsWith('ball46-sidebar-minimal-test-'));
 const sub=await api('/subdomain');const url='https://'+name+'.'+sub.subdomain+'.workers.dev';
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-18',bindings:[]})],{type:'application/json'}),'metadata.json');form.append('worker.mjs',new Blob([worker],{type:'application/javascript+module'}),'worker.mjs');
 await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
 let ok=false;for(let i=0;i<25;i++){try{const r=await fetch(url+'/health');if(r.ok&&(await r.json()).cssSha===sha(css)){ok=true;break}}catch{}await new Promise(r=>setTimeout(r,1000))}assert(ok,'PREVIEW_UNAVAILABLE');
 const r=await fetch(url+'/sidebar-minimal.css');assert.equal(sha(await r.text()),sha(css));
 const v=await browser.newPage();await v.setViewport({width:1100,height:1000});await v.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 await v.waitForSelector('[data-b46-sidebar-row="stat-all"]',{visible:true,timeout:15000});
 await v.bringToFront();await v.$eval('[data-b46-sidebar-row="stat-1x2"]',e=>e.scrollIntoView({block:'center'}));await v.hover('[data-b46-sidebar-row="stat-1x2"]');
 await v.screenshot({path:'evidence/preview-dark.png'});await v.click('#theme');await v.screenshot({path:'evidence/preview-light.png'});
 await v.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await v.$eval('[data-b46-sidebar-row="stat-1x2"]',e=>e.click());await v.screenshot({path:'evidence/preview-mobile.png'});
 const style=await v.evaluate(()=>{const e=document.querySelector('[data-b46-sidebar-row="stat-1x2"]');return {active:e.classList.contains('active'),bg:getComputedStyle(e).backgroundColor,rate:getComputedStyle(e.querySelector('[data-b46-rate-snapshot]')).color}});
 assert(style.active&&style.bg==='rgba(0, 0, 0, 0)'&&style.rate==='rgb(240, 91, 107)','PREVIEW_MOBILE');
 for(const theme of ['light','dark']){
  await v.evaluate(t=>{document.documentElement.dataset.theme=t},theme);
  for(const key of ['status-all','status-live','status-signal','status-scheduled','status-unknown','status-finished']){
   await v.$eval('[data-b46-sidebar-row="'+key+'"]',e=>e.click());
   const state=await v.evaluate(k=>{const e=document.querySelector('[data-b46-sidebar-row="'+k+'"]'),rate=document.querySelector('[data-b46-rate-snapshot="1x2"]');return {active:e.classList.contains('active'),label:getComputedStyle(e.querySelector(':scope > span:first-child')).color,count:getComputedStyle(e.querySelector(':scope > b')).color,background:getComputedStyle(e).backgroundColor,rate:getComputedStyle(rate).color}},key);
   assert(state.active&&state.count===state.label&&state.background==='rgba(0, 0, 0, 0)'&&state.rate==='rgb(240, 91, 107)','MOBILE_STATUS '+theme+' '+key+' '+JSON.stringify(state));
  }
  await v.screenshot({path:'evidence/mobile-status-'+theme+'.png'});
  console.log('MOBILE_STATUS_PASS '+theme);
 }

 const after=await active();assert.deepEqual(after,before,'PRODUCTION_CHANGED');
 fs.writeFileSync('evidence/report.json',JSON.stringify({url,proof,results,actual,productionAfter:after,productionUnchanged:true},null,2));console.log('SIDEBAR_TEST_PASS '+JSON.stringify({url,rows:inventory.length,leagues:snap.count,stateCases:results.length,productionUnchanged:true,cssSha:sha(css)}));
}finally{await browser.close()}
