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
const OLD_STYLE='<style id="'+ID+'">'+readFileSync('old-v5.css','utf8')+'</style>';
const NEW_STYLE='<style id="'+ID+'">'+readFileSync('existing-detail.css','utf8')+'</style>';
const EXPECTED_ACTIVE='e9da6b47-cf4d-442d-83d9-c492492a88ec';

assert(ACCOUNT&&TOKEN,'CLOUDFLARE_ACCESS_NOT_CONFIGURED');
const root='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const sha=v=>createHash('sha256').update(v).digest('hex');
mkdirSync('proof',{recursive:true});
const record={task:'BALL46 V6: repair original mobile All Matches b46gn opened card, remove V5 extra native summary, leave Event Flow and closed match row exactly as originally designed',created:new Date().toISOString(),sha:process.env.GITHUB_SHA,changes:[]};
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
 const from=JSON.stringify(OLD_STYLE),to=JSON.stringify(NEW_STYLE);
 const oldCall='return __b46NativeExpandedV5(response,new URL(request.url).pathname); /* B46_NATIVE_EXPANDED_V5 */';
 const newCall='return __b46NativeFeaturedMobile20261021(response,new URL(request.url).pathname); /* B46_NATIVE_MOBILE_20261021 */';
 const marker='\nasync function __b46NativeExpandedV5(response,path){\n';
 assert.equal(source.split(from).length-1,1,'ACTIVE_V5_STYLE_LITERAL_CHANGED');
 assert.equal(source.split(oldCall).length-1,1,'ACTIVE_V5_ROUTE_WRAPPER_CHANGED');
 assert.equal(source.split(marker).length-1,1,'V5_ADDED_EXTRA_WRAPPER_NOT_UNIQUE');
 const pos=source.lastIndexOf(marker);
 assert(pos>0,'ACTIVE_V5_EXTRA_WRAPPER_NOT_FOUND');
 const tail=source.slice(pos);
 assert(tail.trimEnd().endsWith('}'),'V5_HELPER_TRUNCATED');
 assert(tail.startsWith(marker),'UNEXPECTED_V5_HELPER_START');
 assert(!tail.includes('export default'),'V5_HELPER_NOT_AT_EOF');
 const trimmed=source.slice(0,pos);
 assert(!trimmed.includes('function __b46NativeExpandedV5'),'DUPLICATE_V5_FUNC');
 const updated=trimmed.replace(from,to).replace(oldCall,newCall);
 assert(!updated.includes('__b46NativeExpandedV5'),'V5_WRAPPER_NOT_REMOVED');
 assert.equal(updated.replace(to,from).replace(newCall,oldCall),trimmed,'NON_TARGET_WORKER_CODE_CHANGED');
 return updated;
}

