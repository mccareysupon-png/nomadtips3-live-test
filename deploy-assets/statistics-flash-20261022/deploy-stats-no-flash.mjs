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
const STAT_CSS=readFileSync('stats-no-flash.css','utf8');
const STAT_JS=readFileSync('stats-ready.js','utf8');
assert(V12_JS.includes("data-v12-home")&& !V12_JS.includes("insertBefore(legend"),'V12_LEGEND_SCRIPT_NOT_STABLE');

const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert(ACCOUNT&&TOKEN,'NO_CLOUDFLARE_AUTH');
const SCRIPT='ball46-production',PROD='https://ball46.com',ALIAS='https://www.ball46.com';
const EXPECTED_ACTIVE='3c38c447-c267-42e8-997e-f4ae211ba728';
// Latest English SEO wraps the original V10 Worker. Replace only the exact CSS literal inside the V10 helper.
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const PATHS=['/','/index.html','/expanded-match-343.js','/singlepage-workspace-343.js','/singlepage-workspace-343.css','/featured-facts-premium-20261013a.css','/league-flags-343.js'];
const STYLE_ID='b46-featured-approved-sections-v10-20261021';
const STATS_STYLE_TAG='<style id="b46-statistics-no-old-flash-20261022">'+STAT_CSS+'</style><script id="b46-statistics-ready-20261022">'+STAT_JS+'</script>';
const OLD_STYLE_TAG='<style id="'+STYLE_ID+'">'+PREVIOUS_CSS+'\n'+FAITHFUL_CSS+'\n'+V12_CSS+'</style><script id="b46-featured-faithful-v11-20261021">'+V12_JS+'</script>';
const NEW_STYLE_TAG=OLD_STYLE_TAG+STATS_STYLE_TAG;
const HTML_PATHS=['/','/index.html'];
const hash=v=>createHash('sha256').update(v).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('proof',{recursive:true});
const report={task:'BALL46 Statistics first-render guard: hide old UI until authoritative stats data rendered, PC and mobile. Exact current V12 Worker patch only, no other apps changed.',at:new Date().toISOString()};
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
async function version(v){const d=await api('/workers/workers/'+SCRIPT+'/versions/'+v+'?include=modules');
 assert(d.main_module&&d.modules?.length,'ACTIVE_MODULES_UNREADABLE');return d;}
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
  const d=await get(origin,p);assert.equal(d.status,200,'ASSET_FAILED '+origin+p);result[p]=d;
 }
 return result;
}
function patchWorker(source){
 const from=JSON.stringify(OLD_STYLE_TAG),to=JSON.stringify(NEW_STYLE_TAG);
 assert.equal(source.split(from).length-1,1,'ACTIVE_V12_HTML_STYLE_LITERAL_DRIFT');
 assert(!source.includes('b46-statistics-no-old-flash-20261022'),'STAT_GUARD_ALREADY_PRESENT');
 assert(source.includes('async function __b46ApprovedFeaturedV10'),'ORIGINAL_WORKER_HELPER_MISSING');
 const out=source.replace(from,()=>to);
 assert.equal(out.replace(to,()=>from),source,'UNRELATED_PRODUCTION_WORKER_CODE_CHANGED');
 return out;
}

