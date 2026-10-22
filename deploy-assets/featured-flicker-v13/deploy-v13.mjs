import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {readFileSync} from 'node:fs';
const PREVIOUS_CSS=readFileSync('../featured-sections-v10/approved-sections.css','utf8');
const FAITHFUL_CSS=readFileSync('../featured-faithful-v11/faithful-v11.css','utf8');
const FAITHFUL_JS=readFileSync('../featured-faithful-v11/faithful-v11.js','utf8');
const V12_CSS=readFileSync('../featured-events-v12/stable-events-v12.css','utf8');
const V12_JS=readFileSync('../featured-events-v12/stable-featured-v12.js','utf8');
const STAT_CSS=readFileSync('../statistics-flash-20261022/stats-no-flash.css','utf8');
const STAT_JS=readFileSync('../statistics-flash-20261022/stats-ready.js','utf8');
const GLOBE_CSS=readFileSync('hide-globe.css','utf8');
const GLOBE_STYLE_TAG='<style id="b46-globe-hidden-v13-20261022">'+GLOBE_CSS+'</style>';
import {TARGET,OLD_CONTENT,NEW_CONTENT,OLD_LEAGUE,NEW_LEAGUE,HELPER,patchRenderer} from './feature-stable-patch.mjs';
assert(V12_JS.includes("data-v12-home")&& !V12_JS.includes("insertBefore(legend"),'V12_LEGEND_SCRIPT_NOT_STABLE');