async function browserQA(domain,phase,isNew){
 const b=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const checks=[];
 try{
 const cases=phase==='before'?[[390,'dark'],[1440,'dark']]:
   [[320,'dark'],[360,'dark'],[390,'dark'],[390,'light'],[430,'dark'],[1440,'dark'],[1440,'light']];
 for(const [width,mode] of cases){
  const page=await b.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
  try{
   await page.setViewport({width,height:970,isMobile:width<768,deviceScaleFactor:1});
   await page.goto(domain+'/?view=live&b46_original_detail_v6='+width+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
   await page.evaluate(mode=>document.documentElement.dataset.theme=mode,mode);
   await page.waitForFunction(()=>window.NOMAD343_EXPANDED_MATCH&&document.querySelector('[data-board-sections]')&&document.querySelector('.featured-card[data-featured]'),{timeout:50000,polling:250});
   const initial=await page.evaluate(()=>{
    const rail=document.querySelector('.right-rail'),native=document.querySelectorAll('.b46-native-summary').length;
    return {rail:getComputedStyle(rail).display,railWidth:rail.getBoundingClientRect().width,native,
      activeV5Style:!!document.getElementById('b46-native-featured-mobile-20261021'),
      docWidth:document.documentElement.scrollWidth};
   });
   assert(initial.activeV5Style,'MOBILE_STYLE_TAG_MISSING');
   assert(initial.docWidth<=width+5,'INIT_HORIZONTAL_OVERFLOW');
   if(width>=768){
    assert(initial.railWidth>=260,'PC_RAIL_CHANGED');
    await page.screenshot({path:'proof/'+phase+'-'+width+'-'+mode+'.png',fullPage:false});
    console.log('B46_V6_PC_PASS',JSON.stringify({phase,domain,width,mode,initial}));
    checks.push({width,mode,initial});continue;
   }
   assert(initial.rail==='none','UNREQUESTED_MOBILE_STANDALONE_FEATURED');
   await page.waitForFunction(()=>document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]').length>0,{timeout:58000,polling:500});
   const before=await page.evaluate(()=>{
    const list=document.querySelector('#b46gn-cards');
    const card=list.querySelector('[data-b46gn-fixture]');
    const match=card.getAttribute('data-b46gn-fixture');
    const detail=document.querySelector('#b46gn-detail');
    return {match,cardText:card.textContent.replace(/\s+/g,' ').trim().slice(0,160),
      listCount:list.querySelectorAll('[data-b46gn-fixture]').length,dialogHidden:detail.getAttribute('aria-hidden'),
      nativeCount:document.querySelectorAll('.b46-native-summary').length};
   });
   assert(before.dialogHidden!=='false','DETAIL_VISIBLE_BEFORE_CLICK');
   await page.evaluate(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]').click());
   await page.waitForFunction(()=>document.querySelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card .feature-facts'),{timeout:30000,polling:250});
   await pause(1900);
   const opened=await page.evaluate(()=>{
     const dlg=document.querySelector('#b46gn-detail'),detail=dlg.querySelector('[data-b46gn-detailbody]');
     const featured=detail.querySelector('.b46gn-featured .featured-card[data-featured]');
     const wells=[...featured.querySelectorAll('.feature-facts>div')];
     const row=document.querySelector('.match-row[aria-expanded="true"]'),expanded=document.querySelector('section.match-expanded[data-expanded-match]');
     const originalFlow=expanded?.querySelectorAll('.expand-flow-card')||[];
     const originalMarket=expanded?.querySelectorAll('.expand-full-market-card')||[];
     const dRect=featured.getBoundingClientRect();
     return {dialogOpen:dlg.getAttribute('aria-hidden')==='false',featuredCount:detail.querySelectorAll('.b46gn-featured .featured-card').length,
       mobileCard:{width:dRect.width,height:dRect.height,background:getComputedStyle(featured).backgroundImage},
       wells:wells.map(e=>{const z=getComputedStyle(e),r=e.getBoundingClientRect();return{text:e.innerText.slice(0,70),w:r.width,h:r.height,shadow:z.boxShadow,bg:z.backgroundImage,border:z.borderTopWidth,display:z.display}}),
       nativeCount:document.querySelectorAll('.b46-native-summary').length,
       v4Count:document.querySelectorAll('.b46x-live-detail').length,
       originalFlowCount:originalFlow.length,originalMarketCount:originalMarket.length,
       mainRowText:row?.querySelector('.teams-cell')?.textContent.trim().slice(0,150),
       flowOriginExists:!!expanded&&expanded.querySelector('.expand-flow-card')!==null,
       rowsCount:document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]').length,
       docWidth:document.documentElement.scrollWidth,
       currentTheme:document.documentElement.dataset.theme};
   });
   assert(opened.dialogOpen,'MOBILE_ALL_MATCHES_NOT_EXPANDED');
   assert.equal(opened.featuredCount,1,'ORIGINAL_FEATURED_CARD_MISSING_OR_DUPLICATED');
   assert.equal(opened.wells.length,4,'EXISTING_FOUR_FACTS_MISSING');
   assert.equal(opened.rowsCount,before.listCount,'COLLAPSED_CARDS_CHANGED');
   assert(opened.flowOriginExists&&opened.originalFlowCount===1,'EVENT_FLOW_ORIGINAL_MISSING');
   assert.equal(opened.originalMarketCount,1,'FULL_MARKET_ORIGINAL_MISSING');
   assert(opened.docWidth<=width+5,'OPEN_MOBILE_HORIZONTAL_OVERFLOW');
   if(isNew){
     assert.equal(opened.nativeCount,0,'V5_DUPLICATE_SUMMARY_REMAINS');
     assert.equal(opened.v4Count,0,'V4_DUPLICATE_SUMMARY_REMAINS');
     assert(opened.wells.every(x=>x.w>90&&x.h>=55&&x.shadow.includes('inset')&&x.border==='0px'&&x.bg.includes('linear-gradient')),'FOUR_FACT_WELLS_NOT_VISIBLE');
   }
   assert.deepEqual(errors,[],'UNCATCHED_CLIENT_ERRORS '+JSON.stringify(errors));
   await page.evaluate(()=>{
     const card=document.querySelector('#b46gn-detail .b46gn-featured .featured-card');
     card?.scrollIntoView({block:'center',behavior:'instant'});
     for(const node of document.querySelectorAll('body *')){
       if(node.closest?.('#b46gn-detail'))continue;
       if(getComputedStyle(node).position==='fixed'&&node.getBoundingClientRect().width>innerWidth*.65)
         node.style.setProperty('display','none','important');
     }
   });
   await page.screenshot({path:'proof/'+phase+'-'+width+'-'+mode+'.png',fullPage:false});
   console.log('B46_V6_REAL_MOBILE_ALLMATCHES_QA_PASS',JSON.stringify({phase,domain,width,mode,before,opened}));
   checks.push({width,mode,before,opened});
  }finally{await page.close();}
 }
 }finally{await b.close();}
 return checks;
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
 const originalJS=await get(PROD,'/expanded-match-343.js');
 assert.equal(originalJS.status,200,'LIVE_EXPANDED_JS_NOT_FOUND');
 const expectedJSHash='64b451812f5bc01411f0eddf125b9bada8790e459408a1cf4158ccfc7ee7067e';
 const activeV5JSHash='d5d3af45640307d13afd20f2ac518ddbf46ede0c84be226f2b063092de00a5c4';
 assert.equal(originalJS.hash,activeV5JSHash,'ACTIVE_V5_EXPANDED_JS_ASSET_CHANGED');
 record.assetV5Hash=originalJS.hash;record.expectedJSHash=expectedJSHash;
 const currentHtml=before['/'].bytes.toString('utf8');
 assert(currentHtml.includes(OLD_STYLE),'CURRENT_V5_STYLE_NOT_LIVE');
 const expectedHtml=changeHtml(currentHtml),expectedHash=sha(expectedHtml);
 record.expectedHtmlHash=expectedHash;
 record.assetHashesBefore=Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.hash]));
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'DEPLOY_DOMAIN_TARGET_DRIFT');
 assert.deepEqual(await active(),record.activeBefore,'PRODUCTION_CHANGED_BEFORE_INACTIVE_CANDIDATE');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
  annotations:{'workers/tag':'B46_EXISTING_MOBILE_DETAIL_V6_20261021','workers/message':'Remove unrequested V5 extra section; style existing mobile All Matches detail only'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of current.modules)form.set(m.name,new Blob([m.name===current.main_module?modified:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 record.candidate=uploaded.id;record.changes.push('UPLOADED_EXISTING_MOBILE_DETAIL_V6_CANDIDATE');save();
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
  const previewAsset=await get(preview,'/expanded-match-343.js');
 assert.equal(previewAsset.hash,expectedJSHash,'CANDIDATE_ORIGINAL_EXPANDED_JS_NOT_RESTORED');
 record.previewQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),record.activeBefore,'OTHER_PRODUCTION_DEPLOY_DURING_QA');
 // Promote precisely the inactive version that passed the browser checks.
 const d=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],
  annotations:{'workers/message':'Existing All Matches mobile detail only, V5 duplicate removed, Event Flow and closed rows intact'}});
 promoted=true;record.changes.push({action:'PROMOTE_TESTED_EXISTING_MOBILE_DETAIL_V6',version:uploaded.id,deployment:d.id||null});save();
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
  const liveAsset=await get(PROD,'/expanded-match-343.js');
 assert.equal(liveAsset.hash,expectedJSHash,'PRODUCTION_ORIGINAL_EXPANDED_JS_NOT_RESTORED');
 record.productionQA=await browserQA(PROD,'production',true);
 record.activeAfter=await active();
 assert.equal(record.activeAfter.version,uploaded.id,'ACTIVE_WORKER_NOT_CLEANED');
 record.success=true;record.finished=new Date().toISOString();save();
 console.log('BALL46_ORIGINAL_ALLMATCHES_DETAIL_V6_SUCCESS',JSON.stringify({newVersion:uploaded.id,from:record.activeBefore.version,removedV5Duplicate:true,existingAllMatchesMobileCardRestyled:true,originalExpandedAssetRestored:true,eventFlowCodeUnchanged:true,collapsedRowsUntouched:true,productionUrl:PROD}));
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
 save();console.error('BALL46_ORIGINAL_ALLMATCHES_DETAIL_V6_STOP',record.error);
 process.exitCode=1;
}
