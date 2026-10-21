import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {FEATURED_PREVIEW_SCRIPT,FEATURED_PREVIEW_MARKER} from './clean-featured.mjs';
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,SCRIPT='ball46-production',ORIGIN='https://ball46.com';
assert(acct&&token,'CLOUDFLARE_ACCOUNT_TOKEN_REQUIRED');
const apiRoot='https://api.cloudflare.com/client/v4/accounts/'+acct;
const hash=data=>createHash('sha256').update(data).digest('hex');
mkdirSync('audit',{recursive:true});
const css=readFileSync('./clean-featured.css','utf8');
const styleTag='<style id="'+FEATURED_PREVIEW_MARKER+'-style">'+css+'</style>';
const scriptTag='<script id="'+FEATURED_PREVIEW_MARKER+'-script">'+FEATURED_PREVIEW_SCRIPT+'</script>';
const report={task:'BALL46 Featured Match clean visual redesign PC and mobile — INACTIVE PREVIEW ONLY',sha:process.env.GITHUB_SHA,created:new Date().toISOString(),noProductionActivation:true,actions:[]};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function api(path,body){
 const r=await fetch(apiRoot+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},
  body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(70000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_API_FAILURE '+path+': '+JSON.stringify(j.errors));return j.result;
}
async function active(){const d=(await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&Number(d.versions[0].percentage)===100,'WORKER_NOT_FULLY_ACTIVE');return{version:d.versions[0].version_id,deployment:d.id}}
async function version(id){const x=await api('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');assert(x.main_module&&Array.isArray(x.modules),'VERSION_MODULES_NOT_AVAILABLE');return x}
async function read(origin,path){
 let last;
 for(let i=0;i<4;i++){
  try{
   const u=new URL(path,origin);u.searchParams.set('featured_clean_preview_20261021',Date.now()+'-'+i+'-'+process.env.GITHUB_RUN_ID);
   const r=await fetch(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(40000)});
   const b=Buffer.from(await r.arrayBuffer());return {status:r.status,body:b,sha:hash(b)};
  }catch(e){last=e;if(i<3)await new Promise(r=>setTimeout(r,1800*(i+1)))}
 }
 throw Error('PUBLIC_FILE_FETCH_FAILED '+origin+path+' '+String(last));
}
const files=['/','/index.html','/dashboard-v2-stage3-featured-facts-20261013a.js','/featured-facts-premium-20261013a.css','/singlepage-workspace-343.css','/singlepage-workspace-343.js'];
async function assets(host){const out={};for(const p of files){out[p]=await read(host,p);assert.equal(out[p].status,200,'ASSET_NOT_OK '+p)}return out}
function patchHtml(input){
 assert(input.includes('</head>')&&input.includes('</body>')&&input.includes('featured-card'),'LIVE_FEATURED_CARD_HTML_MISSING');
 assert(!input.includes(FEATURED_PREVIEW_MARKER),'PREVIEW_ALREADY_PRESENT');
 return input.replace('</head>',styleTag+'</head>').replace('</body>',scriptTag+'</body>');
}
const helper=[
'async function __b46FeaturedCleanPreview20261021(response,path){',
'if(!["/","/index.html"].includes(path)||!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;',
'const raw=await response.text();',
'if(!raw.includes("</head>")||!raw.includes("featured-card")||raw.includes('+JSON.stringify(FEATURED_PREVIEW_MARKER)+'))throw Error("FEATURED_PREVIEW_BASELINE_UNEXPECTED");',
'const patched=raw.replace("</head>",'+JSON.stringify(styleTag)+'+"</head>").replace("</body>",'+JSON.stringify(scriptTag)+'+"</body>");',
'const headers=new Headers(response.headers);headers.delete("etag");headers.delete("content-length");headers.set("Cache-Control","no-store");',
'return new Response(patched,{status:response.status,statusText:response.statusText,headers});',
'}'
].join('\n');
function patchWorker(source){
 const anchor='export default {';
 assert.equal(source.split(anchor).length,2,'WORKER_EXPORT_DRIFT');
 assert(!source.includes('__b46FeaturedCleanPreview20261021'),'FEATURED_PREVIEW_ALREADY_PATCHED');
 const original=source.replace(anchor,'const __b46ProductionWorkerForFeaturedPreview = {');
 return original+'\n'+helper+'\nexport default {...__b46ProductionWorkerForFeaturedPreview,async fetch(request,env,ctx){const response=await __b46ProductionWorkerForFeaturedPreview.fetch.call(__b46ProductionWorkerForFeaturedPreview,request,env,ctx);return __b46FeaturedCleanPreview20261021(response,new URL(request.url).pathname);}};\n';
}
async function qa(host){
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(chrome,'CHROME_MISSING');
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 const result=[];
 try{
  for(const [width,theme] of [[390,'dark'],[390,'light'],[1440,'dark'],[1440,'light']]){
   const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e).slice(0,280)));
   try{
    await p.setViewport({width,height:960,deviceScaleFactor:1,isMobile:width<768});await p.setCacheEnabled(false);
    await p.goto(host+'/?featured_match_design_preview=original&check='+width+'-'+theme+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await p.waitForFunction(()=>{
     const c=document.querySelector('.featured-card[data-featured].b46fm-inplace');
     return c&&c.getBoundingClientRect().width>=230&&getComputedStyle(c).display!=='none';
    },{timeout:60000,polling:450});
    await new Promise(r=>setTimeout(r,2000));
    const a=await p.evaluate(()=>{
     const src=document.querySelector('.featured-card[data-featured]'),rail=src.closest('.right-rail');
     const get=(e)=>e?{display:getComputedStyle(e).display,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}:null;
     const facts=[...src.querySelectorAll('.feature-facts > div')].map(x=>{
       const c=getComputedStyle(x);return{label:x.querySelector('span')?.textContent?.trim(),value:x.querySelector('b')?.textContent?.trim(),
         border:c.borderTopWidth,bg:c.backgroundImage,shadow:c.boxShadow,radius:c.borderRadius,
         overflow:x.scrollWidth>x.clientWidth+3};
     });
     const section=src.querySelector('.feature-events');
     const events=[...section?.querySelectorAll('.event-item')||[]];
     return {theme:document.documentElement.dataset.theme,width:innerWidth,docWidth:document.documentElement.scrollWidth,
       featuredOriginalCount:document.querySelectorAll('.featured-card[data-featured]').length,
       duplicatePreviewNodes:document.querySelectorAll('.b46fm-preview-pc,.b46fm-preview-mobile,.b46fm').length,
       sourceInOriginalRail:!!rail&&rail.contains(src),rail:get(rail),card:get(src),
       marker:!!window.__b46FeaturedCleanPreviewV2Installed,
       sourceFields:{
        league:src.querySelector('[data-featured-league]')?.textContent.trim(),
        home:src.querySelector('[data-featured-home]')?.textContent.trim(),
        away:src.querySelector('[data-featured-away]')?.textContent.trim(),
        score:src.querySelector('[data-featured-score]')?.textContent.trim(),
        facts:src.querySelectorAll('.feature-facts > div').length,
        stats:src.querySelectorAll('.feature-stats .stat-row').length,
        signals:src.querySelectorAll('.feature-signal').length,
        events:events.length},
       factColumns:getComputedStyle(src.querySelector('.feature-facts')).gridTemplateColumns.split(' ').length,
       facts,events:events.map(e=>({label:e.textContent.trim(),display:getComputedStyle(e).display})),
       buttonCount:section?.querySelectorAll('.b46fm-events-more').length||0,
       appExists:!!document.querySelector('.workspace.singlepage')};
    });
    assert(a.marker&&a.appExists,'PREVIEW_NOT_RUNNING_ON_REAL_WORKSPACE '+width);
    assert.equal(a.featuredOriginalCount,1,'FEATURED_CARD_NOT_UNIQUE '+width);
    assert.equal(a.duplicatePreviewNodes,0,'ANOTHER_FEATURED_CARD_WAS_INSERTED '+width);
    assert(a.sourceInOriginalRail,'ORIGINAL_FEATURED_CARD_WAS_MOVED_FROM_RAIL '+width);
    assert(a.card.width>=230&&a.card.height>200,'ORIGINAL_FEATURED_CARD_NOT_VISIBLE '+width+' '+JSON.stringify(a.card));
    assert.equal(a.sourceFields.facts,4,'SOURCE_FACT_CARDS_CHANGED');
    assert.equal(a.factColumns,2,'FOUR_FACT_WELLS_NOT_IN_2_COLUMNS');
    assert(a.facts.every(x=>x.shadow.match(/inset/g)?.length>=2&&x.border==='0px'&&x.radius==='9px'&&x.bg.includes('linear-gradient')&&!x.overflow),
      'FEATURED_FACTS_NOT_RECESSED '+width+' '+theme+' '+JSON.stringify(a.facts));
    assert(a.facts.every(x=>x.bg.includes(theme==='dark'?'rgb(14, 32, 23)':'rgb(211, 227, 214)')),
      'FEATURED_FACT_WELL_THEME_NOT_DARKER '+width+' '+theme);
    assert(a.sourceFields.signals===1,'ORIGINAL_SIGNAL_CONTAINER_CHANGED');
    assert(a.docWidth<=width+4,'HORIZONTAL_OVERFLOW '+width+' '+a.docWidth);
    if(width<768){
     assert(a.rail.display!=='none'&&a.rail.width>230,'ORIGINAL_RAIL_HIDDEN_ON_MOBILE '+width);
    }else assert(a.card.width>=260&&a.card.width<=460,'PC_SIDEBAR_CARD_LOST '+a.card.width);
    if(a.sourceFields.events>3){
     assert.equal(a.buttonCount,1,'MORE_EVENTS_BUTTON_NOT_IN_ORIGINAL_CARD');
     assert.equal(a.events.filter(e=>e.display!=='none').length,3,'RECENT_EVENTS_NOT_COLLAPSED_IN_PLACE');
     await p.evaluate(()=>document.querySelector('.featured-card[data-featured] .b46fm-events-more').click());
     const open=await p.evaluate(()=>{
      const src=document.querySelector('.featured-card[data-featured]');
      return{count:[...src.querySelectorAll('.feature-events .event-item')].filter(x=>getComputedStyle(x).display!=='none').length,
       original:[...src.querySelectorAll('.feature-events .event-item')].length};
     });
     assert.equal(open.count,open.original,'IN_PLACE_MORE_EVENTS_BUTTON_DID_NOT_REVEAL_ALL');
    }
    assert.deepEqual(errors,[],'BROWSER_RUNTIME_ERRORS '+JSON.stringify(errors));
    await p.evaluate(()=>document.querySelector('.featured-card[data-featured]').scrollIntoView({block:'start',behavior:'instant'}));
    await new Promise(r=>setTimeout(r,300));
    await p.screenshot({path:'audit/featured-original-in-place-'+width+'-'+theme+'.png',fullPage:false});
    console.log('FEATURED_ORIGINAL_INPLACE_PREVIEW_BROWSER_PASS',width,theme,JSON.stringify(a));
    result.push(a);
   }finally{await p.close()}
  }
 }finally{await browser.close()}
 return result;
}