async function browserQA(domain,phase,patched){
 const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const cases=phase==='before'?[[1440,'dark','statistics'],[390,'dark','statistics']]:
  [[1440,'dark','statistics'],[1440,'light','statistics'],[320,'dark','statistics'],[360,'dark','statistics'],[390,'dark','statistics'],[390,'light','statistics'],[430,'dark','statistics'],[430,'light','statistics'],[390,'dark','all'],[1440,'dark','all']];
 const records=[];
 try{
 for(const [width,mode,view] of cases){
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,180)));
  try{
   await page.setViewport({width,height:965,isMobile:width<768,deviceScaleFactor:1});
   await page.goto(domain+'/?view='+view+'&b46_stat_guard='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
   await page.evaluate(t=>document.documentElement.dataset.theme=t,mode);
   await page.waitForSelector('.workspace.singlepage',{timeout:45000});
   const first=await page.evaluate(()=>{
    const html=document.documentElement,p=document.querySelector('.workspace-panel[data-workspace-panel="statistics"]'),
       content=p?.querySelector(':scope > .sp-stats-content'),
       css=content?getComputedStyle(content):null;
    return {view:document.body.dataset.workspaceView,
      tag:!!document.getElementById('b46-statistics-no-old-flash-20261022'),
      ready:html.getAttribute('data-b46-statistics-render-ready'),
      display:css?.display,
      pseudo:p?getComputedStyle(p,'::after').content:null,
      status:p?.querySelector('[data-sp-feed-state]')?.textContent?.trim().slice(0,170),
      flagCount:window.NOMAD_LEAGUE_FLAGS_343?.iconCount,
      docWidth:document.documentElement.scrollWidth};
   });
   assert.equal(first.tag,patched,'STAT_HTML_INJECTION_MISMATCH');
   if(patched&&view==='statistics'&&first.ready!=='1')
    assert.equal(first.display,'none','OLD_STAT_UI_VISIBLE_BEFORE_RENDER '+JSON.stringify({width,mode,first}));
   if(view==='statistics'){
    await page.waitForFunction(()=>{
      const s=document.querySelector('.workspace-panel[data-workspace-panel="statistics"] [data-sp-feed-state]');
      return /^Updated\b/.test(s?.textContent.trim()||'');
    },{timeout:60000,polling:200});
    await page.waitForFunction(()=>{
      const p=document.querySelector('.workspace-panel[data-workspace-panel="statistics"]'),
         c=p?.querySelector(':scope > .sp-stats-content');
      return c&&getComputedStyle(c).display!=='none'&&!c.hidden;
    },{timeout:12000});
   }else{
    await page.waitForSelector('article.match-row[data-match-id]',{timeout:50000});
   }
   const last=await page.evaluate(()=>{
    const html=document.documentElement,p=document.querySelector('.workspace-panel[data-workspace-panel="statistics"]'),
      content=p?.querySelector(':scope > .sp-stats-content'),
      stat=p?.querySelector('[data-sp-feed-state]'),
      display=content?getComputedStyle(content).display:null,
      kpis=p?.querySelectorAll('.sp-kpi').length,
      body=document.body;
    return {view:body.dataset.workspaceView,ready:html.getAttribute('data-b46-statistics-render-ready'),
      error:html.getAttribute('data-b46-statistics-render-error'),display,kpis,
      status:stat?.textContent.trim().slice(0,190),docWidth:html.scrollWidth,
      originalFeature:!!document.querySelector('.right-rail>.featured-card[data-featured]'),
      originalEventFlow:!!document.querySelector('.expand-flow-card'),
      statPanel:!!p,script:!!document.getElementById('b46-statistics-ready-20261022'),
      flagCount:window.NOMAD_LEAGUE_FLAGS_343?.iconCount,
      statisticsButtons:document.querySelectorAll('[data-stat-market]').length,
      mainCards:document.querySelectorAll('article.match-row[data-match-id]').length};
   });
   assert(last.docWidth<=width+5,'UNEXPECTED_HORIZONTAL_OVERFLOW '+JSON.stringify({width,mode,last}));
   assert(last.originalFeature,'FEATURED_MATCH_UNEXPECTEDLY_REMOVED');
   assert(last.statisticsButtons>=4,'STATISTICS_MARKET_NAV_MISSING');
   if(view==='statistics'){
    assert(last.kpis>=8,'STAT_KPI_CARDS_NOT_RENDERED');
    if(patched)assert(last.ready==='1'&&last.display!=='none'&&last.error===null,'STAT_GUARD_NOT_RELEASED');
   }else{
    assert.equal(last.view,'live','ALL_MATCHES_VIEW_CHANGED');
    assert(last.mainCards>0,'LIVE_MATCH_CARDS_MISSING');
   }
   if(patched&&view==='all'&&width===390){
    // Statistics guard must NOT alter the original mobile All Matches UI.
    // Use the existing native fixture click, not a transient menu animation.
    const existed=await page.evaluate(()=>({
      menu:!!document.querySelector('[data-b46m-open]'),
      fixture:!!document.querySelector('#b46gn-cards [data-b46gn-fixture]'),
      flow:!!document.querySelector('.expand-flow-card'),
      market:!!document.querySelector('.expand-full-market-card')
    }));
    assert(existed.menu&&existed.fixture,'ORIGINAL_MOBILE_ALLMATCHES_MENU_OR_FIXTURE_MISSING '+JSON.stringify(existed));
    // EVENT FLOW exists in the expanded detail only; check it after opening.
    await page.evaluate(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]').click());
    await page.waitForFunction(()=>document.querySelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card[data-featured]'),{timeout:18000,polling:200});
    const flow=await page.evaluate(()=>({
      detail:document.querySelector('#b46gn-detail')?.getAttribute('aria-hidden'),
      facts:document.querySelectorAll('#b46gn-detail .b46gn-featured .featured-card .feature-facts>div').length,
      eventFlow:!!document.querySelector('.expand-flow-card'),fullMarket:!!document.querySelector('.expand-full-market-card'),
      duplicates:document.querySelectorAll('.b46-native-summary,.b46x-live-detail').length
    }));
    assert(flow.detail==='false'&&flow.facts===4&&flow.eventFlow&&flow.fullMarket&&flow.duplicates===0,
      'MOBILE_V12_OR_EVENT_FLOW_REGRESSION '+JSON.stringify(flow));
    console.log('B46_STATISTICS_GUARD_MOBILE_V12_INVARIANTS_PASS',JSON.stringify(flow));
   }
   await page.screenshot({path:'proof/'+phase+'-'+width+'-'+mode+'-'+view+'.png',fullPage:false});
   assert.deepEqual(errors,[],'PAGE_JS_ERRORS '+JSON.stringify(errors));
   console.log('B46_STATS_OLD_UI_FLASH_GUARD_QA_PASS',JSON.stringify({phase,domain,width,mode,view,first,last}));
   records.push({width,mode,view,first,last});
  }finally{await page.close();}
 }
 }finally{await browser.close();}
 return records;
}

