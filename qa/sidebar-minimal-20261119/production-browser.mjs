import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const origin='https://ball46.com';
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
export async function checkReplay(css){
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
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
 const base={i:Number(e.dataset.qaIndex),key:e.getAttribute('data-b46-sidebar-row')||(e.matches('[data-league-filter]')?'league':'member'),ink:st.color,label:cc(label),count:cc(b),rate:cc(rate),rateText:rate?.textContent?.trim(),rateInline:rate?.style.getPropertyValue('color'),icon:cc(icon),bg:st.backgroundColor,img:st.backgroundImage,border:st.borderTopColor,borders:['Top','Right','Bottom','Left'].map(side=>({width:st['border'+side+'Width'],style:st['border'+side+'Style'],color:st['border'+side+'Color']})),shadow:st.boxShadow,green:st.getPropertyValue('--sidebar-green').trim(),w:e.offsetWidth,h:e.offsetHeight};
 if(b&&b.hasAttribute('data-b46-zero')){const old=b.getAttribute('data-b46-zero');b.setAttribute('data-b46-zero','1');base.countZero=cc(b);b.setAttribute('data-b46-zero','0');base.countNonzero=cc(b);b.setAttribute('data-b46-zero',old)}
 return base;
 }))}
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

 await q.close();await p.close();return results;
 }finally{await browser.close()}
}
export async function checkReal({css,cssPath,preflight}){
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});

 const rows=[];
 try{
 for(const [device,width,height]of [['pc',1440,1000],['mobile',390,844]]){
 const p=await browser.newPage();await p.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});await p.bringToFront();await p.setCacheEnabled(false);await p.setBypassServiceWorker(true);
 await p.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID+'-'+device,{waitUntil:'domcontentloaded',timeout:45000});
 await p.waitForSelector('aside.left-rail[data-b46-sidebar="1"] [data-b46-sidebar-row="stat-all"]',{timeout:30000});
 if(preflight)await p.addStyleTag({content:css});else await p.waitForFunction(path=>[...document.styleSheets].some(s=>s.href&&new URL(s.href).pathname===path),{timeout:15000},cssPath);
 await p.waitForFunction(()=>document.querySelectorAll('aside.left-rail [data-league-filter]').length>0,{timeout:20000});
 // Browser-local classes only; no click on external links and no production mutations.
 const c=await p.createCDPSession();await c.send('DOM.enable');await c.send('CSS.enable');
 const doc=await c.send('DOM.getDocument');const sel='aside.left-rail [data-b46-sidebar-row], aside.left-rail button[data-league-filter], aside.left-rail a[data-b46-member-entry="rail"]';
 const nodes=(await c.send('DOM.querySelectorAll',{nodeId:doc.root.nodeId,selector:sel})).nodeIds;
 assert(nodes.length>=16,'SIDEBAR_ROWS_MISSING '+device);
 const force=async v=>{for(let i=0;i<nodes.length;i+=35)await Promise.all(nodes.slice(i,i+35).map(nodeId=>c.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:v})))};
 const inspect=()=>p.evaluate(sel=>[...document.querySelectorAll(sel)].map(e=>{const st=getComputedStyle(e),label=e.querySelector('.league-label')||e.querySelector('.b46-premium-name > span:last-child')||e.querySelector(':scope > span:first-child'),b=e.querySelector(':scope > b'),rate=e.querySelector(':scope > [data-b46-rate-snapshot]');const color=x=>x?getComputedStyle(x).color:null;const t=document.createElement('span');t.style.setProperty('color','var(--sidebar-green,var(--green))','important');e.append(t);const green=getComputedStyle(t).color;t.remove();return {key:e.dataset.b46SidebarRow||(e.hasAttribute('data-league-filter')?'league':'member'),active:e.classList.contains('active'),name:color(label),count:color(b),rate:color(rate),rateText:rate?.textContent?.trim(),rateInline:rate?.style.getPropertyValue('color'),green,bg:st.backgroundColor,img:st.backgroundImage,border:st.borderTopColor,borders:['Top','Right','Bottom','Left'].map(side=>({width:st['border'+side+'Width'],style:st['border'+side+'Style'],color:st['border'+side+'Color']})),shadow:st.boxShadow}}),sel);
 // Freeze actual rendered DOM in a separate blank page, not the live application's rerenders.
 const snap=await p.evaluate(()=>{const a=document.querySelector('aside.left-rail[data-b46-sidebar="1"]');return {side:a.outerHTML,rootClass:document.documentElement.className,styles:[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n')}catch{return ''}}).join('\n')}});
 const orig=await inspect();assert.equal(orig.filter(x=>x.key.startsWith('stat-')).length,8);
 const activeTotal=orig.find(x=>x.key==='stat-all');
 assert(activeTotal.active&&activeTotal.name===activeTotal.green&&activeTotal.bg==='rgba(0, 0, 0, 0)','ACTUAL_ACTIVE_TOTAL '+device+' '+JSON.stringify(activeTotal));
 await p.screenshot({path:'evidence/'+(preflight?'pre':'live')+'-'+device+'.png'});
 await p.close();
 const q=await browser.newPage();await q.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});await q.bringToFront();
 await q.setContent('<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+snap.styles.replace(/@import[^;]+;/gi,'')+'</style></head><body data-workspace-view="statistics"><main class="dash-shell"><section class="workspace singlepage">'+snap.side.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'</section></main></body></html>',{waitUntil:'domcontentloaded'});
 await q.evaluate(cls=>{document.documentElement.className=cls},snap.rootClass);
 const qcdp=await q.createCDPSession();await qcdp.send('DOM.enable');await qcdp.send('CSS.enable');const qdoc=await qcdp.send('DOM.getDocument');const qnodes=(await qcdp.send('DOM.querySelectorAll',{nodeId:qdoc.root.nodeId,selector:sel})).nodeIds;
 const qforce=async v=>{for(let i=0;i<qnodes.length;i+=35)await Promise.all(qnodes.slice(i,i+35).map(nodeId=>qcdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:v})))};
 const configure=async(theme,view,mode)=>q.evaluate(({theme,view,mode,sel})=>{document.documentElement.dataset.theme=theme;document.body.dataset.workspaceView=view;for(const e of document.querySelectorAll(sel)){e.classList.toggle('active',mode==='active');e.removeAttribute('aria-current');e.removeAttribute('aria-pressed')}},{theme,view,mode,sel});
 const qinspect=()=>q.evaluate(sel=>[...document.querySelectorAll(sel)].map(e=>{const st=getComputedStyle(e),label=e.querySelector('.league-label')||e.querySelector('.b46-premium-name > span:last-child')||e.querySelector(':scope > span:first-child'),b=e.querySelector(':scope > b'),rate=e.querySelector(':scope > [data-b46-rate-snapshot]');const color=x=>x?getComputedStyle(x).color:null;const t=document.createElement('span');t.style.setProperty('color','var(--sidebar-green,var(--green))','important');e.append(t);const green=getComputedStyle(t).color;t.remove();return {key:e.dataset.b46SidebarRow||(e.hasAttribute('data-league-filter')?'league':'member'),name:color(label),count:color(b),rate:color(rate),rateText:rate?.textContent?.trim(),green,bg:st.backgroundColor,img:st.backgroundImage,border:st.borderTopColor,borders:['Top','Right','Bottom','Left'].map(side=>({width:st['border'+side+'Width'],style:st['border'+side+'Style'],color:st['border'+side+'Color']})),shadow:st.boxShadow}}),sel);
 for(const theme of ['dark','light'])for(const view of ['statistics','live']){
 await qforce([]);await configure(theme,view,'normal');const base=await qinspect();
 for(const mode of ['hover','active']){
 await configure(theme,view,mode);await qforce(mode==='hover'?['hover']:[]);
 const now=await qinspect();assert.equal(base.length,now.length);
 for(let i=0;i<now.length;i++){const a=now[i],b=base[i],key=a.key;const green=mode==='hover'||key==='league'||key==='member'||key.startsWith('stat-')||key==='status-signal'||(view==='live'&&key.startsWith('status-'));
 assert.equal(a.bg,'rgba(0, 0, 0, 0)','BG '+device+' '+key);assert.equal(a.img,'none');assert.equal(a.shadow,'none');assert(a.borders.every(b=>parseFloat(b.width)===0||b.style==='none'||b.style==='hidden'||b.color==='rgba(0, 0, 0, 0)'),'VISIBLE_BORDER '+device+' '+key+' '+theme+' '+mode+' '+JSON.stringify(a.borders));
 if(green)assert.equal(a.name,a.green,'NAME '+device+' '+key+' '+theme+' '+mode);
 assert.equal(a.count,key.startsWith('status-')&&green?a.green:b.count,'COUNT '+device+' '+key+' '+theme+' '+mode);
 assert.equal(a.rate,b.rate,'RATE '+device+' '+key+' '+theme+' '+mode);assert.equal(a.rateText,b.rateText);
 }
 rows.push({device,theme,view,mode,rows:now.length});console.log((preflight?'PRE_REAL':'LIVE_REAL')+' '+JSON.stringify(rows.at(-1)));
 }
 }
 await q.close()
 }
 return rows;
 }finally{await browser.close()}
}
