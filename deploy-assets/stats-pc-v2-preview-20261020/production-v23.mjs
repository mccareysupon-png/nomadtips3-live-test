import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {RIBBON_SCRIPT,RIBBON_MARKER} from './ribbon-v23.mjs';
const SCRIPT='ball46-production',ORIGIN='https://ball46.com';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CLOUDFLARE_ACCOUNT_OR_TOKEN_MISSING');
const apiRoot='https://api.cloudflare.com/client/v4/accounts/'+account;
const stylesheet=readFileSync('./preview.css','utf8')+'\n'+readFileSync('./compact-v21.css','utf8')+'\n'+readFileSync('./compact-v22.css','utf8')+'\n'+readFileSync('./single-row-v23.css','utf8');
assert(stylesheet.includes('.sp-kpis')&&stylesheet.includes('.sp-trend')&&stylesheet.includes('.sp-table')&&stylesheet.includes('@media (min-width: 1024px)'),'PREVIEW_STYLES_INCOMPLETE');
const hash=b=>createHash('sha256').update(b).digest('hex');
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,sha:process.env.GITHUB_SHA,createdAt:new Date().toISOString(),purpose:'Approved Statistics PC V2.3 14 stats in single row - guarded production deploy from active Worker; mobile unaffected',noProductionDeployment:false,actions:[],cssHash:hash(stylesheet)};
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
const previewStyle='<style id="b46-statistics-pc-single-row-v23-preview-20261020">'+stylesheet+'</style>';
const ribbonOverlay='<script id="b46-statistics-v23-single-row-14-20261020">'+RIBBON_SCRIPT+'</script>';
const themeBoot=''; // Do NOT alter real visitor theme in Production.
function htmlPreview(html){
 assert(typeof html==='string'&&html.includes('</head>')&&html.includes('<head'),'HTML_DOCUMENT_NOT_CONFIRMED');
 assert(html.includes('sp-stats-content')||html.includes('statistics'),'LIVE_STATISTICS_ANCHOR_NOT_FOUND');
 assert(!html.includes('b46-statistics-pc-single-row-v23-preview-20261020'),'PREVIEW_STYLE_ALREADY_PRESENT');
 return html.replace('</head>',previewStyle+'</head>').replace('</body>',ribbonOverlay+'</body>');
}
const helper=[
'async function __b46StatisticsPcV23Production20261020(response,path){',
'if(!["/","/index.html"].includes(path)||!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;',
'const raw=await response.text();',
'if(!raw.includes("sp-stats-content")&&!raw.includes("statistics"))throw new Error("NO_STATISTICS_MARKUP_IN_HTML");',
'if(!raw.includes("</head>"))throw new Error("NO_HTML_HEAD");',
'if(raw.includes("b46-statistics-pc-single-row-v23-preview-20261020"))throw new Error("ALREADY_PREVIEW");',
'const html=raw.replace("</head>",'+JSON.stringify(previewStyle)+'+"</head>").replace("</body>",'+JSON.stringify(ribbonOverlay)+'+"</body>");',
'const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.set("Cache-Control","no-store");',
'return new Response(html,{status:response.status,statusText:response.statusText,headers:headers});',
'}'
].join('\n');
function patchWorker(src){
 const anchor='export default {';
 assert.equal(src.split(anchor).length,2,'WORKER_DEFAULT_EXPORT_SHAPE_CHANGED');
 assert(!src.includes('__b46StatisticsPcV23Production20261020'),'PREVIEW_ALREADY_PATCHED');
 const wrapped=src.replace(anchor,'const __b46ProductionDefaultPreservedForStatsV23 = {');
 const extra='\n'+helper+'\nexport default {...__b46ProductionDefaultPreservedForStatsV23, async fetch(request,env,ctx){const response=await __b46ProductionDefaultPreservedForStatsV23.fetch.call(__b46ProductionDefaultPreservedForStatsV23,request,env,ctx);const path=new URL(request.url).pathname;return __b46StatisticsPcV23Production20261020(response,path);}};\n';
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
async function previewQA(url,widths=[1024,1366,1440,1920,390]){
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(chrome,'CHROMIUM_MISSING');
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 const captures={};
 try{
  for(const width of widths){
   const page=await browser.newPage();
   const pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(String(e).slice(0,250)));
   try{
    await page.setViewport({width,height:960,isMobile:width<768,deviceScaleFactor:1});
    await page.setCacheEnabled(false);
    const res=await page.goto(url+'/?view=statistics&stats_v23_validation=1',{waitUntil:'domcontentloaded',timeout:90000});
    assert.equal(res.status(),200,'PREVIEW_PAGE_NOT_200 '+width);
    await page.evaluate(()=>{if(window.innerWidth>=1024)document.documentElement.setAttribute('data-theme','dark')});
    await new Promise(r=>setTimeout(r,2000));
    await page.waitForFunction(()=>{
      const raw=document.querySelector('[data-sp-kpi="total"]')?.textContent||'';
      const n=Number.parseInt(raw.replace(/[^0-9]/g,''),10);
      return n>0&&document.querySelectorAll('.sp-table tbody tr').length>0;
    },{timeout:35000,polling:500});
    await new Promise(r=>setTimeout(r,1100));
    if(width>=1024)await page.waitForFunction(()=>document.querySelectorAll('.sp-stats-content.b46v23-ready .b46v23-micro-card').length===14,{timeout:10000,polling:350});
    const first=await page.evaluate(()=>{
     const visible=e=>e&&e.getBoundingClientRect().width>0;
     const style=e=>{if(!e)return null;const c=getComputedStyle(e),r=e.getBoundingClientRect();return {bg:c.backgroundColor,image:c.backgroundImage,radius:c.borderRadius,shadow:c.boxShadow,width:+r.width.toFixed(1),height:+r.height.toFixed(1)}};
     const stat=document.querySelector('.sp-stats-content'),hero=document.querySelector('.sp-stat-hero'),kpi=document.querySelector('.sp-kpi'),panel=document.querySelector('.sp-trend'),table=document.querySelector('.sp-table');
     return{title:document.title,href:location.href,theme:document.documentElement.dataset.theme,marker:!!document.querySelector('#b46-statistics-pc-single-row-v23-preview-20261020'),statsVisible:visible(stat),hero:style(hero),metric:style(kpi),chartPanel:style(panel),table:style(table),kpiCards:document.querySelectorAll('.sp-kpi').length,
       filteredButtons:[...document.querySelectorAll('.sp-filter-chip')].map(e=>e.textContent.trim()).slice(0,10),
       timelineChart:!!document.querySelector('.b46-perf-chart-wrap svg,.b46-perf-chart-wrap canvas'),
       settledRows:document.querySelectorAll('.sp-table tbody tr').length,
       settledCounter:document.querySelector('[data-sp-kpi="total"]')?.textContent?.trim(),
       bodyWidth:document.documentElement.scrollWidth,
       rangeText:[...document.querySelectorAll('[data-b46-range]')].map(e=>({text:e.textContent.trim(),active:e.classList.contains('active')})),
       modeText:[...document.querySelectorAll('.b46-perf-mode button')].map(e=>({text:e.textContent.trim(),active:e.classList.contains('active')})),
       typeText:[...document.querySelectorAll('.b76-perf-chart-type button')].map(e=>({text:e.textContent.trim(),active:e.classList.contains('active')})),
       mobileCard:style(document.querySelector('.b46gn-card')),
       ribbon:style(document.querySelector('.b46v23-strip')),
       firstRibbonCard:style(document.querySelector('.b46v23-micro-card')),
       ribbonCount:document.querySelectorAll('.b46v23-strip-grid > .b46v23-micro-card').length,
       ribbonCheck:(()=>{
        const ribbon=document.querySelector('.b46v23-strip');
        if(!ribbon)return null;
        const cards=[...ribbon.querySelectorAll('.b46v23-micro-card')];
        const sources=[...document.querySelectorAll('.sp-stats-content .sp-kpis .sp-kpi'),...document.querySelectorAll('.sp-stats-content .b46-perf-kpis .b46-perf-kpi')];
        const cardData=cards.map(c=>[c.querySelector('.b46v23-label')?.textContent,c.querySelector('.b46v23-value')?.textContent,c.querySelector('.b46v23-meta')?.textContent]);
        const sourceData=sources.map((c,i)=>[c.querySelector('span')?.textContent?.trim(),c.querySelector(i<8?'strong':'b')?.textContent?.trim(),c.querySelector('small')?.textContent?.trim()]);
        const ys=cards.map(c=>c.getBoundingClientRect().top),heights=cards.map(c=>c.getBoundingClientRect().height);
        return {rowTopSpread:Math.max(...ys)-Math.min(...ys),heightSpread:Math.max(...heights)-Math.min(...heights),
          actualDataMatches:JSON.stringify(cardData)===JSON.stringify(sourceData),sourceCount:sources.length,
          noTopAccent:cards.every(c=>getComputedStyle(c,'::before').content==='none'),
          horizontalScroll:ribbon.scrollWidth>ribbon.clientWidth+1,
          overflowCardValues:cards.filter(c=>{const v=c.querySelector('.b46v23-value');return v.scrollWidth>v.clientWidth+2}).map(c=>c.dataset.kpiIndex),
          names:cards.map(c=>c.querySelector('.b46v23-label')?.textContent)};})(),
       typography:{headline:document.querySelector('.sp-stat-hero h3')?getComputedStyle(document.querySelector('.sp-stat-hero h3')).fontSize:null,primaryNumber:document.querySelector('.sp-kpi strong')?getComputedStyle(document.querySelector('.sp-kpi strong')).fontSize:null},
       overflowKPIs:[...document.querySelectorAll('.b46-perf-kpi')].map(e=>({w:e.clientWidth,scroll:e.scrollWidth,name:e.querySelector('span')?.textContent?.trim()}))};
    });
    console.log('STATISTICS_PREVIEW_READY',width,JSON.stringify({theme:first.theme,settled:first.settledCounter,rows:first.settledRows,card:first.firstRibbonCard,hero:first.hero,chart:first.timelineChart,ribbon:first.ribbonCheck}));
    assert(first.marker&&first.statsVisible,'PREVIEW_STATISTICS_NOT_LOADED '+width);
    assert(first.kpiCards===8,'LIVE_KPIS_MISSING '+width);
    assert(first.settledRows>0&&Number.parseInt(first.settledCounter.replaceAll(',',''),10)>0,'REAL_SETTLED_STAT_DATA_MISSING '+width);
    assert(first.rangeText.length>=4&&first.modeText.length>=2&&first.typeText.length>=2,'CHART_CONTROLS_MISSING');
    assert(first.bodyWidth<=width+24,'HORIZONTAL_OVERFLOW '+width+' '+first.bodyWidth);
    if(width>=1024){
     assert(first.theme==='dark','DESKTOP_PREVIEW_NOT_DARK');
     assert(first.metric?.image?.includes('gradient'),'PREMIUM_CARD_STYLING_NOT_APPLIED '+width);
     assert(first.hero?.radius.includes('11px'),'V23_HERO_CORNER_NOT_APPLIED '+width);
     assert(first.ribbonCount===14&&first.ribbonCheck?.sourceCount===14,'FOURTEEN_CARDS_NOT_CONSOLIDATED '+width);
     assert(first.ribbonCheck.actualDataMatches,'RIBBON_VALUES_NOT_EQUAL_TO_REAL_SOURCE '+width);
     assert(first.ribbonCheck.rowTopSpread<=1.5,'FOURTEEN_KPIS_NOT_IN_SINGLE_ROW '+width);
     assert(first.ribbonCheck.noTopAccent,'ACCENT_STROKES_REMAIN '+width);
     assert(first.ribbonCheck.overflowCardValues.length===0,'RIBBON_VALUE_CLIPPED '+width+' '+JSON.stringify(first.ribbonCheck.overflowCardValues));
     assert(first.firstRibbonCard.height<=58,'V23_KPI_TOO_TALL '+width);
     assert(first.hero.height<=76,'V22_HERO_STILL_TOO_TALL '+width+' '+first.hero.height);
     assert(first.metric.height===0,'OLD_TOP_KPIS_STILL_VISIBLE '+width);
     assert(parseFloat(first.typography.primaryNumber)<=19.3,'V22_NUMERAL_STILL_TOO_LARGE '+width+' '+first.typography.primaryNumber);
     assert(parseFloat(first.typography.headline)<=20,'V22_HEADING_STILL_TOO_LARGE '+width+' '+first.typography.headline);
     assert(first.overflowKPIs.every(k=>k.scroll<=k.w+4),'PERFORMANCE_KPI_TEXT_OVERFLOW '+width+': '+JSON.stringify(first.overflowKPIs));
    }
    if(width<1024){
      assert.equal(first.metric?.image,'none','MOBILE_STATS_CARD_STYLE_CHANGED');
      assert.equal(first.hero?.image,'none','MOBILE_STATS_HERO_STYLE_CHANGED');
      await page.screenshot({path:'audit/stats-preview-'+width+'.png',fullPage:true});
      captures[width]={first,mobileStylesPreserved:true,errors:pageErrors};
      console.log('STATISTICS_PREVIEW_MOBILE_STYLE_UNCHANGED',width,JSON.stringify({settled:first.settledCounter,records:first.settledRows,hero:first.hero?.image,card:first.metric?.image}));
      continue;
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
    assert(graphRect&&graphRect.w>(width>=1024?400:150),'CHART_NOT_RENDERED');
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
let activated=false;
try{
 report.activeBefore=await active();
 const prod=await version(report.activeBefore.version);
 report.workerBase={id:report.activeBefore.version,mainModule:prod.main_module,modules:modules(prod)};
 const main=prod.modules.find(m=>m.name===prod.main_module);assert(main,'WORKER_MAIN_NOT_FOUND');
 const originalSource=Buffer.from(main.content_base64,'base64').toString('utf8');
 assert(!originalSource.includes('__b46StatisticsPcV23Production20261020'),'STATS_V23_ALREADY_IN_WORKER');
 const modifiedSource=patchWorker(originalSource);
 // Proof: original worker source survives byte-for-byte inside the wrapper.
 assert(modifiedSource.includes(originalSource.split('export default {')[0]),'WORKER_ORIGINAL_PREFIX_CHANGED');
 report.codeDiff={before:hash(originalSource),after:hash(modifiedSource)};
 const original=await assets(ORIGIN);
 assert(original['/'].data.toString().includes('sp-stats-content'),'CURRENT_LIVE_STATISTICS_MISSING');
 assert(!original['/'].data.toString().includes('b46-statistics-pc-single-row-v23-preview-20261020'),'STATISTICS_V23_ALREADY_DEPLOYED');
 report.productionAssetsBefore=hashReport(original);
 report.expectedHtmlHash=hash(htmlPreview(original['/'].data.toString()));
 const domains=await api('/workers/domains');
 report.domains=domains.filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort();
 assert.deepEqual(report.domains,['ball46.com','www.ball46.com'],'PRODUCTION_DOMAINS_NOT_VERIFIED');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:prod.main_module,compatibility_date:prod.compatibility_date,compatibility_flags:prod.compatibility_flags||[],bindings:prod.bindings,keep_assets:true,assets:{config:prod.assets.config},annotations:{'workers/tag':'B46_STATS_PC_V23_14_SINGLE_ROW_PRODUCTION_20261020','workers/message':'Approved Statistics PC dark theme 14 stats in one compact row; other routes and mobile unchanged'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 assert.deepEqual(await active(),report.activeBefore,'ACTIVE_VERSION_CHANGED_BEFORE_CANDIDATE_UPLOAD');
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of prod.modules)form.set(m.name,new Blob([m.name===prod.main_module?modifiedSource:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 candidate=uploaded.id;report.candidateVersion=candidate;report.actions.push('INACTIVE_CANDIDATE_UPLOADED');save();
 const cv=await version(candidate);
 assert.equal(cv.annotations?.['workers/tag'],'B46_STATS_PC_V23_14_SINGLE_ROW_PRODUCTION_20261020','CANDIDATE_METADATA_MISMATCH');
 const newHashes=modules(cv);
 for(const x of report.workerBase.modules){const target=newHashes.find(y=>y.name===x.name);assert(target,'CANDIDATE_MODULE_MISSING '+x.name);assert.equal(target.hash,x.name===prod.main_module?hash(modifiedSource):x.hash,'UNRELATED_WORKER_MODULE_MODIFIED '+x.name);}
 let subdomain='mccarey-supon';
 try{const sub=await api('/workers/subdomain');if(sub.subdomain)subdomain=sub.subdomain;}catch(e){console.log('SUBDOMAIN_FALLBACK',String(e).slice(0,100));}
 const preview='https://'+candidate.slice(0,8)+'-'+SCRIPT+'.'+subdomain+'.workers.dev';
 report.candidateBrowserUrl=preview+'/?view=statistics';save();
 const candidatePage=await read(preview,'/');
 assert.equal(candidatePage.status,200,'CANDIDATE_PREVIEW_HTTP_ERROR');
 assert.equal(candidatePage.hash,report.expectedHtmlHash,'CANDIDATE_HTML_MISMATCH');
 const candidateIndex=await read(preview,'/index.html');
 assert.equal(candidateIndex.hash,report.expectedHtmlHash,'CANDIDATE_INDEX_HTML_MISMATCH');
 for(const p of paths.filter(x=>x!=='/'&&x!=='/index.html')){
  const file=await read(preview,p);assert.equal(file.hash,original[p].hash,'CANDIDATE_PUBLIC_ASSET_MODIFIED '+p);
 }
 console.log('BALL46_STATS_V23_PRECHECK_CANDIDATE',JSON.stringify({candidate,active:report.activeBefore.version,preview}));
 report.previewBrowser=await previewQA(preview);
 assert.deepEqual(await active(),report.activeBefore,'PRODUCTION_CHANGED_DURING_CANDIDATE_QA');
 // All QA passed, promote only candidate, never a former source version.
 const deployment=await api('/workers/scripts/'+SCRIPT+'/deployments',{
  strategy:'percentage',
  versions:[{version_id:candidate,percentage:100}],
  annotations:{'workers/message':'Approved Statistics PC V2.3 14-card single row; visual parity verified'}
 });
 activated=true;
 report.actions.push({type:'production_promote',candidate,deploymentId:deployment.id||null});save();
 report.activeAfter=await active();
 assert.equal(report.activeAfter.version,candidate,'POST_DEPLOY_WRONG_ACTIVE_WORKER');
 // Cloudflare may report the deployment as 100% before public routes have
 // propagated to all edge locations. Keep the guard; wait for exact HTML
 // parity on BOTH official domains instead of sampling once immediately.
 async function waitForPublicHtml(base,expectedHash){
  let last={};const max=20;
  for(let i=1;i<=max;i++){
   const [root,index]=await Promise.all([read(base,'/'),read(base,'/index.html')]);
   last={attempt:i,domain:base,rootSha:root.hash,indexSha:index.hash,rootLen:root.data.length,indexLen:index.data.length,marker:root.data.includes('b46-statistics-pc-single-row-v23-preview-20261020')};
   console.log('STATS_V23_POST_DEPLOY_PROPAGATION_CHECK',JSON.stringify(last));
   if(root.status===200&&index.status===200&&root.hash===expectedHash&&index.hash===expectedHash)return last;
   assert.equal((await active()).version,candidate,'ANOTHER_WORKER_ACTIVATED_DURING_PROPAGATION');
   await new Promise(r=>setTimeout(r,4500));
  }
  throw Error('PRODUCTION_HTML_NOT_PROPAGATED_AFTER_WAIT '+JSON.stringify(last));
 }
 report.publicPropagation=[];
 report.publicPropagation.push(await waitForPublicHtml(ORIGIN,report.expectedHtmlHash));
 report.publicPropagation.push(await waitForPublicHtml('https://www.ball46.com',report.expectedHtmlHash));
 const updated=await assets(ORIGIN);
 for(const p of paths){
  assert.equal(updated[p].status,200,'POST_DEPLOY_ASSET_HTTP_FAILED '+p);
  assert.equal(updated[p].hash,p==='/'||p==='/index.html'?report.expectedHtmlHash:original[p].hash,'PRODUCTION_PUBLIC_ASSET_DRIFT '+p);
 }
 report.productionAssetsAfter=hashReport(updated);
 report.productionBrowser=await previewQA(ORIGIN,[1440,390]);
 assert.equal((await active()).version,candidate,'ACTIVE_WORKER_CHANGED_AFTER_QA');
 report.finishedAt=new Date().toISOString();report.success=true;save();
 console.log('BALL46_STATS_PC_V23_PRODUCTION_DEPLOY_SUCCESS',JSON.stringify({candidate,previous:report.activeBefore.version,repo:process.env.GITHUB_REPOSITORY,commit:process.env.GITHUB_SHA,desktopWidths:[1024,1366,1440,1920],mobileWidth:390,site:ORIGIN}));
}catch(e){
 report.finishedAt=new Date().toISOString();report.error=e.stack||String(e);
 if(activated&&candidate&&report.activeBefore?.version){
  try{
   if((await active()).version===candidate){
    await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:report.activeBefore.version,percentage:100}],annotations:{'workers/message':'Automatic rollback of Statistics PC V2.3 due to failed post-deployment verification'}});
    report.actions.push({type:'automatic_rollback',version:report.activeBefore.version});
    report.rolledBack=(await active()).version===report.activeBefore.version;
   }
  }catch(rollbackError){report.rollbackError=String(rollbackError);}
 }
 save();console.error('BALL46_STATS_PC_V23_PRODUCTION_DEPLOY_STOP',e.stack||String(e));process.exitCode=1;
}
