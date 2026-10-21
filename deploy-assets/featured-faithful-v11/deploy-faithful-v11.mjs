import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {readFileSync} from 'node:fs';
const PREVIOUS_CSS=readFileSync('../featured-sections-v10/approved-sections.css','utf8');
const FAITHFUL_CSS=readFileSync('faithful-v11.css','utf8');
const FAITHFUL_JS=readFileSync('faithful-v11.js','utf8');

const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert(ACCOUNT&&TOKEN,'NO_CLOUDFLARE_AUTH');
const SCRIPT='ball46-production',PROD='https://ball46.com',ALIAS='https://www.ball46.com';
const EXPECTED_ACTIVE='ed2951df-146e-4768-96a1-c3b97d3a2832';
// Latest English SEO wraps the original V10 Worker. Replace only the exact CSS literal inside the V10 helper.
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const PATHS=['/','/index.html','/expanded-match-343.js','/singlepage-workspace-343.js','/singlepage-workspace-343.css','/featured-facts-premium-20261013a.css','/league-flags-343.js'];
const STYLE_ID='b46-featured-approved-sections-v10-20261021';
const OLD_STYLE_TAG='<style id="'+STYLE_ID+'">'+PREVIOUS_CSS+'</style>';
const NEW_STYLE_TAG='<style id="'+STYLE_ID+'">'+PREVIOUS_CSS+'\n'+FAITHFUL_CSS+'</style><script id="b46-featured-faithful-v11-20261021">'+FAITHFUL_JS+'</script>';
const HTML_PATHS=['/','/index.html'];
const hash=v=>createHash('sha256').update(v).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('proof',{recursive:true});
const report={task:'BALL46 V11 faithful approved design of existing FEATURED card: 2 complete signals, 3-column metric headings, team legend, accessible recent events, true approved Soft Light; preserve latest SEO, scoreboard and Event Flow.',at:new Date().toISOString()};
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
 assert.equal(source.split(from).length-1,1,'LIVE_V10_STYLE_LITERAL_NOT_EXACT');
 assert(!source.includes('b46-featured-faithful-v11-20261021'),'V11_ALREADY_INSTALLED');
 assert(source.includes('async function __b46ApprovedFeaturedV10'),'EXISTING_V10_HELPER_NOT_FOUND');
 const out=source.replace(from,()=>to);
 assert.equal(out.replace(to,()=>from),source,'UNRELATED_WORKER_OR_SEO_CODE_CHANGED');
 return out;
}

