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
    await p.setViewport({width,height:950,deviceScaleFactor:1,isMobile:width<768});await p.setCacheEnabled(false);
    await p.goto(host+'/?featured_match_design_preview=1&check='+width+'-'+theme+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await p.waitForFunction(()=>document.querySelector('[data-featured-home]')?.textContent?.trim()&&document.querySelector('.b46fm-preview-pc .b46fm')&&document.querySelector('.b46fm-preview-mobile .b46fm'),{timeout:60000,polling:400});
    await new Promise(r=>setTimeout(r,1500));
    const a=await p.evaluate(()=>{
     const src=document.querySelector('.featured-card[data-featured]'),
      target=window.innerWidth<768?document.querySelector('.b46fm-preview-mobile .b46fm'):document.querySelector('.b46fm-preview-pc .b46fm');
     const b=target?.getBoundingClientRect();
     const eventsSrc=[...src.querySelectorAll('.feature-events .event-item')];
     return{theme:document.documentElement.dataset.theme,width:innerWidth,docWidth:document.documentElement.scrollWidth,
      original:{home:src.querySelector('[data-featured-home]')?.textContent.trim(),away:src.querySelector('[data-featured-away]')?.textContent.trim(),
       score:src.querySelector('[data-featured-score]')?.textContent.trim(),stats:src.querySelectorAll('.feature-stats .stat-row').length,events:eventsSrc.length,signal:src.querySelector('.feature-signal')?.textContent.trim()},
      display:{home:target?.querySelector('.fm-team.home strong')?.textContent,away:target?.querySelector('.fm-team.away strong')?.textContent,
        score:target?.querySelector('.fm-score-number')?.textContent,stats:target?.querySelectorAll('.fm-stat').length,
        events:target?.querySelectorAll('.fm-event').length,signals:target?.querySelector('.fm-signal-container')?.textContent.trim()},
      cardRect:b?{x:b.x,y:b.y,w:b.width,h:b.height}:null,
      sample:target?.querySelector('.fm-eyebrow')?.textContent.includes('DESIGN SAMPLE')||false,
      sampleSignalCount:target?.querySelectorAll('.fm-sample-signal').length,
      recessedFacts:(()=>{
       const e=[...target?.querySelectorAll('.fm-fact')||[]];
       const container=target?.querySelector('.fm-facts');
       return {columns:getComputedStyle(container).gridTemplateColumns.split(' ').length,
        items:e.map(x=>({label:x.querySelector('span')?.textContent,value:x.querySelector('b')?.textContent,
          background:getComputedStyle(x).backgroundColor,
          shadow:getComputedStyle(x).boxShadow,
          gradient:getComputedStyle(x).backgroundImage,
          radius:getComputedStyle(x).borderRadius,
          border:getComputedStyle(x).borderTopWidth,
          overflow:x.scrollWidth>x.clientWidth+3}))};
      })(),
      pcVisible:!!document.querySelector('.b46fm-preview-pc .b46fm')?.getBoundingClientRect().width,
      mobileVisible:!!document.querySelector('.b46fm-preview-mobile .b46fm')?.getBoundingClientRect().width,
      marker:!!window.__b46FeaturedCleanPreviewV1,hasRealApp:!!document.querySelector('.workspace.singlepage'),
      sourceHidden:getComputedStyle(src).display==='none'};
    });
    assert(a.marker&&a.hasRealApp,'PREVIEW_NOT_RUNNING_IN_REAL_APP');
    assert.equal(a.recessedFacts.items.length,4,'FOUR_RECESSED_FACT_WELLS_NOT_RENDERED');
    assert.equal(a.recessedFacts.columns,2,'FOUR_RECESSED_FACT_WELLS_NOT_TWO_COLUMNS');
    assert(a.recessedFacts.items.every(x=>x.shadow.match(/inset/g)?.length>=3&&x.border==='0px'&&x.radius==='9px'&&x.gradient.includes('linear-gradient')&&!x.overflow),'FACT_WELLS_NOT_INSET_OR_OVERFLOWING '+width+' '+theme+' '+JSON.stringify(a.recessedFacts.items));
    assert(a.recessedFacts.items.every(x=>x.gradient.includes(theme==='dark'?'rgb(16, 35, 27)':'rgb(211, 227, 215)')),'FACT_WELLS_NOT_DARKER_THAN_SURFACE '+width+' '+theme+' '+JSON.stringify(a.recessedFacts.items));
    if(a.sample){
     assert(['','—'].includes(a.original.home)&&['','—'].includes(a.original.away),'SAMPLE_WAS_SHOWN_OVER_REAL_MATCH');
     assert.equal(a.display.home,'Londrina','REFERENCE_SAMPLE_HOME_MISMATCH');
     assert.equal(a.display.away,'Cuiaba','REFERENCE_SAMPLE_AWAY_MISMATCH');
     assert.equal(a.display.score,'1–0','REFERENCE_SAMPLE_SCORE_MISMATCH');
     assert.equal(a.display.stats,6,'REFERENCE_SAMPLE_STATS_NOT_RENDERED');
     assert.equal(a.display.events,3,'REFERENCE_SAMPLE_EVENTS_NOT_RENDERED');
     assert.equal(a.sampleSignalCount,2,'REFERENCE_SAMPLE_SIGNALS_NOT_RENDERED');
     assert.deepEqual(a.recessedFacts.items.map(x=>x.value),['HT 1–0','3–4','2 Yellow / 0 Red · 2 Yellow / 1 Red','8s'],'REFERENCE_SAMPLE_FACT_VALUES_DO_NOT_MATCH_OWNER_REQUEST');
    }else{
     assert.equal(a.display.home,a.original.home,'HOME_TEAM_VALUE_CHANGED');
     assert.equal(a.display.away,a.original.away,'AWAY_TEAM_VALUE_CHANGED');
     assert.equal(a.display.score,a.original.score,'SCORE_VALUE_CHANGED');
     assert.equal(a.display.stats,a.original.stats,'MATCH_STATS_DROPPED');
     assert.equal(a.display.events,Math.min(3,a.original.events),'EVENTS_SUMMARY_WRONG');
    }
    assert(a.cardRect?.w>=Math.min(250,width-35),'PREVIEW_CARD_HIDDEN_OR_TOO_NARROW '+width);
    assert(a.docWidth<=width+4,'HORIZONTAL_OVERFLOW '+width+' '+a.docWidth);
    assert(a.sourceHidden,'ORIGINAL_FEATURED_CARD_DUPLICATED');
    if(width<768)assert(a.mobileVisible,'MOBILE_PREVIEW_NOT_VISIBLE');
    else assert(a.pcVisible,'PC_PREVIEW_NOT_VISIBLE');
    if(a.original.events>3||a.sample){
      await p.evaluate(()=>{const n=window.innerWidth<768?document.querySelector('.b46fm-preview-mobile .fm-more'):document.querySelector('.b46fm-preview-pc .fm-more');n?.click()});
      await p.waitForFunction(()=>{const e=window.innerWidth<768?document.querySelector('.b46fm-preview-mobile .b46fm'):document.querySelector('.b46fm-preview-pc .b46fm');const original=document.querySelector('.featured-card');return e?.querySelectorAll('.fm-event').length===(e?.querySelector('.fm-eyebrow')?.textContent.includes('DESIGN SAMPLE')?5:original?.querySelectorAll('.feature-events .event-item').length)},{timeout:10000,polling:200});
    }
    assert.deepEqual(errors,[],'JS_RUNTIME_ERRORS '+JSON.stringify(errors));
    await p.screenshot({path:'audit/featured-clean-'+width+'-'+theme+'.png',fullPage:false});
    result.push(a);
    console.log('FEATURED_CLEAN_PREVIEW_BROWSER_PASS',width,theme,JSON.stringify(a));
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
 console.log('FEATURED_CLEAN_PC_MOBILE_RECESSED_WELLS_PREVIEW_SUCCESS',JSON.stringify({url:report.previewUrl,active:report.before.version,previewVersion:uploaded.id,productionPromotions:0,checked:[390,1440]}));
}catch(e){
 report.error=e.stack||String(e);report.success=false;save();
 console.error('FEATURED_CLEAN_PC_MOBILE_PREVIEW_FAILED',report.error);process.exitCode=1;
}
