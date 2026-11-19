import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const origin='https://ball46.com',sleep=ms=>new Promise(r=>setTimeout(r,ms));
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
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
 await configure(p,theme,'live',['status-all']);await off(p);
 let rows=await inspect(p);const idle=gap(rows,'status-all','status-live');assert(idle>=4,'IDLE_GAP '+idle);
 await hover(p,live);rows=await inspect(p);const h=gap(rows,'status-all','status-live');assert(h>=3,'HOVER_GAP '+h);assert.equal(rows.find(x=>x.key==='status-all').bg,palette[theme].active);assert.equal(rows.find(x=>x.key==='status-live').bg,palette[theme].hover);
 await off(p);only(await inspect(p),'status-all',palette[theme].active);
 for(const market of ['all','1x2','ah','ou','btts','corners','cards','other']){
 await configure(p,theme,'statistics',['status-live','stat-'+market]);await off(p);rows=await inspect(p);only(rows,'stat-'+market,palette[theme].active);assert(rows.find(x=>x.key==='status-live').active,'REMEMBERED_STATUS_REMOVED');
 }
 await hover(p,live);rows=await inspect(p);assert.equal(rows.find(x=>x.key==='status-live').bg,palette[theme].hover);assert.equal(rows.find(x=>x.key==='stat-other').bg,palette[theme].active);
 await off(p);only(await inspect(p),'stat-other',palette[theme].active);
 await configure(p,theme,'statistics',['status-all','stat-all']);await off(p);only(await inspect(p),'stat-all',palette[theme].active);
 return {theme,idleGap:idle,hoverGap:h,rows:rows.length,markets:8,rememberedStatusPreserved:true};
}
async function actual(p){
 const results=[];
 for(const theme of ['dark','light']){
 await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await sleep(500);await off(p);
 for(const [first,second] of [['status-live','stat-ah'],['status-all','stat-all'],['status-signal','stat-1x2'],['status-scheduled','stat-ou']]){
 const choose=async key=>{const sel='[data-b46-sidebar-row="'+key+'"]';const expected=key.startsWith('stat-')?'statistics':key==='status-signal'?'signal':'live';for(let i=0;i<3;i++){await p.$eval(sel,e=>e.click());await off(p);try{await p.waitForFunction((sel,view)=>document.body.dataset.workspaceView===view&&document.querySelector(sel)?.classList.contains('active'),{timeout:5000},sel,expected);break}catch(e){if(i===2)throw e;console.log('NAV_RETRY '+key)}}await sleep(350);console.log('NAV '+key+' '+JSON.stringify(await p.evaluate(()=>({view:document.body.dataset.workspaceView,url:location.href,theme:document.documentElement.dataset.theme}))))};
 await choose(first);let rows=await inspect(p);only(rows,first,palette[theme].active);
 await choose(second);rows=await inspect(p);only(rows,second,palette[theme].active);
 const route=await p.evaluate(()=>({view:document.body.dataset.workspaceView,market:new URL(location.href).searchParams.get('market')||'all'}));assert.equal(route.view,'statistics');assert.equal(route.market,second.slice(5));
 if(first!=='status-signal')assert(rows.find(x=>x.key===first).active,'FILTER_STATE_LOST');
 results.push({theme,from:first,to:second,activeCards:1});
 }
 await p.screenshot({path:'evidence/actual-'+theme+'.png'});
 }
 console.log('REAL_NAV_PASS '+JSON.stringify(results));return results;
}
export async function check({spacing,routeCSS,paths,preflight}){
const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});

try{
 const p=await b.newPage();await p.setViewport({width:1440,height:1000});await p.setCacheEnabled(false);
 await p.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID,{waitUntil:'domcontentloaded',timeout:45000});
 await p.waitForSelector(scope+' [data-league-filter]',{timeout:30000});
 await p.waitForFunction(()=>[...document.styleSheets].some(s=>s.href?.includes('b46-sidebar-depth-20261119-v2.css')),{timeout:15000});
 if(preflight){await p.addStyleTag({content:spacing});await p.addStyleTag({content:routeCSS})}
 else await p.waitForFunction(paths=>Object.values(paths).every(path=>[...document.styleSheets].some(s=>s.href&&new URL(s.href).pathname===path)),{timeout:20000},paths);
 const result=await actual(p);
 await p.$eval(all,e=>e.click());await p.waitForFunction(()=>document.body.dataset.workspaceView==='live',{timeout:12000});await off(p);
 const before=gap(await inspect(p),'status-all','status-live');assert(before>=4,'IDLE_GAP');
 await hover(p,live);const rows=await inspect(p);assert(gap(rows,'status-all','status-live')>=3,'HOVER_GAP');assert.equal(rows.find(x=>x.key==='status-live').bg,palette.light.hover);await off(p);
 only(await inspect(p),'status-all',palette.light.active);
 await p.close();
 const q=await b.newPage();await q.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await q.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID+'-mobile',{waitUntil:'domcontentloaded',timeout:45000});
 await q.waitForSelector(scope+' [data-league-filter]',{timeout:30000});if(preflight){await q.addStyleTag({content:spacing});await q.addStyleTag({content:routeCSS})}
 else await q.waitForFunction(paths=>Object.values(paths).every(path=>[...document.styleSheets].some(s=>s.href&&new URL(s.href).pathname===path)),{timeout:20000},paths);
 assert.equal(await q.evaluate(()=>matchMedia('(min-width:768px)').matches),false);await q.close();
 console.log('ROUTE_GAP_PASS '+JSON.stringify({preflight,idle:before,hover:gap(rows,'status-all','status-live'),mobileOutsideMedia:true}));
 return result;
}finally{await b.close()}
}