async function browserQA(domain,phase,patched){
 const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const results=[];
 try{
  const cases=phase==='before'?[[1440,'light','all'],[390,'light','all']]:
   [[1440,'dark','all'],[1440,'light','all'],[1440,'light','statistics'],
    [1280,'dark','signal'],[390,'dark','all'],[390,'light','all'],[320,'dark','all'],[320,'light','all'],[430,'light','all']];
  for(const [width,mode,view] of cases){
   const page=await browser.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e).slice(0,190)));
   try{
    await page.setViewport({width,height:1020,isMobile:width<768,deviceScaleFactor:1});
    await page.goto(domain+'/?view='+view+'&b46_v11qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.body.dataset.theme=t},mode);
    await page.waitForSelector('.featured-card[data-featured]',{timeout:45000});
    await page.waitForFunction(()=>window.NOMAD_LEAGUE_FLAGS_343?.iconCount===143,{timeout:48000});
    if(width<768){
     await page.waitForFunction(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]'),{timeout:49000});
     await page.evaluate(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]')?.click());
     await page.waitForFunction(()=>document.querySelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card'),{timeout:15000});
    }else if(view==='all'){
     const fixture=await page.$('article.match-row[data-match-id]');
     if(fixture)await fixture.click();
    }
    await wait(patched?1900:750);
    const actual=await page.evaluate(()=>{
     const root=innerWidth<768?
       document.querySelector('#b46gn-detail .b46gn-featured .featured-card[data-featured]'):
       document.querySelector('.right-rail > .featured-card[data-featured]');
     if(!root)throw Error('ORIGINAL_FEATURED_MISSING');
     const c=e=>{if(!e)return null;const st=getComputedStyle(e),r=e.getBoundingClientRect();
       return {w:r.width,h:r.height,bg:st.backgroundColor,shadow:st.boxShadow,display:st.display,
        columns:st.gridTemplateColumns,rows:st.gridTemplateRows,pad:st.padding,fg:st.color};};
     const stats=root.querySelector(':scope>.feature-stats'),events=root.querySelector(':scope>.feature-events');
     const signals=root.querySelector(':scope>.feature-signal');
     const wells=[...root.querySelectorAll(':scope>.feature-facts>div')];
     const rs=[...stats.querySelectorAll(':scope>.stat-row')];
     const es=[...events.querySelectorAll(':scope>.event-item')];
     const legend=stats.querySelector(':scope>.b46v11-legend');
     const mains=[...signals.querySelectorAll(':scope>.feature-signal-main')];
     const metas=[...signals.querySelectorAll(':scope>.feature-signal-meta')];
     const v11Css=[...document.querySelectorAll('#b46-featured-approved-sections-v10-20261021')].some(n=>n.textContent.includes('V11 faithful'));
     const v11Script=!!document.getElementById('b46-featured-faithful-v11-20261021');
     const bodyScript=!!window.__b46FeaturedFaithfulV11;
     const direct=[...root.children].map(e=>e.className);
     return {theme:document.documentElement.dataset.theme,
      root:c(root),title:c(root.querySelector('.card-title')),
      score:c(root.querySelector('.feature-score')),
      facts:c(root.querySelector('.feature-facts')),well:wells.map(c),
      signals:c(signals),signalCount:mains.length,signalRenderedCount:signals.getAttribute('data-v11-count'),
      mains:mains.map(c),metas:metas.map(c),
      stats:c(stats),rows:rs.map(c),eventPanel:c(events),eventRows:es.length,
      events:es.slice(0,5).map(e=>({type:e.getAttribute('data-v11-type'),
        label:e.querySelector('span')?.getAttribute('data-v11-event'),
        side:e.querySelector('span')?.getAttribute('data-v11-side')})),
      legendCount:stats.querySelectorAll(':scope>.b46v11-legend').length,
      legendText:legend?.textContent,
      v11Css,v11Script,bodyScript,
      direct,oldClone:document.querySelectorAll('.b46x-live-detail,.b46-native-summary').length,
      oldMatchRows:document.querySelectorAll('article.match-row[data-match-id]').length,
      flow:!!document.querySelector('.expand-flow-card'),market:!!document.querySelector('.expand-full-market-card'),
      mobileOpen:document.querySelector('#b46gn-detail')?.getAttribute('aria-hidden'),
      flagRegistry:window.NOMAD_LEAGUE_FLAGS_343?.iconCount,
      overflow:document.documentElement.scrollWidth>innerWidth+5,
      home:root.querySelector('[data-featured-home]')?.textContent.trim(),
      away:root.querySelector('[data-featured-away]')?.textContent.trim(),
      scoreText:root.querySelector('[data-featured-score]')?.textContent.trim()
     };
    });
    assert(actual.direct.filter(x=>/card-title|feature-score|feature-facts|feature-signal|feature-stats|feature-events/.test(x)).length===6,'ORIGINAL_SIX_SECTIONS_CHANGED');
    assert(actual.well.length===4,'FOUR_MATCH_FACTS_LOST');
    assert(actual.flagRegistry===143,'FLAG_REGISTRY_V8_CHANGED');
    assert(!actual.overflow,'HORIZONTAL_OVERFLOW');
    assert(actual.oldClone===0,'UNREQUESTED_ADDITIONAL_CARD');
    if(width<768)assert(actual.flow&&actual.market&&actual.mobileOpen==='false','MOBILE_ALLMATCHES_EVENT_FLOW_REGRESSION');
    assert(actual.v11Css===patched&&actual.v11Script===patched,'CSS_OR_SCRIPT_TAG_STATE_WRONG');
    if(patched){
     assert(actual.bodyScript,'V11_DECORATOR_NOT_LOADED');
     assert(actual.well.every(x=>x.w>90&&x.h>=60),'INSET_FACT_WELLS_WRONG_SIZE');
     assert(actual.facts.h>=150,'MATCH_FACTS_HEADING_OR_SPACING_MISSING');
     assert(actual.stats.h>=70&&actual.eventPanel.h>=30,'SECTION_PANELS_NOT_VISIBLE');
     assert(actual.stats.bg!=='rgba(0, 0, 0, 0)'&&actual.eventPanel.bg!=='rgba(0, 0, 0, 0)','SECTION_BACKGROUNDS_MISSING');
     assert(actual.signalCount===Number(actual.signalRenderedCount),'ACTIVE_SIGNAL_BADGE_COUNT_WRONG');
     if(actual.rows.length)assert(actual.legendCount===1&&actual.legendText.includes('HOME')&&actual.legendText.includes('AWAY'),'TEAM_LEGEND_MISSING');
     if(actual.eventRows)assert(actual.events.every(e=>!!e.label),'EVENT_LABELS_NOT_NORMALIZED');
     if(mode==='light'){
      assert(/rgb\(248, 251, 248\)/.test(actual.root.bg),'APPROVED_MATTE_LIGHT_CARD_NOT_PRESENT '+actual.root.bg);
      assert(/rgb\(237, 243, 238\)/.test(actual.stats.bg),'APPROVED_SOFT_LIGHT_SECTION_NOT_PRESENT '+actual.stats.bg);
      assert(actual.root.shadow.includes('rgba(34, 74, 48, 0.075)'),'UNWANTED_LIGHT_GLOW '+actual.root.shadow);
     }
     const first=actual.rows[0];
     if(first)assert(first.rows.split(' ').length>=2,'STAT_ROWS_NOT_RESTRUCTURED');
    }
    // Prove the 2-signal approved subcard layout on a QA-only synthetic feed;
    // never inject synthetic signals into Production Worker or deployed web content.
    if(patched&&view==='all'&&[390,1440].includes(width)){
     const m=await page.evaluate(()=>{
      const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):
       document.querySelector('.right-rail > .featured-card');
      const host=root.querySelector('.feature-signal');
      const saved=host.innerHTML;
      const savedState=host.getAttribute('data-b46-stable-signal-state');
      host.innerHTML=[
       '<div class="feature-signal-main"><b>HOME</b><span>1X2 · Full Time</span></div>',
       '<div class="feature-signal-meta"><span>Line —</span><span>Odds 1.57</span><span>Bet365</span></div>',
       '<div class="feature-signal-meta"><span>Signal 21'+String.fromCharCode(39)+'</span><span>Entry 0–0</span><span>Live 80'+String.fromCharCode(39)+' · 2–0</span></div>',
       '<div class="feature-signal-main"><b>OVER</b><span>Corners OVER · Full Time</span></div>',
       '<div class="feature-signal-meta"><span>Line +10.50</span><span>Odds 1.93</span><span>Bet365</span></div>',
       '<div class="feature-signal-meta"><span>Signal 19'+String.fromCharCode(39)+'</span><span>Entry 0–0</span><span>Live 80'+String.fromCharCode(39)+' · 2–0</span></div>'
      ].join('');
      host.setAttribute('data-b46-stable-signal-state','qa-only-no-production-feed');
      host.dataset.v11QARestore=JSON.stringify({saved,savedState});
      return true;
     });
     await page.waitForFunction(()=>{
      const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):
       document.querySelector('.right-rail > .featured-card');
      return root?.querySelector('.feature-signal')?.getAttribute('data-v11-count')==='2' &&
       root.querySelectorAll('.feature-signal-meta[data-v11-kind="metrics"] span[data-v11-label="ODDS"]').length===2;
     },{timeout:8500,polling:100});
     const two=await page.evaluate(()=>{
      const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):document.querySelector('.right-rail > .featured-card');
      const host=root.querySelector('.feature-signal');
      const metrics=[...host.querySelectorAll('.feature-signal-meta[data-v11-kind="metrics"]')];
      const timeline=[...host.querySelectorAll('.feature-signal-meta[data-v11-kind="timeline"]')];
      return {count:Number(host.dataset.v11Count),main:host.querySelectorAll('.feature-signal-main').length,
       metrics:metrics.length,timeline:timeline.length,headings:metrics.map(x=>[...x.children].map(y=>y.dataset.v11Label)),
       values:metrics.map(x=>[...x.children].map(y=>y.dataset.v11Value)),
       actualBg:getComputedStyle(metrics[0]).backgroundColor,
       footerBg:getComputedStyle(timeline[0]).backgroundColor,
       metaDisplay:getComputedStyle(metrics[0]).display};
     });
     assert(two.count===2&&two.main===2&&two.metrics===2&&two.timeline===2,'TWO_SIGNAL_SUBCARDS_NOT_RENDERED '+JSON.stringify(two));
     assert(two.headings.every(x=>x.join('|')==='LINE|ODDS|BOOKMAKER'),'THREE_COLUMN_LABELS_INCOMPLETE '+JSON.stringify(two));
     assert(two.metaDisplay==='grid'&&two.actualBg!=='rgba(0, 0, 0, 0)','SIGNAL_VISUAL_CARD_NOT_VISIBLE');
     console.log('B46_V11_TWO_SIGNAL_BROWSER_ONLY_PASS',JSON.stringify({phase,width,mode,domain,two}));
     if(phase==='candidate')await page.screenshot({path:'proof/'+phase+'-'+width+'-'+mode+'-two-test-signals.png',fullPage:false});
     await page.evaluate(()=>{
      const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):document.querySelector('.right-rail > .featured-card');
      const host=root.querySelector('.feature-signal'),s=JSON.parse(host.dataset.v11QARestore);
      host.innerHTML=s.saved;
      if(s.savedState===null)host.removeAttribute('data-b46-stable-signal-state');else host.setAttribute('data-b46-stable-signal-state',s.savedState);
      delete host.dataset.v11QARestore;
     });
    }
    await page.evaluate(()=>{
     const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):document.querySelector('.right-rail > .featured-card');
     root?.scrollIntoView({block:'start',behavior:'instant'});
     document.querySelector('#b46-data-orbit-loading')?.style.setProperty('display','none','important');
     // Consent overlay hidden in QA browser ONLY (do not change production behavior).
     for(const node of document.querySelectorAll('[role="dialog"],[class*="consent"]')){
       if(node.closest('#b46gn-detail'))continue;
       const st=getComputedStyle(node),r=node.getBoundingClientRect();
       if(st.position==='fixed'&&r.width>innerWidth*.65&&r.height>150)node.style.setProperty('display','none','important');
     }
    });
    await page.screenshot({path:'proof/'+phase+'-'+width+'-'+mode+'-'+view+'.png',fullPage:false});
    assert.deepEqual(errors,[],'LIVE_CLIENT_JAVASCRIPT_ERRORS '+JSON.stringify(errors));
    console.log('B46_FEATURED_FAITHFUL_V11_QA_PASS',JSON.stringify({phase,width,mode,view,domain,
      actual:{root:actual.root,score:actual.scoreText,rows:actual.rows.length,events:actual.eventRows,
       hasTeamLegend:actual.legendCount===1,signals:actual.signalCount,statsBg:actual.stats.bg,panels:actual.direct,flagRegistry:actual.flagRegistry,originalFlow:actual.flow,v11Css:actual.v11Css,documentOverflow:actual.overflow}}));
    results.push({width,mode,view,actual});
   }finally{await page.close();}
  }
 }finally{await browser.close();}
 return results;
}

