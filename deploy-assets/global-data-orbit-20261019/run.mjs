import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {completeAssetUpload,createPayload} from '../performance-desktop-borderless-20261019/assets.mjs';

const ACCOUNT='62cb0db544160e6591342abd6b4f35cc',SCRIPT='ball46-production',ORIGIN='https://ball46.com',MARK='B46_GLOBAL_DATA_ORBIT_20261019';
const path='deploy-assets/global-data-orbit-20261019/';
const req=JSON.parse(await readFile(path+'request.json','utf8'));
const assetPaths=JSON.parse(await readFile('deploy-assets/performance-desktop-borderless-20261019/provenance.json','utf8')).paths;
const MARKER='B46_GLOBAL_DATA_ORBIT_20261019';
const bodyTag='<body data-page="live">';
const style=String.raw`
<style id="b46-global-data-orbit-style-20261019">
#b46-data-orbit-loading{
 position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
 width:100%;min-height:100vh;min-height:100dvh;
 background:radial-gradient(ellipse at 50% 38%,#0d3230 0%,#071e20 52%,#061316 100%);
 opacity:1;visibility:visible;pointer-events:auto;
 transition:opacity .22s ease,visibility 0s linear .22s;
}
html[data-b46-orbit-done="1"] #b46-data-orbit-loading{
 opacity:0;visibility:hidden;pointer-events:none;
}
#b46-data-orbit-loading .b46-orbit-stack{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;transform:translateY(-3vh)}
#b46-data-orbit-loading .b46-orbit-brand{font:900 38px/1.1 Arial,sans-serif;letter-spacing:-.075em;color:#fff}
#b46-data-orbit-loading .b46-orbit-brand strong{color:#2de0a3;font-weight:900}
#b46-data-orbit-loading .b46-orbit-ring{
 width:94px;height:94px;position:relative;display:block;isolation:isolate;
}
#b46-data-orbit-loading .b46-orbit-ring::before{
 content:"";position:absolute;inset:0;border-radius:50%;
 background:conic-gradient(from 0deg,transparent 0deg,transparent 180deg,rgba(41,221,164,.06) 220deg,#21c994 290deg,#72ffe0 327deg,transparent 360deg);
 -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 8px),#000 calc(100% - 7px));
 mask:radial-gradient(farthest-side,transparent calc(100% - 8px),#000 calc(100% - 7px));
 animation:b46-orbit-rotate-20261019 2.8s linear infinite;
 filter:drop-shadow(0 0 11px rgba(45,238,175,.65));
}
#b46-data-orbit-loading .b46-orbit-ring::after{
 content:"";position:absolute;inset:12px;border-radius:50%;border:1px solid rgba(45,233,177,.18);
 box-shadow:0 0 16px rgba(35,233,178,.14),inset 0 0 18px rgba(27,180,142,.09);
}
#b46-data-orbit-loading .b46-orbit-copy{color:#9dbbb4;font:700 10px/1.4 Arial,sans-serif;letter-spacing:.19em;text-align:center}
@keyframes b46-orbit-rotate-20261019{to{transform:rotate(360deg)}}
@media(max-width:760px){#b46-data-orbit-loading .b46-orbit-brand{font-size:35px}#b46-data-orbit-loading .b46-orbit-ring{width:84px;height:84px}}
@media(prefers-reduced-motion:reduce){#b46-data-orbit-loading .b46-orbit-ring::before{animation:none;transform:rotate(110deg)}}
</style>
`;
const loader=String.raw`<div id="b46-data-orbit-loading" role="status" aria-live="polite" aria-label="Loading football match data">
 <div class="b46-orbit-stack"><div class="b46-orbit-brand" aria-hidden="true">ball<strong>46</strong></div>
 <span class="b46-orbit-ring" aria-hidden="true"></span><span class="b46-orbit-copy">LOADING MATCH DATA</span></div>
</div>`;
const runtime=String.raw`
<script id="b46-global-data-orbit-runtime-20261019">
(function(){
'use strict';
const doc=document.documentElement;
let boardDone=false,closed=false,observer=null;
const started=performance.now();
const isMobile=()=>window.matchMedia('(max-width:760px)').matches;
const visibleReady=()=>{
 const state=document.querySelector('[data-state]');
 const board=document.querySelector('[data-board-sections]');
 if(!boardDone||!state||!board)return false;
 const settled=state.classList.contains('live')||state.classList.contains('warn');
 const rendered=!board.querySelector('.board-loading');
 const uiReady=!isMobile()||doc.dataset.b46gn==='1'||doc.dataset.b46BootFallback==='1';
 return settled&&rendered&&uiReady;
};
function finish(reason){
 if(closed)return;
 closed=true;
 doc.dataset.b46OrbitDone='1';
 doc.dataset.b46OrbitReason=reason;
 if(observer){observer.disconnect();observer=null}
 clearTimeout(watchdog);
 setTimeout(()=>document.getElementById('b46-data-orbit-loading')?.remove(),500);
}
function inspect(){
 if(closed||!visibleReady())return;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!closed&&visibleReady())finish('data-ready')}));
}
window.addEventListener('ball46:board-first-paint',()=>{boardDone=true;inspect()},{once:true});
function watch(){
 if(closed)return;
 if(document.body){
   observer=new MutationObserver(inspect);
   observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-b46gn','data-b46-boot-fallback']});
 }
 inspect();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
const watchdog=setTimeout(()=>finish('timeout'),10000);
})();
</script>
`;
function patchHomepage(html){
 assert(!html.includes(MARKER),'LOADER_PATCH_ALREADY_PRESENT');
 assert.equal(html.split('</head>').length,2,'HTML_HEAD_ANCHOR_CHANGED');
 assert.equal(html.split(bodyTag).length,2,'HTML_BODY_ANCHOR_CHANGED');
 assert(html.includes("window.dispatchEvent(new CustomEvent('ball46:board-first-paint')"),'BOARD_READY_EVENT_NOT_FOUND');
 assert(html.includes('B46_MOBILE_FIRST_PAINT_GUARD_20261019'),'MOBILE_FLASH_GUARD_MISSING');
 const next=html.replace('</head>',style+runtime+'</head>').replace(bodyTag,bodyTag+loader);
 assert.equal(next.replace(style+runtime,'').replace(loader,''),html,'UNRELATED_HTML_CHANGED');
 return next;
}
assert(['candidate','activate'].includes(req.phase),'INVALID_PHASE');
assert(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT&&process.env.CLOUDFLARE_API_TOKEN,'CLOUDFLARE_AUTH_WRONG');
assert.equal(new Set(assetPaths).size,assetPaths.length,'DUPLICATE_ASSET_PATH');
const token=process.env.CLOUDFLARE_API_TOKEN;
const hash=b=>createHash('sha256').update(b).digest('hex');
const url='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const preview=id=>'https://'+id.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
const canonical=o=>JSON.stringify(o,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function cf(endpoint,body){
 if(body)assert(['/workers/scripts/'+SCRIPT+'/assets-upload-session','/workers/workers/'+SCRIPT+'/versions?deploy=false','/workers/scripts/'+SCRIPT+'/deployments'].includes(endpoint),'WRITE_ENDPOINT_NOT_ALLOWED');
 const r=await fetch(url+endpoint,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success===true,'CF_FAILED '+endpoint+':'+r.status+':'+JSON.stringify(j.errors||[]).slice(0,280));return j.result;
}
async function active(){
 const d=(await cf('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments?.[0];
 assert(d&&d.versions?.length===1&&d.versions[0].percentage===100,'UNSAFE_ACTIVE_TRAFFIC');return d.versions[0].version_id;
}
const ver=id=>cf('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
async function config(){
 const [settings,schedules,domains]=await Promise.all([cf('/workers/scripts/'+SCRIPT+'/settings'),cf('/workers/scripts/'+SCRIPT+'/schedules'),cf('/workers/domains')]);
 assert.deepEqual(domains.filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com'],'PRODUCTION_DOMAIN_MISMATCH');
 return {settings,schedules,domains:domains.filter(x=>x.service===SCRIPT)};
}
async function get(host,p){
 const u=new URL(p,host);u.searchParams.set('b46FrameAudit',process.env.GITHUB_RUN_ID||'test');
 const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
 return {status:r.status,bytes:Buffer.from(await r.arrayBuffer()),type:r.headers.get('content-type')||''};
}
async function health(host){
 const out=[];
 for(const p of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1']){
 const r=await get(host,p);assert.equal(r.status,200,'API_HTTP '+p);const j=JSON.parse(r.bytes);assert.equal(j.ok,true,'API_NOT_OK '+p);
 if(p.includes('/board'))assert(Array.isArray(j.fixtures),'BOARD_SCHEMA');if(p.includes('/statistics'))assert(Array.isArray(j.rows),'STATISTICS_SCHEMA');
 out.push({path:p,ok:j.ok,fixtures:j.fixtures?.length,signals:j.signals?.length,rows:j.rows?.length});}return out;
}
async function visual(host,fixed){
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});const output=[];
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:850}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(host+'/?firstPaintAudit='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForTimeout(2100);
   const normal=await page.evaluate(()=>{
     const root=document.documentElement,board=document.querySelector('[data-board-sections]'),newUI=document.querySelector('#b46gn-results'),legacy=document.querySelector('.dash-shell');
     return {ready:root.dataset.b46gn==='1',legacyVisibility:getComputedStyle(legacy).visibility,oldBoardDisplay:getComputedStyle(board).display,
       newBoardDisplay:newUI?getComputedStyle(newUI).display:null,headGuard:!!document.querySelector('#b46-mobile-first-paint-guard-20261019'),
       priorSignalBadge:document.documentElement.innerHTML.includes('B46_MOBILE_SIGNAL_COUNT_BADGE_20261019'),url:location.href,
       chosenStatus:document.querySelector('[data-status-filter].active')?.dataset.statusFilter};
   });
   assert(normal.priorSignalBadge,'SIGNAL_BADGE_PATCH_WAS_LOST');
   if(width===390){
     assert(normal.ready,'GREEN_NOIR_NOT_INITIALIZED');
     assert.equal(normal.chosenStatus,'all','ALL_MATCHES_DEFAULT_CHANGED');
     if(fixed){
       assert(normal.headGuard,'CRITICAL_HEAD_CSS_MISSING');
       const wait=await page.evaluate(()=>{
         const root=document.documentElement,old=root.dataset.b46gn;
         delete root.dataset.b46gn;
         delete root.dataset.b46BootFallback;
         const before={visibility:getComputedStyle(document.querySelector('.dash-shell')).visibility,
          topMask:getComputedStyle(document.body,'::before').content,
          headerMask:getComputedStyle(document.body,'::after').content};
         root.dataset.b46BootFallback='1';
         const fallback={visibility:getComputedStyle(document.querySelector('.dash-shell')).visibility,topMask:getComputedStyle(document.body,'::before').content};
         delete root.dataset.b46BootFallback;root.dataset.b46gn=old;
         const after={visibility:getComputedStyle(document.querySelector('.dash-shell')).visibility};
         return {before,fallback,after};
       });
       assert.equal(wait.before.visibility,'hidden','OLD_UI_VISIBLE_DURING_STARTUP');
       assert(wait.before.headerMask.includes('ball46'),'EXPECTED_LOADING_SHELL_MISSING');
       assert.equal(wait.fallback.visibility,'visible','FAILSAFE_OLD_UI_NOT_RESTORED');
       assert.equal(wait.after.visibility,'visible','GREEN_NOIR_SHELL_NOT_RESTORED');
       output.push({width,normal,guard:wait,errors:errors.slice(0,2)});
     }else{
       output.push({width,normal,errors:errors.slice(0,2)});
     }
   }else{
     assert.equal(normal.legacyVisibility,'visible','DESKTOP_LEGACY_LAYOUT_HIDDEN');
     assert(!normal.ready,'DESKTOP_GREEN_NOIR_SHOULD_BE_DISABLED');
     output.push({width,normal,errors:errors.slice(0,2)});
   }
   assert.equal(errors.length,0,'PAGE_JS_ERROR');
   await page.close();
  }
 }finally{await browser.close()}
 return output;
}
const state={phase:req.phase,run:process.env.GITHUB_RUN_ID,startedAt:new Date().toISOString(),mark:MARK};
await mkdir(path+'audit-last',{recursive:true});
let activated=false,baseId;
try{
 const current=await active();baseId=current;const conf=await config();
 state.before=current;state.healthBefore=await health(ORIGIN);
 if(req.phase==='candidate'){
 state.beforeStyles=await visual(ORIGIN,false);
 const base=await ver(current),mod=base.modules.find(x=>x.name==='assets/index.html');assert(mod,'INDEX_MODULE_MISSING');
 const index=Buffer.from(mod.content_base64,'base64');const live=await get(ORIGIN,'/index.html');
 assert.equal(live.status,200);assert.equal(hash(live.bytes),hash(index),'LIVE_INDEX_DIFFERS_FROM_ACTIVE');
 const html=index.toString();
 const patched=patchHomepage(html);
 const files=new Map();
 for(let i=0;i<assetPaths.length;i+=5){
 const batch=await Promise.all(assetPaths.slice(i,i+5).map(async p=>{
 const [liveAsset,baseAsset]=await Promise.all([get(ORIGIN,'/'+p),get(preview(current),'/'+p)]);
 assert.equal(liveAsset.status,200,'MISSING_LIVE_ASSET '+p);assert.equal(baseAsset.status,200,'MISSING_IMMUTABLE_ASSET '+p);
 assert.equal(hash(liveAsset.bytes),hash(baseAsset.bytes),'ASSET_DRIFT '+p);assert(liveAsset.type,'NO_ASSET_MIME '+p);return {p,asset:liveAsset};
 }));for(const {p,asset} of batch)files.set(p,{bytes:asset.bytes,type:asset.type});}
 assert.equal(files.size,assetPaths.length,'ASSET_INCOMPLETE');assert.equal(hash(files.get('index.html').bytes),hash(index),'INDEX_FILE_MODULE_MISMATCH');
 assert.equal(await active(),current,'ACTIVE_CHANGED_DURING_READ');
 files.set('index.html',{...files.get('index.html'),bytes:Buffer.from(patched)});
 const uploaded=await completeAssetUpload({account:ACCOUNT,script:SCRIPT,files,expectedPaths:assetPaths,api:cf});
 assert.equal(await active(),current,'ACTIVE_CHANGED_DURING_UPLOAD');
 const payload=createPayload(base,patched,uploaded.jwt,MARK);payload.annotations['workers/message']='Mobile match row expanded frame 7px seam only';
 const created=await cf('/workers/workers/'+SCRIPT+'/versions?deploy=false',payload);
 state.candidate=created.id;state.base=current;state.sourceSHA=hash(index);state.candidateSHA=hash(Buffer.from(patched));state.assetCount=files.size;
 const cv=await ver(created.id);assert.equal(cv.annotations?.['workers/tag'],MARK,'NOT_OWNED_PREVIEW');
 assert.equal(hash(Buffer.from(cv.modules.find(x=>x.name==='assets/index.html').content_base64,'base64')),state.candidateSHA,'PREVIEW_MODULE_CHANGED');
 const previewIndex=await get(preview(created.id),'/index.html');assert.equal(previewIndex.status,200);assert.equal(hash(previewIndex.bytes),state.candidateSHA,'PREVIEW_CONTENT_MISMATCH');
 state.previewStyles=await visual(preview(created.id),true);state.previewHealth=await health(preview(created.id));
 assert.equal(await active(),current,'PREVIEW_CHANGED_ACTIVE');assert.equal(canonical(await config()),canonical(conf),'SETTINGS_CHANGED');
 await writeFile(path+'audit-last/candidate.json',JSON.stringify({base:current,candidate:created.id,sourceSHA:state.sourceSHA,candidateSHA:state.candidateSHA,assetCount:files.size,previewChecked:true,mark:MARK},null,2));
 state.ok=true;state.productionChanged=false;
 }else{
 const proof=JSON.parse(await readFile(path+'audit-last/candidate.json','utf8'));
 assert(proof.base===current&&proof.previewChecked&&proof.mark===MARK&&proof.candidate===req.candidate,'BASE_OR_APPROVAL_PROOF_CHANGED');
 const [base,candidate]=await Promise.all([ver(current),ver(proof.candidate)]);
 assert.equal(candidate.annotations?.['workers/tag'],MARK,'CANDIDATE_NOT_OWNED');
 assert.equal(hash(Buffer.from(base.modules.find(x=>x.name==='assets/index.html').content_base64,'base64')),proof.sourceSHA,'BASE_SOURCE_CHANGED');
 assert.equal(hash(Buffer.from(candidate.modules.find(x=>x.name==='assets/index.html').content_base64,'base64')),proof.candidateSHA,'CANDIDATE_SOURCE_CHANGED');
 assert.equal(canonical(candidate.bindings),canonical(base.bindings),'BINDINGS_CHANGED');
 assert.equal(canonical(candidate.assets?.config),canonical(base.assets?.config),'ASSET_CONFIG_CHANGED');
 assert.equal(candidate.main_module,base.main_module,'MAIN_MODULE_CHANGED');
 const baseMain=base.modules.find(x=>x.name===base.main_module),candMain=candidate.modules.find(x=>x.name===base.main_module);
 assert.equal(hash(Buffer.from(candMain.content_base64,'base64')),hash(Buffer.from(baseMain.content_base64,'base64')),'RUNTIME_CHANGED');
 state.previewStyles=await visual(preview(proof.candidate),true);state.previewHealth=await health(preview(proof.candidate));
 state.beforeStyles=await visual(ORIGIN,false);
 assert.equal(await active(),current,'ACTIVE_MOVED_BEFORE_DEPLOY');
 activated=true;state.candidate=proof.candidate;
 const d=await cf('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:proof.candidate,percentage:100}],annotations:{'workers/message':'Circular light loader for PC and mobile until match data first paints'}});
 state.deployment=d.id;assert.equal(await active(),proof.candidate,'DEPLOY_DID_NOT_ACTIVATE');
 let loaded=false;for(let i=0;i<15;i++){const p=await get(ORIGIN,'/index.html');if(p.status===200&&hash(p.bytes)===proof.candidateSHA){loaded=true;break}await new Promise(r=>setTimeout(r,3000))}
 assert(loaded,'CUTOVER_NOT_VISIBLE');state.productionStyles=await visual(ORIGIN,true);state.healthAfter=await health(ORIGIN);
 assert.equal(canonical(await config()),canonical(conf),'CONFIG_CHANGED_AFTER_ACTIVATION');state.ok=true;state.productionChanged=true;
 }
}catch(e){
 state.ok=false;state.error=e.message;
 if(activated&&baseId){try{if((await active())===state.candidate){await cf('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:baseId,percentage:100}],annotations:{'workers/message':'Auto rollback global data orbit loader'}});state.rolledBack=(await active())===baseId}}catch(re){state.rollbackError=re.message}}
}
state.finishedAt=new Date().toISOString();
await writeFile(path+'audit-last/result.json',JSON.stringify(state,null,2));
console.log('B46_GLOBAL_ORBIT_RESULT',JSON.stringify(state));
assert(state.ok,state.error||'GLOBAL_ORBIT_QA_FAILED');
