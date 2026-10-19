import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {completeAssetUpload,createPayload} from '../performance-desktop-borderless-20261019/assets.mjs';

const ACCOUNT='62cb0db544160e6591342abd6b4f35cc',SCRIPT='ball46-production',ORIGIN='https://ball46.com',MARK='B46_ALLMATCHES_DISABLE_AUTOLIVE_20261019';
const path='deploy-assets/stop-automatic-live-20261019/';
const req=JSON.parse(await readFile(path+'request.json','utf8'));
const assetPaths=JSON.parse(await readFile('deploy-assets/performance-desktop-borderless-20261019/provenance.json','utf8')).paths;
const TUNE='dashboard-v2-tune.js';
const OLD='  if(autoStatusChosen||userStatusChosen)return;';
const NEW='  // B46_ALLMATCHES_DISABLE_AUTOLIVE_20261019: respect homepage All Matches, explicit All route, and user navigation.\n  const requestedStatus=new URLSearchParams(location.search).get("status");\n  if(!requestedStatus||requestedStatus==="all")return;\n  if(autoStatusChosen||userStatusChosen)return;';
function patchTune(source){
 assert.equal(source.split(OLD).length,2,'AUTO_LIVE_CODE_DRIFT');
 assert(!source.includes('B46_ALLMATCHES_DISABLE_AUTOLIVE_20261019'),'PATCH_ALREADY_PRESENT');
 const next=source.replace(OLD,NEW);
 assert.equal(next.replace(NEW,OLD),source,'UNRELATED_SOURCE_CHANGED');
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
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});const out=[];
 try{
  for(const width of [390,1280]){
   for(const route of ['/','/?status=all','/?status=live','/?view=signal']){
    const page=await browser.newPage({viewport:{width,height:850}});
    const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.goto(host+route,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(4500);
    const v=await page.evaluate(()=>({
      href:location.href,view:document.body.dataset.workspaceView,active:[...document.querySelectorAll('[data-status-filter].active')].map(e=>e.dataset.statusFilter),
      headline:document.querySelector('#b46gn-main-title')?.textContent?.trim()||null,
      count:document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]').length,
      statusKinds:[...new Set([...document.querySelectorAll('#b46gn-cards .b46gn-cardhead[data-kind]')].map(x=>x.dataset.kind))],
      mobileClock:!!document.querySelector('#b46-mobile-live-minute-red-tick-20261019'),
      previousEmptyFix:!!document.querySelector('#b46-hide-empty-detail-tiles-style-20261019'),
      allHead:document.querySelector('[data-status-filter="all"]')?.textContent.trim().slice(0,45)
    }));
    assert(v.mobileClock&&v.previousEmptyFix,'PRODUCTION_FEATURES_MISSING');
    if(fixed){
      if(route==='/'||route==='/?status=all'){
        assert(v.active.includes('all'),'DEFAULT_NOT_ALL');
        assert(!new URL(v.href).searchParams.has('status')||new URL(v.href).searchParams.get('status')==='all','AUTOMATIC_STATUS_REDIRECT');
        if(width===390)assert.equal(v.headline,'All Matches','HOMEPAGE_HEADING_WRONG');
      }
      if(route==='/?status=live'){
        assert(v.active.includes('live'),'EXPLICIT_LIVE_FILTER_CHANGED');
        assert.equal(new URL(v.href).searchParams.get('status'),'live','LIVE_DEEP_LINK_CHANGED');
        if(width===390)assert.equal(v.headline,'Live Matches','LIVE_HEADING_CHANGED');
      }
      if(route==='/?view=signal')assert.equal(v.view,'signal','SIGNAL_DEEP_LINK_CHANGED');
    }
    if(fixed&&route==='/'){
      await page.evaluate(()=>document.querySelector('.left-rail [data-status-filter="live"]')?.click());
      await page.waitForTimeout(300);
      const nav=await page.evaluate(()=>({filter:document.querySelector('[data-status-filter].active')?.dataset.statusFilter,href:location.href}));
      assert.equal(nav.filter,'live','USER_CLICK_LIVE_FAILED');
      await page.evaluate(()=>document.querySelector('.left-rail [data-status-filter="all"]')?.click());
      await page.waitForTimeout(500);
      const all=await page.evaluate(()=>({filter:document.querySelector('[data-status-filter].active')?.dataset.statusFilter,href:location.href}));
      assert.equal(all.filter,'all','USER_CLICK_ALL_FAILED');
      assert.equal(new URL(all.href).searchParams.has('status'),false,'USER_ALL_ROUTE_STUCK');
      v.manualNavigation={afterLive:nav,afterAll:all};
    }
    out.push({width,route,...v,errors:pageErrors.slice(0,2)});await page.close();
   }
  }
 }finally{await browser.close()}
 return out;
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
 const patched=html;
 const files=new Map();
 for(let i=0;i<assetPaths.length;i+=5){
 const batch=await Promise.all(assetPaths.slice(i,i+5).map(async p=>{
 const [liveAsset,baseAsset]=await Promise.all([get(ORIGIN,'/'+p),get(preview(current),'/'+p)]);
 assert.equal(liveAsset.status,200,'MISSING_LIVE_ASSET '+p);assert.equal(baseAsset.status,200,'MISSING_IMMUTABLE_ASSET '+p);
 assert.equal(hash(liveAsset.bytes),hash(baseAsset.bytes),'ASSET_DRIFT '+p);assert(liveAsset.type,'NO_ASSET_MIME '+p);return {p,asset:liveAsset};
 }));for(const {p,asset} of batch)files.set(p,{bytes:asset.bytes,type:asset.type});}
 assert.equal(files.size,assetPaths.length,'ASSET_INCOMPLETE');assert.equal(hash(files.get('index.html').bytes),hash(index),'INDEX_FILE_MODULE_MISMATCH');
 assert.equal(await active(),current,'ACTIVE_CHANGED_DURING_READ');
 assert(files.has(TUNE),'SOURCE_TUNE_MISSING');
 const tuneBefore=files.get(TUNE).bytes;
 const tunePatched=Buffer.from(patchTune(tuneBefore.toString()));
 state.tuneBeforeSHA=hash(tuneBefore);state.tuneAfterSHA=hash(tunePatched);
 files.set(TUNE,{...files.get(TUNE),bytes:tunePatched});
 files.set('index.html',{...files.get('index.html'),bytes:Buffer.from(patched)});
 const uploaded=await completeAssetUpload({account:ACCOUNT,script:SCRIPT,files,expectedPaths:assetPaths,api:cf});
 assert.equal(await active(),current,'ACTIVE_CHANGED_DURING_UPLOAD');
 const payload=createPayload(base,patched,uploaded.jwt,MARK);payload.annotations['workers/message']='Stop mobile auto-select Live on default All Matches page; preserve user-selected status';
 const created=await cf('/workers/workers/'+SCRIPT+'/versions?deploy=false',payload);
 state.candidate=created.id;state.base=current;state.sourceSHA=hash(index);state.candidateSHA=hash(Buffer.from(patched));state.assetCount=files.size;
 const cv=await ver(created.id);assert.equal(cv.annotations?.['workers/tag'],MARK,'NOT_OWNED_PREVIEW');
 assert.equal(hash(Buffer.from(cv.modules.find(x=>x.name==='assets/index.html').content_base64,'base64')),state.candidateSHA,'PREVIEW_MODULE_CHANGED');
 const previewIndex=await get(preview(created.id),'/index.html');assert.equal(previewIndex.status,200);assert.equal(hash(previewIndex.bytes),state.candidateSHA,'PREVIEW_CONTENT_MISMATCH');
 const previewTune=await get(preview(created.id),'/'+TUNE);
 assert.equal(previewTune.status,200,'PREVIEW_TUNE_HTTP');assert.equal(hash(previewTune.bytes),state.tuneAfterSHA,'PREVIEW_TUNE_SHA_MISMATCH');
 state.previewStyles=await visual(preview(created.id),true);state.previewHealth=await health(preview(created.id));
 assert.equal(await active(),current,'PREVIEW_CHANGED_ACTIVE');assert.equal(canonical(await config()),canonical(conf),'SETTINGS_CHANGED');
 await writeFile(path+'audit-last/candidate.json',JSON.stringify({base:current,candidate:created.id,sourceSHA:state.sourceSHA,candidateSHA:state.candidateSHA,assetCount:files.size,tuneBeforeSHA:state.tuneBeforeSHA,tuneAfterSHA:state.tuneAfterSHA,previewChecked:true,mark:MARK},null,2));
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
 assert.equal((await get(ORIGIN,'/'+TUNE)).status,200,'ORIGIN_TUNE_MISSING');
 assert.equal(hash((await get(ORIGIN,'/'+TUNE)).bytes),proof.tuneBeforeSHA,'TUNE_SOURCE_DRIFT');
 assert.equal(hash((await get(preview(proof.candidate),'/'+TUNE)).bytes),proof.tuneAfterSHA,'CANDIDATE_TUNE_DRIFT');
 const baseMain=base.modules.find(x=>x.name===base.main_module),candMain=candidate.modules.find(x=>x.name===base.main_module);
 assert.equal(hash(Buffer.from(candMain.content_base64,'base64')),hash(Buffer.from(baseMain.content_base64,'base64')),'RUNTIME_CHANGED');
 state.previewStyles=await visual(preview(proof.candidate),true);state.previewHealth=await health(preview(proof.candidate));
 state.beforeStyles=await visual(ORIGIN,false);
 assert.equal(await active(),current,'ACTIVE_MOVED_BEFORE_DEPLOY');
 activated=true;state.candidate=proof.candidate;
 const d=await cf('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:proof.candidate,percentage:100}],annotations:{'workers/message':'Fix wrong automatic Live route when entering Ball46 root; keep All Matches default'}});
 state.deployment=d.id;assert.equal(await active(),proof.candidate,'DEPLOY_DID_NOT_ACTIVATE');
 let loaded=false;for(let i=0;i<15;i++){const p=await get(ORIGIN,'/'+TUNE);if(p.status===200&&hash(p.bytes)===proof.tuneAfterSHA){loaded=true;break}await new Promise(r=>setTimeout(r,3000))}
 assert(loaded,'TUNE_CUTOVER_NOT_VISIBLE');state.productionStyles=await visual(ORIGIN,true);state.healthAfter=await health(ORIGIN);
 assert.equal(canonical(await config()),canonical(conf),'CONFIG_CHANGED_AFTER_ACTIVATION');state.ok=true;state.productionChanged=true;
 }
}catch(e){
 state.ok=false;state.error=e.message;
 if(activated&&baseId){try{if((await active())===state.candidate){await cf('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:baseId,percentage:100}],annotations:{'workers/message':'Auto rollback All Matches auto-live navigation'}});state.rolledBack=(await active())===baseId}}catch(re){state.rollbackError=re.message}}
}
state.finishedAt=new Date().toISOString();
await writeFile(path+'audit-last/result.json',JSON.stringify(state,null,2));
console.log('B46_DISABLE_AUTOLIVE_RESULT',JSON.stringify(state));
assert(state.ok,state.error||'DISABLE_AUTOLIVE_QA_FAILED');
