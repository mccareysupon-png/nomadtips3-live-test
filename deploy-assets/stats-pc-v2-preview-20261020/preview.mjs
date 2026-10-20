import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
const SCRIPT='ball46-production',ORIGIN='https://ball46.com';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CLOUDFLARE_ACCOUNT_OR_TOKEN_MISSING');
const apiRoot='https://api.cloudflare.com/client/v4/accounts/'+account;
const stylesheet=readFileSync('./preview.css','utf8');
assert(stylesheet.includes('.sp-kpis')&&stylesheet.includes('.sp-trend')&&stylesheet.includes('.sp-table')&&stylesheet.includes('@media (min-width: 1024px)'),'PREVIEW_STYLES_INCOMPLETE');
const hash=b=>createHash('sha256').update(b).digest('hex');
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,sha:process.env.GITHUB_SHA,createdAt:new Date().toISOString(),purpose:'Statistics PC V2 browser preview only',noProductionDeployment:true,actions:[],cssHash:hash(stylesheet)};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function api(path,body){
 const response=await fetch(apiRoot+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000)});
 const json=await response.json();assert(response.ok&&json.success===true,'CF_API_ERROR '+path+' '+response.status+':'+JSON.stringify(json.errors||[]));return json.result;
}
async function active(){
 const d=(await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments?.[0];
 assert(d&&d.versions?.length===1&&Number(d.versions[0].percentage)===100,'ACTIVE_DEPLOYMENT_NOT_100_PERCENT');
 return{version:d.versions[0].version_id,deployment:d.id};
}
async function version(id){
 const v=await api('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
 assert(v.main_module&&Array.isArray(v.modules)&&v.modules.length>0,'WORKER_MODULES_MISSING');
 return v;
}
const modules=v=>v.modules.map(m=>({name:m.name,kind:m.content_type,hash:hash(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));
const previewStyle='<style id="b46-statistics-pc-premium-v2-preview-20261020">'+stylesheet+'</style>';
const themeBoot='<script id="b46-statistics-pc-v2-preview-theme">(function(){if(!window.matchMedia("(min-width:1024px)").matches)return;try{localStorage.setItem("nomad343_dashboard_theme_v1","dark");}catch(e){}document.documentElement.setAttribute("data-theme","dark");})();</script>';
function htmlPreview(html){
 assert(typeof html==='string'&&html.includes('</head>')&&html.includes('<head'),'HTML_DOCUMENT_NOT_CONFIRMED');
 assert(html.includes('sp-stats-content')||html.includes('statistics'),'LIVE_STATISTICS_ANCHOR_NOT_FOUND');
 assert(!html.includes('b46-statistics-pc-premium-v2-preview-20261020'),'PREVIEW_STYLE_ALREADY_PRESENT');
 return html.replace(/<head([^>]*)>/i,(x)=>x+themeBoot).replace('</head>',previewStyle+'</head>');
}
const helper=[
'async function __b46StatisticsDesktopPreviewV2(response,path){',
'if(!["/","/index.html"].includes(path)||!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;',
'const raw=await response.text();',
'if(!raw.includes("sp-stats-content")&&!raw.includes("statistics"))throw new Error("NO_STATISTICS_MARKUP_IN_HTML");',
'if(!raw.includes("</head>"))throw new Error("NO_HTML_HEAD");',
'if(raw.includes("b46-statistics-pc-premium-v2-preview-20261020"))throw new Error("ALREADY_PREVIEW");',
'const html=raw.replace(/<head([^>]*)>/i,function(x){return x+'+JSON.stringify(themeBoot)+';}).replace("</head>",'+JSON.stringify(previewStyle)+'+"</head>");',
'const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.set("Cache-Control","no-store");',
'return new Response(html,{status:response.status,statusText:response.statusText,headers:headers});',
'}'
].join('\n');
function patchWorker(src){
 const anchor='export default {';
 assert.equal(src.split(anchor).length,2,'WORKER_DEFAULT_EXPORT_SHAPE_CHANGED');
 assert(!src.includes('__b46StatisticsDesktopPreviewV2'),'PREVIEW_ALREADY_PATCHED');
 const wrapped=src.replace(anchor,'const __b46ProductionDefaultForStatsPreview = {');
 const extra='\n'+helper+'\nexport default {...__b46ProductionDefaultForStatsPreview, async fetch(request,env,ctx){const response=await __b46ProductionDefaultForStatsPreview.fetch.call(__b46ProductionDefaultForStatsPreview,request,env,ctx);const path=new URL(request.url).pathname;return __b46StatisticsDesktopPreviewV2(response,path);}};\n';
 return wrapped+extra;
}
async function read(base,path){
 const url=new URL(path,base);url.searchParams.set('stats_v2_candidate_audit',process.env.GITHUB_RUN_ID+'-'+Date.now());
 const r=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(50000)});
 const data=Buffer.from(await r.arrayBuffer());return{status:r.status,contentType:r.headers.get('content-type'),hash:hash(data),data};
}
const paths=['/','/index.html','/longterm-performance-343.js','/singlepage-workspace-343.js','/dashboard-v2-tune.css','/expanded-match-343.js'];
async function assets(base){const out={};for(const p of paths){const d=await read(base,p);assert.equal(d.status,200,'ASSET_HTTP_MISSING '+p);out[p]=d;}return out;}
function hashReport(assets){return Object.fromEntries(Object.entries(assets).map(([k,v])=>[k,{sha256:v.hash,bytes:v.data.length,status:v.status}]));}
async function previewQA(url){
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(chrome,'CHROMIUM_MISSING');
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 const captures={};
 try{
  for(const width of [1366,1440,1920,390]){
   const page=await browser.newPage();
   const pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(String(e).slice(0,250)));
   try{
    await page.setViewport({width,height:960,isMobile:width<768,deviceScaleFactor:1});
    await page.setCacheEnabled(false);
    const res=await page.goto(url+'/?view=statistics&stats_v2_preview=1',{waitUntil:'domcontentloaded',timeout:90000});
    assert.equal(res.status(),200,'PREVIEW_PAGE_NOT_200 '+width);
    await new Promise(r=>setTimeout(r,6200));
    const first=await page.evaluate(()=>{
     const visible=e=>e&&e.getBoundingClientRect().width>0;
     const style=e=>{if(!e)return null;const c=getComputedStyle(e),r=e.getBoundingClientRect();return {bg:c.backgroundColor,image:c.backgroundImage,radius:c.borderRadius,shadow:c.boxShadow,width:+r.width.toFixed(1),height:+r.height.toFixed(1)}};
     const stat=document.querySelector('.sp-stats-content'),hero=document.querySelector('.sp-stat-hero'),kpi=document.querySelector('.sp-kpi'),panel=document.querySelector('.sp-trend'),table=document.querySelector('.sp-table');
     return{title:document.title,href:location.href,theme:document.documentElement.dataset.theme,marker:!!document.querySelector('#b46-statistics-pc-premium-v2-preview-20261020'),statsVisible:visible(stat),hero:style(hero),metric:style(kpi),chartPanel:style(panel),table:style(table),kpiCards:document.querySelectorAll('.sp-kpi').length,
       filteredButtons:[...document.querySelectorAll('.sp-filter-chip')].map(e=>e.textContent.trim()).slice(0,10),
       timelineChart:!!document.querySelector('.b46-perf-chart-wrap svg,.b46-perf-chart-wrap canvas'),
       settledRows:document.querySelectorAll('.sp-table tbody tr').length,
       settledCounter:document.querySelector('[data-sp-kpi="total"]')?.textContent?.trim(),
       bodyWidth:document.documentElement.scrollWidth,
       rangeText:[...document.querySelectorAll('[data-b46-range]')].map(e=>({text:e.textContent.trim(),active:e.classList.contains('active')})),
       modeText:[...document.querySelectorAll('.b46-perf-mode button')].map(e=>({text:e.textContent.trim(),active:e.classList.contains('active')})),
       typeText:[...document.querySelectorAll('.b76-perf-chart-type button')].map(e=>({text:e.textContent.trim(),active:e.classList.contains('active')})),
       mobileCard:style(document.querySelector('.b46gn-card'))};
    });
    assert(first.marker&&first.statsVisible,'PREVIEW_STATISTICS_NOT_LOADED '+width);
    assert(first.kpiCards===8,'LIVE_KPIS_MISSING '+width);
    assert(first.settledRows>0&&Number.parseInt(first.settledCounter.replaceAll(',',''),10)>0,'REAL_SETTLED_STAT_DATA_MISSING '+width);
    assert(first.rangeText.length>=4&&first.modeText.length>=2&&first.typeText.length>=2,'CHART_CONTROLS_MISSING');
    assert(first.bodyWidth<=width+24,'HORIZONTAL_OVERFLOW '+width+' '+first.bodyWidth);
    if(width>=1024){
     assert(first.theme==='dark','DESKTOP_PREVIEW_NOT_DARK');
     assert(first.metric?.image?.includes('gradient'),'PREMIUM_CARD_STYLING_NOT_APPLIED '+width);
     assert(first.hero?.radius.includes('17px'),'HERO_CARD_NOT_RESTYLED '+width);
    }
    const clickText=async(sel,t)=>page.evaluate((selector,value)=>{
     const e=[...document.querySelectorAll(selector)].find(x=>x.textContent.trim().toUpperCase()===value.toUpperCase());
     if(!e)return false;e.click();return true;
    },sel,t);
    assert(await clickText('[data-b46-range]','7D'),'RANGE_7D_CLICK_TARGET_MISSING');
    await new Promise(r=>setTimeout(r,350));
    const range7=await page.evaluate(()=>[...document.querySelectorAll('[data-b46-range]')].find(x=>x.textContent.trim()==='7D')?.classList.contains('active'));
    assert(range7,'RANGE_7D_INTERACTION_NOT_WORKING');
    assert(await clickText('[data-b46-range]','ALL'),'RANGE_ALL_CLICK_TARGET_MISSING');
    assert(await clickText('.b76-perf-chart-type button','LINE'),'CHART_LINE_CLICK_TARGET_MISSING');
    await new Promise(r=>setTimeout(r,250));
    const lineActive=await page.evaluate(()=>[...document.querySelectorAll('.b76-perf-chart-type button')].find(x=>x.textContent.trim()==='LINE')?.classList.contains('active'));
    assert(lineActive,'CHART_LINE_INTERACTION_NOT_WORKING');
    assert(await clickText('.b76-perf-chart-type button','CANDLES'),'CHART_CANDLES_CLICK_TARGET_MISSING');
    assert(await clickText('.b46-perf-mode button','ROI'),'ROI_MODE_CLICK_TARGET_MISSING');
    await new Promise(r=>setTimeout(r,350));
    const roiActive=await page.evaluate(()=>[...document.querySelectorAll('.b46-perf-mode button')].find(x=>x.textContent.trim()==='ROI')?.classList.contains('active'));
    assert(roiActive,'ROI_MODE_INTERACTION_NOT_WORKING');
    await clickText('.b46-perf-mode button','WIN RATE');
    await clickText('.b46-perf-mode button','UNITS');
    await new Promise(r=>setTimeout(r,300));
    const graphRect=await page.evaluate(()=>{const e=document.querySelector('.b46-perf-chart-wrap svg,.b46-perf-chart-wrap canvas');if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});
    assert(graphRect&&graphRect.w>400,'CHART_NOT_RENDERED');
    await page.mouse.move(graphRect.x+graphRect.w*.4,graphRect.y+graphRect.h*.4);await new Promise(r=>setTimeout(r,300));
    const tooltip=await page.evaluate(()=>{const el=document.querySelector('.b46-perf-tip');return{exists:!!el,visible:el?getComputedStyle(el).visibility:'missing',text:el?.textContent?.trim().slice(0,170)};});
    const filter=await page.evaluate(()=>{
      const e=document.querySelector('.sp-filter-chip[data-sp-filter="all"]');if(e)e.click();
      return{clicked:!!e,active:e?.classList.contains('active')};
    });
    assert(filter.clicked,'MARKET_FILTER_UNAVAILABLE');
    await page.screenshot({path:'audit/stats-preview-'+width+'.png',fullPage:true});
    captures[width]={first,range7,lineActive,roiActive,tooltip,filter,errors:pageErrors};
    assert.equal(pageErrors.length,0,'BROWSER_ERROR '+width+': '+pageErrors.join(';'));
    console.log('STATISTICS_PREVIEW_BROWSER_OK',width,JSON.stringify({theme:first.theme,kpiCards:first.kpiCards,settledRows:first.settledRows,settled:first.settledCounter,range7,lineActive,roiActive,graphWidth:graphRect.w,tooltip}));
   }finally{await page.close()}
  }
 }finally{await browser.close()}
 return captures;
}
let candidate=null;
try{
 report.activeBefore=await active();
 const prod=await version(report.activeBefore.version);
 report.workerBase={id:report.activeBefore.version,mainModule:prod.main_module,modules:modules(prod)};
 const main=prod.modules.find(m=>m.name===prod.main_module);assert(main,'WORKER_MAIN_NOT_FOUND');
 const originalSource=Buffer.from(main.content_base64,'base64').toString('utf8');
 const modifiedSource=patchWorker(originalSource);report.codeDiff={before:hash(originalSource),after:hash(modifiedSource)};
 const original=await assets(ORIGIN);
 assert(original['/'].data.toString().includes('sp-stats-content'),'LIVE_STATS_DOM_NOT_PRESENT');
 report.productionAssetsBefore=hashReport(original);
 const expected=htmlPreview(original['/'].data.toString());report.expectedHtmlHash=hash(expected);
 const beforeDomain=await api('/workers/domains');report.domainsBefore=beforeDomain.filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort();
 assert.deepEqual(report.domainsBefore,['ball46.com','www.ball46.com'],'WRONG_WORKER_DOMAINS');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:prod.main_module,compatibility_date:prod.compatibility_date,compatibility_flags:prod.compatibility_flags||[],bindings:prod.bindings,keep_assets:true,assets:{config:prod.assets.config},annotations:{'workers/tag':'B46_STATS_PC_V2_PREVIEW_ONLY_20261020','workers/message':'Inactive candidate only - desktop Statistics design preview - DO NOT ACTIVATE'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 assert.equal((await active()).version,report.activeBefore.version,'PRODUCTION_CHANGED_BEFORE_PREVIEW_UPLOAD');
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of prod.modules)form.set(m.name,new Blob([m.name===prod.main_module?modifiedSource:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 candidate=uploaded.id;report.candidateVersion=candidate;report.actions.push('UPLOAD_INACTIVE_PREVIEW_VERSION_ONLY');save();
 const cv=await version(candidate);
 assert.equal(cv.annotations?.['workers/tag'],'B46_STATS_PC_V2_PREVIEW_ONLY_20261020','WRONG_PREVIEW_CANDIDATE');
 const newHashes=modules(cv);
 for(const x of report.workerBase.modules){const target=newHashes.find(y=>y.name===x.name);assert(target,'MISSING_PREVIEW_MODULE '+x.name);assert.equal(target.hash,x.name===prod.main_module?hash(modifiedSource):x.hash,'NON_MAIN_MODULE_CHANGED '+x.name);}
 let workerSubdomain='mccarey-supon';
 try{const sub=await api('/workers/subdomain');if(sub.subdomain)workerSubdomain=sub.subdomain;}catch(e){console.log('SUBDOMAIN_FALLBACK_TO_KNOWN',String(e).slice(0,180));}
 const preview='https://'+candidate.slice(0,8)+'-'+SCRIPT+'.'+workerSubdomain+'.workers.dev';
 report.previewUrl=preview+'/?view=statistics';save();
 const previewRoot=await read(preview,'/');
 console.log('PREVIEW_CANDIDATE_HTTP',preview,previewRoot.status,previewRoot.data.length);
 assert.equal(previewRoot.status,200,'PREVIEW_NOT_ACCESSIBLE');
 assert.equal(previewRoot.hash,report.expectedHtmlHash,'PREVIEW_HTML_DID_NOT_MATCH_EXACT_PRODUCTION_PLUS_CSS');
 for(const p of paths.filter(x=>x!=='/'&&x!=='/index.html')){
  const z=await read(preview,p);assert.equal(z.hash,original[p].hash,'PREVIEW_STATIC_ASSET_CHANGED '+p);
 }
 const previewIndex=await read(preview,'/index.html');assert.equal(previewIndex.hash,report.expectedHtmlHash,'PREVIEW_INDEX_HTML_MISMATCH');
 report.browser=await previewQA(preview);
 report.activeAfter=await active();
 assert.deepEqual(report.activeAfter,report.activeBefore,'PRODUCTION_DEPLOYMENT_CHANGED_DURING_PREVIEW');
 const post=await assets(ORIGIN);
 for(const p of paths)assert.equal(post[p].hash,original[p].hash,'PRODUCTION_ASSET_CHANGED_DURING_PREVIEW '+p);
 report.productionAssetsAfter=hashReport(post);
 report.success=true;report.finishedAt=new Date().toISOString();save();
 console.log('BALL46_STATISTICS_PC_V2_PREVIEW_SUCCESS',JSON.stringify({previewUrl:report.previewUrl,candidateVersion:candidate,productionStillActive:report.activeAfter.version,desktopWidths:[1366,1440,1920],mobileUntouched:true,productionPromotions:0}));
}catch(e){
 report.success=false;report.error=e.stack||String(e);report.finishedAt=new Date().toISOString();save();
 console.error('BALL46_STATISTICS_PC_V2_PREVIEW_FAILED',e.stack||String(e));
 process.exitCode=1;
}
