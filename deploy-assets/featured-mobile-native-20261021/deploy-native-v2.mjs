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
const OLD_STYLE='<style id="'+ID+'">'+readFileSync('native-mobile.css','utf8')+'</style>';
const NEW_STYLE='<style id="'+ID+'">'+readFileSync('native-mobile-v2.css','utf8')+'</style>';
const EXPECTED_ACTIVE='4cd96601-43b4-400c-adbe-79fab90955d5';

assert(ACCOUNT&&TOKEN,'CLOUDFLARE_ACCESS_NOT_CONFIGURED');
const root='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const sha=v=>createHash('sha256').update(v).digest('hex');
mkdirSync('proof',{recursive:true});
const record={task:'Mobile Featured V2: restore distinctly visible dark sunken fact wells and compact whitespace with source/PC unchanged',created:new Date().toISOString(),sha:process.env.GITHUB_SHA,changes:[]};
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
async function browserQA(domain,prefix,expectedMobileVisible){
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
 assert(chrome,'CHROME_NOT_FOUND');
 const b=await puppeteer.launch({headless:true,executablePath:chrome,args:['--no-sandbox']});
 const checks=[];
 try{
 for(const [width,mode] of [[320,'dark'],[360,'dark'],[390,'dark'],[390,'light'],[430,'dark'],[1440,'dark'],[1440,'light']]){
  const p=await b.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(String(e).slice(0,250)));
  try{
  await p.setViewport({width,height:980,deviceScaleFactor:1,isMobile:width<768});
  await p.setCacheEnabled(false);
  await p.goto(domain+'/?view=live&featured_native_mobile='+width+'-'+mode+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await p.evaluate(m=>document.documentElement.dataset.theme=m,mode);
  await p.waitForFunction(()=>document.querySelector('.featured-card[data-featured]')&&document.querySelector('.workspace.singlepage'),{timeout:45000,polling:250});
  await pause(1800);
  const d=await p.evaluate(()=>{
   const root=document.querySelector('.featured-card[data-featured]'),rail=root.closest('.right-rail');
   const style=getComputedStyle(root),railStyle=getComputedStyle(rail),rect=root.getBoundingClientRect();
   const facts=[...root.querySelectorAll('.feature-facts > div')];
   const cssFacts=facts.map(x=>{const cs=getComputedStyle(x),r=x.getBoundingClientRect();return{width:r.width,height:r.height,border:cs.borderTopWidth,shadow:cs.boxShadow,background:cs.backgroundImage,overflow:x.scrollWidth>x.clientWidth+3}});
   return {width:innerWidth,docWidth:document.documentElement.scrollWidth,cardCount:document.querySelectorAll('.featured-card').length,
    cardInRail:rail.contains(root),card:{w:rect.width,h:rect.height,display:style.display},railDisplay:railStyle.display,
    clonedCount:document.querySelectorAll('.b46fm-preview-mobile,.b46fm-preview-pc,.b46fm').length,
    sourcePatched:!!document.getElementById('b46-native-featured-mobile-20261021'),oldPatch:!!document.getElementById('b46-featured-clean-recessed-production-20261021-style'),
    originalFields:root.querySelectorAll('[data-featured-home],[data-featured-away],[data-featured-score],[data-featured-stats],[data-featured-events],[data-featured-signal]').length,
    facts:cssFacts,
    wellPixel: {inside:{x:Math.round(facts[0].getBoundingClientRect().right-14),y:Math.round(facts[0].getBoundingClientRect().top+12)},
      outside:{x:Math.round((facts[0].getBoundingClientRect().right+facts[1].getBoundingClientRect().left)/2),y:Math.round(facts[0].getBoundingClientRect().top+12)}},
    gapAboveStats:root.querySelector('.feature-stats')?.getBoundingClientRect().top-root.querySelector('.feature-facts')?.getBoundingClientRect().bottom,
    emptySignal:!root.querySelector('.feature-signal')?.textContent?.trim()&&!root.querySelector('.feature-signal')?.children?.length,
    secondaryRailVisible:[...rail.children].filter(x=>!x.matches('.featured-card')).some(x=>getComputedStyle(x).display!=='none'),
    mainBoardVisible:getComputedStyle(document.querySelector('.main-board')).display!=='none',
    featureText:(root.querySelector('[data-featured-league]')?.textContent||'').trim().slice(0,55)
   };
  });
  assert.equal(d.cardCount,1,'EXTRA_FEATURED_ORIGINAL');
  assert(d.cardInRail,'FEATURED_REMOVED_FROM_NATIVE_RAIL');
  assert.equal(d.clonedCount,0,'PREVIEW_CLONE_DETECTED');
  assert(!d.oldPatch,'OLD_FEATURED_OVERLAY_ACTIVE');
  assert.equal(d.originalFields,6,'ORIGINAL_LIVE_DATA_FIELDS_CHANGED');
  assert.equal(d.facts.length,4,'FOUR_ORIGINAL_FACT_WELLS_MISSING');
  assert(d.docWidth<=width+4,'MOBILE_HORIZONTAL_OVERFLOW');
  assert(d.mainBoardVisible,'MAIN_BOARD_HIDDEN');
  assert.equal(d.sourcePatched,expectedMobileVisible,'STYLE_TAG_UNEXPECTED');
  if(width<768&&expectedMobileVisible){
   assert(d.card.w>=(width-40),'MOBILE_CARD_TOO_NARROW');
   assert(d.card.h>130,'MOBILE_CARD_COLLAPSED');
   assert(d.railDisplay!=='none','RAIL_STILL_HIDDEN');
   assert(!d.secondaryRailVisible,'UNINTENDED_RAIL_CARDS_SHOWN');
   assert(d.facts.every(x=>x.width>90&&x.height>=50&&x.border==='0px'&&x.shadow.includes('inset')&&x.background.includes('linear-gradient')&&!x.overflow),'FOUR_WELLS_NOT_INSET_OR_OVERFLOW');
   if(prefix!=='before'){
    const expectedColor=mode==='dark'?'rgb(7, 26, 19)':'rgb(200, 219, 206)';
    assert(d.facts.every(x=>x.background.includes(expectedColor)),'OWNER_RECESSED_COLOR_NOT_VISIBLE');
    if(d.emptySignal)assert(d.gapAboveStats>=0&&d.gapAboveStats<=25,'EXCESSIVE_EMPTY_GAP_BETWEEN_WELLS_AND_STATS');
   }
  }
  if(width<768&&!expectedMobileVisible)assert(d.card.w===0&&d.railDisplay==='none','BASELINE_MOBILE_NOT_HIDDEN');
  if(width>=768)assert(d.card.w>=260&&d.railDisplay==='grid','PC_FEATURED_CARD_CHANGED');
  assert.deepEqual(errors,[],'PAGE_JS_ERRORS');
  const shot=await p.screenshot({path:'proof/'+prefix+'-'+width+'-'+mode+'.png',fullPage:false});
  if(width<768&&prefix!=='before'){
   const image=PNG.sync.read(shot);
   const rgb=pt=>{assert(pt.x>=0&&pt.y>=0&&pt.x<image.width&&pt.y<image.height,'WELL_PIXEL_OUTSIDE_SCREENSHOT');const at=(pt.y*image.width+pt.x)*4;return [...image.data.subarray(at,at+3)]};
   const a=rgb(d.wellPixel.inside),z=rgb(d.wellPixel.outside);
   const brightness=v=>v[0]*.2126+v[1]*.7152+v[2]*.0722;
   const delta=brightness(z)-brightness(a);
   assert(delta>=12,'INSET_WELLS_NOT_VISIBLY_DARKER_THAN_CARD: '+JSON.stringify({a,z,delta}));
   console.log('B46_VISUAL_WELL_CONTRAST_PASS',JSON.stringify({prefix,width,mode,inside:a,outside:z,delta}));
  }
  console.log('B46_NATIVE_MOBILE_BROWSER_PASS',JSON.stringify({prefix,mode,...d, facts:d.facts.map(x=>({width:x.width,height:x.height,border:x.border,shadow:x.shadow}))}));
  checks.push(d);
  }finally{await p.close()}
 }
 }finally{await b.close()}
 return checks;
}