const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert(ACCOUNT&&TOKEN,'NO_CLOUDFLARE_AUTH');
const SCRIPT='ball46-production',PROD='https://ball46.com',ALIAS='https://www.ball46.com';
const EXPECTED_ACTIVE='578fd91b-424f-46c8-8f2b-b104f080cbc5';
// Latest English SEO wraps the original V10 Worker. Replace only the exact CSS literal inside the V10 helper.
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const PATHS=['/','/index.html','/expanded-match-343.js','/singlepage-workspace-343.js','/singlepage-workspace-343.css','/featured-facts-premium-20261013a.css','/league-flags-343.js'];
const STYLE_ID='b46-featured-approved-sections-v10-20261021';
const STATS_STYLE_TAG='<style id="b46-statistics-no-old-flash-20261022">'+STAT_CSS+'</style><script id="b46-statistics-ready-20261022">'+STAT_JS+'</script>';
const OLD_STYLE_TAG='<style id="'+STYLE_ID+'">'+PREVIOUS_CSS+'\n'+FAITHFUL_CSS+'\n'+V12_CSS+'</style><script id="b46-featured-faithful-v11-20261021">'+V12_JS+'</script>';
const PREVIOUS_STYLE_TAG=OLD_STYLE_TAG+STATS_STYLE_TAG;
const NEW_STYLE_TAG=PREVIOUS_STYLE_TAG+GLOBE_STYLE_TAG;
const HTML_PATHS=['/','/index.html'];
const hash=v=>createHash('sha256').update(v).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('proof',{recursive:true});
const report={task:'BALL46 Featured PC/Mobile V13: stop repeatedly rebuilding facts/stats/events and league flags, hide fallback globe icons while preserving real flags, Statistics and V12.',at:new Date().toISOString()};
const save=()=>writeFileSync('proof/report.json',JSON.stringify(report,null,2));
async function api(path,body){
 const r=await fetch(ROOT+path,{method:body?'POST':'GET',
  headers:{Authorization:'Bearer '+TOKEN,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},
  body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined,
  signal:AbortSignal.timeout(60000)});
 const data=await r.json();
 assert(r.ok&&data.success,'CF_API_ERROR '+path+' '+JSON.stringify(data.errors));
 return data.result;
}
async function active(){
 const data=await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1');
 const d=data.deployments[0];
 assert(d?.versions?.length===1&&Number(d.versions[0].percentage)===100,'ACTIVE_WORKER_SPLIT');
 return {version:d.versions[0].version_id,deployment:d.id};
}
async function version(v){
 let last;
 for(let i=0;i<12;i++){
  try{
   const d=await api('/workers/workers/'+SCRIPT+'/versions/'+v+'?include=modules');
   assert(d.main_module&&d.modules?.length,'ACTIVE_MODULES_UNREADABLE');return d;
  }catch(e){
   last=e;
   if(!String(e).includes('code":10071'))throw e;
   console.log('B46_V13_VERSION_NOT_READY_RETRY',JSON.stringify({version:v,attempt:i+1}));
   await wait(1800);
  }
 }
 throw last;
}
async function get(origin,path){
 let last;
 for(let i=0;i<5;i++)try{
  const u=new URL(path,origin);u.searchParams.set('b46_no_flag_flicker',process.env.GITHUB_RUN_ID+'-'+Date.now());
  const r=await fetch(u,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
  const bytes=Buffer.from(await r.arrayBuffer());
  return {status:r.status,bytes,hash:hash(bytes),contentType:r.headers.get('content-type')};
 }catch(e){last=e;await wait(600*(i+1));}
 throw last;
}
async function fetchSet(origin){
 const result={};
 for(const p of PATHS){
  const d=await get(origin,p);
  if(d.status!==200)console.error('B46_V13_BAD_ASSET_RESPONSE',JSON.stringify({origin,path:p,status:d.status,contentType:d.contentType,body:d.bytes.toString('utf8').slice(0,2000)}));
  assert.equal(d.status,200,'ASSET_FAILED '+origin+p);result[p]=d;
 }
 return result;
}
function patchWorker(source){
 const old=JSON.stringify(PREVIOUS_STYLE_TAG),newStyle=JSON.stringify(NEW_STYLE_TAG);
 assert.equal(source.split(old).length-1,1,'CURRENT_STATISTICS_V12_STYLE_LITERAL_DRIFT');
 const from='const original=await __b46StatsLeaguesNavV9(response,path);';
 const to='const original=await __b46StableFeaturedV13(response,path);';
 assert.equal(source.split(from).length-1,1,'V10_ASSET_DISPATCH_DRIFT');
 assert(!source.includes('__b46StableFeaturedV13'),'V13_ALREADY_DEPLOYED');
 const helper='\nasync function __b46StableFeaturedV13(response,path){\n'+
  ' const original=await __b46StatsLeaguesNavV9(response,path);\n'+
  ' if(path!=='+JSON.stringify(TARGET)+'||!original||original.status!==200)return original;\n'+
  ' const input=await original.text();\n'+
  ' const oldLeague='+JSON.stringify(OLD_LEAGUE)+',newLeague='+JSON.stringify(NEW_LEAGUE)+';\n'+
  ' const oldContent='+JSON.stringify(OLD_CONTENT)+',newContent='+JSON.stringify(NEW_CONTENT)+';\n'+
  ' const helper='+JSON.stringify(HELPER)+',marker="function renderFeatured(){";\n'+
  ' if(input.split(oldLeague).length!==2||input.split(oldContent).length!==2||input.split(marker).length!==2)throw Error("FEATURED_V13_SOURCE_DRIFT");\n'+
  ' let output=input.replace(oldLeague,()=>newLeague).replace(oldContent,()=>newContent).replace(marker,()=>helper+"\\n"+marker);\n'+
  ' const h=new Headers(original.headers);h.delete("content-length");h.delete("etag");h.set("Cache-Control","no-store");\n'+
  ' return new Response(output,{status:original.status,statusText:original.statusText,headers:h});\n'+
  '}\n';
 const out=source.replace(old,()=>newStyle).replace(from,()=>to)+helper;
 assert.equal(out.slice(0,-helper.length).replace(to,()=>from).replace(newStyle,()=>old),source,'V13_UNRELATED_WORKER_CODE_CHANGED');
 return out;
}

async function browserQA(domain,phase,patched){
 const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const records=[];
 try{
  const cases=phase==='before'?[[1440,'dark'],[390,'dark']]:
    [[1440,'dark'],[1440,'light'],[390,'dark'],[390,'light'],[320,'dark'],[360,'dark'],[430,'light']];
  for(const [width,theme] of cases){
   const page=await browser.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e).slice(0,180)));
   await page.setViewport({width,height:990,isMobile:width<768,deviceScaleFactor:1});
   try{
    await page.goto(domain+'/?view=all&v13='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await page.waitForSelector('.featured-card[data-featured]',{timeout:48000});
    await page.waitForFunction(()=>window.NOMAD_LEAGUE_FLAGS_343?.iconCount===143,{timeout:46000});
    if(width<768){
     await page.waitForFunction(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]'),{timeout:48000});
     await page.evaluate(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]').click());
     await page.waitForFunction(()=>document.querySelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card'),{timeout:14000});
    }
    await wait(2250);
    await page.evaluate(()=>{
     window.__v13Count={f:0,s:0,e:0,flag:0,all:0};window.__v13Start={};
     const main=document.querySelector('.right-rail > .featured-card[data-featured]');
     const target=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card[data-featured]'):main;
     const stats=target.querySelector('.feature-stats'),facts=target.querySelector('.feature-facts'),events=target.querySelector('.feature-events');
     const detect=(el,key)=>new MutationObserver(ms=>{
      for(const m of ms)if(m.type==='childList'){
       if([...m.removedNodes].some(n=>n.nodeType===1))window.__v13Count[key]++;
      }
     }).observe(el,{childList:true,subtree:true});
     detect(facts,'f');detect(stats,'s');detect(events,'e');
     const league=main.querySelector('[data-featured-league]');detect(league,'flag');
     window.__v13Start={fixture:main.querySelector('[data-featured-home]')?.textContent,
      status:main.querySelector('[data-featured-status]')?.textContent,
      stats:stats.querySelectorAll('.stat-row').length,
      events:events.querySelectorAll('.event-item').length,
      flags:document.querySelectorAll('.league-flag-ready>.league-flag').length,
      visibleGlobe:[...document.querySelectorAll('.league-flag-ready>.league-globe')].filter(n=>getComputedStyle(n).display!=='none').length,
      css:!!document.getElementById('b46-globe-hidden-v13-20261022')};
    });
    await wait(7500);
    const state=await page.evaluate(()=>{
      const main=document.querySelector('.right-rail > .featured-card[data-featured]');
      const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card[data-featured]'):main;
      const stats=root.querySelector('.feature-stats');
      const flag=[...document.querySelectorAll('.league-flag-ready>.league-globe')],known=[...document.querySelectorAll('.league-flag-ready>.league-flag')];
      const ghost=flag.filter(n=>getComputedStyle(n).display!=='none').length;
      const r=root.getBoundingClientRect(),cs=getComputedStyle(root);
      return {start:window.__v13Start,updates:window.__v13Count,
        visibleGlobes:ghost,totalGlobes:flag.length,flagImages:known.length,
        mainLeague:main.querySelector('[data-featured-league]')?.outerHTML.slice(0,450),
        fixture:main.querySelector('[data-featured-home]')?.textContent,
        status:main.querySelector('[data-featured-status]')?.textContent,
        stats:stats.querySelectorAll('.stat-row').length,events:root.querySelectorAll('.feature-events .event-item').length,
        factValues:[...root.querySelectorAll('.feature-facts>div>b')].map(n=>n.textContent),
        factWells:root.querySelectorAll('.feature-facts>div').length,
        tag:!!document.getElementById('b46-globe-hidden-v13-20261022'),
        x:r.x,w:r.width,h:r.height,theme:document.documentElement.dataset.theme,
        v12:document.querySelector('#b46-featured-approved-sections-v10-20261021')?.textContent.includes('V12 | Stabilize V11 team headings'),
        statReadyTag:!!document.getElementById('b46-statistics-no-old-flash-20261022'),
        flagsRegistry:window.NOMAD_LEAGUE_FLAGS_343?.iconCount,
        docWidth:document.documentElement.scrollWidth,
        flow:!!document.querySelector('.expand-flow-card'),
        fullMarket:!!document.querySelector('.expand-full-market-card'),
        duplicate:document.querySelectorAll('.b46x-live-detail,.b46-native-summary').length,
        parentDisplay:cs.display};
    });
    console.log('B46_V13_CANDIDATE_DIAG',JSON.stringify({phase,width,theme,patched,state,errors}).slice(0,12000));
    assert.equal(state.tag,patched,'GLOBE_STYLESHEET_TAG_MISMATCH');
    assert(state.factWells===4&&state.v12&&state.statReadyTag,'FEATURED_V12_OR_STATISTICS_GUARD_REGRESSION');
    if(state.fixture&&state.fixture!=='—'&&state.fixture!=='Select a match'){
     assert(state.flagsRegistry===143&&state.flagImages>=2,'NATIONAL_FLAGS_REGRESSION');
    }else{
     assert(state.flagsRegistry===143,'NATIONAL_FLAGS_REGISTRY_MISSING');
     console.warn('B46_V13_EMPTY_FEATURED_IGNORED_FOR_FLAG_COUNT',JSON.stringify({phase,width,theme,fixture:state.fixture,flagImages:state.flagImages}));
    }
    assert(state.docWidth<=width+5&&state.duplicate===0,'UI_OVERFLOW_OR_ADDED_FEATURED_CARD');
    if(width<768)assert(state.flow&&state.fullMarket,'EVENT_FLOW_OR_MARKET_MISSING');
    if(patched){
     assert(state.visibleGlobes===0,'GLOBE_ICONS_STILL_VISIBLE');
     // Render updates may change numbers; rows/wells must retain their DOM identity.
     assert(state.updates.f<=1,'FEATURED_FACTS_REBUILT_REPEATEDLY '+JSON.stringify(state.updates));
     assert(state.updates.s<=1,'FEATURED_STAT_ROWS_REBUILT_REPEATEDLY '+JSON.stringify(state.updates));
     assert(state.updates.flag<=1,'FEATURED_LEAGUE_FLAG_RERENDERED '+JSON.stringify(state.updates));
     if(state.fixture&&state.fixture!=='—'&&state.fixture!=='Select a match')assert(state.flagImages>=2,'CURRENT_NATIONAL_FLAG_IMAGES_MISSING');
    }
    await page.evaluate(()=>{
      const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):document.querySelector('.right-rail > .featured-card');
      root?.scrollIntoView({block:'center',behavior:'instant'});
      document.querySelector('#b46-data-orbit-loading')?.style.setProperty('display','none','important');
    });
    await page.screenshot({path:'proof/'+phase+'-'+width+'-'+theme+'.png',fullPage:false});
    assert.deepEqual(errors,[],'PAGE_ERRORS '+JSON.stringify(errors));
    console.log('B46_V13_STABLE_FEATURED_FLAG_QA_PASS',JSON.stringify({domain,phase,width,theme,patched,state}));
    records.push({width,theme,state});
   }finally{await page.close();}
  }
 }finally{await browser.close();}
 return records;
}