let promoted=false,rollbackAttempted=false;
try{
 report.activeBefore=await active();
 assert.equal(report.activeBefore.version,EXPECTED_ACTIVE,'WORKER_CHANGED_FROM_V12_STOP');
 const current=await version(report.activeBefore.version);
 const originalMain=current.modules.find(x=>x.name===current.main_module);
 assert(originalMain,'MAIN_MODULE_NOT_FOUND');
 const source=Buffer.from(originalMain.content_base64,'base64').toString('utf8');
 const modified=patchWorker(source);
 const files=await fetchSet(PROD);
 const originalHtml=await get(PROD,'/');
 assert.equal(originalHtml.status,200,'ORIGINAL_HTML_MISSING');
 assert(originalHtml.bytes.toString('utf8').includes(OLD_STYLE_TAG),'EXACT_V12_STYLE_NOT_LIVE');
 assert(originalHtml.bytes.toString('utf8').includes('b46-featured-faithful-v11-20261021'),'V11_SCRIPT_MISSING');
 assert(!originalHtml.bytes.toString('utf8').includes('b46-statistics-no-old-flash-20261022'),'STAT_GUARD_ALREADY_LIVE');
 report.beforeHtmlHash=originalHtml.hash;
 report.beforeQA=await browserQA(PROD,'before',false);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_PRECHECK');
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'WRONG_WORKER_DOMAINS');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,
   compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
   annotations:{'workers/tag':'B46_STATISTICS_NO_FLASH_20261022','workers/message':'Hide legacy Statistics UI until authoritative statistics updated; preserve all existing apps and V12.'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of current.modules)form.set(m.name,new Blob([m.name===current.main_module?modified:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 report.candidate=uploaded.id;
 const candVersion=await version(uploaded.id);
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
 assert(candidateStr.includes(NEW_STYLE_TAG),'STAT_FLASH_FIX_CANDIDATE_MISSING');
 assert.equal(hash(candidateStr.replace(NEW_STYLE_TAG,OLD_STYLE_TAG)),originalHtml.hash,'CANDIDATE_CHANGED_UNRELATED_HTML_OR_SEO');
 report.candidateQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_CANDIDATE_QA');
 const deploy=await api('/workers/scripts/'+SCRIPT+'/deployments',
  {strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],annotations:{'workers/message':'Fix Statistics old-UI flash at first paint on desktop and mobile; FEATURED V12 and Event Flow unchanged'}});
 promoted=true;report.deployment=deploy.id;save();
 let live=false;
 for(let i=0;i<25;i++){
  const a=await active();
  if(a.version===uploaded.id){live=true;break;}
  assert.equal(a.version,report.activeBefore.version,'UNEXPECTED_WORKER_VERSION_DURING_DEPLOY');await wait(1200);
 }
 assert(live,'DEPLOY_ACCEPTED_NOT_ACTIVE');
 for(const domain of [PROD,ALIAS]){
  let propagated=false;
  for(let i=0;i<25;i++){
   const head=await get(domain,'/');
   if(head.bytes.toString('utf8').includes(NEW_STYLE_TAG)&&hash(head.bytes.toString('utf8').replace(NEW_STYLE_TAG,OLD_STYLE_TAG))===originalHtml.hash){propagated=true;break;}
   assert.equal((await active()).version,uploaded.id,'OTHER_PRODUCTION_VERSION_DURING_EDGE');await wait(1800);
  }
  assert(propagated,'LIVE_EDGE_HAS_OLD_LEAGUE_NAV_JS '+domain);
 }
 const liveFiles=await fetchSet(PROD);
 for(const p of PATHS.filter(p=>!HTML_PATHS.includes(p)))assert.equal(liveFiles[p].hash,files[p].hash,'UNRELATED_PRODUCTION_ASSET_CHANGED '+p);
 const liveHtml=(await get(PROD,'/')).bytes.toString('utf8');
 assert(liveHtml.includes(NEW_STYLE_TAG),'STAT_FLASH_FIX_PRODUCTION_MISSING');
 assert.equal(hash(liveHtml.replace(NEW_STYLE_TAG,OLD_STYLE_TAG)),originalHtml.hash,'LIVE_OTHER_HTML_OR_SEO_CHANGED');
 report.productionQA=await browserQA(PROD,'production',true);
 report.activeAfter=await active();assert.equal(report.activeAfter.version,uploaded.id,'ACTIVE_NOT_PROMOTED_VERSION');
 report.ok=true;save();
 console.log('B46_STATISTICS_NO_OLD_FLASH_PRODUCTION_SUCCESS',JSON.stringify({workerVersion:uploaded.id,previousVersion:report.activeBefore.version,
  statisticsFirstPaintGuarded:true,statisticsDataRendered:true,desktopAndMobileTested:true,featuredV12Preserved:true,seoPreserved:true,scoreboardPreserved:true,flagV8Preserved:true,mobileV6Preserved:true,eventFlowUntouched:true,otherAssetsUnchanged:true,qa:'pass'}));
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
       annotations:{'workers/message':'Auto rollback: Statistics old UI flash guard candidate or production failed QA'}});
     report.rollback='previous_active_requested';break;
    }
    if(a.version!==report.activeBefore.version)break;await wait(900);
   }
  }catch(err){report.rollbackError=String(err);}
 }
 report.rollbackAttempted=rollbackAttempted;save();
 console.error('B46_STATISTICS_NO_OLD_FLASH_DEPLOY_STOP',report.error);
 process.exitCode=1;
}