let promoted=false,rollbackAttempted=false;
try{
 record.activeBefore=await active();
 assert.equal(record.activeBefore.version,EXPECTED_ACTIVE,'ACTIVE_PRODUCTION_VERSION_CHANGED_STOP');
 record.beforeQA=await browserQA(PROD,'before',true);
 const current=await readVersion(record.activeBefore.version);
 const main=current.modules.find(m=>m.name===current.main_module);
 assert(main,'MAIN_MODULE_UNAVAILABLE');
 const mainSource=Buffer.from(main.content_base64,'base64').toString('utf8');
 const modified=patch(mainSource);
 const beforeModules=current.modules.map(m=>({name:m.name,sha:sha(Buffer.from(m.content_base64,'base64'))}));
 record.modulesBefore=beforeModules;
 const before=await readFiles(PROD);
 const currentHtml=before['/'].bytes.toString('utf8');
 assert(currentHtml.includes(OLD_STYLE),'EXPECTED_V1_STYLE_NOT_LIVE');
 const expectedHtml=changeHtml(currentHtml),expectedHash=sha(expectedHtml);
 record.expectedHtmlHash=expectedHash;
 record.assetHashesBefore=Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.hash]));
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'DEPLOY_DOMAIN_TARGET_DRIFT');
 assert.deepEqual(await active(),record.activeBefore,'PRODUCTION_CHANGED_BEFORE_INACTIVE_CANDIDATE');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
  annotations:{'workers/tag':'B46_NATIVE_MOBILE_FEATURED_V2_20261021','workers/message':'Deepen the 4 recessed fact wells and compact empty whitespace on mobile only; preserve desktop, data and other assets'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of current.modules)form.set(m.name,new Blob([m.name===current.main_module?modified:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 record.candidate=uploaded.id;record.changes.push('UPLOADED_INACTIVE_V2_CSS_CANDIDATE');save();
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
  annotations:{'workers/message':'Owner screenshot visual correction: deepen 4 mobile fact wells and reduce gap without altering data'}});
 promoted=true;record.changes.push({action:'PROMOTE_TESTED_MOBILE_CSS_V2',version:uploaded.id,deployment:d.id||null});save();
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
 console.log('BALL46_NATIVE_MOBILE_FEATURED_V2_PRODUCTION_SUCCESS',JSON.stringify({newVersion:uploaded.id,from:record.activeBefore.version,pcCardOriginal:true,mobileOriginalVisible:true,mobileNoClone:true,productionUrl:PROD}));
}catch(e){
 record.error=e.stack||String(e);record.finished=new Date().toISOString();
 if(promoted&&record.candidate&&record.activeBefore?.version){
  try{
   for(let j=0;j<10;j++){
    const a=await active();
    if(a.version===record.candidate){
     rollbackAttempted=true;
     await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:record.activeBefore.version,percentage:100}],
      annotations:{'workers/message':'Automated rollback after failed mobile facts contrast and spacing change'}});
     record.changes.push('ROLLBACK_PREVIOUS_ACTIVE_WORKER');break;
    }
    if(a.version!==record.activeBefore.version)break;
    await pause(1700);
   }
  }catch(z){record.rollbackError=String(z)}
 }
 record.rollbackAttempted=rollbackAttempted;
 save();console.error('BALL46_NATIVE_MOBILE_FEATURED_V2_STOP',record.error);
 process.exitCode=1;
}
