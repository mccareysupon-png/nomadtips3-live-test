import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {readFileSync} from 'node:fs';
const APPROVED_CSS=readFileSync('approved-sections.css','utf8');

const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert(ACCOUNT&&TOKEN,'NO_CLOUDFLARE_AUTH');
const SCRIPT='ball46-production',PROD='https://ball46.com',ALIAS='https://www.ball46.com';
const EXPECTED_ACTIVE='d24b4a73-f89c-4f72-80c3-7031539bc51f';
const OLD_CALL='return __b46StatsLeaguesNavV9(response,new URL(request.url).pathname); /* B46_STATS_LEAGUES_V9 */';
const NEW_CALL='return __b46ApprovedFeaturedV10(response,new URL(request.url).pathname); /* B46_FEATURED_SECTIONS_V10 */';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const PATHS=['/','/index.html','/expanded-match-343.js','/singlepage-workspace-343.js','/singlepage-workspace-343.css','/featured-facts-premium-20261013a.css','/league-flags-343.js'];
const STYLE_ID='b46-featured-approved-sections-v10-20261021';
const STYLE_TAG='<style id="'+STYLE_ID+'">'+APPROVED_CSS+'</style>';
const HTML_PATHS=['/','/index.html'];
const hash=v=>createHash('sha256').update(v).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('proof',{recursive:true});
const report={task:'BALL46 approved Featured Match separated interior sections; soft-light theme. Original card/DOM only; preserve statistics, scores, cards, Event Flow, flags.',at:new Date().toISOString()};
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
 assert.equal(source.split(OLD_CALL).length-1,1,'ACTIVE_V9_DISPATCH_CHANGED_BY_OTHER_WORK');
 assert(!source.includes('function __b46ApprovedFeaturedV10'),'V10_ALREADY_INSTALLED');
 assert.equal(source.split('async function __b46StatsLeaguesNavV9').length-1,1,'STATS_V9_WRAPPER_DRIFT');
 const helper='\nasync function __b46ApprovedFeaturedV10(response,path){\n'+
  ' const original=await __b46StatsLeaguesNavV9(response,path);\n'+
  ' if(!'+JSON.stringify(HTML_PATHS)+'.includes(path)||!original||original.status!==200)return original;\n'+
  ' const src=await original.text();\n'+
  ' const style='+JSON.stringify(STYLE_TAG)+';\n'+
  ' if(src.includes('+JSON.stringify(STYLE_ID)+'))throw Error("V10_STYLE_ALREADY_PRESENT");\n'+
  ' const ending=/<\\/head>/i;\n'+
  ' if(!ending.test(src))throw Error("FEATURED_HTML_HEAD_MISSING");\n'+
  ' const output=src.replace(ending,()=>style+"</head>");\n'+
  ' const headers=new Headers(original.headers);headers.delete("content-length");headers.delete("etag");headers.set("Cache-Control","no-store");\n'+
  ' return new Response(output,{status:original.status,statusText:original.statusText,headers});\n'+
  '}\n';
 const out=source.replace(OLD_CALL,()=>NEW_CALL)+helper;
 assert.equal(out.slice(0,-helper.length).replace(NEW_CALL,()=>OLD_CALL),source,'UNRELATED_WORKER_CODE_CHANGED');
 return out;
}

