import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {readFileSync} from 'node:fs';
const PREVIOUS_CSS=readFileSync('../featured-sections-v10/approved-sections.css','utf8');
const FAITHFUL_CSS=readFileSync('../featured-faithful-v11/faithful-v11.css','utf8');
const FAITHFUL_JS=readFileSync('../featured-faithful-v11/faithful-v11.js','utf8');
const V12_CSS=readFileSync('stable-events-v12.css','utf8');
const V12_JS=readFileSync('stable-featured-v12.js','utf8');
assert(V12_JS.includes("data-v12-home")&& !V12_JS.includes("insertBefore(legend"),'V12_LEGEND_SCRIPT_NOT_STABLE');

const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert(ACCOUNT&&TOKEN,'NO_CLOUDFLARE_AUTH');
const SCRIPT='ball46-production',PROD='https://ball46.com',ALIAS='https://www.ball46.com';
const EXPECTED_ACTIVE='856dcb53-e5e6-49ca-8b3f-0ad936963986';
// Latest English SEO wraps the original V10 Worker. Replace only the exact CSS literal inside the V10 helper.
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const PATHS=['/','/index.html','/expanded-match-343.js','/singlepage-workspace-343.js','/singlepage-workspace-343.css','/featured-facts-premium-20261013a.css','/league-flags-343.js'];
const STYLE_ID='b46-featured-approved-sections-v10-20261021';
const OLD_STYLE_TAG='<style id="'+STYLE_ID+'">'+PREVIOUS_CSS+'\n'+FAITHFUL_CSS+'</style><script id="b46-featured-faithful-v11-20261021">'+FAITHFUL_JS+'</script>';
const NEW_STYLE_TAG='<style id="'+STYLE_ID+'">'+PREVIOUS_CSS+'\n'+FAITHFUL_CSS+'\n'+V12_CSS+'</style><script id="b46-featured-faithful-v11-20261021">'+V12_JS+'</script>';
const HTML_PATHS=['/','/index.html'];
const hash=v=>createHash('sha256').update(v).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('proof',{recursive:true});
const report={task:'BALL46 V12: stop Featured full-card flicker from native stats redraw vs V11 DOM-inserted legend, and restore compact Recent Events one-row layout. Existing data / Event Flow / main cards unchanged.',at:new Date().toISOString()};
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
 assert.equal(source.split(from).length-1,1,'CURRENT_V11_EXACT_LITERAL_NOT_FOUND');
 assert(!source.includes('V12 | Stabilize V11 team headings'),'V12_ALREADY_INSTALLED');
 assert(source.includes('async function __b46ApprovedFeaturedV10'),'V10_HELPER_MISSING');
 const out=source.replace(from,()=>to);
 assert.equal(out.replace(to,()=>from),source,'UNRELATED_SEO_WORKER_CODE_CHANGED');
 return out;
}

