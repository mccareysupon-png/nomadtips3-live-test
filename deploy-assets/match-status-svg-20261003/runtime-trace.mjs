import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export async function traceRuntime({directory='audit/runtime',watchMs=10000,expectFixed=false}={}){
  mkdirSync(directory,{recursive:true});
  const report={startedAt:new Date().toISOString(),disableCache:true,ignoreCacheReload:true,loaded:[],pauses:[],statisticsResponses:[],snapshots:[]};
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),cdp=await page.context().newCDPSession(page);
    await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Debugger.enable');await cdp.send('DOM.enable');
    const scripts=new Map(),responses=new Map(),pending=[];
    cdp.on('Debugger.scriptParsed',s=>scripts.set(s.scriptId,s.url));
    cdp.on('Network.responseReceived',e=>{if(e.response.url.includes('singlepage-workspace-343.js'))responses.set(e.requestId,e.response)});
    cdp.on('Network.loadingFinished',e=>{if(responses.has(e.requestId))pending.push((async()=>{const r=responses.get(e.requestId),body=await cdp.send('Network.getResponseBody',{requestId:e.requestId});const bytes=Buffer.from(body.body,body.base64Encoded?'base64':'utf8');report.loaded.push({url:r.url,status:r.status,headers:r.headers,fromDiskCache:r.fromDiskCache||false,fromServiceWorker:r.fromServiceWorker||false,sha256:createHash('sha256').update(bytes).digest('hex'),newTotalCode:bytes.toString().includes('state.statisticsTotal=j.total'),sidebarRowCountCode:bytes.toString().includes('out.all=state.rows.length')});writeFileSync(directory+'/loaded-spa.js',bytes)})()));});
    cdp.on('Debugger.paused',e=>{pending.push((async()=>{
      const pause={reason:e.reason,data:e.data,frames:e.callFrames.map(f=>({function:f.functionName,url:f.url||scripts.get(f.location.scriptId),line:f.location.lineNumber+1,column:f.location.columnNumber+1})),values:[]};
      for(const f of e.callFrames.filter(f=>/renderStatNav|marketCounts|renderKpis|loadStatistics/.test(f.functionName))){
        for(const expression of ['typeof c!=="undefined"?c.all:null','typeof id!=="undefined"?id:null','typeof state!=="undefined"?state.rows.length:null','typeof state!=="undefined"?state.statisticsTotal:null']){
          const r=await cdp.send('Debugger.evaluateOnCallFrame',{callFrameId:f.callFrameId,expression,returnByValue:true,silent:true});pause.values.push({function:f.functionName,expression,value:r.result.value});
        }
      }
      report.pauses.push(pause);await cdp.send('Debugger.resume');
    })());});
    page.on('response',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')pending.push((async()=>{const j=await r.json();report.statisticsResponses.push({at:Date.now(),url:r.url(),total:j.total,returned:j.returned,rowCount:j.rows?.length})})());});
    // Hold only the first statistics response until the real DOM breakpoint is installed.
    let held=null,release;const gate=new Promise(r=>release=r);
    await page.route('**/api/engine/statistics*',async route=>{if(!held){held=route;await gate;await route.continue()}else await route.continue()});
    await page.goto('https://www.ball46.com/index.html?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
    for(let i=0;i<200&&!held;i++)await page.waitForTimeout(50);
    assert(held,'STATISTICS_REQUEST_NOT_OBSERVED');
    const document=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
    report.literalDataTotalCount=await page.locator('[data-total]').count();
    const targets=['[data-stat-market="all"] b','[data-sp-kpi="total"]'];
    report.breakpointTargets=[];
    for(const selector of targets){const n=await cdp.send('DOM.querySelector',{nodeId:document.root.nodeId,selector});assert(n.nodeId,`TARGET_NOT_FOUND:${selector}`);await cdp.send('DOMDebugger.setDOMBreakpoint',{nodeId:n.nodeId,type:'subtree-modified'});report.breakpointTargets.push(selector)}
    release();
    await page.waitForTimeout(6000);
    async function snapshot(label){const value=await page.evaluate(()=>({url:location.href,sidebar:document.querySelector('[data-stat-market="all"] b')?.textContent,kpi:document.querySelector('[data-sp-kpi="total"]')?.textContent}));report.snapshots.push({label,at:Date.now(),...value});if(expectFixed)assert.equal(value.sidebar,value.kpi,'SIDEBAR_TOTAL_DIFFERS_FROM_KPI');}
    await snapshot('initial');
    // Disable cache + hard reload, reinstall DOM breakpoints by repeating request gating.
    await cdp.send('Debugger.disable');
    await cdp.send('Page.enable');await cdp.send('Page.reload',{ignoreCache:true});
    await page.waitForTimeout(6000);await snapshot('hard-reload');
    report.serviceWorkers=await page.evaluate(async()=>({controller:navigator.serviceWorker.controller?.scriptURL||null,registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.scriptURL}))}));
    report.cacheStorage=await page.evaluate(async()=>{const out=[];for(const name of await caches.keys()){const cache=await caches.open(name);out.push({name,urls:(await cache.keys()).map(r=>r.url)})}return out});
    for(let i=1;i<=2;i++){await page.waitForTimeout(watchMs);await snapshot('polling-cycle-'+i)}
    await Promise.all(pending);await page.screenshot({path:directory+'/runtime.png',fullPage:true});
    report.has2000Writer=report.pauses.some(p=>p.values.some(v=>v.expression.includes('c.all')&&v.value===2000));
    writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));return report;
  }finally{await browser.close()}
}
if(process.argv[1]?.endsWith('runtime-trace.mjs'))await traceRuntime({watchMs:5000});

