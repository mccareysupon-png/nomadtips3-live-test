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
const OLD_STYLE='<style id="'+ID+'">'+readFileSync('expanded-only.css','utf8')+'</style><script id="b46-expanded-only-v4">'+readFileSync('expanded-only.js','utf8')+'</script>';
const NEW_STYLE='<style id="'+ID+'">'+readFileSync('native-core-v5.css','utf8')+'</style>';
const EXPECTED_ACTIVE='b16a5b96-5ed0-45db-9117-d4a93d11cc2d';

assert(ACCOUNT&&TOKEN,'CLOUDFLARE_ACCESS_NOT_CONFIGURED');
const root='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const sha=v=>createHash('sha256').update(v).digest('hex');
mkdirSync('proof',{recursive:true});
const record={task:'BALL46 V5: native shared All Matches expanded details; remove V4 duplicate and preserve Event Flow',created:new Date().toISOString(),sha:process.env.GITHUB_SHA,changes:[]};
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
 const oldCall='return __b46NativeFeaturedMobile20261021(response,new URL(request.url).pathname); /* B46_NATIVE_MOBILE_20261021 */';
 const newCall='return __b46NativeExpandedV5(response,new URL(request.url).pathname); /* B46_NATIVE_EXPANDED_V5 */';
 assert.equal(source.split(from).length-1,1,'EXPECTED_ACTIVE_V4_INLINE_STYLE_NOT_ONCE');
 assert.equal(source.split(oldCall).length-1,1,'EXPECTED_ACTIVE_FETCH_DISPATCH_NOT_ONCE');
 assert(!source.includes('__b46NativeExpandedV5'),'V5_ALREADY_DEPLOYED');
 const patcher='async function __b46NativeExpandedV5(response,path){\n'+
  'if(path!=="/expanded-match-343.js")return __b46NativeFeaturedMobile20261021(response,path);\n'+
  'if(!response||response.status!==200)return response;\n'+
  'const input=await response.text();\n'+
  'const a='+JSON.stringify(OLD_SHELL)+',b='+JSON.stringify(HOOK_MARKER)+',c='+JSON.stringify(PUBLISH_MARKER)+';\n'+
  'if(input.split(a).length!==2||input.split(b).length!==2||input.split(c).length!==2)throw Error("B46_NATIVE_EXPANDED_ASSET_CHANGED");\n'+
  'const output=input.replace(a,'+JSON.stringify(NEW_SHELL)+')'+
   '.replace(b,'+JSON.stringify(RENDER_HELPER+'\n'+HOOK_MARKER)+')'+
   '.replace(c,'+JSON.stringify(PUBLISH_REPLACEMENT)+');\n'+
  'const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.set("Cache-Control","no-store");\n'+
  'return new Response(output,{status:response.status,statusText:response.statusText,headers});\n'+
  '}\n';
 return source.replace(from,to).replace(oldCall,newCall)+'\n'+patcher;
}
async function browserQA(domain,phase,isNew){
 const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const checks=[];
 try{
 for(const [width,theme] of [[320,'dark'],[360,'dark'],[390,'dark'],[390,'light'],[430,'dark'],[1440,'dark'],[1440,'light']]){
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,160)));
  try {
   await page.setViewport({width,height:1020,isMobile:width<768,deviceScaleFactor:1});
   await page.goto(domain+'/?view=live&v5check='+Date.now()+'-'+width,{waitUntil:'domcontentloaded',timeout:85000});
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await page.waitForFunction(()=>window.NOMAD343_EXPANDED_MATCH&&document.querySelector('[data-board-sections]'),{timeout:45000});
   const before=await page.evaluate(()=>{
    const rail=document.querySelector('.right-rail');
    return {count:document.querySelectorAll('.b46-native-summary').length,oldV4:!!document.getElementById('b46-expanded-only-v4'),display:rail?getComputedStyle(rail).display:null,docWidth:document.documentElement.scrollWidth};
   });
   assert.equal(before.count,0,'DETAIL_SHOWN_BEFORE_EXPAND');
   assert.equal(before.oldV4,!isNew,'V4_SCRIPT_NOT_REPLACED');
   assert(before.docWidth<=width+5,'PAGE_OVERFLOWS_BEFORE_EXPAND');
   if(width<768&&isNew)assert.equal(before.display,'none','UNWANTED_STANDALONE_MOBILE_CARD');
   const selected=await page.evaluate(async()=>{
    const r=await fetch('/api/engine/board',{cache:'no-store'}),data=await r.json();
    if(!r.ok||!Array.isArray(data.fixtures)||!data.fixtures.length)throw Error('BOARD_FIXTURE_DATA_UNAVAILABLE');
    const f=data.fixtures.find(x=>x.boardState==='live'&&x.home?.name&&x.away?.name)||
      data.fixtures.find(x=>x.home?.name&&x.away?.name&&x.statistics)||data.fixtures[0];
    const id=String(f.fixtureId||f.id),board=document.querySelector('[data-board-sections]');
    let row=[...document.querySelectorAll('article.match-row[data-match-id]')].find(z=>z.dataset.matchId===id);
    if(!row){
     const wrap=document.createElement('div');wrap.dataset.b46QaOnly='1';
     const rowEl=document.createElement('article');rowEl.className='match-row';rowEl.dataset.matchId=id;rowEl.setAttribute('aria-expanded','false');
     const teams=document.createElement('div');teams.className='teams-cell';
     for(const name of [f.home?.name||'—',f.away?.name||'—']){const b=document.createElement('b');b.textContent=name;teams.appendChild(b);}
     rowEl.appendChild(teams);wrap.appendChild(rowEl);board.prepend(wrap);row=rowEl;
    }
    const saved=row.querySelector('.teams-cell')?.textContent;
    window.NOMAD343_EXPANDED_MATCH.open(id);
    return {id,home:f.home?.name,away:f.away?.name,score:f.goals?.home+'–'+f.goals?.away,saved};
   });
   await page.waitForFunction(({id,isNew,width})=>{
    const e=document.querySelector('section.match-expanded[data-expanded-match="'+id+'"]');
    if(!e)return false;
    if(!isNew)return e.querySelectorAll('.expand-flow-card').length===1;
    const n=e.querySelector('.b46-native-summary');
    return !!n&&(width>767||n.innerText.includes('HALF-TIME'));
   },{timeout:42000,polling:250},{id:selected.id,isNew,width});
   const data=await page.evaluate(id=>{
    const e=document.querySelector('section.match-expanded[data-expanded-match="'+id+'"]'),inner=e.querySelector('.match-expanded-inner'),sum=e.querySelector('.b46-native-summary');
    return {expandedCount:document.querySelectorAll('.match-expanded').length,nativeCount:document.querySelectorAll('.b46-native-summary').length,v4Count:document.querySelectorAll('.b46x-live-detail').length,
     order:[...inner.children].map(x=>x.className),flowCount:e.querySelectorAll('.expand-flow-card').length,marketCount:e.querySelectorAll('.expand-full-market-card').length,
     marketOwner:e.querySelector('.expand-full-market-card')?.hasAttribute('data-full-market-card'),detailDisplay:sum?getComputedStyle(sum).display:null,
     home:sum?.innerText||'',wells:[...sum?.querySelectorAll('.b46x-fact')||[]].map(x=>({s:x.innerText,shadow:getComputedStyle(x).boxShadow})),
     teamText:e.previousElementSibling.querySelector('.teams-cell')?.textContent,aria:e.previousElementSibling.getAttribute('aria-expanded'),
     docWidth:document.documentElement.scrollWidth};
   },selected.id);
   assert.equal(data.flowCount,1,'EVENT_FLOW_CHANGED');
   assert.equal(data.marketCount,1,'FULL_MARKET_CHANGED');
   assert(data.marketOwner,'FULL_MARKET_OWNER_MISSING');
   assert(data.teamText?.includes(selected.home)&&data.teamText?.includes(selected.away),'ORIGINAL_MATCH_CARD_TEAMS_CHANGED '+JSON.stringify({before:selected.saved,after:data.teamText}));
   assert.equal(data.aria,'true','EXPAND_NOT_ACTIVE');
   if(isNew)assert.equal(data.v4Count,0,'OLD_V4_DUPLICATE_REMAINS_IN_CANDIDATE');
   assert(data.docWidth<=width+5,'HORIZONTAL_OVERFLOW_EXPANDED');
   if(isNew){
    assert.equal(data.nativeCount,1,'NATIVE_SUMMARY_NOT_IN_EXPANDED');
    assert.deepEqual(data.order.slice(1,3),['expand-card expand-flow-card','expand-card expand-full-market-card'],'EVENT_FLOW_OR_MARKET_ORDER_CHANGED');
    if(width<768){
     assert.equal(data.detailDisplay,'block','NEW_DETAIL_NOT_DISPLAYED');
     assert.equal(data.wells.length,4,'FOUR_FACT_WELLS_MISSING');
     assert(data.wells.every(x=>x.shadow.includes('inset')),'FACT_WELLS_NOT_INSET');
     assert(data.home.includes(selected.home)&&data.home.includes(selected.away),'WRONG_FIXTURE_SELECTED');
     assert(data.home.includes('RECENT EVENTS')&&data.home.includes('MATCH COMPARISON'),'INCOMPLETE_DETAILS');
    }else assert.equal(data.detailDisplay,'none','PC_LAYOUT_CHANGED');
   }else assert.equal(data.nativeCount,0,'NATIVE_V5_PANEL_ON_BASELINE');
   assert.deepEqual(errors,[],'PAGE_JS_ERRORS '+JSON.stringify(errors));
   if(isNew&&width<768)await page.evaluate(()=>document.querySelector('.b46-native-summary')?.scrollIntoView({block:'center',behavior:'instant'}));
   await page.screenshot({path:'proof/'+phase+'-'+width+'-'+theme+'.png',fullPage:false});
   console.log('B46_NATIVE_EXPANDED_V5_BROWSER_PASS',JSON.stringify({phase,domain,width,theme,selected,detailCount:data.nativeCount,flow:data.flowCount,market:data.marketCount,rowsIntact:true,wells:data.wells.length,display:data.detailDisplay}));
   checks.push({width,theme,selected,detailCount:data.nativeCount});
  }finally{await page.close();}
 }
 }finally{await browser.close();}
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
 const expectedJS=transformExpandedJS(originalJS.bytes.toString('utf8'));
 const expectedJSHash=sha(expectedJS);
 record.assetSourceHash=originalJS.hash;record.expectedJSHash=expectedJSHash;
 const currentHtml=before['/'].bytes.toString('utf8');
 assert(currentHtml.includes(OLD_STYLE),'CURRENT_V4_STYLE_NOT_LIVE');
 const expectedHtml=changeHtml(currentHtml),expectedHash=sha(expectedHtml);
 record.expectedHtmlHash=expectedHash;
 record.assetHashesBefore=Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.hash]));
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'DEPLOY_DOMAIN_TARGET_DRIFT');
 assert.deepEqual(await active(),record.activeBefore,'PRODUCTION_CHANGED_BEFORE_INACTIVE_CANDIDATE');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
  annotations:{'workers/tag':'B46_NATIVE_EXPANDED_V5_20261021','workers/message':'Replace V4 duplicate with native All Matches expanded renderer; Event Flow kept intact'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of current.modules)form.set(m.name,new Blob([m.name===current.main_module?modified:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 record.candidate=uploaded.id;record.changes.push('UPLOADED_NATIVE_EXPANDED_V5_CANDIDATE');save();
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
 assert.equal(previewAsset.hash,expectedJSHash,'CANDIDATE_EXPANDED_JS_NOT_PATCHED');
 record.previewQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),record.activeBefore,'OTHER_PRODUCTION_DEPLOY_DURING_QA');
 // Promote precisely the inactive version that passed the browser checks.
 const d=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],
  annotations:{'workers/message':'Native expanded renderer, real fixture data, remove duplicate V4, preserve flow'}});
 promoted=true;record.changes.push({action:'PROMOTE_TESTED_NATIVE_EXPANDED_V5',version:uploaded.id,deployment:d.id||null});save();
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
 assert.equal(liveAsset.hash,expectedJSHash,'PRODUCTION_NATIVE_JS_NOT_EXPECTED');
 record.productionQA=await browserQA(PROD,'production',true);
 record.activeAfter=await active();
 assert.equal(record.activeAfter.version,uploaded.id,'ACTIVE_WORKER_NOT_CLEANED');
 record.success=true;record.finished=new Date().toISOString();save();
 console.log('BALL46_NATIVE_EXPANDED_V5_PRODUCTION_SUCCESS',JSON.stringify({newVersion:uploaded.id,from:record.activeBefore.version,removedV4:true,realFixtureData:true,nativeSharedExpansion:true,eventFlowCodeUnchanged:true,collapsedRowsUntouched:true,productionUrl:PROD}));
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
 save();console.error('BALL46_NATIVE_EXPANDED_V5_STOP',record.error);
 process.exitCode=1;
}