async function browserQA(domain,phase,patched){
 const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const results=[];
 try{
 const cases=phase==='before'?[[1440,'dark'],[390,'dark']]:
  [[1440,'dark'],[1440,'light'],[390,'dark'],[390,'light'],[320,'dark'],[430,'light']];
 for(const [width,theme] of cases){
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,220)));
  try{
   await page.setViewport({width,height:1000,isMobile:width<768,deviceScaleFactor:1});
   await page.goto(domain+'/?view=all&b46_v12='+width+'-'+theme+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await page.waitForSelector('.featured-card[data-featured]',{timeout:43000});
   await page.waitForFunction(()=>window.NOMAD_LEAGUE_FLAGS_343?.iconCount===143,{timeout:46000});
   if(width<768){
    await page.waitForFunction(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]'),{timeout:50000});
    await page.evaluate(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]')?.click());
    await page.waitForSelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card[data-featured]',{timeout:16000});
   }else{
    const r=await page.$('article.match-row[data-match-id]');if(r)await r.click();
   }
   await wait(patched?1350:650);
   const state=await page.evaluate(()=>{
    const root=innerWidth<768?
     document.querySelector('#b46gn-detail .b46gn-featured .featured-card[data-featured]'):
     document.querySelector('.right-rail > .featured-card[data-featured]');
    if(!root)throw Error('ORIGINAL_FEATURED_MISSING');
    const stats=root.querySelector(':scope>.feature-stats');
    const events=root.querySelector(':scope>.feature-events');
    const rs=[...events.querySelectorAll(':scope>.event-item')];
    const rows=rs.map(row=>{
      const time=row.querySelector('time'),label=row.querySelector('span');
      const r=row.getBoundingClientRect(),t=time?.getBoundingClientRect(),s=label?.getBoundingClientRect();
      const dot=getComputedStyle(row,'::before');
      return {text:row.textContent.slice(0,120),h:r.height,display:getComputedStyle(row).display,
       gridRows:getComputedStyle(row).gridTemplateRows,dotGridRow:dot.gridRow,
       timeMid:t?(t.top+t.bottom)/2:null,spanMid:s?(s.top+s.bottom)/2:null,
       spanDisplay:label?getComputedStyle(label).display:null,
       spanColumns:label?getComputedStyle(label).gridTemplateColumns:null};
    });
    const a=root.getBoundingClientRect(),rStats=stats.getBoundingClientRect();
    const flow=!!document.querySelector('.expand-flow-card');
    const market=!!document.querySelector('.expand-full-market-card');
    const cssTag=document.getElementById('b46-featured-approved-sections-v10-20261021');
    return {
      score:root.querySelector('[data-featured-score]')?.textContent.trim(),
      root:{w:a.width,h:a.height,display:getComputedStyle(root).display},
      facts:root.querySelectorAll(':scope>.feature-facts>div').length,
      direct:[...root.children].map(x=>x.className),
      statsRows:stats.querySelectorAll(':scope>.stat-row').length,
      statsH:rStats.height,oldLegend:stats.querySelectorAll(':scope>.b46v11-legend').length,
      home:stats.dataset.v12Home||null,away:stats.dataset.v12Away||null,
      beforePseudo:getComputedStyle(stats,'::before').content,
      afterPseudo:getComputedStyle(stats,'::after').content,
      eventRows:rows,
      hasV12:!!cssTag?.textContent.includes('V12 | Stabilize V11 team headings'),
      signalMains:root.querySelectorAll('.feature-signal-main').length,
      flow,market,flagCount:window.NOMAD_LEAGUE_FLAGS_343?.iconCount,
      duplicateCards:document.querySelectorAll('.b46x-live-detail,.b46-native-summary').length,
      docWidth:document.documentElement.scrollWidth,
      mobile:innerWidth<768,detailOpen:document.querySelector('#b46gn-detail')?.getAttribute('aria-hidden'),
      eventFlowRowCount:document.querySelectorAll('.expand-flow-card').length,
      mobileMainRowCount:document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]').length,
      theme:document.documentElement.dataset.theme
    };
   });
   assert(state.facts===4,'FOUR_FACTS_MISSING');
   assert(state.direct.filter(c=>/card-title|feature-score|feature-facts|feature-signal|feature-stats|feature-events/.test(c)).length===6,'ORIGINAL_SIX_SECTIONS_CHANGED');
   assert(state.flagCount===143,'FLAG_RENDER_REGRESSION');
   assert(state.duplicateCards===0,'NEW_CARD_CLONE_DETECTED');
   assert(state.docWidth<=width+5,'HORIZONTAL_OVERFLOW');
   if(width<768)assert(state.detailOpen==='false'&&state.flow&&state.market,'MOBILE_ALLMATCHES_OR_EVENT_FLOW_CHANGED');
   assert(state.hasV12===patched,'V12_STYLE_NOT_EXPECTED');
   if(patched){
     assert(state.oldLegend===0,'V11_DOM_LEGEND_STILL_RECREATED');
     assert(state.home&&state.away,'PERSISTENT_TEAM_LABELS_MISSING');
     assert(state.beforePseudo.includes('MATCH COMPARISON')&&state.beforePseudo.includes('HOME')&&state.afterPseudo.includes('LIVE STATS'),'PERSISTENT_TEAM_LABELS_NOT_DRAWN');
     if(state.eventRows.length){
      assert(state.eventRows.every(x=>x.h<=39&&x.h>=24),'RECENT_EVENTS_STILL_MULTILINE '+JSON.stringify(state.eventRows));
      assert(state.eventRows.every(x=>x.display==='grid'&&x.spanDisplay==='flex'&&Math.abs(x.timeMid-x.spanMid)<=5),'EVENT_MINUTE_AND_TEXT_NOT_ALIGNED '+JSON.stringify(state.eventRows));
     }
     // Reproduce native engine's destructive stats refresh in this test browser.
     // Identical rows must never cause a 37px card-height jump.
     const stability=await page.evaluate(async()=>{
      const root=innerWidth<768?
        document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):
        document.querySelector('.right-rail > .featured-card');
      const stats=root.querySelector('.feature-stats');
      const backup=stats.innerHTML;
      const sample='<div class="stat-row"><b>3</b><span>Shots on target</span><div class="stat-track home"><i style="width:40%"></i></div><div class="stat-track away"><i style="width:55%"></i></div><b>5</b></div>';
      const text=backup.includes('stat-row')?backup.replace(/<div class="b46v11-legend"[\s\S]*?<\/div>/g,''):sample;
      stats.innerHTML=text;
      await new Promise(resolve=>setTimeout(resolve,1250));
      const a=[];
      for(let n=0;n<6;n++){
       stats.innerHTML=text;
       await new Promise(resolve=>setTimeout(resolve,55));
       a.push({height:stats.getBoundingClientRect().height,legend:stats.querySelectorAll('.b46v11-legend').length,
        before:getComputedStyle(stats,'::before').content,home:stats.dataset.v12Home});
       await new Promise(resolve=>setTimeout(resolve,160));
      }
      // Restore only test-browser snapshot; never persisted or sent to Production.
      stats.innerHTML=backup;
      return a;
     });
     const delta=Math.max(...stability.map(x=>x.height))-Math.min(...stability.map(x=>x.height));
     assert(delta<=3,'STATS_CARD_STILL_JUMPS_ON_IDENTICAL_DATA '+JSON.stringify(stability));
     assert(stability.every(x=>x.legend===0),'V11_LEGEND_CYCLE_STILL_ACTIVE '+JSON.stringify(stability));
     console.log('B46_V12_STABILITY_QA_PASS',JSON.stringify({domain,phase,width,theme,delta,stability}));
   }
   await page.evaluate(()=>{
      const root=innerWidth<768?
       document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):
       document.querySelector('.right-rail>.featured-card');
      root?.querySelector('.feature-events')?.scrollIntoView({block:'center',behavior:'instant'});
      document.querySelector('#b46-data-orbit-loading')?.style.setProperty('display','none','important');
   });
   await page.screenshot({path:'proof/'+phase+'-'+width+'-'+theme+'.png',fullPage:false});
   assert.deepEqual(errors,[],'CLIENT_JS_ERROR '+JSON.stringify(errors));
   console.log('B46_V12_BROWSER_PASS',JSON.stringify({domain,phase,width,theme,patched,
    state:{events:state.eventRows.length,eventHeights:state.eventRows.map(x=>x.h),
     statsH:state.statsH,home:state.home,away:state.away,legend:state.oldLegend,
     signalMains:state.signalMains,flow:state.flow,market:state.market}}));
   results.push({width,theme,state});
  }finally{await page.close();}
 }
 }finally{await browser.close();}
 return results;
}