let promoted=false,rollbackAttempted=false;
try{
 report.activeBefore=await active();
 assert.equal(report.activeBefore.version,EXPECTED_ACTIVE,'WORKER_CHANGED_FROM_LATEST_SEO_STOP');
 const current=await version(report.activeBefore.version);
 const originalMain=current.modules.find(x=>x.name===current.main_module);
 assert(originalMain,'MAIN_MODULE_NOT_FOUND');
 const source=Buffer.from(originalMain.content_base64,'base64').toString('utf8');
 const modified=patchWorker(source);
 const files=await fetchSet(PROD);
 const originalHtml=await get(PROD,'/');
 assert.equal(originalHtml.status,200,'ORIGINAL_HTML_MISSING');
 assert(originalHtml.bytes.toString('utf8').includes(OLD_STYLE_TAG),'APPROVED_V10_STYLE_NOT_LIVE');
 assert(!originalHtml.bytes.toString('utf8').includes('b46-featured-faithful-v11-20261021'),'V11_ALREADY_LIVE');
 report.beforeHtmlHash=originalHtml.hash;
 report.beforeQA=await browserQA(PROD,'before',false);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_PRECHECK');
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'WRONG_WORKER_DOMAINS');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,
   compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
   annotations:{'workers/tag':'B46_FEATURED_FAITHFUL_V11_20261021','workers/message':'Match approved prototype: exact signal subcards labels, legends, events and matte Soft Light. Preserve latest SEO and scoreboard.'}};
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
 assert(candidateStr.includes(NEW_STYLE_TAG),'CANDIDATE_FAITHFUL_V11_MISSING');
 assert.equal(hash(candidateStr.replace(NEW_STYLE_TAG,OLD_STYLE_TAG)),originalHtml.hash,'CANDIDATE_CHANGED_UNRELATED_HTML_OR_SEO');
 report.candidateQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_CANDIDATE_QA');
 const deploy=await api('/workers/scripts/'+SCRIPT+'/deployments',
  {strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],annotations:{'workers/message':'Faithful approved FEATURED card design only, latest SEO and Scoreboard unaffected'}});
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
 assert(liveHtml.includes(NEW_STYLE_TAG),'LIVE_FAITHFUL_V11_NOT_VISIBLE');
 assert.equal(hash(liveHtml.replace(NEW_STYLE_TAG,OLD_STYLE_TAG)),originalHtml.hash,'LIVE_OTHER_HTML_OR_SEO_CHANGED');
 report.productionQA=await browserQA(PROD,'production',true);
 report.activeAfter=await active();assert.equal(report.activeAfter.version,uploaded.id,'ACTIVE_NOT_PROMOTED_VERSION');
 report.ok=true;save();
 console.log('B46_FEATURED_FAITHFUL_V11_PRODUCTION_SUCCESS',JSON.stringify({workerVersion:uploaded.id,previousVersion:report.activeBefore.version,
  faithfulApprovedLayout:true,realThreeColumnSignals:true,realActiveSignalCount:true,teamLegendAndEvents:true,matteSoftLight:true,latestSeoPreserved:true,latestScoreboardPreserved:true,flagV8Preserved:true,mobileV6Preserved:true,eventFlowUntouched:true,otherAssetsUnchanged:true,qa:'pass'}));
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
       annotations:{'workers/message':'Auto rollback: Featured Match V11 exact-approved QA failed'}});
     report.rollback='previous_active_requested';break;
    }
    if(a.version!==report.activeBefore.version)break;await wait(900);
   }
  }catch(err){report.rollbackError=String(err);}
 }
 report.rollbackAttempted=rollbackAttempted;save();
 console.error('B46_FEATURED_FAITHFUL_V11_STOP',report.error);
 process.exitCode=1;
}