async function purgeAffectedFilesOnly(){
 const zone='d491ee30b7a87a6c37e6a4dacf00ae8d';
 const files=[];
 for(const domain of [PROD,ALIAS])for(const path of ['/','/index.html',TARGET])files.push(domain+path);
 const url='https://api.cloudflare.com/client/v4/zones/'+zone+'/purge_cache';
 const response=await fetch(url,{method:'POST',
  headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},
  body:JSON.stringify({files}),signal:AbortSignal.timeout(30000)});
 const data=await response.json().catch(()=>({}));
 const record={status:response.status,success:data.success===true,errors:data.errors||[],
  purgedFiles:files};
 report.cachePurge=record;save();
 console.log('B46_V13_PURGE_ONLY_AFFECTED_FILES',JSON.stringify(record));
 if(!response.ok||data.success!==true){
  // The Worker deploy token may lack Zone Cache Purge permission (Cloudflare 10000).
  // Do not count this as success: require the independent public-edge hash checks below
  // for both ball46.com and www.ball46.com, otherwise the rollback guard remains active.
  report.cachePurge.warning='PURGE_DENIED_VERIFY_PUBLIC_EDGE_OR_ROLLBACK';
  save();
  console.warn('B46_V13_CACHE_PURGE_DENIED_EDGE_VERIFICATION_REQUIRED',JSON.stringify(record));
  return false;
}
return true;
}

