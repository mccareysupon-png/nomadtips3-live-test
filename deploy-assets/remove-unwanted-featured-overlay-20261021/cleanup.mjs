import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';

/* BALL46 — remove only the accidentally added Featured Match overlay.
   Preserve exact active Worker base, modules, assets, bindings and rendering.
   No new UI, no different repository, no stale/preview rollback. */
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const SCRIPT='ball46-production';
const PROD='https://ball46.com';
const ALIAS='https://www.ball46.com';
const ID='b46-featured-clean-recessed-production-20261021';
const CALL='return __b46FeaturedRecessedProduction20261021(response,new URL(request.url).pathname);';
const REPLACEMENT='return response; /* B46_REMOVE_ADDED_FEATURED_OVERLAY_20261021 */';
assert(ACCOUNT&&TOKEN,'CLOUDFLARE_ACCESS_NOT_CONFIGURED');
const root='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const sha=v=>createHash('sha256').update(v).digest('hex');
mkdirSync('proof',{recursive:true});
const record={task:'Remove only mistakenly injected Featured Match overlay from current Production; retain original card, backend and PC',created:new Date().toISOString(),sha:process.env.GITHUB_SHA,changes:[]};
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
function stripTagged(html){
 let out=html;
 for(const tag of ['style','script']){
  const open='<'+tag+' id="'+ID+'-'+tag+'">';
  const a=out.indexOf(open);
  assert(a>=0,'ORIGINAL_OVERLAY_'+tag.toUpperCase()+'_NOT_FOUND');
  assert(out.indexOf(open,a+open.length)<0,'DUPLICATE_OVERLAY_'+tag);
  const endTag='</'+tag+'>';
  const b=out.indexOf(endTag,a+open.length);
  assert(b>a,'ORIGINAL_OVERLAY_'+tag+'_NOT_CLOSED');
  out=out.slice(0,a)+out.slice(b+endTag.length);
 }
 assert(!out.includes('<script id="'+ID+'-script">')&&!out.includes('<style id="'+ID+'-style">'),'OVERLAY_NOT_REMOVED');
 return out;
}
function patch(source){
 const n=source.split(CALL).length-1;
 assert.equal(n,1,'EXPECTED_SINGLE_WRAPPER_CALL_NOT_FOUND: '+n);
 assert(source.includes('__b46FeaturedRecessedProduction20261021'),'FEATURED_INJECTOR_FUNCTION_MISSING');
 assert(!source.includes('B46_REMOVE_ADDED_FEATURED_OVERLAY_20261021'),'CLEANUP_ALREADY_ACTIVE');
 const fixed=source.replace(CALL,REPLACEMENT);
 assert.equal(fixed.replace(REPLACEMENT,CALL),source,'WORKER_PATCH_NOT_SINGLE_STRING');
 return fixed;
}
async function browserQA(domain,prefix){
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
 assert(chrome,'CHROME_NOT_FOUND');
 const b=await puppeteer.launch({headless:true,executablePath:chrome,args:['--no-sandbox']});
 const checks=[];
 try{
  for(const [width,mode] of [[390,'dark'],[390,'light'],[430,'dark'],[1440,'dark'],[1440,'light']]){
   const page=await b.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,260)));
   try{
    await page.setViewport({width,height:980,deviceScaleFactor:1,isMobile:width<768});
    await page.setCacheEnabled(false);
    await page.goto(domain+'/?view=live&featured_remove_qacheck='+width+'-'+mode+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.evaluate(t=>document.documentElement.dataset.theme=t,mode);
    await page.waitForFunction(()=>document.querySelector('.featured-card[data-featured]')&&document.querySelector('.workspace.singlepage'),{timeout:45000,polling:250});
    await pause(1400);
    const data=await page.evaluate(()=>{
     const root=document.querySelector('.featured-card[data-featured]');
     const rail=root.closest('.right-rail');
     const box=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{w:Math.round(r.width),h:Math.round(r.height),display:s.display,visible:s.visibility}};
     const marker='b46-featured-clean-recessed-production-20261021';
     const before=[...document.querySelectorAll('.featured-card')];
     return {width:innerWidth,docWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,
      originalCount:before.length,originalIsInRail:!!rail&&rail.contains(root),original:box(root),rail:box(rail),
      cloneCount:document.querySelectorAll('.b46fm-preview-mobile,.b46fm-preview-pc,.b46fm').length,
      injectedStyle:!!document.getElementById(marker+'-style'),
      injectedScript:!!document.getElementById(marker+'-script'),
      originalFacts:root.querySelectorAll('.feature-facts>div').length,
      teamCount:root.querySelectorAll('[data-featured-home],[data-featured-away]').length,
      oldInjectionRan:!!window.__b46FeaturedCleanPreviewV1,
      originalMatchCode:!!document.querySelector('.workspace.singlepage')};
    });
    assert.equal(data.originalCount,1,'ORIGINAL_FEATURED_MATCH_NOT_UNIQUE');
    assert(data.originalIsInRail,'ORIGINAL_FEATURED_MATCH_MOVED');
    assert.equal(data.cloneCount,0,'EXTRA_FEATURED_MATCH_STILL_ON_PAGE');
    assert(!data.injectedStyle&&!data.injectedScript&&!data.oldInjectionRan,'REMOVED_FEATURED_JS_STILL_ACTIVE');
    assert.equal(data.originalFacts,4,'ORIGINAL_FEATURED_FACTS_CHANGED');
    assert.equal(data.teamCount,2,'ORIGINAL_TEAM_FIELDS_MISSING');
    assert(data.originalMatchCode,'MAIN_WORKSPACE_MISSING');
    assert(data.docWidth<=width+5,'HORIZONTAL_OVERFLOW '+width);
    if(width>=1024)assert(data.original.w>=260,'ORIGINAL_PC_FEATURED_CARD_HIDDEN');
    else assert(data.rail.display==='none'&&data.original.w===0,'ORIGINAL_MOBILE_LAYOUT_NOT_RESTORED');
    assert.deepEqual(errors,[],'BROWSER_JS_ERRORS '+JSON.stringify(errors));
    await page.screenshot({path:'proof/'+prefix+'-'+width+'-'+mode+'.png',fullPage:false});
    console.log('FEATURED_OVERLAY_CLEAN_BROWSER_PASS',JSON.stringify({domain,width,mode,...data}));
    checks.push(data);
   }finally{await page.close()}
  }
 }finally{await b.close()}
 return checks;
}
let promoted=false,rollbackAttempted=false;
try{
 record.activeBefore=await active();
 const current=await readVersion(record.activeBefore.version);
 const main=current.modules.find(m=>m.name===current.main_module);
 assert(main,'MAIN_MODULE_UNAVAILABLE');
 const mainSource=Buffer.from(main.content_base64,'base64').toString('utf8');
 const modified=patch(mainSource);
 const beforeModules=current.modules.map(m=>({name:m.name,sha:sha(Buffer.from(m.content_base64,'base64'))}));
 record.modulesBefore=beforeModules;
 const before=await readFiles(PROD);
 const currentHtml=before['/'].bytes.toString('utf8');
 assert(currentHtml.includes('<style id="'+ID+'-style">')&&currentHtml.includes('<script id="'+ID+'-script">'),'UNEXPECTED_PRODUCTION_HTML_NO_OVERLAY');
 const expectedHtml=stripTagged(currentHtml),expectedHash=sha(expectedHtml);
 record.expectedHtmlHash=expectedHash;
 record.assetHashesBefore=Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.hash]));
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'DEPLOY_DOMAIN_TARGET_DRIFT');
 assert.deepEqual(await active(),record.activeBefore,'PRODUCTION_CHANGED_BEFORE_INACTIVE_CANDIDATE');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
  annotations:{'workers/tag':'B46_REMOVE_UNWANTED_FEATURED_OVERLAY_20261021','workers/message':'Remove unapproved Featured Match cloned UI and flashing; restore original mobile; keep all current features'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of current.modules)form.set(m.name,new Blob([m.name===current.main_module?modified:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 record.candidate=uploaded.id;record.changes.push('UPLOADED_INACTIVE_CLEANUP_CANDIDATE');save();
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
 record.previewQA=await browserQA(preview,'candidate');
 assert.deepEqual(await active(),record.activeBefore,'OTHER_PRODUCTION_DEPLOY_DURING_QA');
 // Promote precisely the inactive version that passed the browser checks.
 const d=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],
  annotations:{'workers/message':'Approved removal of flashing Featured Match UI; keep original card, retain all other current features'}});
 promoted=true;record.changes.push({action:'PROMOTE_TESTED_FEATURED_OVERLAY_REMOVAL',version:uploaded.id,deployment:d.id||null});save();
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
   if(a.hash===expectedHash&&b.hash===expectedHash){passed=true;console.log('FEATURED_CLEANUP_PUBLIC_PROPAGATED',domain,i+1);break;}
   assert.equal((await active()).version,uploaded.id,'PRODUCTION_CHANGED_WHILE_WAITING_FOR_EDGE');
   await pause(2800);
  }
  assert(passed,'EDGE_DID_NOT_SERVE_CLEAN_FEATURED_HTML_'+domain);
 }
 const after=await readFiles(PROD);
 for(const p of PATHS)assert.equal(after[p].hash,p==='/'||p==='/index.html'?expectedHash:before[p].hash,'UNRELATED_PRODUCTION_ASSET_CHANGED_'+p);
 record.productionQA=await browserQA(PROD,'production');
 record.activeAfter=await active();
 assert.equal(record.activeAfter.version,uploaded.id,'ACTIVE_WORKER_NOT_CLEANED');
 record.success=true;record.finished=new Date().toISOString();save();
 console.log('BALL46_UNWANTED_FEATURED_OVERLAY_REMOVED_PRODUCTION_SUCCESS',JSON.stringify({newVersion:uploaded.id,from:record.activeBefore.version,pcCardOriginal:true,mobileNoClone:true,productionUrl:PROD}));
}catch(e){
 record.error=e.stack||String(e);record.finished=new Date().toISOString();
 if(promoted&&record.candidate&&record.activeBefore?.version){
  try{
   for(let j=0;j<10;j++){
    const a=await active();
    if(a.version===record.candidate){
     rollbackAttempted=true;
     await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:record.activeBefore.version,percentage:100}],
      annotations:{'workers/message':'Automated rollback after failed removal of Featured Match injected overlay'}});
     record.changes.push('ROLLBACK_PREVIOUS_ACTIVE_WORKER');break;
    }
    if(a.version!==record.activeBefore.version)break;
    await pause(1700);
   }
  }catch(z){record.rollbackError=String(z)}
 }
 record.rollbackAttempted=rollbackAttempted;
 save();console.error('BALL46_UNWANTED_FEATURED_OVERLAY_REMOVAL_STOP',record.error);
 process.exitCode=1;
}
