import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {completeAssetUpload,createPayload} from '../performance-desktop-borderless-20261019/assets.mjs';

const ACCOUNT='62cb0db544160e6591342abd6b4f35cc',SCRIPT='ball46-production',ORIGIN='https://ball46.com',MARK='B46_MOBILE_LIVE_MINUTE_RED_TICK_20261019';
const path='deploy-assets/mobile-live-minute-red-tick-20261019/';
const req=JSON.parse(await readFile(path+'request.json','utf8'));
const assetPaths=JSON.parse(await readFile('deploy-assets/performance-desktop-borderless-20261019/provenance.json','utf8')).paths;
const MARKUP_OLD='<span class="b46gn-clock">${esc(timed)}</span>';
const MARKUP_NEW='<span class="b46gn-clock">${live?b46gnLiveMinuteMarkup(timed):esc(timed)}</span>';
const HELPER="function b46gnLiveMinuteMarkup(value){const raw=String(value||'').trim(),m=/^([0-9]{1,3}(?:\\+[0-9]{1,2})?)(['’′])$/.exec(raw);return m?'<span class=\"b46gn-minute-number\">'+esc(m[1])+'</span><span class=\"b46gn-minute-tick\">'+esc(m[2])+'</span>':esc(raw)}\n ";
const css=[
'<style id="b46-mobile-live-minute-red-tick-20261019">',
'/* Mobile Green Noir Live Matches only: preserve LIVE dot, geometry and time data. */',
'@media (max-width:760px){',
'html[data-b46gn="1"] #b46gn-cards .b46gn-cardhead[data-kind="live"] .b46gn-clock .b46gn-minute-number,',
'html[data-b46gn="1"] #b46gn-cards .b46gn-cardhead[data-kind="live"] .b46gn-clock .b46gn-minute-tick{color:#EF4444!important}',
'html[data-b46gn="1"] #b46gn-cards .b46gn-cardhead[data-kind="live"] .b46gn-clock .b46gn-minute-tick{animation:b46gn-minute-red-tick-20261019 1s step-end infinite}',
'}',
'@keyframes b46gn-minute-red-tick-20261019{0%,49.99%{opacity:1}50%,100%{opacity:0}}',
'@media (prefers-reduced-motion:reduce){html[data-b46gn="1"] #b46gn-cards .b46gn-cardhead[data-kind="live"] .b46gn-minute-tick{animation:none!important}}',
'</style>'
].join('\n')+'\n';
function patchClockHTML(html){
 assert.equal(html.split(MARKUP_OLD).length,2,'LIVE_CARD_CLOCK_MARKUP_DRIFT');
 assert.equal(html.split('function cardHtml(f){').length,2,'CARD_RENDERER_CHANGED');
 assert(!html.includes('b46-mobile-live-minute-red-tick-20261019'),'CLOCK_PATCH_ALREADY_PRESENT');
 assert.equal(html.split('</head>').length,2,'HEAD_ANCHOR_CHANGED');
 const next=html.replace('function cardHtml(f){',HELPER+'function cardHtml(f){').replace(MARKUP_OLD,MARKUP_NEW).replace('</head>',css+'</head>');
 assert.equal(next.replace(css,'').replace(HELPER,'').replace(MARKUP_NEW,MARKUP_OLD),html,'UNSCOPED_HTML_CHANGE');
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
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.goto(host+'/?hideEmptyDetailTiles='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForTimeout(450);
   if(width===390){
    await page.locator('#b46gn-detail [data-b46gn-detailbody]').waitFor({state:'attached',timeout:12000});
    await page.evaluate(()=>{
     const root=document.querySelector('#b46gn-detail [data-b46gn-detailbody]');
     const prices=document.createElement('div');prices.className='b46gn-prices';prices.setAttribute('data-b46-empty-fixture','');
     prices.innerHTML='<div><div class="market-cell" style="display:none!important">1.90</div></div><div><div class="market-cell" style="display:none!important">2.04</div></div><div><div class="market-cell" style="display:none!important">1.65</div></div>';
     root.appendChild(prices);
    });
    await page.waitForTimeout(220);
    const hidden=await page.evaluate(()=>{
      const p=document.querySelector('[data-b46-empty-fixture]');
      const slots=[...p.children].map(e=>({display:getComputedStyle(e).display,classes:e.className}));
      return {display:getComputedStyle(p).display,classes:p.className,slots};
    });
    assert.equal(hidden.display,fixed?'none':'grid','EMPTY_MINI_ROW_VISIBILITY_WRONG');
    if(fixed){assert.equal(hidden.slots.filter(x=>x.display==='none').length,3,'THREE_EMPTY_TILES_VISIBLE')}
    await page.evaluate(()=>{
      const p=document.querySelector('[data-b46-empty-fixture]');
      const slot=p.firstElementChild;
      slot.insertAdjacentHTML('beforeend','<span data-visible-market="1">OVER 1.95</span>');
    });
    await page.waitForTimeout(220);
    const visible=await page.evaluate(()=>{
      const p=document.querySelector('[data-b46-empty-fixture]');
      return {display:getComputedStyle(p).display,slots:[...p.children].map(e=>getComputedStyle(e).display),text:p.firstElementChild.innerText};
    });
    assert.equal(visible.display,'grid','VALID_PRICE_ROW_NOT_VISIBLE');
    if(fixed)assert.deepEqual(visible.slots,['block','none','none'],'ONLY_REAL_MARKET_TILE_SHOULD_SHOW');
    await page.evaluate(()=>document.querySelector('[data-b46-empty-fixture]')?.remove());
    out.push({width,empty:hidden,withRealData:visible});
   }else{
    const d=await page.evaluate(()=>{
      const x=document.createElement('div');
      x.id='b46gn-detail';
      x.innerHTML='<div class="b46gn-prices"><div><span>1.95</span></div></div>';
      document.body.appendChild(x);
      const p=x.querySelector('.b46gn-prices'),display=getComputedStyle(p).display;
      x.remove();return {display,greenNoir:document.documentElement.dataset.b46gn};
    });
    assert.notEqual(d.display,'none','DESKTOP_PRICES_HIDDEN');
    out.push({width,...d});
   }
   await page.close();
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
 const patched=patchClockHTML(html);
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
 state.previewStyles=await visual(preview(created.id),true);assert.deepEqual(state.previewStyles[1],state.beforeStyles[1],'DESKTOP_STYLE_DIFF');assert.equal(state.previewStyles[1].display,state.beforeStyles[1].display,'DESKTOP_DISPLAY_CHANGED');state.previewHealth=await health(preview(created.id));
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
 const d=await cf('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:proof.candidate,percentage:100}],annotations:{'workers/message':'Mobile Live Matches minute red and minute mark blinking; no data changes'}});
 state.deployment=d.id;assert.equal(await active(),proof.candidate,'DEPLOY_DID_NOT_ACTIVATE');
 let loaded=false;for(let i=0;i<15;i++){const p=await get(ORIGIN,'/index.html');if(p.status===200&&hash(p.bytes)===proof.candidateSHA){loaded=true;break}await new Promise(r=>setTimeout(r,3000))}
 assert(loaded,'CUTOVER_NOT_VISIBLE');state.productionStyles=await visual(ORIGIN,true);state.healthAfter=await health(ORIGIN);
 assert.equal(canonical(await config()),canonical(conf),'CONFIG_CHANGED_AFTER_ACTIVATION');state.ok=true;state.productionChanged=true;
 }
}catch(e){
 state.ok=false;state.error=e.message;
 if(activated&&baseId){try{if((await active())===state.candidate){await cf('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:baseId,percentage:100}],annotations:{'workers/message':'Auto rollback mobile live minute'}});state.rolledBack=(await active())===baseId}}catch(re){state.rollbackError=re.message}}
}
state.finishedAt=new Date().toISOString();
await writeFile(path+'audit-last/result.json',JSON.stringify(state,null,2));
console.log('B46_MOBILE_LIVE_MINUTE_RESULT',JSON.stringify(state));
assert(state.ok,state.error||'MOBILE_LIVE_MINUTE_QA_FAILED');
