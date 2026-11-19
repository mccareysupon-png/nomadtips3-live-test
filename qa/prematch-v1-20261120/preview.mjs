import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const name='ball46-prematch-ui-test-20261120',prod='ball46-production',origin='https://ball46.com';
assert(name.startsWith('ball46-prematch-ui-test-')&&name!==prod);
const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token}=process.env;
assert(account&&token);
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,opts={}){const r=await fetch(root+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status);return j.result}
async function active(){return (await api('/scripts/'+prod+'/deployments?per_page=1')).deployments[0].versions}
const before=await active();console.log('PRODUCTION_BEFORE',JSON.stringify(before));fs.mkdirSync('evidence',{recursive:true});
const puppet=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const browser=await puppet.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const scope='aside.left-rail[data-b46-sidebar="1"]';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const p=await browser.newPage();await p.setViewport({width:1440,height:1000});await p.setRequestInterception(true);
 p.on('request',r=>{if(!['GET','HEAD'].includes(r.method())||/5dollarfootballapi\.com/i.test(r.url()))r.abort();else r.continue()});
 await p.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID,{waitUntil:'domcontentloaded',timeout:45000});
 await p.waitForSelector(scope+' [data-b46-sidebar-row="status-signal"]',{timeout:30000});
 await p.waitForSelector(scope+' [data-b46-sidebar-row="stat-other"]',{timeout:30000});
 const snap=await p.evaluate(scope=>{
  const original=document.querySelector(scope),side=original.cloneNode(true);
  const rows=()=>[...side.querySelectorAll('[data-b46-sidebar-row]')];
  const old=rows().map(e=>[e.dataset.b46SidebarRow,e.textContent.trim()]);
  const locate=k=>side.querySelector('[data-b46-sidebar-row="'+k+'"]');
  const signal=locate('status-signal'),upcoming=locate('status-upcoming'),other=locate('stat-other'),all=locate('stat-all');
  if(!signal||!upcoming||!other||!all)throw Error('NATIVE_ROW_MISSING');
  function make(src,key,label,count){
   const e=src.cloneNode(false);e.removeAttribute('id');for(const a of [...e.attributes])if(a.name.startsWith('data-')||a.name.startsWith('aria-')||a.name.startsWith('on')||a.name==='href')e.removeAttribute(a.name);
   e.classList.remove('active');e.classList.add('prematch-preview-row');e.setAttribute('type','button');e.dataset.b46SidebarRow=key;e.dataset.pm=key;
   const l=document.createElement('span');l.textContent=label;e.append(l);
   const v=document.createElement('span');v.className='pm-value';v.textContent=count;e.append(v);return e;
  }
  signal.after(make(signal,'status-prematch','Pre-Match Predictions','0'));
  const section=document.createElement('section');section.className='pm-stat-group';section.setAttribute('aria-label','Pre-Match statistics');
  const heading=document.createElement('div');heading.className='pm-stat-heading';heading.textContent='PRE-MATCH';section.append(heading);
  for(const [k,label] of [['all','All Matches'],['1x2','1X2'],['btts','BTTS']])section.append(make(all,'prematch-stat-'+k,label,'—'));
  other.after(section);
  const preserved=rows().filter(e=>!e.dataset.pm).map(e=>[e.dataset.b46SidebarRow,e.textContent.trim()]);
  if(JSON.stringify(old)!==JSON.stringify(preserved))throw Error('LIVE_ROWS_CHANGED');
  for(const e of side.querySelectorAll('script,iframe,object,embed,form'))e.remove();
  for(const e of side.querySelectorAll('*'))for(const a of [...e.attributes])if(/^on/i.test(a.name)||['href','action','src','srcset'].includes(a.name))e.removeAttribute(a.name);
  side.removeAttribute('style');
  return {html:side.outerHTML,root:document.documentElement.className,css:[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n')}catch{return ''}}).join('\n'),old};
 },scope);
 await p.close();
 console.log('NATIVE_ROWS_PRESERVED',JSON.stringify(snap.old));
 const css=snap.css.replace(/@import[^;]+;/gi,'')+"/* Isolated preview layout, never injected into production. */\nhtml,body{margin:0;min-height:100%;font-family:Inter,Arial,sans-serif}body{background:#14231c;color:#edf4ef;padding:12px;overflow-x:hidden}html[data-theme=light] body{background:#f1f4f2;color:#22332a}.pm-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;font-size:12px}.pm-head strong{font-size:24px}.pm-head strong span{color:#19b569}.pm-head button{background:transparent;color:inherit;border:1px solid #84978b;border-radius:6px;padding:6px 10px;margin-left:auto}.pm-shell.workspace.singlepage{display:grid!important;grid-template-columns:minmax(238px,280px) minmax(0,1fr)!important;gap:16px!important;position:relative!important;width:100%!important;max-width:none!important;margin:0!important;height:auto!important;overflow:visible!important}.dash-shell{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important}.pm-shell>aside.left-rail{display:block!important;position:relative!important;inset:auto!important;transform:none!important;opacity:1!important;width:100%!important;max-width:none!important;height:auto!important;max-height:none!important;overflow:visible!important}.pm-content{min-width:0;padding:16px;align-self:start;border:1px solid #61756b;border-radius:10px}.pm-content h2{font-size:20px;margin:0 0 8px;color:inherit}.pm-content p{font-size:12px;color:inherit;margin:0 0 14px}.pm-card{display:grid;gap:10px;border:1px solid #61756b;border-radius:9px;padding:14px;max-width:620px}.pm-teams{display:flex;justify-content:space-between;gap:6px;align-items:center;font-size:14px}.pm-league,.pm-pick small{font-size:11px;opacity:.8}.pm-pick{display:grid;gap:6px;border:1px solid #61756b;border-radius:7px;padding:12px}.pm-pick>div{display:flex;justify-content:space-between;gap:8px}.pm-pick b{color:#1b9a5c}.pm-stat-group{display:block;margin-top:12px}.pm-stat-heading{font-size:11px;font-weight:700;letter-spacing:.04em;padding:6px 8px}.prematch-preview-row{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:4px;width:100%;text-align:left}.prematch-preview-row>span:first-child{white-space:normal;font-size:inherit;line-height:1.15}.pm-value{font-size:10px;font-weight:700;flex-shrink:0}.prematch-preview-row.active{color:#1da462!important}.prematch-preview-row.active>span:first-child{color:#1da462!important}#pm-empty{padding:18px;border:1px solid #61756b;border-radius:8px}#pm-empty[hidden],#pm-card[hidden]{display:none!important}@media(max-width:700px){.pm-shell.workspace.singlepage{grid-template-columns:minmax(0,1fr)!important}.pm-content{grid-row:1;padding:12px}.pm-shell>aside.left-rail{grid-row:2;min-width:0!important}.pm-head button{margin-left:0}}";
 const client="document.querySelector('#pm-theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'});for(const e of document.querySelectorAll('[data-pm]'))e.addEventListener('click',()=>{for(const x of document.querySelectorAll('[data-b46-sidebar-row]')){x.classList.remove('active');x.removeAttribute('aria-current');x.removeAttribute('aria-pressed')}e.classList.add('active');e.setAttribute('aria-current','page');const k=e.dataset.pm,stat=k.startsWith('prematch-stat-');document.querySelector('#pm-title').textContent=stat?'Pre-Match Statistics · '+e.querySelector('span').textContent:'Pre-Match Predictions';document.querySelector('#pm-card').hidden=stat;document.querySelector('#pm-empty').hidden=!stat;});";
 const html='<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BALL46 Pre-Match phase 1 TEST</title><style>'+css+'</style></head><body data-workspace-view="live"><div class="pm-head"><strong>ball<span>46</span></strong><span>ISOLATED TEST · NO LIVE DATA</span><button id="pm-theme" type="button">Light / Dark</button></div><main class="dash-shell"><section class="workspace singlepage pm-shell">'+snap.html+'<article class="pm-content"><h2 id="pm-title">Pre-Match Predictions</h2><p id="pm-caption">Test fixture only · no real predictions</p><div id="pm-card" class="pm-card"><div class="pm-league">DEMO FIXTURE · 67′ LIVE</div><div class="pm-teams">Test home <strong>1 : 0</strong> Test away</div><div class="pm-pick" data-demo="prematch"><small>PRE-MATCH PREDICTION</small><div><b>BTTS YES</b><span>1.85</span></div></div><div class="pm-pick" data-demo="live"><small>LIVE PREDICTION · 67′</small><div><b>OVER 2.5</b><span>1.95</span></div></div></div><div id="pm-empty" hidden>No settled Pre-Match predictions · —</div></article></section></main><script>'+client+'</script></body></html>';
 const proof={mode:'ISOLATED_PREMATCH_PHASE1_UI',productionBefore:before,liveRowsPreserved:snap.old.length,syntheticOnly:true,upstreamCalls:0,bindings:[]};
 const files={'/':{body:html,type:'text/html'},'/index.html':{body:html,type:'text/html'},'/health':{body:JSON.stringify(proof),type:'application/json'}};
 const worker='const files='+JSON.stringify(files)+';export default {async fetch(req){const f=files[new URL(req.url).pathname];if(!["GET","HEAD"].includes(req.method)||!f)return new Response("Test only",{status:404});return new Response(req.method==="HEAD"?null:f.body,{headers:{"Content-Type":f.type+"; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src \\'none\\'; style-src \\'unsafe-inline\\'; script-src \\'unsafe-inline\\'; img-src data:; connect-src \\'none\\'; base-uri \\'none\\'; form-action \\'none\\'"}})}};';
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-19',bindings:[]})],{type:'application/json'}),'metadata.json');form.append('worker.mjs',new Blob([worker],{type:'application/javascript+module'}),'worker.mjs');
 const existing=(await api('/scripts')).some(w=>w.id===name);assert(!existing,'TEST_NAME_ALREADY_EXISTS');
 await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
 const sub=await api('/subdomain'),url='https://'+name+'.'+sub.subdomain+'.workers.dev';
 const cases=[];
 for(const [device,width,height] of [['pc',1440,1000],['mobile',390,844]]){
  const q=await browser.newPage();await q.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});
  let ok=false;for(let i=0;i<12;i++){try{const r=await q.goto(url+'/?qa='+i,{waitUntil:'domcontentloaded',timeout:15000});if(r?.ok()&&await q.$('[data-pm="status-prematch"]')){ok=true;break}}catch{}await sleep(1200)}assert(ok,'PREVIEW_UNAVAILABLE');
  for(const theme of ['dark','light']){
   await q.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await q.evaluate(()=>document.querySelector('[data-pm="status-prematch"]').click());
   const out=await q.evaluate(()=>{
    const a=document.querySelector('[data-b46-sidebar-row="status-signal"]'),b=document.querySelector('[data-pm="status-prematch"]'),c=document.querySelector('[data-b46-sidebar-row="status-upcoming"]');
    const r=[...document.querySelectorAll('.pm-pick')].map(x=>{const d=x.getBoundingClientRect();return {top:d.top,bottom:d.bottom,width:d.width,height:d.height}});
    return {order:a.nextElementSibling===b&&b.nextElementSibling===c,stat:[...document.querySelectorAll('.pm-stat-group [data-pm]')].map(e=>e.textContent.trim()),active:b.classList.contains('active'),title:document.querySelector('#pm-title').textContent,overlap:r[0].bottom>r[1].top,picks:r,overflow:document.documentElement.scrollWidth>innerWidth};
   });assert(out.order&&out.active&&!out.overlap&&!out.overflow&&out.picks.every(x=>x.height>0)&&out.stat.length===3,JSON.stringify(out));
   await q.screenshot({path:'evidence/'+device+'-'+theme+'.png',fullPage:true});
   await q.evaluate(()=>document.querySelector('[data-pm="prematch-stat-btts"]').click());assert.equal(await q.$eval('#pm-title',e=>e.textContent),'Pre-Match Statistics · BTTS');assert.equal(await q.$eval('#pm-empty',e=>e.hidden),false);
   cases.push({device,theme,...out});console.log('UI_CASE_PASS',JSON.stringify(cases.at(-1)));
  }await q.close();
 }
 assert.deepEqual(await active(),before,'PRODUCTION_CHANGED_DURING_CHECK');
 fs.writeFileSync('evidence/report.json',JSON.stringify({url,proof,cases,productionUnchanged:true},null,2));
 console.log('PREMATCH_UI_PHASE1_READY',JSON.stringify({url,cases:cases.length,productionUnchanged:true}));
}finally{await browser.close()}
