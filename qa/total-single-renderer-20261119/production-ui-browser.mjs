import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {sha,origin,cssPath} from './production-ui-build.mjs';
import {rateTone} from './win-rate-tone.mjs';
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const markets=[['all','all'],['ah','AH'],['1x2','1X2'],['ou','O/U'],['corners','Corners'],['btts','BTTS'],['cards','Cards'],['other','Other']];
const palette={light:{green:'rgb(8, 124, 80)',yellow:'rgb(135, 87, 10)',red:'rgb(199, 54, 73)',neutral:'rgb(82, 109, 97)'},dark:{green:'rgb(55, 212, 154)',yellow:'rgb(230, 188, 113)',red:'rgb(255, 103, 121)'}};
export async function browserCheck({assets,candidateHtml},intercept){
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const records=[],loaded=[],errors=[];
 try{
  const p=await browser.newPage();await p.setViewport({width:1440,height:950});await p.setCacheEnabled(false);await p.setBypassServiceWorker(true);p.on('pageerror',e=>errors.push(String(e)));
  p.on('response',r=>{const u=new URL(r.url());if(Object.hasOwn(assets,u.pathname))loaded.push((async()=>{try{return {path:u.pathname,url:r.url(),status:r.status(),hash:sha(await r.buffer())}}catch(e){return {path:u.pathname,error:String(e)}}})())});
  if(intercept){await p.setRequestInterception(true);p.on('request',req=>{const u=new URL(req.url());if(u.origin===origin&&Object.hasOwn(assets,u.pathname)){void req.respond({status:200,contentType:u.pathname===cssPath?'text/css':'application/javascript',body:assets[u.pathname]});return}
   if(u.origin===origin&&req.isNavigationRequest()&&['/','/index.html'].includes(u.pathname)){void req.respond({status:200,contentType:'text/html; charset=utf-8',body:candidateHtml});return}void req.continue()})}
  const dest=origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID+'-'+Date.now();
  const res=await p.goto(dest,{waitUntil:'domcontentloaded',timeout:45000});assert(res?.ok(),'SPA_HTTP');
  async function waitMarket(key){
   try{await p.waitForFunction(k=>{const c=document.querySelector('#b46-finance-chart-card');return document.body.dataset.workspaceView==='statistics'&&c?.dataset.b46StatisticsSource==='receiver'&&c?.dataset.b46Market===k&&[...c.querySelectorAll('.f46-overview [data-b46-rate-tone]')].some(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden')},{timeout:35000},key)}
   catch(e){console.log('SPA_DIAGNOSTIC '+JSON.stringify(await p.evaluate(()=>({url:location.href,bodyView:document.body.dataset.workspaceView,card:document.getElementById('b46-finance-chart-card')?.dataset,overview:document.querySelector('.f46-overview')?.innerText,errors:[] }))).slice(0,2500));throw e}
  }
  await waitMarket('all');
  for(const [id,key]of markets){
   if(id!=='all'){
    const selector='button[data-stat-market="'+id+'"]';
    try{
     await p.$eval(selector,e=>{e.scrollIntoView({block:'center',inline:'center'});e.click()});
     await p.waitForFunction(m=>new URL(location.href).searchParams.get('market')===m,{timeout:5000},id);
    }catch(e){
     console.log('SPA_NAV_RETRY '+id+' '+String(e));
     const target=origin+'/index.html?view=statistics&market='+encodeURIComponent(id)+'&b46QA='+process.env.GITHUB_RUN_ID+'-'+Date.now();
     const res=await p.goto(target,{waitUntil:'domcontentloaded',timeout:45000});assert(res?.ok(),'MARKET_NAV_HTTP '+id);
     await p.waitForFunction(m=>document.body.dataset.workspaceView==='statistics'&&new URL(location.href).searchParams.get('market')===m,{timeout:15000},id);
    }
    // Empty markets may intentionally show no graph. Confirm the exact live receiver result,
    // and require a correct route, no stale market data and no fabricated populated statistics.
    const graphUrl=new URL('/b46-receiver-v1/graph',origin);
    for(const [k,v]of Object.entries({market:key,variant:'all',filter:'all',range:'all'}))graphUrl.searchParams.set(k,v);
    const gr=await fetch(graphUrl,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
    const raw=gr.ok?await gr.json():null;
    const empty=raw?.ok===true&&raw.source==='RECEIVER'&&raw.summary?.rows===0&&raw.summary?.wins===0&&raw.summary?.pushes===0&&raw.summary?.losses===0;
    if(empty){
     await p.waitForFunction(m=>document.body.dataset.workspaceView==='statistics'&&new URL(location.href).searchParams.get('market')===m,{timeout:10000},id);
     await new Promise(r=>setTimeout(r,1600));
     for(const theme of ['light','dark']){
      await p.evaluate(t=>{document.documentElement.dataset.theme=t},theme);
      const v=await p.evaluate(()=>{const c=document.querySelector('#b46-finance-chart-card'),o=c?.querySelector('.f46-overview');return {theme:document.documentElement.dataset.theme,market:c?.dataset.b46Market||null,rows:Number(c?.dataset.b46Settled||0),rate:[...(o?.querySelectorAll('[data-b46-rate-tone]')||[])].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({text:e.textContent.trim(),tone:e.dataset.b46RateTone,color:getComputedStyle(e).color})),sidebar:[...document.querySelectorAll('button[data-b46-sidebar-row^="stat-"]')].length}});
      assert.equal(v.theme,theme);assert.equal(v.rows,0,'EMPTY_MARKET_HAS_ROWS '+id);assert(!v.market||v.market===key,'STALE_EMPTY_MARKET '+id);assert.equal(v.sidebar,8);
      for(const item of v.rate)assert.equal(item.tone,'neutral','EMPTY_MARKET_RATE '+id);
      records.push({id,...v,empty:true});console.log((intercept?'PRECHECK_EMPTY':'LIVE_CHECK_EMPTY')+' '+JSON.stringify({id,theme,receiverRows:0,rate:v.rate}));
     }
     continue;
    }
    await waitMarket(key);
   }
   for(const theme of ['light','dark']){
    await p.evaluate(t=>{document.documentElement.dataset.theme=t},theme);
    const v=await p.evaluate(()=>{const c=document.querySelector('#b46-finance-chart-card'),o=c.querySelector('.f46-overview');
     const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
     const rate=[...o.querySelectorAll('[data-b46-rate-tone]')].filter(visible).map(e=>({text:e.textContent.trim(),tone:e.dataset.b46RateTone,color:getComputedStyle(e).color}));
     const wd=o.querySelector('[data-key="wpl"]'),stake=o.querySelector('[data-key="stake"]');
     const wdl=wd?[...wd.querySelectorAll('[data-b46-wdl]')].map(e=>({text:e.textContent,color:getComputedStyle(e).color})):[],label=wd?.querySelector('.b46-stage-summary-label,small')?.textContent,units=stake?.querySelector('.b46-stage-summary-label,small')?.textContent;
     return {theme:document.documentElement.dataset.theme,market:c.dataset.b46Market,rows:Number(c.dataset.b46Settled),rate,wdl,label,units,overviewBG:getComputedStyle(o).backgroundImage,oldVisible:!!o.querySelector('.f46-metrics')?.getBoundingClientRect().width,owner:c.dataset.b46TotalOwner,sidebar:[...document.querySelectorAll('button[data-b46-sidebar-row^="stat-"]')].map(e=>e.dataset.b46SidebarRow)};
    });
    assert.equal(v.theme,theme);assert.equal(v.market,key);assert(v.rate.length,'RATE_MISSING '+id);
    for(const item of v.rate){const tone=rateTone(item.text);assert.equal(item.tone,tone,'RATE_TONE '+id);if(tone!=='neutral'||theme==='light')assert.equal(item.color,palette[theme][tone],'RATE_COLOR '+id+' '+JSON.stringify(item))}
    if(v.rows>0){assert.equal(v.wdl.length,3,'WDL_MISSING '+id);assert.equal(v.label,'W · D · L');assert.equal(v.units,'UNITS USED');assert.deepEqual(v.wdl.map(e=>e.color),['green','yellow','red'].map(t=>palette[theme][t]))}
    if(theme==='light')assert(v.overviewBG.includes('255, 255, 255'),'LIGHT_SURFACE '+id);
    if(id==='all'){assert.equal(v.owner,'receiver','TOTAL_OWNER');assert(!v.oldVisible,'TOTAL_LEGACY_VISIBLE')}
    assert.equal(v.sidebar.length,8,'SIDEBAR_CHANGED');
    records.push({id,...v});console.log((intercept?'PRECHECK':'LIVE_CHECK')+' '+JSON.stringify({id,theme,rows:v.rows,rate:v.rate,wdl:v.wdl,label:v.label,units:v.units}));
    if(id==='all'||id==='ah')await p.screenshot({path:'qa-output/'+(intercept?'pre-':'live-')+id+'-'+theme+'.png'});
   }
  }
  const hashes=await Promise.all(loaded);
  for(const [path,s]of Object.entries(assets))assert(hashes.some(h=>h.path===path&&h.hash===sha(s)&&h.status===200),'BROWSER_ASSET_BYTES '+path+' '+JSON.stringify(hashes.filter(h=>h.path===path)));
  assert.deepEqual(errors,[],'BROWSER_ERRORS');
  return {records,hashes,errors};
 }finally{await browser.close()}
}
