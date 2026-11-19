import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const origin='https://ball46.com';
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
export async function replay(css,patched){
const hook=" document.addEventListener('DOMContentLoaded',()=>{if(last)paint(last)},{once:true});";
assert.equal(patched.split(hook).length,2,'PAINT_HOOK_DRIFT');const instrumented=patched.replace(hook," window.__qaPaint=paint;\n"+hook);
const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const status=['all','live','signal','scheduled','unknown','finished'],keys=['all','1x2','ah','ou','btts','corners','cards','other'];
const rates={all:58.12,'1x2':49.35,ah:60.26,ou:59.13,btts:null,corners:61.39,cards:null,other:null};
const palette={dark:{normal:'rgb(184, 205, 191)',zero:'rgb(126, 148, 136)',active:'rgb(52, 210, 126)',up:'rgb(24, 176, 111)',flat:'rgb(217, 166, 58)',down:'rgb(240, 91, 107)',empty:'rgb(154, 167, 159)'},light:{normal:'rgb(62, 91, 76)',zero:'rgb(122, 139, 130)',active:'rgb(15, 143, 90)',up:'rgb(14, 140, 87)',flat:'rgb(185, 133, 20)',down:'rgb(204, 64, 81)',empty:'rgb(111, 125, 117)'}};
const tone=v=>v===null?'empty':v>50?'up':v<50?'down':'flat';
const cases=[];
try{
 const p=await b.newPage();await p.setViewport({width:1440,height:1000});await p.setCacheEnabled(false);
 await p.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID,{waitUntil:'domcontentloaded',timeout:45000});
 await p.waitForSelector('aside.left-rail[data-b46-sidebar="1"] [data-league-filter]',{timeout:30000});await p.waitForSelector('[data-b46-rate-snapshot="all"]',{timeout:15000});
 // Collect public rendered markup and actual styles, not private user data.
 const snap=await p.evaluate(()=>{const a=document.querySelector('aside.left-rail[data-b46-sidebar="1"]');return {side:a.outerHTML,css:[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n')}catch{return ''}}).join('\n'),rootClass:document.documentElement.className}});
 await p.close();
 const baseCss=snap.css.replace(/@import[^;]+;/gi,'');
 const side=snap.side.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/\son\w+="[^"]*"/gi,'');
 const baseHtml='<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+baseCss+'</style></head><body data-workspace-view="live"><main class="dash-shell"><section class="workspace singlepage">'+side+'</section></main></body></html>';
 let seq=1000000;
 for(const [device,width,height]of [['pc',1440,1000],['mobile',390,844]]){
 const q=await b.newPage();await q.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});
 await q.setContent(baseHtml,{waitUntil:'domcontentloaded'});await q.evaluate(cls=>{document.documentElement.className=cls;for(const e of document.querySelectorAll('[data-b46-rate-snapshot]'))delete e.dataset.b46MonitorSequence},snap.rootClass);
 const c=await q.createCDPSession();await c.send('DOM.enable');await c.send('CSS.enable');const d=await c.send('DOM.getDocument');const selector='aside.left-rail .b46-mobile-status-menu button[data-b46-sidebar-row^="status-"]';const nodes=(await c.send('DOM.querySelectorAll',{nodeId:d.root.nodeId,selector})).nodeIds;assert.equal(nodes.length,6);
 const force=async v=>{for(const nodeId of nodes)await c.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:v})};
 const config=async(theme,mode)=>q.evaluate(({theme,mode})=>{document.documentElement.dataset.theme=theme;document.body.dataset.workspaceView='live';for(const e of document.querySelectorAll('aside.left-rail [data-b46-sidebar-row],aside.left-rail [data-league-filter]')){e.classList.toggle('active',mode==='active');e.removeAttribute('aria-pressed');e.removeAttribute('aria-current')}},{theme,mode});
 const inspect=()=>q.evaluate(()=>{const a=document.querySelector('aside.left-rail');const cc=e=>e?getComputedStyle(e).color:null;return {counts:[...a.querySelectorAll('.b46-mobile-status-menu button[data-b46-sidebar-row^="status-"]')].map(e=>{const b=e.querySelector(':scope>b'),z=b.getAttribute('data-b46-zero');const color=cc(b);b.setAttribute('data-b46-zero','1');const zero=cc(b);b.setAttribute('data-b46-zero','0');const nonzero=cc(b);if(z===null)b.removeAttribute('data-b46-zero');else b.setAttribute('data-b46-zero',z);return {key:e.dataset.b46SidebarRow,color,zero,nonzero,text:b.textContent,name:cc(e.querySelector(':scope>span:first-child')),bg:getComputedStyle(e).backgroundColor}}),rates:[...a.querySelectorAll('[data-b46-rate-snapshot]')].map(e=>({key:e.dataset.b46RateSnapshot,color:cc(e),text:e.textContent})),leagues:[...a.querySelectorAll('[data-league-filter]')].map(e=>({name:cc(e.querySelector('.league-label')),count:cc(e.querySelector(':scope>b')),text:e.textContent,bg:getComputedStyle(e).backgroundColor}))}});
 const original={};for(const theme of ['dark','light']){await config(theme,'normal');original[theme]={normal:await inspect()};await force(['hover']);original[theme].hover=await inspect();await force([]);await config(theme,'active');original[theme].active=await inspect()}
 await q.addStyleTag({content:css});await q.addScriptTag({content:instrumented});
 for(const theme of ['dark','light']){
 await config(theme,'normal');await force([]);await q.evaluate(({rates,sequence})=>window.__qaPaint({rates,sequence}),{rates,sequence:++seq});
 for(const mode of ['normal','hover','active']){
 await config(theme,mode);await force(mode==='hover'?['hover']:[]);
 const now=await inspect(),orig=original[theme][mode],pal=palette[theme];
 assert.equal(now.counts.length,6);assert.equal(now.rates.length,8);
 for(let i=0;i<now.counts.length;i++){const x=now.counts[i],o=orig.counts[i];assert.equal(x.text,o.text);assert.equal(x.name,o.name,'NAME '+device+' '+theme+' '+mode+' '+x.key);assert.equal(x.bg,o.bg);assert.equal(x.zero,mode==='normal'?pal.zero:pal.active,'ZERO '+theme+' '+mode+' '+x.key);assert.equal(x.nonzero,mode==='normal'?pal.normal:pal.active,'COUNT '+theme+' '+mode+' '+x.key)}
 for(const x of now.rates){assert.equal(x.color,pal[tone(rates[x.key])],'RATE '+device+' '+theme+' '+mode+' '+x.key);assert.equal(x.text,rates[x.key]===null?'—':rates[x.key].toFixed(2)+'%')}
 assert.deepEqual(now.leagues,orig.leagues,'LEAGUE_CHANGED');
 cases.push({device,theme,mode,status:6,rates:8,leagues:now.leagues.length});console.log('COLOR_CASE_PASS '+JSON.stringify(cases.at(-1)));
 }
 // Check exact boundary values and refresh while active, without changing the real ledger.
 await q.evaluate(({rates,sequence})=>window.__qaPaint({rates,sequence}),{rates:{...rates,all:50,'1x2':50.01,ah:49.99},sequence:++seq});
 const edge=await inspect();for(const [k,v]of [['all',palette[theme].flat],['1x2',palette[theme].up],['ah',palette[theme].down]])assert.equal(edge.rates.find(x=>x.key===k).color,v,'THRESHOLD '+theme+' '+k);
 console.log('BOUNDARY_PASS '+device+' '+theme);
 }
 await force([]);await config('dark','normal');await q.evaluate(({rates,sequence})=>{window.__qaPaint({rates,sequence});document.querySelector('[data-b46-sidebar-row="status-live"]').classList.add('active')},{rates,sequence:++seq});
 await q.close();
 }
 assert.equal(cases.length,12);
 return cases;
}finally{await b.close()}
}

