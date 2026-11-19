import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const prod='ball46-production',name='ball46-sidebar-depth-test-20261119',origin='https://ball46.com',prior='https://ball46-sidebar-colors-test-v3-20261119.mccarey-supon.workers.dev';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;assert(account&&token);const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,opts={}){const r=await fetch(root+p,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF '+p+' '+r.status);return j.result}
async function active(){return (await api('/scripts/'+prod+'/deployments?per_page=1')).deployments[0].versions}
async function get(base,path,verify=()=>true){for(let i=0;i<15;i++){try{const r=await fetch(base+path+'?qa='+process.env.GITHUB_RUN_ID+'-'+i,{signal:AbortSignal.timeout(10000)});if(r.ok){const t=await r.text();if(verify(t))return t}}catch{}await sleep(1000)}throw Error('HTTP '+base+path)}
const before=await active();console.log('PRODUCTION_BEFORE '+JSON.stringify(before));fs.mkdirSync('evidence',{recursive:true});
const css=fs.readFileSync('qa/sidebar-depth-20261119/sidebar-depth.css','utf8');
const origPage=await get(prior,'/',v=>v.includes('BALL46 · COLOR TEST')&&v.includes('qa-mobile-layout'));
const base=await get(prior,'/base.css',v=>v.includes('left-rail'));const preview=await get(prior,'/preview.css',v=>v.includes('qa-shell'));const colors=await get(prior,'/sidebar-colors.css',v=>sha(v)==='591e0b481f261fde65d7f531f8dd6b0e7c2bf172396660c47935f8eb8c49a388');
const liveColors=await get(origin,'/b46-sidebar-colors-20261119-v1.css',v=>v===colors);
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const sel='aside.left-rail[data-b46-sidebar="1"] :is([data-b46-sidebar-row],button[data-league-filter],a[data-b46-member-entry="rail"])';
const palette={dark:{hover:'rgba(70, 120, 90, 0.16)',active:'rgba(80, 145, 105, 0.22)'},light:{hover:'rgba(70, 130, 95, 0.1)',active:'rgba(65, 120, 85, 0.15)'}};
const cases=[];
async function inspect(p){return p.evaluate(sel=>[...document.querySelectorAll(sel)].map(e=>{const s=getComputedStyle(e),c=x=>x?getComputedStyle(x).color:null;return {key:e.dataset.b46SidebarRow||(e.hasAttribute('data-league-filter')?'league':'member'),label:c(e.querySelector('.league-label')||e.querySelector('.b46-premium-name > span:last-child')||e.querySelector(':scope>span:first-child')),count:c(e.querySelector(':scope>b')),rate:c(e.querySelector('[data-b46-rate-snapshot]')),value:e.textContent,icon:c(e.querySelector('svg.b46-menu-icon')),background:s.backgroundColor,shadow:s.boxShadow,border:['Top','Right','Bottom','Left'].every(k=>parseFloat(s['border'+k+'Width'])===0||s['border'+k+'Style']==='none'||s['border'+k+'Color']==='rgba(0, 0, 0, 0)'),radius:s.borderTopLeftRadius,transform:s.transform,width:e.offsetWidth,height:e.offsetHeight}}),sel)}
try{
 // Real public DOM and CSS, frozen in a separate browser document to avoid live updates during color comparison.
 const p=await b.newPage();await p.setViewport({width:1440,height:1000});await p.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID,{waitUntil:'domcontentloaded',timeout:45000});await p.waitForSelector('aside.left-rail[data-b46-sidebar="1"] [data-league-filter]',{timeout:30000});await p.waitForFunction(()=>[...document.styleSheets].some(s=>s.href?.includes('b46-sidebar-colors-20261119-v1.css')),{timeout:15000});
 const snap=await p.evaluate(()=>{const a=document.querySelector('aside.left-rail[data-b46-sidebar="1"]');return {side:a.outerHTML,rootClass:document.documentElement.className,styles:[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n')}catch{return ''}}).join('\n')}});
 await p.close();assert(snap.styles.includes('--b46-count-normal')&&snap.styles.includes('--b46-menu-normal'));
 const markup='<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+snap.styles.replace(/@import[^;]+;/gi,'')+'</style></head><body data-workspace-view="live"><main class="dash-shell"><section class="workspace singlepage">'+snap.side.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'</section></main></body></html>';
 for(const [device,width,height]of [['pc',1440,1000],['mobile',390,844]]){
 const q=await b.newPage();await q.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});await q.setContent(markup,{waitUntil:'domcontentloaded'});await q.evaluate(cls=>{document.documentElement.className=cls},snap.rootClass);
 const media=await q.evaluate(()=>matchMedia('(min-width:768px) and (hover:hover) and (pointer:fine)').matches);assert.equal(media,device==='pc','MEDIA_SCOPE');
 const c=await q.createCDPSession();await c.send('DOM.enable');await c.send('CSS.enable');const d=await c.send('DOM.getDocument');const ids=(await c.send('DOM.querySelectorAll',{nodeId:d.root.nodeId,selector:sel})).nodeIds;assert(ids.length>=16);
 const force=async v=>{for(let i=0;i<ids.length;i+=50)await Promise.all(ids.slice(i,i+50).map(nodeId=>c.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:v})))};
 const config=async(theme,mode)=>{await q.evaluate(({theme,mode,sel})=>{document.documentElement.dataset.theme=theme;document.body.dataset.workspaceView='live';for(const e of document.querySelectorAll(sel)){e.classList.toggle('active',mode==='active');e.removeAttribute('aria-current');e.removeAttribute('aria-pressed')}},{theme,mode,sel});await force(mode==='hover'?['hover']:[]);await sleep(240)};
 const reference={};for(const theme of ['dark','light'])for(const mode of ['normal','hover','active']){await config(theme,mode);reference[theme+mode]=await inspect(q)}
 await q.addStyleTag({content:css});
 for(const theme of ['dark','light'])for(const mode of ['normal','hover','active']){
 await config(theme,mode);const now=await inspect(q),ref=reference[theme+mode];assert.equal(now.length,ref.length);
 for(let i=0;i<now.length;i++){const x=now[i],r=ref[i];for(const k of ['key','label','count','rate','value','icon','width','height'])assert.equal(x[k],r[k],'UNCHANGED '+device+' '+theme+' '+mode+' '+x.key+' '+k);
 if(device==='mobile'||mode==='normal'){for(const k of ['background','shadow','border','transform'])assert.equal(x[k],r[k],'UNCHANGED_SURFACE '+device+' '+theme+' '+mode+' '+x.key+' '+k)}else{assert.equal(x.background,palette[theme][mode],'BG '+theme+' '+mode+' '+x.key);assert.notEqual(x.shadow,'none','SHADOW '+x.key);assert(x.border,'BORDER '+x.key);assert.equal(x.transform,mode==='hover'?'matrix(1, 0, 0, 1, 0, -1)':'none','TRANSFORM '+x.key)}}
 cases.push({device,theme,mode,rows:now.length});console.log('DEPTH_CASE_PASS '+JSON.stringify(cases.at(-1)));
 }
 await q.close()
 }
 // Keep the already verified mobile preview layout and approved color assets. Only append desktop surface CSS.
 const page=origPage.replace('BALL46 · Numeric colors test','BALL46 · Desktop menu depth').replace('BALL46 · COLOR TEST','BALL46 · DESKTOP DEPTH TEST').replace('Snapshot · compare number colors; no live records.','Snapshot · hover or select a menu; mobile unchanged.').replace('</head>','<link rel="stylesheet" href="/sidebar-depth.css"></head>');
 assert(page.includes('/sidebar-depth.css')&&page.includes('qa-mobile-layout'));
 const proof={mode:'ISOLATED_SIDEBAR_DEPTH',cssSha:sha(css),colorsSha:sha(colors),cases:cases.length,productionBefore:before};
 const files={'/':{body:page,type:'text/html'},'/index.html':{body:page,type:'text/html'},'/base.css':{body:base,type:'text/css'},'/preview.css':{body:preview,type:'text/css'},'/sidebar-colors.css':{body:colors,type:'text/css'},'/sidebar-depth.css':{body:css,type:'text/css'},'/health':{body:JSON.stringify(proof),type:'application/json'}};
 const worker='const files='+JSON.stringify(files)+';\nexport default {async fetch(req){const p=new URL(req.url).pathname,f=files[p];if(!["GET","HEAD"].includes(req.method)||!f)return new Response("Test only",{status:404});return new Response(req.method==="HEAD"?null:f.body,{headers:{"Content-Type":f.type+"; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"}})}};';
 assert(name!==prod&&name.startsWith('ball46-sidebar-depth-test-'));const list=await api('/scripts');assert(!list.some(w=>w.id===name),'WORKER_EXISTS');const sub=await api('/subdomain');const url='https://'+name+'.'+sub.subdomain+'.workers.dev';
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-18',bindings:[]})],{type:'application/json'}),'metadata.json');form.append('worker.mjs',new Blob([worker],{type:'application/javascript+module'}),'worker.mjs');
 await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
 for(const [path,value]of [['/',page],['/base.css',base],['/preview.css',preview],['/sidebar-colors.css',colors],['/sidebar-depth.css',css]])await get(url,path,t=>t===value);
 const sample='[data-b46-sidebar-row="status-live"]',hover='[data-b46-sidebar-row="status-scheduled"]';
 for(const [device,width,height]of [['pc',1100,1000],['mobile',390,844]]){
 const q=await b.newPage();await q.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});await q.setCacheEnabled(false);let ready=false;
 for(let i=0;i<12;i++){try{const r=await q.goto(url+'/?qa='+process.env.GITHUB_RUN_ID+'-'+device+'-'+i,{waitUntil:'domcontentloaded',timeout:15000});assert(r?.ok());await q.waitForFunction(()=>!!document.querySelector('#qa-mobile-layout')&&[...document.styleSheets].some(s=>s.href?.includes('/sidebar-depth.css'))&&document.querySelector('[data-b46-rate-snapshot="all"]')?.getBoundingClientRect().width>0,{timeout:6000});ready=true;break}catch(e){console.log('PREVIEW_RETRY '+device+' '+i+' '+e.message);await sleep(1500)}}assert(ready,'PREVIEW_UNAVAILABLE '+device);
 for(const theme of ['dark','light']){
 await q.evaluate(t=>{document.documentElement.dataset.theme=t;document.querySelector('[data-b46-sidebar-row="status-live"]').click()},theme);
 if(device==='pc')await q.hover(hover);await sleep(250);
 const s=await q.evaluate(({sample,hover})=>[sample,hover].map(k=>{const e=document.querySelector(k),s=getComputedStyle(e);return {bg:s.backgroundColor,shadow:s.boxShadow,visible:e.getBoundingClientRect().width>0}}),{sample,hover});
 assert(s.every(x=>x.visible));assert.equal(s[0].bg,device==='pc'?palette[theme].active:'rgba(0, 0, 0, 0)');assert.equal(s[1].bg,device==='pc'?palette[theme].hover:'rgba(0, 0, 0, 0)');await q.screenshot({path:'evidence/'+device+'-'+theme+'.png'});console.log('PREVIEW_DEPTH_PASS '+device+' '+theme);
 }
 await q.close()
 }
 assert.deepEqual(await active(),before,'PRODUCTION_CHANGED');fs.writeFileSync('evidence/report.json',JSON.stringify({url,proof,cases,productionUnchanged:true,previewCases:4},null,2));console.log('SIDEBAR_DEPTH_READY '+JSON.stringify({url,cases:cases.length,previewCases:4,productionUnchanged:true,cssSha:sha(css)}));
}finally{await b.close()}
