import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {PNG} from 'pngjs';
import {OLD_SHELL,NEW_SHELL,HOOK_MARKER,RENDER_HELPER,PUBLISH_MARKER,PUBLISH_REPLACEMENT,transformExpandedJS} from './native-core-v5-patch.mjs';

/* BALL46 — enable ORIGINAL Featured Match on mobile, with 4 inset fact wells.
   Preserve exact active Worker base, modules, assets, bindings and rendering.
   No new UI, no different repository, no stale/preview rollback. */
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const SCRIPT='ball46-production';
const PROD='https://ball46.com';
const ALIAS='https://www.ball46.com';
const ID='b46-native-featured-mobile-20261021';
const OLD_STYLE='<style id="'+ID+'">'+readFileSync('native-core-v5.css','utf8')+'</style>';
const NEW_STYLE='<style id="b46-mobile-allmatches-v6">'+readFileSync('mobile-allmatches-v6.css','utf8')+'</style>';
const DETAIL_NEW=readFileSync('mobile-allmatches-v6-detail.js','utf8');
const EXPECTED_ACTIVE='e9da6b47-cf4d-442d-83d9-c492492a88ec';

assert(ACCOUNT&&TOKEN,'CLOUDFLARE_ACCESS_NOT_CONFIGURED');
const root='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const sha=v=>createHash('sha256').update(v).digest('hex');
mkdirSync('proof',{recursive:true});
const record={task:'BALL46 V6: fix REAL mobile All Matches existing detailFrom sheet, remove featured cloning and V5 hidden native additions; Event Flow original restored',created:new Date().toISOString(),sha:process.env.GITHUB_SHA,changes:[]};
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
const DETAIL_START=' function detailFrom(f){';
const DETAIL_END=' function openDetail(id){';
function fixDetailInHtml(html){
 assert(!html.includes('b46-mobile-allmatches-v6'),'ALREADY_V6_HTML');
 const i=html.indexOf(DETAIL_START),j=html.indexOf(DETAIL_END,i);
 assert(i>=0&&j>i&&html.indexOf(DETAIL_START,i+1)<0,'MOBILE_REAL_DETAIL_FROM_NOT_UNIQUE');
 const old=html.slice(i,j);
 assert(old.includes('featured.cloneNode(true)')&&old.includes('body.replaceChildren(team)'),'MOBILE_DETAIL_OLD_CLONE_SIGNATURE_CHANGED');
 assert(DETAIL_NEW.startsWith(DETAIL_START),'NEW_DETAIL_NOT_DROP_IN_REPLACEMENT');
 assert(!DETAIL_NEW.includes('featured.cloneNode'),'NEW_DETAIL_REINTRODUCES_WRONG_CLONE');
 return html.slice(0,i)+DETAIL_NEW+html.slice(j);
}
function changeHtml(previousPatchedHtml){
 assert(previousPatchedHtml.includes(OLD_STYLE),'V5_STYLE_MISSING');
 assert.equal(previousPatchedHtml.split(OLD_STYLE).length-1,1,'V5_STYLE_NOT_UNIQUE');
 let html=previousPatchedHtml.replace(OLD_STYLE,'');
 html=fixDetailInHtml(html);
 assert(html.includes('</head>'),'HTML_HEAD_MISSING');
 return html.replace('</head>',NEW_STYLE+'</head>');
}
function reverseExpandedAsset(previous){
 for(const [name,s] of [['V5_SHELL',NEW_SHELL],['V5_HELPER',RENDER_HELPER+'\n'+HOOK_MARKER],['V5_PUBLISH',PUBLISH_REPLACEMENT]])
  assert.equal(previous.split(s).length-1,1,'V5_ASSET_DRIFT_'+name);
 const restored=previous.replace(NEW_SHELL,OLD_SHELL)
  .replace(RENDER_HELPER+'\n'+HOOK_MARKER,HOOK_MARKER)
  .replace(PUBLISH_REPLACEMENT,PUBLISH_MARKER);
 assert.equal(transformExpandedJS(restored),previous,'RESTORED_EXPANDED_ASSET_NOT_EXACT_ORIGINAL');
 return restored;
}
function patch(source){
 const oldCall='return __b46NativeExpandedV5(response,new URL(request.url).pathname); /* B46_NATIVE_EXPANDED_V5 */';
 const newCall='return __b46RealAllMatchesV6(response,new URL(request.url).pathname); /* B46_REAL_ALL_MATCHES_V6 */';
 assert.equal(source.split(oldCall).length-1,1,'EXPECTED_ACTIVE_V5_DISPATCH_MISSING');
 assert(!source.includes('async function __b46RealAllMatchesV6'),'V6_ALREADY_INSTALLED');
 const helper='async function __b46RealAllMatchesV6(response,path){\n'+
 'if(!["/","/index.html"].includes(path)||!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;\n'+
 'const input=await response.text();\n'+
 'const start='+JSON.stringify(DETAIL_START)+',end='+JSON.stringify(DETAIL_END)+';\n'+
 'const i=input.indexOf(start),j=input.indexOf(end,i);\n'+
 'if(i<0||j<=i||input.indexOf(start,i+1)>=0||!input.slice(i,j).includes("featured.cloneNode(true)"))throw Error("REAL_MOBILE_DETAIL_SIGNATURE_CHANGED");\n'+
 'const output=input.slice(0,i)+'+JSON.stringify(DETAIL_NEW)+'+input.slice(j);\n'+
 'if(!output.includes("</head>"))throw Error("MOBILE_HTML_HEAD_MISSING");\n'+
 'const edited=output.replace("</head>",'+JSON.stringify(NEW_STYLE)+'+"</head>");\n'+
 'const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.set("Cache-Control","no-store");\n'+
 'return new Response(edited,{status:response.status,statusText:response.statusText,headers});\n'+
 '}\n';
 return source.replace(oldCall,newCall)+'\n'+helper;
}
async function browserQA(domain,phase,isV6){
 const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const results=[];
 try{
 for(const [width,theme] of [[320,'dark'],[360,'dark'],[390,'dark'],[390,'light'],[430,'dark'],[1440,'dark']]){
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
  try{
  await page.setViewport({width,height:1000,isMobile:width<768,deviceScaleFactor:1});
  await page.setCacheEnabled(false);
  await page.goto(domain+'/?view=live&mobile_allmatches_v6='+Date.now()+'-'+width,{waitUntil:'domcontentloaded',timeout:85000});
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.waitForFunction(()=>document.querySelector('.workspace.singlepage'),{timeout:45000});
  if(width>=768)await page.waitForSelector('article.match-row[data-match-id]',{timeout:40000});
  const initial=await page.evaluate(()=>{
   const card=document.querySelector('#b46gn-cards [data-b46gn-fixture]'),sheet=document.querySelector('#b46gn-detail');
   return {card:!!card,sheet:!!sheet,realMobileUI:document.documentElement.dataset.b46gn==='1',mobileVersion:!!document.getElementById('b46-mobile-allmatches-v6'),oldV5Style:!!document.getElementById('b46-native-featured-mobile-20261021'),
     originalRows:document.querySelectorAll('.match-row[data-match-id]').length,docWidth:document.documentElement.scrollWidth};
  });
  assert.equal(initial.mobileVersion,isV6,'V6_STYLESHEET_NOT_BOUND');
  assert.equal(initial.oldV5Style,!isV6,'V5_INJECTED_CSS_NOT_REMOVED');
  assert(initial.docWidth<=width+5,'MAIN_PAGE_OVERFLOW');
  if(width<768){
   await page.waitForSelector('#b46gn-cards [data-b46gn-fixture]',{timeout:45000});
   const fixture=await page.evaluate(async()=>{
     const card=document.querySelector('#b46gn-cards [data-b46gn-fixture]'),id=card?.dataset.b46gnFixture;
     if(!id)throw Error('MOBILE_CARD_ID_MISSING');
     const labels=[...card.querySelectorAll('.b46gn-team-name')].map(x=>x.textContent.trim());
     const scores=[...card.querySelectorAll('.b46gn-team-score')].map(x=>x.textContent.trim());
     const originalCard=card.outerHTML;
     card.click(); // Actual All Matches click, not desktop hidden match-row click.
     const b=await fetch('/api/engine/board',{cache:'no-store'}),board=await b.json();
     const f=Array.isArray(board.fixtures)?board.fixtures.find(x=>String(x.fixtureId??x.id??'')===id):null;
     return {id,labels,scores,fixtureHome:f?.home?.name||null,fixtureAway:f?.away?.name||null,
       fixtureGoals:f?.goals||null,fixtureCorners:f?.corners||null,originalCard};
   });
   await page.waitForFunction(({id,isV6})=>{
    const dialog=document.querySelector('#b46gn-detail');
    if(dialog?.getAttribute('aria-hidden')!=='false')return false;
    const body=dialog.querySelector('[data-b46gn-detailbody]');
    if(!body)return false;
    return isV6?!!body.querySelector('.b46gnv6[data-b46gnv6-content="'+id+'"]'):!!body.querySelector('.b46gn-featured');
   },{timeout:50000,polling:300},{id:fixture.id,isV6});
   const d=await page.evaluate(id=>{
    const card=document.querySelector('#b46gn-cards [data-b46gn-fixture="'+id+'"]');
    const body=document.querySelector('#b46gn-detail [data-b46gn-detailbody]');
    const own=body?.querySelector('.b46gnv6'),facts=own?[...own.querySelectorAll('.b46gnv6-fact')]:[];
    return {cardStillExists:!!card,cardNames:[...card?.querySelectorAll('.b46gn-team-name')||[]].map(e=>e.textContent.trim()),
      dialogOpen:document.querySelector('#b46gn-detail')?.getAttribute('aria-hidden')==='false',
      nativeBodyCount:body?.querySelectorAll('.b46gnv6').length||0,featuredCloneCount:body?.querySelectorAll('.b46gn-featured,[data-featured]').length||0,
      hasEventFlowInSheet:body?.querySelectorAll('.expand-flow-card').length||0,
      factCount:facts.length,shadow:facts[0]?getComputedStyle(facts[0]).boxShadow:'',
      text:own?.textContent?.slice(0,2400)||'',bodyFixture:body?.dataset.b46gnv6Fixture||null,
      header:document.querySelector('.b46m-header')?.outerHTML.slice(0,600),docWidth:document.documentElement.scrollWidth};
   },fixture.id);
   assert(d.cardStillExists&&d.dialogOpen,'MOBILE_MAIN_CARD_OR_SHEET_BROKEN');
   assert.deepEqual(d.cardNames,fixture.labels,'MOBILE_COLLAPSED_CARD_NAMES_CHANGED');
   if(isV6)assert.equal(d.hasEventFlowInSheet,0,'EVENT_FLOW_INJECTED_INTO_MOBILE_SHEET');
   assert(d.docWidth<=width+5,'MOBILE_EXPANDED_OVERFLOW');
   if(isV6){
    assert.equal(d.nativeBodyCount,1,'EXISTING_MOBILE_DETAIL_NOT_POPULATED');
    assert.equal(d.featuredCloneCount,0,'WRONG_FEATURED_MATCH_CLONED');
    assert.equal(d.factCount,4,'FOUR_RECESSED_FACTS_NOT_IN_MOBILE_SHEET');
    assert(d.shadow.includes('inset'),'MOBILE_RECESSED_VISUAL_NOT_APPLIED');
    assert.equal(d.bodyFixture,fixture.id,'MOBILE_FIXTURE_ID_NOT_BOUND');
    for(const name of fixture.labels)assert(d.text.includes(name),'WRONG_SELECTED_MOBILE_TEAM');
    assert(d.text.includes('ACTIVE SIGNALS')&&d.text.includes('MATCH COMPARISON')&&d.text.includes('RECENT EVENTS'),'MOBILE_DETAILS_INCOMPLETE');
    if(fixture.fixtureCorners?.home!==null&&fixture.fixtureCorners?.home!==undefined)
      assert(d.text.includes(String(fixture.fixtureCorners.home)),'CORNER_DATA_NOT_FROM_REAL_FIXTURE');
   }else assert.equal(d.nativeBodyCount,0,'V6_ALREADY_ON_BASELINE');
   // QA-only: hide the separate visitor consent panel if it obscures the opened sheet screenshot.
   await page.evaluate(()=>{
     const dialog=document.querySelector('#b46gn-detail');
     for(const n of [...document.body.querySelectorAll('*')]){
      if(n===dialog||dialog?.contains(n))continue;
      if(n.children.length>5)continue;
      const st=getComputedStyle(n),r=n.getBoundingClientRect();
      if(st.position==='fixed'&&r.width>=innerWidth*.7&&r.height>=210&&r.height<innerHeight&&Number(st.zIndex)>1000)n.style.setProperty('display','none','important');
     }
   });
   await page.screenshot({path:'proof/'+phase+'-'+width+'-'+theme+'.png',fullPage:false});
   console.log('B46_REAL_ALL_MATCHES_V6_MOBILE_PASS',JSON.stringify({phase,domain,width,theme,fixture:{id:fixture.id,labels:fixture.labels,goals:fixture.fixtureGoals,corners:fixture.fixtureCorners},sheet:{native:d.nativeBodyCount,facts:d.factCount,noClone:d.featuredCloneCount===0},collapsedUnchanged:true}));
   results.push({width,theme,fixtureId:fixture.id,pass:true});
  }else {
   assert(initial.originalRows>=1,'PC_MAIN_MATCH_ROWS_MISSING');
   assert(!initial.realMobileUI,'PC_RENDER_WRONG');
   console.log('B46_REAL_ALL_MATCHES_V6_PC_PASS',JSON.stringify({phase,width,theme,rows:initial.originalRows}));
   results.push({width,theme,desktopIntact:true});
  }
  assert.deepEqual(errors,[],'PAGE_ERRORS_'+JSON.stringify(errors));
  }finally{await page.close();}
 }
 }finally{await browser.close();}
 return results;
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
 const restoredOriginalJS=reverseExpandedAsset(originalJS.bytes.toString('utf8'));
 const expectedJSHash=sha(restoredOriginalJS);
 record.v5PatchedJSHash=originalJS.hash;record.restoredEventFlowJSHash=expectedJSHash;
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
  annotations:{'workers/tag':'B46_REAL_ALL_MATCHES_V6_20261021','workers/message':'Use real mobile All Matches detailFrom, remove featured clone and restore original Event Flow asset'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of current.modules)form.set(m.name,new Blob([m.name===current.main_module?modified:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 record.candidate=uploaded.id;record.changes.push('UPLOADED_REAL_ALL_MATCHES_V6_CANDIDATE');save();
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
 assert.equal(previewAsset.hash,expectedJSHash,'CANDIDATE_EVENT_FLOW_ASSET_NOT_ORIGINAL');
 record.previewQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),record.activeBefore,'OTHER_PRODUCTION_DEPLOY_DURING_QA');
 // Promote precisely the inactive version that passed the browser checks.
 const d=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],
  annotations:{'workers/message':'Fix real mobile All Matches detail sheet; keep collapsed card and Event Flow exactly as original'}});
 promoted=true;record.changes.push({action:'PROMOTE_TESTED_REAL_ALL_MATCHES_V6',version:uploaded.id,deployment:d.id||null});save();
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
 assert.equal(liveAsset.hash,expectedJSHash,'PRODUCTION_EVENT_FLOW_ASSET_NOT_RESTORED');
 record.productionQA=await browserQA(PROD,'production',true);
 record.activeAfter=await active();
 assert.equal(record.activeAfter.version,uploaded.id,'ACTIVE_WORKER_NOT_CLEANED');
 record.success=true;record.finished=new Date().toISOString();save();
 console.log('BALL46_REAL_ALL_MATCHES_V6_PRODUCTION_SUCCESS',JSON.stringify({newVersion:uploaded.id,from:record.activeBefore.version,correctExistingMobileDetail:true,removedFeaturedClone:true,realSelectedFixtureData:true,eventFlowAssetRestored:true,collapsedMobileCardUnchanged:true,productionUrl:PROD}));
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
 save();console.error('BALL46_REAL_ALL_MATCHES_V6_STOP',record.error);
 process.exitCode=1;
}
