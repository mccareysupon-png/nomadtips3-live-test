import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {PNG} from 'pngjs';

/* BALL46 — enable ORIGINAL Featured Match on mobile, with 4 inset fact wells.
   Preserve exact active Worker base, modules, assets, bindings and rendering.
   No new UI, no different repository, no stale/preview rollback. */
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const SCRIPT='ball46-production';
const PROD='https://ball46.com';
const ALIAS='https://www.ball46.com';
const ID='b46-native-featured-mobile-20261021';
const OLD_STYLE='<style id="'+ID+'">'+readFileSync('../featured-mobile-native-20261021/native-mobile-v3.css','utf8')+'</style>';
const NEW_STYLE='<style id="'+ID+'">'+readFileSync('expanded-only.css','utf8')+'</style><script id="b46-expanded-only-v4">'+readFileSync('expanded-only.js','utf8')+'</script>';
const EXPECTED_ACTIVE='3e2ca9f5-0f68-4b7d-af22-7b594ddf1596';

assert(ACCOUNT&&TOKEN,'CLOUDFLARE_ACCESS_NOT_CONFIGURED');
const root='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const sha=v=>createHash('sha256').update(v).digest('hex');
mkdirSync('proof',{recursive:true});
const record={task:'BALL46 V4: restore no mobile standalone featured; show only inside actual expanded match, preserving Event Flow and collapsed row',created:new Date().toISOString(),sha:process.env.GITHUB_SHA,changes:[]};
const save=()=>writeFileSync('proof/report.json',JSON.stringify(record,null,2));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,body){
 const req={method:body?'POST':'GET',headers:{Authorization:'Bearer '+TOKEN,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(65000)};
 if(body)req.body=body instanceof FormData?body:JSON.stringify(body);
 const response=await fetch(root+path,req);
 const data=await response.json();
 assert(response.ok&&data.success===true,'CLOUDFLARE_API_FAILED '+path+' '+JSON.stringify(data.errors));
 return data.result;
}
async function active(){
 const d=(await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments[0];
 assert(d&&d.versions?.length===1&&Number(d.versions[0].percentage)===100,'WORKER_ACTIVE_SPLIT_OR_INVALID');
 return {version:d.versions[0].version_id,deployment:d.id};
}
async function readVersion(id){
 const v=await api('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
 assert(v.main_module&&v.modules?.length,'ACTIVE_WORKER_MODULES_NOT_FOUND');
 return v;
}
async function get(base,path){
 let last;
 for(let attempt=0;attempt<5;attempt++){
  try{
   const url=new URL(path,base);
   url.searchParams.set('b46removefeatured',process.env.GITHUB_RUN_ID+'-'+Date.now()+'-'+attempt);
   const r=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(40000)});
   const bytes=Buffer.from(await r.arrayBuffer());
   return {status:r.status,bytes,hash:sha(bytes)};
  }catch(e){last=e;console.log('RETRY_EDGE_FETCH',base,path,attempt,String(e));if(attempt<4)await pause(1800*(attempt+1));}
 }
 throw new Error('EDGE_FETCH_FAILED '+base+path+': '+String(last));
}
const PATHS=['/','/index.html','/dashboard-v2-stage3-featured-facts-20261013a.js','/featured-facts-premium-20261013a.css','/singlepage-workspace-343.css','/singlepage-workspace-343.js'];
async function readFiles(base){
 const r={};
 for(const p of PATHS){r[p]=await get(base,p);assert.equal(r[p].status,200,'LIVE_ASSET_FAILED '+base+p);}
 return r;
}
function changeHtml(html){
 assert(html.includes('</head>')&&html.includes('featured-card'),'BASELINE_HTML_UNEXPECTED');
 assert.equal(html.split(OLD_STYLE).length-1,1,'EXPECTED_OLD_NATIVE_MOBILE_STYLE_ONCE');
 assert(!html.includes(NEW_STYLE),'V2_ALREADY_PRESENT');
 assert(!html.includes('b46-featured-clean-recessed-production-20261021-style'),'OLDER_OVERLAY_STILL_PRESENT');
 return html.replace(OLD_STYLE,NEW_STYLE);
}
function patch(source){
 const oldQuoted=JSON.stringify(OLD_STYLE),newQuoted=JSON.stringify(NEW_STYLE);
 assert.equal(source.split(oldQuoted).length-1,1,'WORKER_OLD_STYLE_LITERAL_NOT_EXACTLY_ONCE');
 assert(source.includes('__b46NativeFeaturedMobile20261021'),'LIVE_NATIVE_MOBILE_WRAPPER_MISSING');
 assert(!source.includes(newQuoted),'V2_WORKER_ALREADY_ACTIVE');
 const updated=source.replace(oldQuoted,newQuoted);
 assert.equal(updated.replace(newQuoted,oldQuoted),source,'UNRELATED_WORKER_CODE_CHANGED');
 return updated;
}
async function browserQA(domain,prefix,newDesign){
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
 assert(chrome,'CHROME_NOT_FOUND');
 const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:['--no-sandbox']});
 const result=[];
 try {
  for(const [width,theme] of [[320,'dark'],[360,'dark'],[390,'dark'],[390,'light'],[430,'dark'],[1440,'dark'],[1440,'light']]) {
   const page=await browser.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e).slice(0,180)));
   try{
    await page.setViewport({width,height:950,isMobile:width<768,deviceScaleFactor:1});
    await page.setCacheEnabled(false);
    await page.goto(domain+'/?view=live&b46_v4_qa='+width+'-'+theme+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await page.waitForFunction(()=>document.querySelector('.featured-card[data-featured]')&&document.querySelector('.workspace.singlepage'),{timeout:45000,polling:250});
    await pause(1400);
    const initial=await page.evaluate(()=>{
      const src=document.querySelector('.featured-card[data-featured]');
      const rail=src.closest('.right-rail');
      const r=src.getBoundingClientRect(),rr=rail.getBoundingClientRect();
      return {featuredWidth:r.width,railWidth:rr.width,railDisplay:getComputedStyle(rail).display,extraInfoCount:document.querySelectorAll('.b46x-live-detail').length,
       hasStyle:!!document.getElementById('b46-native-featured-mobile-20261021'),hasNewScript:!!document.getElementById('b46-expanded-only-v4'),
       docWidth:document.documentElement.scrollWidth,mainBoardExists:!!document.querySelector('.main-board')};
    });
    assert(initial.mainBoardExists,'MAIN_BOARD_MISSING');
    assert.equal(initial.extraInfoCount,0,'UNREQUESTED_VISIBLE_CARD_ON_LOAD');
    assert(initial.hasStyle,'NATIVE_STYLE_MISSING');
    assert.equal(initial.hasNewScript,newDesign,'V4_SCRIPT_MISMATCH');
    if(width<768) {
     assert(newDesign?initial.railDisplay==='none'&&initial.featuredWidth===0:initial.featuredWidth>150,'STANDALONE_FEATURED_WRONG_DISPLAY');
    }else {
     assert(initial.railWidth>250&&initial.featuredWidth>250,'DESKTOP_FEATURED_CARD_CHANGED');
    }
    assert(initial.docWidth<=width+5,'SCREEN_OVERFLOW');
    // Only temporary QA nodes in this browser; no synthetic matches in Production.
    const before=await page.evaluate(()=>{
     const fixture=document.createElement('div');
     fixture.setAttribute('data-b46-v4-qa-only','');
     fixture.innerHTML='<section class="league-block"><header class="league-head"><strong>QA League</strong></header>'+
       '<article class="match-row active" data-match-id="qa-v4-fixture" aria-expanded="true"><div class="teams-cell"><b>QA Home</b><strong class="desktop-team-score">2</strong><b>QA Away</b><strong class="desktop-team-score">1</strong></div><span>LIVE · 64'+String.fromCharCode(39)+' HT 1–0</span></article>'+
       '<section class="match-expanded" data-expanded-match="qa-v4-fixture"><div class="match-expanded-inner">'+
       '<section class="expand-card expand-flow-card" data-v4-protect-flow>EVENT FLOW MUST STAY EXACT</section>'+
       '<section class="expand-card expand-full-market-card" data-v4-protect-market>FULL MARKET MUST STAY EXACT</section>'+
       '</div></section></section>';
     document.querySelector('.workspace.singlepage').appendChild(fixture);
     const row=fixture.querySelector('.match-row'),flow=fixture.querySelector('[data-v4-protect-flow]'),
      market=fixture.querySelector('[data-v4-protect-market]');
     return {rowHTML:row.outerHTML,flowHTML:flow.outerHTML,marketHTML:market.outerHTML};
    });
    await pause(2200);
    const tested=await page.evaluate(()=>{
     const fixture=document.querySelector('[data-b46-v4-qa-only]');
     const panel=fixture?.querySelector('.b46x-live-detail');
     const row=fixture?.querySelector('.match-row');
     const flow=fixture?.querySelector('[data-v4-protect-flow]'),market=fixture?.querySelector('[data-v4-protect-market]');
     const inner=fixture?.querySelector('.match-expanded-inner');
     const fact=panel?.querySelector('.b46x-fact'),r=fact?.getBoundingClientRect();
     return {panelCount:fixture?.querySelectorAll('.b46x-live-detail').length||0,
       globalCount:document.querySelectorAll('.b46x-live-detail').length,
       rowHTML:row?.outerHTML,flowHTML:flow?.outerHTML,marketHTML:market?.outerHTML,
       lastChild:inner?.lastElementChild===panel,childOrder:[...inner?.children||[]].map(x=>x.className),
       data:panel?.innerText.slice(0,300),factCount:panel?.querySelectorAll('.b46x-fact').length||0,
       factDisplay:fact?getComputedStyle(fact).display:null,
       factShadow:fact?getComputedStyle(fact).boxShadow:null,
       factSize:r?{w:r.width,h:r.height}:null,
       overflow:document.documentElement.scrollWidth>innerWidth+5};
    });
    assert.equal(tested.rowHTML,before.rowHTML,'COLLAPSED_MAIN_MATCH_ROW_MUTATED');
    assert.equal(tested.flowHTML,before.flowHTML,'EVENT_FLOW_MUTATED');
    assert.equal(tested.marketHTML,before.marketHTML,'FULL_MARKET_MUTATED');
    assert.deepEqual(tested.childOrder.slice(0,2),['expand-card expand-flow-card','expand-card expand-full-market-card'],'EXISTING_ORDER_CHANGED');
    assert(!tested.overflow,'SCREEN_OVERFLOW_AFTER_EXPANDING');
    if(width<768&&newDesign){
     assert.equal(tested.panelCount,1,'NO_DETAIL_INSIDE_EXPANDED_ROW');
     assert.equal(tested.globalCount,1,'DUPLICATE_EXPANDED_DETAILS');
     assert(tested.lastChild,'EVENT_FLOW_ORDER_NOT_PRESERVED');
     assert.equal(tested.factCount,4,'FOUR_INSET_FACTS_MISSING');
     assert(tested.factShadow?.includes('inset'),'INSET_VISUAL_NOT_APPLIED');
     assert(tested.factSize?.w>100,'FACTS_MOBILE_LAYOUT_TOO_NARROW');
     assert(tested.data?.includes('QA Home')&&tested.data?.includes('QA Away')&&tested.data?.includes('2–1'),'LIVE_ROW_FIELDS_NOT_BOUND');
    }else assert.equal(tested.panelCount,0,'UNREQUESTED_EXPANDED_PANEL_IN_BASELINE_OR_PC');
    assert.deepEqual(errors,[],'PAGE_JAVASCRIPT_ERRORS '+JSON.stringify(errors));
    await page.evaluate(()=>{
      const el=document.querySelector('[data-b46-v4-qa-only]');
      if(el)el.scrollIntoView({block:'center',behavior:'instant'});
      for(const fixed of document.querySelectorAll('body *')){
       if(fixed.children.length>0&&fixed!==el&&getComputedStyle(fixed).position==='fixed'&&fixed.getBoundingClientRect().width>innerWidth*.7)fixed.style.setProperty('display','none','important');
      }
    });
    await page.screenshot({path:'proof/'+prefix+'-'+width+'-'+theme+'.png',fullPage:false});
    console.log('B46_EXPANDED_V4_QA_PASS',JSON.stringify({domain,prefix,width,theme,initial,verified:{panelCount:tested.panelCount,childOrder:tested.childOrder,factCount:tested.factCount,shadow:tested.factShadow,mainUntouched:tested.rowHTML===before.rowHTML,eventFlowUntouched:tested.flowHTML===before.flowHTML,fullMarketUntouched:tested.marketHTML===before.marketHTML}}));
    result.push({width,theme,initial,verified:tested.panelCount});
   }finally{await page.close();}
  }
 }finally{await browser.close();}
 return result;
}