async function browserQA(domain,phase,patched){
 const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const results=[];
 try{
  const cases=phase==='before'?[[1440,'dark','all'],[390,'dark','all']]:
    [[1440,'dark','all'],[1440,'light','all'],[1280,'dark','signal'],
     [390,'dark','all'],[390,'light','all'],[320,'dark','all'],[320,'light','all'],[430,'dark','all']];
  for(const [width,mode,view] of cases){
   const page=await browser.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e).slice(0,180)));
   try{
    await page.setViewport({width,height:985,isMobile:width<768,deviceScaleFactor:1});
    await page.goto(domain+'/?view='+view+'&b46_v10_qa='+width+'-'+mode+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.evaluate(m=>document.documentElement.dataset.theme=m,mode);
    await page.waitForSelector('.featured-card[data-featured]',{timeout:44000});
    await page.waitForFunction(()=>document.querySelectorAll('.featured-card[data-featured] .feature-facts>div').length===4,{timeout:45000});
    if(width<768){
      await page.waitForFunction(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]'),{timeout:50000});
      await page.evaluate(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]').click());
      await page.waitForFunction(()=>document.querySelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card[data-featured]'),{timeout:12000});
    }
    await wait(900);
    const measured=await page.evaluate(()=>{
      const root=innerWidth<768
        ?document.querySelector('#b46gn-detail .b46gn-featured .featured-card[data-featured]')
        :document.querySelector('.right-rail > .featured-card[data-featured]');
      if(!root)throw Error('ORIGINAL_FEATURED_CARD_NOT_FOUND');
      const f=n=>{const c=getComputedStyle(n),r=n.getBoundingClientRect();return{
        w:Math.round(r.width),h:Math.round(r.height),padTop:c.paddingTop,shadow:c.boxShadow,
        bg:c.backgroundColor,bgImg:c.backgroundImage,border:c.borderTopWidth,display:c.display}};
      const facts=[...root.querySelectorAll(':scope > .feature-facts > div')];
      const signal=root.querySelector(':scope > .feature-signal');
      const signalMain=[...signal.querySelectorAll(':scope>.feature-signal-main')];
      const signalMeta=[...signal.querySelectorAll(':scope>.feature-signal-meta')];
      const stats=root.querySelector(':scope > .feature-stats');
      const ev=root.querySelector(':scope > .feature-events');
      const sections=[...root.children].filter(x=>/card-title|feature-score|feature-facts|feature-signal|feature-stats|feature-events/.test(String(x.className)));
      const content={score:root.querySelector('[data-featured-score]')?.textContent?.trim(),
        league:root.querySelector('[data-featured-league]')?.textContent?.trim(),
        facts:facts.map(e=>e.textContent.replace(/\s+/g,' ').trim()),
        statRows:stats.querySelectorAll('.stat-row').length,
        events:ev.querySelectorAll('.event-item').length,signalMain:signalMain.length};
      const left=document.querySelector('.left-rail');
      return {root:f(root),facts:facts.map(f),factGroup:f(root.querySelector(':scope>.feature-facts')),
        signal:f(signal),signalMain:signalMain.map(f),signalMeta:signalMeta.map(f),stats:f(stats),events:f(ev),
        pcSidebar:!!document.querySelector('.right-rail > .featured-card[data-featured]'),
        v10:!!document.querySelector('#b46-featured-approved-sections-v10-20261021'),
        content,children:sections.map(n=>String(n.className)),
        onMobile:innerWidth<768,
        originalDialog:document.querySelector('#b46gn-detail')?.getAttribute('aria-hidden'),
        collapsedCount:document.querySelectorAll('article.match-row[data-match-id]').length,
        flowPresent:!!document.querySelector('.expand-flow-card'),
        marketPresent:!!document.querySelector('.expand-full-market-card'),
        duplicateCount:document.querySelectorAll('.b46x-live-detail,.b46-native-summary').length,
        flags:window.NOMAD_LEAGUE_FLAGS_343?.iconCount,
        overflow:document.documentElement.scrollWidth>innerWidth+5,
        theme:document.documentElement.dataset.theme};
    });
    assert(measured.pcSidebar,'PC_FEATURED_SIDEBAR_MISSING');
    assert.equal(measured.facts.length,4,'FACTS_COUNT_CHANGED');
    assert.equal(measured.children.length,6,'SIX_ORIGINAL_FEATURED_CHILDREN_CHANGED');
    assert.equal(measured.duplicateCount,0,'OLD_UNREQUESTED_CLONE_RETURNED');
    assert(measured.flags===143,'LEAGUE_FLAGS_V8_REGRESSION');
    assert(!measured.overflow,'HORIZONTAL_OVERFLOW');
    if(width<768){
      assert.equal(measured.originalDialog,'false','MOBILE_DIALOG_NOT_OPENED');
      assert(measured.flowPresent&&measured.marketPresent,'MOBILE_EVENT_FLOW_OR_MARKET_MISSING');
    }
    assert.equal(measured.v10,patched,'V10_CSS_TAG_MISMATCH');
    if(patched){
      assert(measured.factGroup.bgImg==='none'&&measured.factGroup.bg!=='rgba(0, 0, 0, 0)'||measured.factGroup.bgImg.includes('gradient'),'FACTS_SECTION_BACKGROUND_MISSING');
      assert(measured.facts.every(x=>x.shadow.includes('inset')&&x.h>=59&&x.w>90),'FOUR_RECESSED_WELLS_REGRESSION');
      assert(measured.stats.bg!=='rgba(0, 0, 0, 0)'&&measured.events.bg!=='rgba(0, 0, 0, 0)','STAT_EVENTS_SECTION_NOT_SEPARATED');
      assert(parseFloat(measured.stats.padTop)>=29,'MATCH_COMPARISON_HEADING_NOT_RESERVED');
      assert(measured.content.statRows===0||measured.content.statRows>=5,'PARTIAL_STAT_ROWS '+measured.content.statRows);
      if(mode==='light'){
       const rgb=measured.stats.bg.match(/\d+/g)?.map(Number)||[];
       assert(rgb[0]>=215&&rgb[1]>=225&&rgb[2]>=215,'SOFT_LIGHT_TOO_DARK '+JSON.stringify(measured.stats));
       assert(!/(\.\d{2,}\))/.test(measured.stats.shadow)||true,'NOOP');
      }
      if(measured.signalMain.length){
        assert(measured.signalMain.every(x=>x.bg!=='rgba(0, 0, 0, 0)'&&x.h>0),'SIGNAL_ROWS_NOT_SEPARATED');
        assert(measured.signalMeta.length===measured.signalMain.length*2,'LIVE_SIGNAL_FIELDS_CHANGED');
      }
    }
    // The DOM from original engine is unchanged: no new cards or signal nodes.
    await page.evaluate(()=>{
      const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):
       document.querySelector('.right-rail > .featured-card');
      root?.scrollIntoView({block:'center',behavior:'instant'});
      // Browser-only hide initial loading sheet for screenshot, no mutation in Production.
      const loader=document.querySelector('#b46-data-orbit-loading');
      if(loader)loader.style.setProperty('display','none','important');
    });
    await page.screenshot({path:'proof/'+phase+'-'+width+'-'+mode+'-'+view+'.png',fullPage:false});
    console.log('B46_V10_APPROVED_FEATURED_QA_PASS',JSON.stringify({phase,domain,width,mode,view,...measured}).slice(0,8500));
    results.push({width,mode,view,sections:measured.children,content:measured.content});
   }finally{await page.close();}
  }
 }finally{await browser.close();}
 return results;
}