export async function verifyLive(cssPath,ratePath){
 const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const cases=[];
 try{
 for(const [device,width,height] of [['pc',1440,1000],['mobile',390,844]]){
 const p=await b.newPage();await p.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});await p.setCacheEnabled(false);await p.setBypassServiceWorker(true);
 const loaded=new Set();p.on('response',r=>{if(r.ok())loaded.add(new URL(r.url()).pathname)});
 await p.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID+'-'+device,{waitUntil:'domcontentloaded',timeout:45000});
 await p.waitForFunction((c,j)=>[...document.styleSheets].some(s=>s.href&&new URL(s.href).pathname===c)&&[...document.scripts].some(s=>s.src&&new URL(s.src).pathname===j)&&document.querySelector('[data-b46-rate-snapshot="all"]'),{timeout:25000},cssPath,ratePath);
 await p.waitForFunction(()=>[...document.querySelectorAll('[data-b46-rate-snapshot]')].some(e=>e.dataset.b46MonitorLive==='1'),{timeout:35000});
 assert(loaded.has(cssPath)&&loaded.has(ratePath),'ASSET_NOT_LOADED '+device);
 for(const theme of ['dark','light']){
 await p.evaluate(t=>{document.documentElement.dataset.theme=t},theme);
 const info=await p.evaluate(()=>{const a=document.querySelector('aside.left-rail[data-b46-sidebar="1"]');const color=e=>getComputedStyle(e).color;return {rates:[...a.querySelectorAll('[data-b46-rate-snapshot]')].map(e=>({k:e.dataset.b46RateSnapshot,text:e.textContent,color:color(e),sequence:e.dataset.b46MonitorSequence})),counts:[...a.querySelectorAll('.b46-mobile-status-menu button[data-b46-sidebar-row^="status-"]')].map(e=>({key:e.dataset.b46SidebarRow,text:e.querySelector('b').textContent,color:color(e.querySelector('b')),zero:e.querySelector('b').dataset.b46Zero,active:e.classList.contains('active'),bg:getComputedStyle(e).backgroundColor}))}});
 const pal=theme==='dark'?{normal:'rgb(184, 205, 191)',zero:'rgb(126, 148, 136)',active:'rgb(52, 210, 126)',up:'rgb(24, 176, 111)',flat:'rgb(217, 166, 58)',down:'rgb(240, 91, 107)',empty:'rgb(154, 167, 159)'}:{normal:'rgb(62, 91, 76)',zero:'rgb(122, 139, 130)',active:'rgb(15, 143, 90)',up:'rgb(14, 140, 87)',flat:'rgb(185, 133, 20)',down:'rgb(204, 64, 81)',empty:'rgb(111, 125, 117)'};
 assert.equal(info.rates.length,8);assert.equal(info.counts.length,6);
 // The displayed value is rounded to 2 decimals, so 50.00 may correspond to either side of the exact threshold.
 for(const r of info.rates){assert(r.sequence!==undefined,'RATE_NOT_RENDERED '+r.k);const n=parseFloat(r.text);const allowed=Number.isNaN(n)?[pal.empty]:n>50?[pal.up]:n<50?[pal.down]:[pal.up,pal.flat,pal.down];assert(allowed.includes(r.color),'LIVE_RATE '+device+' '+theme+' '+JSON.stringify(r))}
 for(const r of info.counts){const expect=r.key==='status-signal'&&r.active?pal.active:r.zero==='1'?pal.zero:pal.normal;assert.equal(r.color,expect,'LIVE_COUNT '+device+' '+theme+' '+JSON.stringify(r));}
 await p.screenshot({path:'evidence/live-'+device+'-'+theme+'.png'});cases.push({device,theme,rates:info.rates,counts:info.counts});console.log('LIVE_COLOR_PASS '+JSON.stringify({device,theme,rates:info.rates.map(x=>[x.k,x.text,x.color]),counts:info.counts.length}));
 }
 await p.close();
 }
 return cases;
 }finally{await b.close()}
}