let promoted=false,rollbackAttempted=false;
try{
 record.activeBefore=await active();
 assert.equal(record.activeBefore.version,EXPECTED_ACTIVE,'ACTIVE_PRODUCTION_VERSION_CHANGED_STOP');
 record.beforeQA=await browserQA(PROD,'before',false);
 const current=await readVersion(record.activeBefore.version);
 const main=current.modules.find(m=>m.name===current.main_module);
 assert(main,'MAIN_MODULE_UNAVAILABLE');
 const mainSource=Buffer.from(main.content_base64,'base64').toString('utf8');
 const modified=patch(mainSource);
 const beforeModules=current.modules.map(m=>({name:m.name,sha:sha(Buffer.from(m.content_base64,'base64'))}));
 record.modulesBefore=beforeModules;
 const before=await readFiles(PROD);
 const currentHtml=before['/'].bytes.toString('utf8');
 assert(currentHtml.includes(OLD_STYLE),'CURRENT_V3_STYLE_NOT_LIVE');
 const expectedHtml=changeHtml(currentHtml),expectedHash=sha(expectedHtml);
 record.expectedHtmlHash=expectedHash;
 record.assetHashesBefore=Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.hash]));
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'DEPLOY_DOMAIN_TARGET_DRIFT');
 assert.deepEqual(await active(),record.activeBefore,'PRODUCTION_CHANGED_BEFORE_INACTIVE_CANDIDATE');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
  annotations:{'workers/tag':'B46_EXPANDED_ONLY_MOBILE_V4_20261021','workers/message':'Mobile expanded card live details ONLY; restore no standalone featured and preserve untouched Event Flow'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of current.modules)form.set(m.name,new Blob([m.name===current.main_module?modified:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 record.candidate=uploaded.id;record.changes.push('UPLOADED_INACTIVE_EXPANDED_ONLY_V4_CANDIDATE');save();
 const cand=await readVersion(uploaded.id);
 for(const m of cand.modules){
  const prev=beforeModules.find(v=>v.name===m.name);
  assert(prev,'UNEXPECTED_WORKER_MODULE_ADDED '+m.name);
  const currentHash=sha(Buffer.from(m.content_base64,'base64'));
  assert.equal(currentHash,m.name===current.main_module?sha(modified):prev.sha,'NON_FEATURED_MODULE_MODIFIED '+m.name);
 }
 const sub=(await api('/workers/subdomain')).subdomain||'mccarey-supon';
 const preview='https://'+uploaded.id.slice(0,8)+'-'+SCRIPT+'.'+sub+'.workers.dev';
 record.preview=preview;save();
 const candidate=await readFiles(preview);
 assert.equal(candidate['/'].hash,expectedHash,'CANDIDATE_HTML_NOT_EXACTLY_OVERLAY_REMOVED');
 assert.equal(candidate['/index.html'].hash,expectedHash,'CANDIDATE_INDEX_HTML_NOT_EXPECTED');
 for(const p of PATHS.filter(x=>x!=='/'&&x!=='/index.html'))
   assert.equal(candidate[p].hash,before[p].hash,'UNRELATED_ASSET_CHANGED_'+p);
 record.previewQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),record.activeBefore,'OTHER_PRODUCTION_DEPLOY_DURING_QA');
 // Promote precisely the inactive version that passed the browser checks.
 const d=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],
  annotations:{'workers/message':'Deploy selected-match detail only after expand; Event Flow and collapsed match row unchanged'}});
 promoted=true;record.changes.push({action:'PROMOTE_TESTED_EXPANDED_ONLY_V4',version:uploaded.id,deployment:d.id||null});save();
 let activated=false;
 for(let i=0;i<25;i++){
  const a=await active();
  if(a.version===uploaded.id){activated=true;break}
  if(a.version!==record.activeBefore.version)throw Error('THIRD_PARTY_WORKER_ACTIVATED');
  await pause(1600);
 }
 assert(activated,'DEPLOYMENT_ACCEPTED_BUT_NOT_ACTIVE');
 for(const domain of [PROD,ALIAS]){
  let passed=false;
  for(let i=0;i<28;i++){
   const a=await get(domain,'/'),b=await get(domain,'/index.html');
   if(a.hash===expectedHash&&b.hash===expectedHash){passed=true;console.log('FEATURED_NATIVE_PUBLIC_PROPAGATED',domain,i+1);break;}
   assert.equal((await active()).version,uploaded.id,'PRODUCTION_CHANGED_WHILE_WAITING_FOR_EDGE');
   await pause(2800);
  }
  assert(passed,'EDGE_DID_NOT_SERVE_CLEAN_FEATURED_HTML_'+domain);
 }
 const after=await readFiles(PROD);
 for(const p of PATHS)assert.equal(after[p].hash,p==='/'||p==='/index.html'?expectedHash:before[p].hash,'UNRELATED_PRODUCTION_ASSET_CHANGED_'+p);
 record.productionQA=await browserQA(PROD,'production',true);
 record.activeAfter=await active();
 assert.equal(record.activeAfter.version,uploaded.id,'ACTIVE_WORKER_NOT_CLEANED');
 record.success=true;record.finished=new Date().toISOString();save();
 console.log('BALL46_EXPANDED_ONLY_V4_PRODUCTION_SUCCESS',JSON.stringify({newVersion:uploaded.id,from:record.activeBefore.version,desktopUnchanged:true,eventFlowUntouched:true,collapsedRowsUntouched:true,noStandaloneMobileFeatured:true,expandedOnly:true,productionUrl:PROD}));
}catch(e){
 record.error=e.stack||String(e);record.finished=new Date().toISOString();
 if(promoted&&record.candidate&&record.activeBefore?.version){
  try{
   for(let j=0;j<10;j++){
    const a=await active();
    if(a.version===record.candidate){
     rollbackAttempted=true;
     await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:record.activeBefore.version,percentage:100}],
      annotations:{'workers/message':'Automated rollback on expanded-only mobile regression'}});
     record.changes.push('ROLLBACK_PREVIOUS_ACTIVE_WORKER');break;
    }
    if(a.version!==record.activeBefore.version)break;
    await pause(1700);
   }
  }catch(z){record.rollbackError=String(z)}
 }
 record.rollbackAttempted=rollbackAttempted;
 save();console.error('BALL46_EXPANDED_ONLY_V4_STOP',record.error);
 process.exitCode=1;
}