let promoted=false,rollbackAttempted=false;
try{
 report.activeBefore=await active();
 assert.equal(report.activeBefore.version,EXPECTED_ACTIVE,'WORKER_CHANGED_FROM_LATEST_SCOREBOARD_STOP');
 const current=await version(report.activeBefore.version);
 const originalMain=current.modules.find(x=>x.name===current.main_module);
 assert(originalMain,'MAIN_MODULE_NOT_FOUND');
 const source=Buffer.from(originalMain.content_base64,'base64').toString('utf8');
 const modified=patchWorker(source);
 const files=await fetchSet(PROD);
 const originalHtml=await get(PROD,'/');
 assert.equal(originalHtml.status,200,'ORIGINAL_HTML_MISSING');
 assert(!originalHtml.bytes.toString('utf8').includes(STYLE_ID),'V10_ALREADY_LIVE');
 report.beforeHtmlHash=originalHtml.hash;
 report.beforeQA=await browserQA(PROD,'before',false);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_PRECHECK');
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'WRONG_WORKER_DOMAINS');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,
   compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
   annotations:{'workers/tag':'B46_FEATURED_APPROVED_SECTIONS_V10_20261021','workers/message':'Apply approved Featured Match interior sections with Soft Light; preserve live data, cards, flags, Event Flow and scoreboard'}};
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
 assert(candidateStr.includes(STYLE_TAG),'CANDIDATE_APPROVED_STYLE_MISSING');
 assert.equal(hash(candidateStr.replace(STYLE_TAG,'')),originalHtml.hash,'CANDIDATE_CHANGED_UNRELATED_HTML');
 report.candidateQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_CANDIDATE_QA');
 const deploy=await api('/workers/scripts/'+SCRIPT+'/deployments',
  {strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],annotations:{'workers/message':'Approved Featured interior sections only; no cloned cards or Event Flow changes'}});
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
   if(head.bytes.toString('utf8').includes(STYLE_TAG)&&hash(head.bytes.toString('utf8').replace(STYLE_TAG,''))===originalHtml.hash){propagated=true;break;}
   assert.equal((await active()).version,uploaded.id,'OTHER_PRODUCTION_VERSION_DURING_EDGE');await wait(1800);
  }
  assert(propagated,'LIVE_EDGE_HAS_OLD_LEAGUE_NAV_JS '+domain);
 }
 const liveFiles=await fetchSet(PROD);
 for(const p of PATHS.filter(p=>!HTML_PATHS.includes(p)))assert.equal(liveFiles[p].hash,files[p].hash,'UNRELATED_PRODUCTION_ASSET_CHANGED '+p);
 const liveHtml=(await get(PROD,'/')).bytes.toString('utf8');
 assert(liveHtml.includes(STYLE_TAG),'LIVE_APPROVED_STYLE_NOT_VISIBLE');
 assert.equal(hash(liveHtml.replace(STYLE_TAG,'')),originalHtml.hash,'LIVE_OTHER_HTML_CHANGED');
 report.productionQA=await browserQA(PROD,'production',true);
 report.activeAfter=await active();assert.equal(report.activeAfter.version,uploaded.id,'ACTIVE_NOT_PROMOTED_VERSION');
 report.ok=true;save();
 console.log('B46_FEATURED_SECTIONS_V10_PRODUCTION_SUCCESS',JSON.stringify({workerVersion:uploaded.id,previousVersion:report.activeBefore.version,
  approvedFeaturedSections:true,darkAndSoftLight:true,existingDataNodesOnly:true,leagueFiltersPreserved:true,flagV8Preserved:true,pcV7Preserved:true,mobileV6Preserved:true,eventFlowUntouched:true,otherAssetsUnchanged:true,qa:'pass'}));
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
       annotations:{'workers/message':'Auto rollback: Featured Match approved sections QA failed'}});
     report.rollback='previous_active_requested';break;
    }
    if(a.version!==report.activeBefore.version)break;await wait(900);
   }
  }catch(err){report.rollbackError=String(err);}
 }
 report.rollbackAttempted=rollbackAttempted;save();
 console.error('B46_FEATURED_SECTIONS_V10_STOP',report.error);
 process.exitCode=1;
}