try{
 report.before=await active();console.log('FEATURED_CLEAN_PREVIEW_CURRENT_ACTIVE',JSON.stringify(report.before));
 const v=await version(report.before.version),main=v.modules.find(x=>x.name===v.main_module);
 assert(main,'PRODUCTION_MAIN_MODULE_NOT_FOUND');
 const currentSource=Buffer.from(main.content_base64,'base64').toString('utf8');
 const modifiedSource=patchWorker(currentSource);
 const hashes=v.modules.map(x=>({name:x.name,sha:hash(Buffer.from(x.content_base64,'base64'))}));
 const original=await assets(ORIGIN);
 report.productionAssetHashesBefore=Object.fromEntries(Object.entries(original).map(([k,d])=>[k,d.sha]));
 const expected=hash(patchHtml(original['/'].body.toString()));
 const domains=(await api('/workers/domains')).filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'PRODUCTION_DOMAINS_CHANGED');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings,keep_assets:true,assets:{config:v.assets.config},annotations:{'workers/tag':'B46_FEATURED_MATCH_PC_MOBILE_VISUAL_PREVIEW_20261021','workers/message':'Featured Match clean sections design inactive candidate only; DO NOT ACTIVATE'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 assert.deepEqual(await active(),report.before,'ACTIVE_WORKER_CHANGED_BEFORE_UPLOAD');
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of v.modules)form.set(m.name,new Blob([m.name===v.main_module?modifiedSource:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 report.candidate=uploaded.id;report.actions.push('UPLOAD_INACTIVE_CANDIDATE_ONLY');save();
 const cand=await version(uploaded.id);
 for(const m of cand.modules){
  const old=hashes.find(x=>x.name===m.name);assert(old,'UNEXPECTED_WORKER_MODULE '+m.name);
  assert.equal(hash(Buffer.from(m.content_base64,'base64')),m.name===v.main_module?hash(modifiedSource):old.sha,'UNRELATED_MODULE_CHANGED '+m.name);
 }
 const sub=(await api('/workers/subdomain')).subdomain||'mccarey-supon';
 const preview='https://'+uploaded.id.slice(0,8)+'-'+SCRIPT+'.'+sub+'.workers.dev';
 report.previewUrl=preview+'/?featured_match_design_preview=1';save();
 const previewHtml=await read(preview,'/');
 assert.equal(previewHtml.sha,expected,'CANDIDATE_HTML_DIFFERS_FROM_PLANNED_LAYOUT');
 for(const p of files.filter(x=>x!=='/'&&x!=='/index.html')){
  const doc=await read(preview,p);assert.equal(doc.sha,original[p].sha,'ORIGINAL_SCRIPT_OR_STYLE_CHANGED '+p);
 }
 report.browser=await qa(preview);
 assert.deepEqual(await active(),report.before,'PRODUCTION_ACTIVATED_UNEXPECTEDLY');
 const after=await assets(ORIGIN);
 for(const p of files)assert.equal(after[p].sha,original[p].sha,'PRODUCTION_ASSET_CHANGED '+p);
 report.success=true;report.finished=new Date().toISOString();save();
 console.log('FEATURED_ORIGINAL_INPLACE_PC_MOBILE_PREVIEW_SUCCESS',JSON.stringify({url:report.previewUrl,active:report.before.version,previewVersion:uploaded.id,productionPromotions:0,checked:[390,1440]}));
}catch(e){
 report.error=e.stack||String(e);report.success=false;save();
 console.error('FEATURED_CLEAN_PC_MOBILE_PREVIEW_FAILED',report.error);process.exitCode=1;
}