let promoted=false,rollbackAttempted=false;
try{
 report.activeBefore=await active();
 // Strict read-only control: does the ORIGINAL active version URL fail too?
 const baselinePreview='https://'+EXPECTED_ACTIVE.slice(0,8)+'-'+SCRIPT+'.mccarey-supon.workers.dev';
 const baseline=await get(baselinePreview,'/');
 const baselineText=baseline.bytes.toString('utf8');
 console.log('B46_V13_UNCHANGED_ACTIVE_PREVIEW_BASELINE',JSON.stringify({url:baselinePreview,status:baseline.status,contentType:baseline.contentType,title:baselineText.match(/<title>([^<]+)/i)?.[1]||'',body:baselineText.slice(0,1500)}));
 assert.equal(baseline.status,200,'UNCHANGED_LIVE_VERSION_PREVIEW_FAILED');
 assert.equal(report.activeBefore.version,EXPECTED_ACTIVE,'WORKER_CHANGED_FROM_STAT_GUARD_V12_STOP');
 const current=await version(report.activeBefore.version);
 const originalMain=current.modules.find(x=>x.name===current.main_module);
 assert(originalMain,'MAIN_MODULE_NOT_FOUND');
 const source=Buffer.from(originalMain.content_base64,'base64').toString('utf8');
 const indexed=current.modules.find(m=>m.name==='assets/index.html');
 if(indexed){const raw=Buffer.from(indexed.content_base64,'base64').toString('utf8');
 console.log('B46_V13_CURRENT_VERSION_STATIC_INDEX',JSON.stringify({size:raw.length,hasDark:raw.includes('b46-dark-match-deep-graphite-teal-20261020'),hasInteraction:raw.includes('b46-dark-match-interaction'),hasStatistics:raw.includes('b46-statistics-no-old-flash-20261022'),hash:hash(raw)}));}
 for(const needle of ['MATCH_PATCH_ANCHOR_DRIFT','__b46DarkMatchCard20261020','__b46StatsLeaguesNavV9']){
   const pos=source.indexOf(needle);
   console.log('B46_V13_WORKER_ANCHOR_CONTEXT',JSON.stringify({needle,pos,context:pos<0?'NOT_FOUND':source.slice(Math.max(0,pos-2500),pos+850)}));
 }
 let modified=patchWorker(source);
 // CANDIDATE DIAGNOSTIC ONLY: an already-applied October 20 dark card
 // stylesheet must not be installed a second time. Keep HTML unchanged.
 const guard='if(!html.includes("</body>")||html.includes("b46-dark-match-deep-graphite-teal-20261020"))throw new Error("MATCH_PATCH_ANCHOR_DRIFT");';
 const idempotent='if(html.includes("b46-dark-match-deep-graphite-teal-20261020"))return response;if(!html.includes("</body>"))throw new Error("MATCH_PATCH_ANCHOR_DRIFT");';
 assert.equal(modified.split(guard).length-1,1,'DARK_MATCH_ANCHOR_NOT_UNIQUE');
 modified=modified.replace(guard,idempotent);
 // Original response.text() consumes the stream. The idempotent early return
 // must preserve a readable Response for the next existing Worker transform.
 const darkFn='async function __b46DarkMatchCard20261020(response,path)';
 const darkAt=modified.indexOf(darkFn);
 assert(darkAt>=0,'DARK_CARD_FN_MISSING');
 const darkSection=modified.slice(darkAt,darkAt+1200);
 assert(darkSection.includes('const html=await response.text();'),'DARK_CARD_BODY_READ_CHANGED');
 modified=modified.slice(0,darkAt)+darkSection.replace('const html=await response.text();','const html=await response.clone().text();')+modified.slice(darkAt+darkSection.length);
 console.log('B46_V13_CANDIDATE_DARK_CARD_DUPLICATE_STYLE_GUARD_ISOLATION');
 // CANDIDATE-ONLY exception diagnostic: return a non-200 status with the
 // stack; never promote this diagnostic build to Production.
 const exportAnchors=[...modified.matchAll(/\bexport\s+default\s+/g)];
 assert.equal(exportAnchors.length,1,'DIAGNOSTIC_EXPORT_SHAPE_UNEXPECTED');
 modified=modified.replace(/\bexport\s+default\s+/,'const __b46DiagOriginalWorker = ');
 modified+=String.raw`
export default {
  ...__b46DiagOriginalWorker,
  async fetch(req,env,ctx){
    try{return await __b46DiagOriginalWorker.fetch(req,env,ctx);}
    catch(error){
      const msg=String(error&&error.stack||error).slice(0,1500);
      console.error('B46_V13_CANDIDATE_WORKER_EXCEPTION',msg);
      return new Response('B46_V13_CANDIDATE_EXCEPTION\\n'+msg,{status:599,headers:{'content-type':'text/plain'}});
    }
  }
};
`;
 console.log('B46_V13_EXCEPTION_INSTRUMENTATION_ON_CANDIDATE_ONLY');
 // Differential test: clone the exact active Worker source with NO V13 changes.
 modified=source;
 console.log('B46_V13_IDENTICAL_SOURCE_CLONE_CANDIDATE_TEST',JSON.stringify({sourceHash:hash(source)}));
 assert.equal(source.split('export default ').length-1,1,'CLONE_EXPORT_DEFAULT_NOT_UNIQUE');
 modified=source.replace('export default ','const __b46UntouchedCloneWorker = ');
 modified+=String.raw`
export default {
 ...__b46UntouchedCloneWorker,
 async fetch(req,env,ctx){
   try{return await __b46UntouchedCloneWorker.fetch(req,env,ctx);}
   catch(error){
      const msg=String(error&&error.stack||error).slice(0,2100);
      let assetDiag={};
      try{
        const assetResponse=await env.ASSETS.fetch(req.clone());
        const assetText=await assetResponse.text();
        assetDiag={status:assetResponse.status,length:assetText.length,dark:assetText.includes('b46-dark-match-deep-graphite-teal-20261020'),stat:assetText.includes('b46-statistics-no-old-flash-20261022'),matchRows:assetText.includes('class="match-row'),hashHint:assetText.slice(0,180)};
      }catch(assetError){assetDiag={error:String(assetError)}}
      console.error('B46_V13_UNCHANGED_CLONE_EXCEPTION',msg,JSON.stringify(assetDiag));
      return new Response('B46_V13_UNCHANGED_CLONE_EXCEPTION\\n'+msg+'\\nRAW_ASSET '+JSON.stringify(assetDiag),{status:599,headers:{'content-type':'text/plain'}});
   }
 }
};`;
 console.log('B46_V13_CLONE_CATCH_ONLY',JSON.stringify({originalHash:hash(source)}));
 const files=await fetchSet(PROD);
 const originalAsset=await get(PROD,TARGET);
 assert.equal(originalAsset.status,200,'ORIGINAL_RENDERER_NOT_FOUND');
 const expectedAsset=patchRenderer(originalAsset.bytes.toString('utf8'));
 report.oldRendererHash=originalAsset.hash;report.newRendererHash=hash(expectedAsset);
 const originalHtml=await get(PROD,'/');
 assert.equal(originalHtml.status,200,'ORIGINAL_HTML_MISSING');
 assert(originalHtml.bytes.toString('utf8').includes(OLD_STYLE_TAG),'EXACT_V12_STYLE_NOT_LIVE');
 assert(originalHtml.bytes.toString('utf8').includes('b46-featured-faithful-v11-20261021'),'V11_SCRIPT_MISSING');
 assert(originalHtml.bytes.toString('utf8').includes('b46-statistics-no-old-flash-20261022'),'STAT_GUARD_MISSING');
 assert(!originalHtml.bytes.toString('utf8').includes('b46-globe-hidden-v13-20261022'),'V13_ALREADY_LIVE');
 report.beforeHtmlHash=originalHtml.hash;
 report.beforeQA={skipped:true,reason:'DIAGNOSTIC_ONLY_BASELINE_COPY_NEVER_PROMOTE'};
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_PRECHECK');
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'WRONG_WORKER_DOMAINS');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,
   compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
   annotations:{'workers/tag':'B46_FEATURED_FLAG_STABLE_V13_20261022','workers/message':'Stop repeated Featured DOM rebuilding and hide fallback globes; all active apps and V12 preserved.'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of current.modules)form.set(m.name,new Blob([m.name===current.main_module?modified:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 report.candidate=uploaded.id;
 const candVersion=await version(uploaded.id);
 const digestVersion=d=>({main_module:d.main_module,compatibility_date:d.compatibility_date,
   compatibility_flags:d.compatibility_flags,assets:d.assets,
   modules:d.modules?.map(x=>({name:x.name,type:x.content_type})),
   bindings:d.bindings?.map(x=>({name:x.name,type:x.type})),
   hasTriggers:!!d.triggers});
 console.log('B46_V13_OLD_NEW_VERSION_METADATA_DIFF',JSON.stringify({old:digestVersion(current),clone:digestVersion(candVersion)}).slice(0,14000));
 for(const m of candVersion.modules){
  const old=current.modules.find(x=>x.name===m.name);
  assert(old,'UNKNOWN_WORKER_MODULE '+m.name);
  const actualHash=hash(Buffer.from(m.content_base64,'base64'));
  assert.equal(actualHash,m.name===current.main_module?hash(modified):hash(Buffer.from(old.content_base64,'base64')),'UNRELATED_WORKER_MODULE_CHANGED '+m.name);
 }
 const sub=(await api('/workers/subdomain')).subdomain||'mccarey-supon';
 const preview='https://'+uploaded.id.slice(0,8)+'-'+SCRIPT+'.'+sub+'.workers.dev';
 report.preview=preview;save();
 const candidateFiles=await fetchSet(preview);
 for(const p of PATHS.filter(p=>!HTML_PATHS.includes(p)))assert.equal(candidateFiles[p].hash,files[p].hash,'UNRELATED_ASSET_CHANGED '+p);
 const candidateHtml=await get(preview,'/');
 assert.equal(candidateHtml.status,200,'CANDIDATE_HTML_MISSING');
 const candidateStr=candidateHtml.bytes.toString('utf8');
 assert(candidateStr.includes(NEW_STYLE_TAG),'V13_GLOBE_STYLE_NOT_INSTALLED');
 {
 const restored=candidateStr.replace(NEW_STYLE_TAG,PREVIOUS_STYLE_TAG);
 if(hash(restored)!==originalHtml.hash){
  let i=0;while(i<Math.min(restored.length,originalHtml.bytes.length)&&restored.charCodeAt(i)===originalHtml.bytes.toString('utf8').charCodeAt(i))i++;
  console.log('B46_V13_HTML_DIFF_DIAG',JSON.stringify({candidateLength:candidateStr.length,oldLength:originalHtml.bytes.length,
    restoredLength:restored.length,matchNew:candidateStr.includes(NEW_STYLE_TAG),
    firstMismatch:i,restoredAround:restored.slice(Math.max(0,i-250),i+650),
    originalAround:originalHtml.bytes.toString('utf8').slice(Math.max(0,i-250),i+650),
    oldStyleCount:originalHtml.bytes.toString('utf8').split(PREVIOUS_STYLE_TAG).length-1}));
 }
 assert.equal(hash(restored),originalHtml.hash,'CANDIDATE_CHANGED_UNRELATED_HTML_OR_SEO');
}
 const candidateAsset=await get(preview,TARGET);
 assert.equal(candidateAsset.hash,report.newRendererHash,'V13_RENDERER_ASSET_CANDIDATE_MISMATCH');
 report.candidateQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_CANDIDATE_QA');
 assert.fail('DIAGNOSTIC_ONLY_NO_PRODUCTION_PROMOTION');
 const deploy=await api('/workers/scripts/'+SCRIPT+'/deployments',
  {strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],annotations:{'workers/message':'Stop Featured PC/mobile row remount and flag flicker; no Event Flow or Statistics change'}});
 promoted=true;report.deployment=deploy.id;save();
 let live=false;
 for(let i=0;i<25;i++){
  const a=await active();
  if(a.version===uploaded.id){live=true;break;}
  assert.equal(a.version,report.activeBefore.version,'UNEXPECTED_WORKER_VERSION_DURING_DEPLOY');await wait(1200);
 }
 assert(live,'DEPLOY_ACCEPTED_NOT_ACTIVE');
 await purgeAffectedFilesOnly();
 for(const domain of [PROD,ALIAS]){
  let propagated=false;
  for(let i=0;i<70;i++){
   const head=await get(domain,'/');
   const body=head.bytes.toString('utf8'); const exactNew=body.includes(NEW_STYLE_TAG);
    const restoredHash=exactNew?hash(body.replace(NEW_STYLE_TAG,PREVIOUS_STYLE_TAG)):null;
    if(exactNew&&restoredHash===originalHtml.hash){propagated=true;break;}
    if(i%8===0)console.log('B46_V13_EDGE_PROPAGATION',JSON.stringify({domain,attempt:i+1,
      exactNew,exactOld:body.includes(PREVIOUS_STYLE_TAG),restoredHashMatches:restoredHash===originalHtml.hash,
      receivedHash:head.hash,receivedLength:head.bytes.length,
      workerVersion:(await active()).version}));
   assert.equal((await active()).version,uploaded.id,'OTHER_PRODUCTION_VERSION_DURING_EDGE');await wait(1800);
  }
  assert(propagated,'LIVE_EDGE_NOT_SHOWING_V13_AFTER_TARGETED_CACHE_PURGE '+domain);
 }
 const liveFiles=await fetchSet(PROD);
 for(const p of PATHS.filter(p=>!HTML_PATHS.includes(p)))assert.equal(liveFiles[p].hash,files[p].hash,'UNRELATED_PRODUCTION_ASSET_CHANGED '+p);
 const liveHtml=(await get(PROD,'/')).bytes.toString('utf8');
 assert(liveHtml.includes(NEW_STYLE_TAG),'STAT_FLASH_FIX_PRODUCTION_MISSING');
 assert.equal(hash(liveHtml.replace(NEW_STYLE_TAG,PREVIOUS_STYLE_TAG)),originalHtml.hash,'LIVE_OTHER_HTML_OR_SEO_CHANGED');
 const liveAsset=await get(PROD,TARGET);
 assert.equal(liveAsset.hash,report.newRendererHash,'V13_RENDERER_ASSET_PRODUCTION_MISMATCH');
 report.productionQA=await browserQA(PROD,'production',true);
 report.activeAfter=await active();assert.equal(report.activeAfter.version,uploaded.id,'ACTIVE_NOT_PROMOTED_VERSION');
 report.ok=true;save();
 console.log('B46_V13_FEATURED_FLAGS_PRODUCTION_SUCCESS',JSON.stringify({workerVersion:uploaded.id,previousVersion:report.activeBefore.version,
  featuredRendererStable:true,originalFactNodesPreserved:true,originalFlagNodesPreserved:true,globeIconsHidden:true,statisticsGuardPreserved:true,featuredV12Preserved:true,seoPreserved:true,scoreboardPreserved:true,mobileV6Preserved:true,eventFlowUntouched:true,otherAssetsUnchanged:true,qa:'pass'}));
}catch(e){
 report.error=e.stack||String(e);
 if(promoted&&report.candidate&&report.activeBefore){
  try{
   for(let k=0;k<10;k++){
    const a=await active();
    if(a.version===report.candidate){
     rollbackAttempted=true;
     await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',
       versions:[{version_id:report.activeBefore.version,percentage:100}],
       annotations:{'workers/message':'Auto rollback: V13 Featured flag/signal/UI stability candidate or production failed QA'}});
     report.rollback='previous_active_requested';break;
    }
    if(a.version!==report.activeBefore.version)break;await wait(900);
   }
  }catch(err){report.rollbackError=String(err);}
 }
 report.rollbackAttempted=rollbackAttempted;save();
 console.error('B46_V13_FEATURED_FLAGS_DEPLOY_STOP',report.error);
 process.exitCode=1;
}