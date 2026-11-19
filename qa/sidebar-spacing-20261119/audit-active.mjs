import {pathToFileURL} from 'node:url';
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const p=await b.newPage();await p.setViewport({width:1440,height:1000});await p.goto('https://ball46.com/index.html?view=statistics&market=ah',{waitUntil:'domcontentloaded',timeout:45000});await p.waitForSelector('[data-b46-sidebar-row="stat-ah"]',{timeout:25000});await delay(500);await p.mouse.move(1100,10);
 const snapshot=()=>p.evaluate(()=>({view:document.body.dataset.workspaceView,url:location.href,rows:[...document.querySelectorAll('aside.left-rail [data-b46-sidebar-row],aside.left-rail [data-league-filter]')].filter(e=>e.classList.contains('active')||e.matches(':hover,[aria-pressed="true"],[aria-current="page"]')).map(e=>({key:e.dataset.b46SidebarRow||e.dataset.leagueFilter,active:e.classList.contains('active'),hover:e.matches(':hover'),bg:getComputedStyle(e).backgroundColor,shadow:getComputedStyle(e).boxShadow,label:getComputedStyle(e.querySelector('span')).color}))}));
 console.log('INITIAL '+JSON.stringify(await snapshot()));
 const scripts=await p.evaluate(()=>[...document.scripts].map(e=>({src:e.src,text:e.src?'':e.textContent})));
 for(const x of scripts){let t=x.text;if(x.src){if(!x.src.startsWith('https://ball46.com/'))continue;try{const r=await fetch(x.src,{signal:AbortSignal.timeout(8000)});if(!r.ok)continue;t=await r.text()}catch{continue}}
 const patterns=[/classList\.toggle\(['"]active['"]/g,/data-status-filter/g,/data-stat-market/g,/dataset\.workspaceView\s*=/g,/data-league-filter/g];if(!t.includes('data-stat-market')&&!t.includes('data-status-filter'))continue;
 const samples=[];for(const q of patterns){for(const m of [...t.matchAll(q)].slice(0,5))samples.push(t.slice(Math.max(0,m.index-160),m.index+330))}
 console.log('SOURCE '+JSON.stringify({src:x.src||'inline',length:t.length,samples}));}
 const steps=[['live','[data-b46-sidebar-row="status-live"]'],['ah','[data-b46-sidebar-row="stat-ah"]'],['signal','[data-b46-sidebar-row="status-signal"]'],['total','[data-b46-sidebar-row="stat-all"]'],['all','[data-b46-sidebar-row="status-all"]']];
 for(const [key,sel]of steps){await p.$eval(sel,e=>e.click());await p.mouse.move(1100,10);await delay(950);console.log('ACTUAL_CLICK '+key+' '+JSON.stringify(await snapshot()));}
}finally{await b.close()}
