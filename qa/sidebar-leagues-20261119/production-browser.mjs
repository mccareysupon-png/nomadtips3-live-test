import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const origin='https://ball46.com';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const card='aside.left-rail[data-b46-sidebar="1"] [data-league-card]',btn=card+' .b46-leagues-toggle',list=card+' [data-league-filters]';
const cases=[];
async function state(p){return p.evaluate(({card,btn,list})=>{const c=document.querySelector(card),e=document.querySelector(btn),l=document.querySelector(list);return{count:l.querySelectorAll('[data-league-filter]').length,selected:[...l.querySelectorAll('[data-league-filter].active')].map(x=>x.dataset.leagueFilter),toggleCount:c.querySelectorAll('.b46-leagues-toggle').length,expanded:e.getAttribute('aria-expanded'),controls:e.getAttribute('aria-controls')===l.id,button:getComputedStyle(e).display,list:getComputedStyle(l).display,height:l.getBoundingClientRect().height,cardHeight:c.getBoundingClientRect().height,rate:[...document.querySelectorAll('[data-b46-rate-snapshot]')].map(x=>[x.textContent,getComputedStyle(x).color]),status:[...document.querySelectorAll('[data-b46-sidebar-row] > b')].map(x=>[x.textContent,getComputedStyle(x).color])}},{card,btn,list})}
async function wait(p,expanded){await p.waitForFunction((selector,v)=>document.querySelector(selector)?.getAttribute('aria-expanded')===String(v),{timeout:10000},btn,expanded);await sleep(190)}
function retained(a,c){assert.equal(c.count,a.count);assert.deepEqual(c.selected,a.selected);assert.equal(c.toggleCount,1);assert(c.controls)}

export async function check({depth,css,js,paths,preflight}){
const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});

const cases=[];
try{
 for(const [device,width,height] of [['pc',1440,1000],['mobile',390,844]]){
 const p=await b.newPage();await p.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});await p.setCacheEnabled(false);await p.setBypassServiceWorker(true);
 async function nav(view='statistics'){
  const r=await p.goto(origin+'/index.html?view='+view+(view==='statistics'?'&market=all':'')+'&b46QA='+process.env.GITHUB_RUN_ID+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});assert(r?.ok());
  await p.waitForSelector(list+' [data-league-filter]',{timeout:30000});
  if(preflight){await p.addStyleTag({content:depth});await p.addStyleTag({content:css});await p.addScriptTag({content:js})}
  else await p.waitForFunction(p=>[...document.styleSheets].some(s=>s.href&&new URL(s.href).pathname===p.depth)&&[...document.styleSheets].some(s=>s.href&&new URL(s.href).pathname===p.css)&&[...document.scripts].some(s=>s.src&&new URL(s.src).pathname===p.js),{timeout:20000},paths);
  await p.waitForSelector(btn,{timeout:15000});
 }
 await nav();await wait(p,true);
 for(const theme of ['dark','light']){
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const a=await state(p);assert(a.count>0&&a.toggleCount===1&&a.controls);
  const sample='[data-b46-sidebar-row="stat-all"]';
  const style=await p.evaluate(sel=>{const e=document.querySelector(sel),s=getComputedStyle(e);return{bg:s.backgroundColor,shadow:s.boxShadow,rate:getComputedStyle(e.querySelector('[data-b46-rate-snapshot]')).color,active:e.classList.contains('active')}},sample);
  const expected=theme==='dark'?'rgba(80, 145, 105, 0.22)':'rgba(65, 120, 85, 0.18)';
  assert(style.active,'ACTIVE_TOTAL_MISSING');assert.equal(style.bg,device==='pc'?expected:'rgba(0, 0, 0, 0)','DEPTH '+device+' '+theme);if(device==='pc')assert.notEqual(style.shadow,'none');
  if(device==='pc'){
   assert(a.button!=='none'&&a.list!=='none');
   await p.$eval(btn,e=>e.click());await wait(p,false);const c=await state(p);assert(c.list==='none'&&c.height===0&&c.cardHeight<a.cardHeight);assert(c.controls&&c.toggleCount===1);assert.deepEqual(c.selected,a.selected);
   await p.$eval(btn,e=>e.scrollIntoView({block:'center'}));await p.screenshot({path:'evidence/'+(preflight?'pre':'live')+'-'+theme+'-collapsed.png'});
   await p.$eval(btn,e=>e.click());await wait(p,true);const d=await state(p);assert(d.list!=='none'&&d.height>0&&d.controls&&d.toggleCount===1);assert.deepEqual(d.selected,a.selected);
   await p.$eval(btn,e=>e.scrollIntoView({block:'center'}));await p.screenshot({path:'evidence/'+(preflight?'pre':'live')+'-'+theme+'-expanded.png'});
  }else assert(a.button==='none'&&a.expanded==='true'&&a.list!=='none','MOBILE_CHANGED');
  cases.push({device,theme,leagues:a.count,activeDepth:style.bg,collapse:device==='pc'});console.log((preflight?'PRECHECK':'LIVE_CHECK')+' '+JSON.stringify(cases.at(-1)));
 }
 if(device==='pc'){
  await p.$eval(btn,e=>e.click());await wait(p,false);await nav();await wait(p,false);assert((await state(p)).list==='none','RELOAD_PERSISTENCE');
  await p.$eval(btn,e=>e.click());await wait(p,true);console.log('PERSISTENCE_PASS '+(preflight?'pre':'live'));
 }
 await p.close()
 }
 return cases;
}finally{await b.close()}
}
