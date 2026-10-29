// Read-only inspection of the exact active BALL46 Production Performance card.
// Never writes to Cloudflare, never calls a football provider directly.
// One browser page load and at most two explicit Statistics GET probes.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const ORIGIN='https://www.ball46.com';
const SCRIPT='ball46-production';
const CF_ROOT='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
const report={schema:'ball46-performance-readonly-20261029-v1',atUtc:new Date().toISOString(),
  mode:'READ_ONLY',productionWrites:0,providerDirectRequests:0,
  initialVersion:null,finalVersion:null,origin:ORIGIN,observations:{},errors:[]};
const digest=(v)=>createHash('sha256').update(v).digest('hex');
async function cfGet(path){
  if(!token||!process.env.CLOUDFLARE_ACCOUNT_ID)throw Error('CLOUDFLARE_READ_AUTH_NOT_CONFIGURED');
  const r=await fetch(CF_ROOT+path,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error('CLOUDFLARE_READ_HTTP_'+r.status);
  const body=await r.json();if(body?.success!==true)throw Error('CLOUDFLARE_READ_REJECTED');
  return body.result;
}
async function active(){
  const d=await cfGet('/scripts/'+SCRIPT+'/deployments?per_page=1');
  const a=d?.deployments?.[0]?.versions||[];
  if(a.length!==1||Number(a[0].percentage)!==100||!a[0].version_id)throw Error('ACTIVE_VERSION_NOT_EXCLUSIVE');
  return a[0].version_id;
}
async function timedGet(path){
  const start=performance.now();
  const r=await fetch(ORIGIN+path,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(23000),redirect:'follow'});
  const headerMs=Math.round(performance.now()-start);
  const bytes=Buffer.from(await r.arrayBuffer());
  const totalMs=Math.round(performance.now()-start);
  const out={path:path.split('?')[0],queryKind:path.includes('paged=1')?'paged-limit1':'default',http:r.status,headerMs,totalMs,
    bytes:bytes.length,cacheStatus:r.headers.get('cf-cache-status'),cacheControl:r.headers.get('cache-control'),
    contentType:r.headers.get('content-type')?.split(';')[0]||null};
  if(bytes.length<12000000&&r.headers.get('content-type')?.includes('json')){
    try {const j=JSON.parse(bytes.toString('utf8'));
      out.shape={ok:j.ok===true,rows:Array.isArray(j.rows)?j.rows.length:null,
       ledgerTotal:Number.isFinite(Number(j.ledgerTotal))?Number(j.ledgerTotal):null,
       returned:Number.isFinite(Number(j.returned))?Number(j.returned):null,
       total:Number.isFinite(Number(j.total))?Number(j.total):null,
       nextCursorPresent:Boolean(j.nextCursor),hasMore:Boolean(j.hasMore),
       ledgerUpdatedAtPresent:Boolean(j.ledgerUpdatedAt),fieldNames:Object.keys(j).filter(k=>k!=='rows').slice(0,35)};
    }catch{out.jsonParse='failed'}
  }
  return out;
}
function inspectRuntime(html){
  const id='<script id="b46-daily-performance-runtime">';
  const i=html.indexOf(id),end=i<0?-1:html.indexOf('</script>',i+id.length);
  const source=i>=0&&end>i?html.slice(i+id.length,end):'';
  const start=source.search(/async\s+function\s+refresh\s*\(/);
  let body='';
  if(start>=0){
    const open=source.indexOf('{',start);let depth=0;
    for(let p=open;p<source.length&&p>=0;p++){
      if(source[p]==='{')depth++;else if(source[p]==='}'&&--depth===0){body=source.slice(start,p+1);break}
    }
  }
  const refreshMs=source.match(/\bREFRESH\s*=\s*(\d+)/)?.[1];
  return {runtimePresent:Boolean(source),runtimeSha256:source?digest(source):null,
    runtimeBytes:Buffer.byteLength(source),refreshFunctionFound:Boolean(body),
    refreshFunctionSha256:body?digest(body):null,refreshFunctionBytes:Buffer.byteLength(body),
    refreshMs:refreshMs?Number(refreshMs):null,
    statisticsEndpointReferenced:/\/api\/engine\/statistics/.test(body||source),
    pagedRead:/paged=1/.test(body),cursorLoop:/while\s*\(\s*cursor\s*\)/.test(body),
    repeatedPageGet:/nextCursor/.test(body),fetchNoStore:/cache\s*:\s*['"]no-store['"]/.test(source),
    browserAggregate:/aggregate\s*\(\s*rows\s*\)/.test(body),
    londonTimezone:source.match(/\bTZ\s*=\s*['"]([^'"]+)['"]/)?.[1]||null,
    londonCutHour:source.match(/\bCUT\s*=\s*(\d+)/)?.[1]||null,
    htmlLabelSix:html.includes('LONDON DAY · 06:00'),
    htmlLabelEight:html.includes('LONDON DAY · 08:00'),
    fetchCallsInRefresh:(body.match(/await\s+json\s*\(/g)||[]).length,
    refreshSnippetSanitized:body.slice(0,1500).replace(/(['"])(?:sk|Bearer|token)[^'"]{15,}\1/ig,'[REDACTED]')};
}
async function inspectPublicPage(){
  const start=performance.now();
  const r=await fetch(ORIGIN+'/index.html',{method:'GET',signal:AbortSignal.timeout(28000),redirect:'follow'});
  const headerMs=Math.round(performance.now()-start);
  const bytes=Buffer.from(await r.arrayBuffer());
  const s=bytes.toString('utf8');
  return {status:r.status,headerMs,totalMs:Math.round(performance.now()-start),bytes:bytes.length,
    sha256:digest(bytes),cacheControl:r.headers.get('cache-control'),cacheStatus:r.headers.get('cf-cache-status'),
    runtime:inspectRuntime(s)};
}
async function browserProbe(){
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
  if(!executablePath)throw Error('CHROME_NOT_FOUND');
  const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],timeout:40000});
  const records=[],errors=[],requests=new Map();
  try{
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:900});
    await page.setCacheEnabled(false);
    page.on('pageerror',e=>errors.push(String(e.message).slice(0,160)));
    page.on('request',r=>{try{const u=new URL(r.url());if(u.origin===ORIGIN&&u.pathname.startsWith('/api/'))requests.set(r,{start:Date.now(),path:u.pathname})}catch{}});
    page.on('requestfinished',async r=>{
      const start=requests.get(r);if(!start)return;requests.delete(r);
      try{const response=await r.response();records.push({path:start.path,http:response?.status()||null,durationMs:Date.now()-start.start,
        contentLength:response?.headers()?.['content-length']||null,cacheStatus:response?.headers()?.['cf-cache-status']||null})}catch{}
    });
    page.on('requestfailed',r=>{const start=requests.get(r);if(start){requests.delete(r);records.push({path:start.path,error:'request_failed'})}});
    const start=Date.now();
    let loadError=null;
    try{await page.goto(ORIGIN+'/?b46PerformanceAudit=readonly',{waitUntil:'domcontentloaded',timeout:45000})}
    catch(e){loadError=String(e.message).slice(0,170)}
    const domReadyMs=Date.now()-start;
    let cardReady=false,readyMs=null;
    try{
      await page.waitForFunction(()=>{
        const keys=['today-win','today-loss','today-push','today-pending','yesterday-win','yesterday-loss','yesterday-push'];
        return keys.every(k=>{const v=document.querySelector('[data-b46-stat="'+k+'"]')?.textContent?.trim();return Boolean(v&&v!=='—')});
      },{timeout:18000,polling:100});
      readyMs=Math.round(await page.evaluate(()=>performance.now()));cardReady=true;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,1500));
    const state=await page.evaluate(()=>({
      cardFound:Boolean(document.getElementById('ball46-daily-performance')),
      bodyVisible:!document.hidden,cardDisplay:(()=>{const e=document.getElementById('ball46-daily-performance');return e?getComputedStyle(e).display:null})(),
      timing:performance.getEntriesByType('navigation').slice(0,1).map(n=>({domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),responseStartMs:Math.round(n.responseStart)})),
      totalResourceCount:performance.getEntriesByType('resource').length
    })).catch(()=>({evaluationError:true}));
    return {domReadyMs,cardReady,cardReadyMsFromNavigation:readyMs,pageLoadError:loadError,apiRequests:records.slice(0,70),
      countedStatisticsCalls:records.filter(x=>x.path==='/api/engine/statistics').length,
      errors:errors.slice(0,8),state};
  }finally{await browser.close()}
}
async function checked(name,fn){try{report.observations[name]=await fn()}catch(e){report.errors.push({stage:name,error:String(e.message||e).slice(0,220)})}}
await checked('versionBefore',async()=>{report.initialVersion=await active();return {id:report.initialVersion}});
await checked('activeModule',async()=>{
  if(!report.initialVersion)throw Error('VERSION_MISSING');
  const d=await cfGet('/workers/'+SCRIPT+'/versions/'+report.initialVersion+'?include=modules');
  const mod=d.modules?.find(x=>x.name==='assets/index.html');
  const hash=mod?.content_base64?digest(Buffer.from(mod.content_base64,'base64')):null;
  return {mainModule:d.main_module||null,moduleCount:d.modules?.length||0,indexHtmlSha256:hash,version:report.initialVersion};
});
await checked('publicPage',inspectPublicPage);
await checked('statsPagedSummary',()=>timedGet('/api/engine/statistics?paged=1&limit=1'));
await checked('statsDefault',()=>timedGet('/api/engine/statistics'));
await checked('oneBrowserLoad',browserProbe);
await checked('versionAfter',async()=>{report.finalVersion=await active();return {id:report.finalVersion,sameVersion:report.initialVersion===report.finalVersion}});
report.observations.originHashMatch=(report.observations.activeModule?.indexHtmlSha256&&report.observations.publicPage?.sha256)
?report.observations.activeModule.indexHtmlSha256===report.observations.publicPage.sha256:null;
await mkdir('reports',{recursive:true});
await writeFile('reports/ball46-performance-audit-20261029.json',JSON.stringify(report,null,2)+'\n');
console.log('B46_READONLY_AUDIT='+JSON.stringify(report));
if(report.initialVersion!==report.finalVersion||!report.observations.publicPage?.runtime?.runtimePresent)process.exitCode=1;