import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MOBILE_SCRIPT,MOBILE_MARKER} from './mobile-clean.mjs';
const script='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CF_PREVIEW_ACCESS_MISSING');
const base='https://api.cloudflare.com/client/v4/accounts/'+account;
const css=readFileSync('./mobile-clean.css','utf8');
assert(css.includes('@media(max-width:767px)'),'MOBILE_CSS_MEDIA_GATE_MISSING');
const hash=d=>createHash('sha256').update(d).digest('hex');
mkdirSync('audit',{recursive:true});
const report={intent:'Statistics mobile-first clean match cards PREVIEW ONLY - no Production activation',sha:process.env.GITHUB_SHA,created:new Date().toISOString(),productionActions:[],cssHash:hash(css)};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function api(path,body){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},
 body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const data=await r.json();assert(r.ok&&data.success===true,'CF_API_FAILURE '+path+': '+JSON.stringify(data.errors));return data.result;
}
async function active(){
 const d=(await api('/workers/scripts/'+script+'/deployments?per_page=1')).deployments[0];
 assert(d.versions.length===1&&Number(d.versions[0].percentage)===100,'ACTIVE_WORKER_SPLIT');
 return{version:d.versions[0].version_id,deployment:d.id};
}
async function version(id){const r=await api('/workers/workers/'+script+'/versions/'+id+'?include=modules');assert(r.main_module&&r.modules?.length,'WORKER_MODULES_MISSING');return r}
async function read(origin,path){
 let last;
 for(let tries=0;tries<4;tries++){
  try{
   const u=new URL(path,origin);u.searchParams.set('mobile_stats_preview_'+process.env.GITHUB_RUN_ID,Date.now()+'-'+tries);
   const r=await fetch(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(40000)});
   const b=Buffer.from(await r.arrayBuffer());return{status:r.status,sha:hash(b),body:b};
  }catch(e){last=e;if(tries<3)await new Promise(r=>setTimeout(r,1500*(tries+1)))}
 }
 throw Error('READ_ERROR '+origin+path+': '+String(last));
}
const paths=['/','/index.html','/longterm-performance-343.js','/singlepage-workspace-343.js','/dashboard-v2-tune.css','/expanded-match-343.js'];
async function assets(origin){const out={};for(const p of paths){out[p]=await read(origin,p);assert.equal(out[p].status,200,'ASSET_MISSING '+p)}return out}
const style='<style id="b46-mobile-stats-clean-v1-20261020">'+css+'</style>';
const overlay='<script id="b46-mobile-stats-clean-v1-script-20261020">'+MOBILE_SCRIPT+'</script>';
function htmlPatch(html){
 assert(html.includes('</head>')&&html.includes('</body>')&&html.includes('sp-stats-content'),'HTML_STATISTICS_UNRECOGNIZED');
 assert(!html.includes('b46-mobile-stats-clean-v1-20261020'),'PREVIEW_ALREADY_PRESENT');
 return html.replace('</head>',style+'</head>').replace('</body>',overlay+'</body>');
}
const helper=[
'function __b46MobileStatsCleanV1Html20261020(raw){',
'if(!raw.includes("</head>")||!raw.includes("</body>")||!raw.includes("sp-stats-content")||raw.includes("b46-mobile-stats-clean-v1-20261020"))throw new Error("MOBILE_STATS_HTML_BASELINE_UNEXPECTED");',
'const css='+JSON.stringify(style)+';',
'const js='+JSON.stringify(overlay)+';',
'return raw.replace("</head>",css+"</head>").replace("</body>",js+"</body>");',
'}',
'async function __b46MobileStatsCleanV1Response20261020(response,path){',
'if(!["/","/index.html"].includes(path)||!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;',
'const s=await response.text();const h=new Headers(response.headers);h.delete("content-length");h.delete("etag");h.set("Cache-Control","no-store");',
'return new Response(__b46MobileStatsCleanV1Html20261020(s),{status:response.status,statusText:response.statusText,headers:h});',
'}'
].join('\n');
function patchWorker(source){
 const key='export default {';
 assert.equal(source.split(key).length,2,'WORKER_EXPORT_CHANGED');
 assert(!source.includes('__b46MobileStatsCleanV1Response20261020'),'PREVIEW_ALREADY_PATCHED');
 const body=source.replace(key,'const __b46CurrentWorkerForMobilePreview = {');
 return body+'\n'+helper+'\nexport default {...__b46CurrentWorkerForMobilePreview,async fetch(request,env,ctx){const response=await __b46CurrentWorkerForMobilePreview.fetch.call(__b46CurrentWorkerForMobilePreview,request,env,ctx);return __b46MobileStatsCleanV1Response20261020(response,new URL(request.url).pathname);}};\n';
}
async function browserQA(origin){
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(chrome,'CHROME_NOT_FOUND');
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 const out={};
 try{
  for(const width of [360,390,430,768,1440]){
   const mode=width===390?'light':'dark';
   const page=await browser.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e).slice(0,260)));
   try{
    await page.setViewport({width,height:950,deviceScaleFactor:1,isMobile:width<=767});
    await page.setCacheEnabled(false);
    await page.goto(origin+'/?view=statistics&mobile_v1_qa='+width+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>{
     const s=document.querySelector('[data-sp-kpi="total"]');
     return document.querySelectorAll('.sp-results .sp-table tbody tr').length>0&&Number.parseInt(s?.textContent?.replace(/[^0-9]/g,''),10)>0;
    },{timeout:50000,polling:400});
    await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),mode);
    if(width<=767)await page.waitForFunction(()=>document.querySelector('.sp-results.b46m-stats-ready .b46m-hcard'),{timeout:20000,polling:250});
    await new Promise(r=>setTimeout(r,1250));
    const initial=await page.evaluate(()=>{
     const result=document.querySelector('.sp-results'),rows=[...result.querySelectorAll('.sp-table tbody tr')],cards=[...result.querySelectorAll('.b46m-hcard')],first=cards[0],firstRow=rows[0],wrap=result.querySelector('.sp-table-wrap'),stat=document.querySelector('.sp-stats-content');
     const style=e=>e?{display:getComputedStyle(e).display,width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)}:null;
     const sourceMatch=firstRow?.querySelector('.sp-match strong')?.textContent.trim(),sourceLeague=firstRow?.querySelector('.sp-match small')?.textContent.trim();
     return {docWidth:document.documentElement.scrollWidth,viewport:innerWidth,theme:document.documentElement.dataset.theme,
      cssMarker:!!document.querySelector('#b46-mobile-stats-clean-v1-20261020'),scriptMarker:!!window.__b46MobileStatsCleanV1Installed,
      allRows:rows.length,visibleCards:cards.length,sourceMatch,sourceLeague,
      firstTitleH:first?.querySelector('.b46m-teamname')?.title,firstTitleA:first?.querySelectorAll('.b46m-teamname')[1]?.title,
      league:first?.querySelector('.b46m-league')?.textContent,score:first?.querySelector('.b46m-scoreline')?.textContent,
      status:first?.querySelector('.b46m-outcome')?.textContent,sourceStatus:firstRow?.querySelector('.sp-result')?.textContent?.trim(),
      sourceOdds:firstRow?.querySelectorAll(':scope > td')[5]?.textContent?.trim(),visibleOdds:first?.querySelector('.b46m-odds')?.textContent,
      oldTable:style(wrap),kpis:document.querySelectorAll('.sp-kpis .sp-kpi').length,firstKPI:style(document.querySelector('.sp-kpi')),
      pcRibbonCount:stat?.querySelectorAll('.b46v23-micro-card').length,pcRibbon:style(stat?.querySelector('.b46v23-strip')),
      marketFilter:document.querySelector('.sp-filter-chip')?.textContent?.trim()
     };
    });
    assert(initial.cssMarker&&initial.scriptMarker,'MOBILE_STYLE_OR_SCRIPT_NOT_LOADED');
    assert(initial.allRows>0,'REAL_SETTLEMENT_HISTORY_EMPTY');
    assert(initial.kpis===8,'EIGHT_ORIGINAL_STATS_LOST');
    assert(initial.docWidth<=width+5,'DOCUMENT_HAS_HORIZONTAL_OVERFLOW '+width+' '+initial.docWidth);
    if(width<=767){
     assert(initial.visibleCards===Math.min(12,initial.allRows),'MOBILE_CARDS_NOT_RENDERED '+width);
     assert(initial.oldTable?.display==='none','DESKTOP_TABLE_STILL_SHOWN_ON_MOBILE');
     assert(initial.firstTitleH&&initial.firstTitleA&&initial.sourceMatch.includes(initial.firstTitleH),'MATCH_TEAM_NOT_FROM_ACTUAL_TABLE');
     assert.equal(initial.sourceLeague,initial.league,'LEAGUE_SOURCE_MISMATCH');
     assert.equal(initial.visibleOdds,initial.sourceOdds,'ODDS_DATA_INCORRECT');
     assert.equal(initial.status,initial.sourceStatus,'SETTLEMENT_STATUS_MISMATCH');
     assert(initial.firstKPI.height<=65,'KPI_CARDS_NOT_COMPACT '+width+' '+initial.firstKPI.height);
     await page.evaluate(()=>document.querySelector('.b46m-detail-toggle').click());
     const expanded=await page.evaluate(()=>{
      const card=document.querySelector('.b46m-hcard');
      return{expanded:card.dataset.expanded,detail:getComputedStyle(card.querySelector('.b46m-extra')).display,
        source:card.querySelector('.b46m-extra').textContent,
        tableEntry:document.querySelector('.sp-table tbody tr > td:nth-child(8)')?.textContent.trim(),
        tableFinal:document.querySelector('.sp-table tbody tr > td:nth-child(9)')?.textContent.trim()};
     });
     assert(expanded.expanded==='true'&&expanded.detail==='grid','DETAILS_NOT_INTERACTIVE');
     assert(expanded.source.includes(expanded.tableEntry)&&expanded.source.includes(expanded.tableFinal),'ENTRY_OR_FINAL_DATA_LOST');
     await page.evaluate(()=>document.querySelector('.b46m-more').click());
     const loaded=await page.evaluate(()=>document.querySelectorAll('.b46m-hcard').length);
     assert.equal(loaded,Math.min(24,initial.allRows),'SHOW_MORE_NOT_WORKING');
     await page.evaluate(()=>document.querySelector('.sp-filter-chip[data-sp-filter="all"]')?.click());
     await new Promise(r=>setTimeout(r,1250));
     assert(await page.evaluate(()=>document.querySelector('.sp-filter-chip[data-sp-filter="all"]')?.classList.contains('active')),'FILTER_STATE_BROKEN');
     out[width]={initial,expanded:{expanded:expanded.expanded,detail:expanded.detail},loaded,errors};
    }else{
     assert(!initial.visibleCards,'MOBILE_CARDS_LEAKED_TO_DESKTOP_OR_TABLET '+width);
     if(width>=1024){
      assert(initial.pcRibbonCount===14,'EXISTING_PC_SINGLE_ROW_LOST '+width);
      assert(initial.pcRibbon?.display==='block','EXISTING_PC_RIBBON_HIDDEN '+width);
     }else{
      assert(initial.pcRibbonCount===0,'TABLET_LAYOUT_UNEXPECTEDLY_CHANGED '+width);
     }
     out[width]={initial,errors};
    }
    if(errors.length)throw Error('BROWSER_ERRORS '+width+': '+errors.join(';'));
    await page.screenshot({path:'audit/stats-mobile-v1-'+width+'.png',fullPage:width<=767});
    console.log('MOBILE_STATS_BROWSER_PASS',width,JSON.stringify({cards:initial.visibleCards,sourceRows:initial.allRows,pc14:initial.pcRibbonCount,docWidth:initial.docWidth,expanded:out[width].expanded,loaded:out[width].loaded}));
   }finally{await page.close()}
  }
 }finally{await browser.close()}
 return out;
}
try{
 report.activeBefore=await active();
 console.log('MOBILE_PREVIEW_CURRENT_PRODUCTION',JSON.stringify(report.activeBefore));
 const v=await version(report.activeBefore.version),main=v.modules.find(m=>m.name===v.main_module);
 assert(main,'WORKER_MAIN_MODULE_MISSING');
 const beforeHash=v.modules.map(m=>({name:m.name,sha:hash(Buffer.from(m.content_base64,'base64'))}));
 const source=Buffer.from(main.content_base64,'base64').toString('utf8');
 assert(source.includes('__b46StatsV23AllThemes20261020'),'LATEST_PC_STATISTICS_14_CARD_REPAIR_MISSING');
 const patched=patchWorker(source);
 const original=await assets('https://ball46.com');
 assert(original['/'].body.includes('b46-statistics-v23-allthemes-repaired-20261020'),'LIVE_PC_14_CARD_TAG_MISSING');
 report.liveHashesBefore=Object.fromEntries(Object.entries(original).map(([k,v])=>[k,v.sha]));
 const expected=hash(htmlPatch(original['/'].body.toString()));
 report.expectedHtmlHash=expected;
 const domains=(await api('/workers/domains')).filter(x=>x.service===script).map(x=>x.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'UNEXPECTED_PRODUCTION_TARGET');
 const settings=await api('/workers/scripts/'+script+'/settings');
 const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings,keep_assets:true,assets:{config:v.assets.config},annotations:{'workers/tag':'B46_STATS_MOBILE_CLEAN_V1_PREVIEW_ONLY_20261020','workers/message':'Mobile Statistics clean match cards, inactive preview, NO PRODUCTION ACTIVATION'}};
 for(const key of ['usage_model','logpush','limits','observability','placement'])if(settings[key]!=null)metadata[key]=settings[key];
 assert.deepEqual(await active(),report.activeBefore,'ACTIVE_WORKER_CHANGED_BEFORE_UPLOAD');
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of v.modules)form.set(m.name,new Blob([m.name===v.main_module?patched:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const response=await api('/workers/scripts/'+script+'/versions',form);
 report.candidate=response.id;report.productionActions.push('UPLOAD_INACTIVE_CANDIDATE');save();
 const cand=await version(response.id);
 for(const m of cand.modules){
  const b=beforeHash.find(x=>x.name===m.name);assert(b,'UNEXPECTED_MODULE_ADDED '+m.name);
  assert.equal(hash(Buffer.from(m.content_base64,'base64')),m.name===v.main_module?hash(patched):b.sha,'UNRELATED_MODULE_CHANGED '+m.name);
 }
 const sub=(await api('/workers/subdomain')).subdomain||'mccarey-supon';
 const preview='https://'+response.id.slice(0,8)+'-'+script+'.'+sub+'.workers.dev';
 report.preview=preview+'/?view=statistics';save();
 assert.equal((await read(preview,'/')).sha,expected,'INACTIVE_PREVIEW_HTML_MISMATCH');
 for(const p of paths.filter(p=>p!=='/'&&p!=='/index.html'))assert.equal((await read(preview,p)).sha,original[p].sha,'MOBILE_PREVIEW_ALTERED_PUBLIC_ASSET '+p);
 report.browser=await browserQA(preview);
 assert.deepEqual(await active(),report.activeBefore,'PRODUCTION_VERSION_CHANGED_DURING_PREVIEW');
 const after=await assets('https://ball46.com');
 for(const p of paths)assert.equal(after[p].sha,original[p].sha,'PRODUCTION_CHANGED_DURING_PREVIEW '+p);
 report.success=true;save();
 console.log('BALL46_STATS_MOBILE_V1_PREVIEW_SUCCESS',JSON.stringify({url:report.preview,currentProduction:report.activeBefore.version,previewVersion:report.candidate,mobile:[360,390,430],desktop:[768,1440],productionPromotions:0}));
}catch(e){report.success=false;report.error=e.stack||String(e);save();console.error('BALL46_STATS_MOBILE_V1_PREVIEW_FAILED',report.error);process.exitCode=1}