let promoted=false,rollbackAttempted=false;
try{
 report.activeBefore=await active();
 assert.equal(report.activeBefore.version,EXPECTED_ACTIVE,'WORKER_CHANGED_FROM_LIVE_V11_STOP');
 const current=await version(report.activeBefore.version);
 const originalMain=current.modules.find(x=>x.name===current.main_module);
 assert(originalMain,'MAIN_MODULE_NOT_FOUND');
 const source=Buffer.from(originalMain.content_base64,'base64').toString('utf8');
 const modified=patchWorker(source);
 const files=await fetchSet(PROD);
 const originalHtml=await get(PROD,'/');
 assert.equal(originalHtml.status,200,'ORIGINAL_HTML_MISSING');
 assert(originalHtml.bytes.toString('utf8').includes(OLD_STYLE_TAG),'EXACT_V11_STYLE_NOT_LIVE');
 assert(originalHtml.bytes.toString('utf8').includes('b46-featured-faithful-v11-20261021'),'V11_SCRIPT_MISSING');
 assert(!originalHtml.bytes.toString('utf8').includes('V12 | Stabilize V11 team headings'),'V12_ALREADY_LIVE');
 report.beforeHtmlHash=originalHtml.hash;
 report.beforeQA=await browserQA(PROD,'before',false);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_PRECHECK');
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'WRONG_WORKER_DOMAINS');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,
   compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
   annotations:{'workers/tag':'B46_FEATURED_EVENTS_STABLE_V12_20261021','workers/message':'Stop Featured card legend flicker and compact Recent Events in existing card; preserve SEO, Scoreboard and Event Flow.'}};
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
 assert(candidateStr.includes(NEW_STYLE_TAG),'CANDIDATE_STABLE_V12_MISSING');
 assert.equal(hash(candidateStr.replace(NEW_STYLE_TAG,OLD_STYLE_TAG)),originalHtml.hash,'CANDIDATE_CHANGED_UNRELATED_HTML_OR_SEO');
 report.candidateQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_CANDIDATE_QA');
 const deploy=await api('/workers/scripts/'+SCRIPT+'/deployments',
  {strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],annotations:{'workers/message':'Stable Featured legend and single-row Events only; SEO and Event Flow unchanged'}});
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
 assert(liveHtml.includes(NEW_STYLE_TAG),'LIVE_STABLE_V12_NOT_VISIBLE');
 assert.equal(hash(liveHtml.replace(NEW_STYLE_TAG,OLD_STYLE_TAG)),originalHtml.hash,'LIVE_OTHER_HTML_OR_SEO_CHANGED');
 report.productionQA=await browserQA(PROD,'production',true);
 report.activeAfter=await active();assert.equal(report.activeAfter.version,uploaded.id,'ACTIVE_NOT_PROMOTED_VERSION');
 report.ok=true;save();
 console.log('B46_FEATURED_EVENTS_STABLE_V12_PRODUCTION_SUCCESS',JSON.stringify({workerVersion:uploaded.id,previousVersion:report.activeBefore.version,
  v11StatsLegendFlickerRemoved:true,eventsCompactOneRow:true,liveStatDataIntact:true,existingFeaturedCardOnly:true,seoPreserved:true,scoreboardPreserved:true,flagV8Preserved:true,mobileV6Preserved:true,eventFlowUntouched:true,otherAssetsUnchanged:true,qa:'pass'}));
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
       annotations:{'workers/message':'Auto rollback: Featured card flicker V12 live verification failed'}});
     report.rollback='previous_active_requested';break;
    }
    if(a.version!==report.activeBefore.version)break;await wait(900);
   }
  }catch(err){report.rollbackError=String(err);}
 }
 report.rollbackAttempted=rollbackAttempted;save();
 console.error('B46_FEATURED_EVENTS_STABLE_V12_STOP',report.error);
 process.exitCode=1;
}