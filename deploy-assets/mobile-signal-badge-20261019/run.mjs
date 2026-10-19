import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {completeAssetUpload,createPayload} from '../performance-desktop-borderless-20261019/assets.mjs';

const ACCOUNT='62cb0db544160e6591342abd6b4f35cc',SCRIPT='ball46-production',ORIGIN='https://ball46.com',MARK='B46_MOBILE_SIGNAL_COUNT_BADGE_20261019';
const path='deploy-assets/mobile-signal-badge-20261019/';
const req=JSON.parse(await readFile(path+'request.json','utf8'));
const assetPaths=JSON.parse(await readFile('deploy-assets/performance-desktop-borderless-20261019/provenance.json','utf8')).paths;
const COUNT_ANCHOR='function model(el){';
const MODEL_OLD='imgs,clock:t.clock};}';
const MODEL_NEW='imgs,clock:t.clock,signalCount:b46gnSignalCount(el)};}';
const HELPER="function b46gnSignalCount(el){const raw=el.querySelector('.signal-inline-stack[data-inline-signal-count]')?.getAttribute('data-inline-signal-count');const n=Number(raw);return Number.isSafeInteger(n)&&n>0?n:0}\n ";
const STATUS_OLD="const st=live?'LIVE':finished?'FT':scheduled?'UPCOMING':'WAIT';";
const STATUS_NEW="const st=live?(f.signalCount>0?f.signalCount+' signal':'LIVE'):finished?'FT':scheduled?'UPCOMING':'WAIT';";
const SIGNATURE_OLD="x.clock,x.kind].join(':')";
const SIGNATURE_NEW="x.clock,x.kind,x.signalCount].join(':')";
const WATCH_OLD="attributeFilter:['class']});";
const WATCH_NEW="attributeFilter:['class','data-inline-signal-count']});";
function patchHomepage(html){
  assert(!html.includes('B46_MOBILE_SIGNAL_COUNT_BADGE_20261019'),'BADGE_ALREADY_APPLIED');
  for(const value of [COUNT_ANCHOR,MODEL_OLD,STATUS_OLD,SIGNATURE_OLD,WATCH_OLD])
    assert.equal(html.split(value).length,2,'SOURCE_ANCHOR_MISMATCH:'+value);
  let result=html.replace(COUNT_ANCHOR,HELPER+COUNT_ANCHOR)
    .replace(MODEL_OLD,MODEL_NEW)
    .replace(STATUS_OLD,STATUS_NEW)
    .replace(SIGNATURE_OLD,SIGNATURE_NEW)
    .replace(WATCH_OLD,WATCH_NEW);
  const marker='<!-- B46_MOBILE_SIGNAL_COUNT_BADGE_20261019: mobile Live label reads match-local inline signal count; no engine writes -->\n';
  assert.equal(result.split('</head>').length,2,'HTML_HEAD_DRIFT');
  result=result.replace('</head>',marker+'</head>');
  let reverse=result.replace(marker,'').replace(WATCH_NEW,WATCH_OLD).replace(SIGNATURE_NEW,SIGNATURE_OLD)
    .replace(STATUS_NEW,STATUS_OLD).replace(MODEL_NEW,MODEL_OLD).replace(HELPER,'');
  assert.equal(reverse,html,'UNRELATED_SOURCE_BYTES_CHANGED');
  return result;
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
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  const out=[];
  try{
    for(const width of [390,1280]){
      for(const route of ['/','/?status=live','/?view=signal']){
        const page=await browser.newPage({viewport:{width,height:850}});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(host+route,{waitUntil:'domcontentloaded',timeout:60000});
        await page.waitForTimeout(2200);
        const state=await page.evaluate(()=>({
          href:location.href,view:document.body.dataset.workspaceView,
          filter:[...document.querySelectorAll('[data-status-filter].active')].map(x=>x.dataset.statusFilter),
          mobile:document.documentElement.dataset.b46gn==='1',
          hero:document.querySelector('#b46gn-main-title')?.textContent?.trim()??null,
          hadClockFix:!!document.querySelector('#b46-mobile-live-minute-red-tick-20261019'),
          hadBlankFix:!!document.querySelector('#b46-hide-empty-detail-tiles-style-20261019'),
          marker:document.documentElement.innerHTML.includes('B46_MOBILE_SIGNAL_COUNT_BADGE_20261019')
        }));
        assert(state.hadClockFix&&state.hadBlankFix,'PRIOR_PRODUCTION_FEATURE_MISSING');
        if(route==='/'){
          assert(state.filter.includes('all'),'ALL_MATCHES_DEFAULT_CHANGED');
          assert(!new URL(state.href).searchParams.has('status'),'DEFAULT_REDIRECT_TO_LIVE');
        }
        if(route==='/?status=live')assert(state.filter.includes('live'),'LIVE_DEEP_LINK_BROKEN');
        if(route==='/?view=signal')assert.equal(state.view,'signal','SIGNALS_DEEP_LINK_BROKEN');
        if(width===390&&route==='/'){
          assert(state.mobile,'MOBILE_GREEN_NOIR_MISSING');
          await page.waitForFunction(()=>document.querySelectorAll('[data-board-sections] .match-row[data-match-id]').length>0,null,{timeout:25000});
          await page.waitForTimeout(950);
          let snapshot=null;
          for(let qaAttempt=0;qaAttempt<5;qaAttempt++){
          const fixture=await page.evaluate(()=>{
            const board=document.querySelector('[data-board-sections]');
            if(!board)return {error:'BOARD_MISSING'};
            board.querySelectorAll('[data-b46-badge-fixture-root]').forEach(x=>x.remove());
            const section=document.createElement('section');section.className='status-section';section.dataset.statusSection='live';
            section.setAttribute('data-b46-badge-fixture-root','');
            let article='';
            for(const [id,n] of [['none',0],['one',1],['two',2]]){
              article+=`<article class="match-row" data-match-id="b46-badge-qa-${id}"><div class="teams-cell"><b>Home ${id}</b><strong class="desktop-team-score">0</strong><b>Away ${id}</b><strong class="desktop-team-score">0</strong></div><div class="score-cell"><small>LIVE · 33'</small></div>${n>0?`<div class="signal-inline-stack" data-inline-signal-count="${n}"><div class="signal-cell locked prediction-live">SIGNAL</div></div>`:''}</article>`;
            }
            section.innerHTML='<section class="league-block"><header class="league-head"><strong>QA League</strong></header>'+article+'</section>';
            board.prepend(section);window.__BALL46_GREEN_NOIR?.refresh?.();
            return {added:board.querySelectorAll('[data-b46-badge-fixture-root] .match-row').length};
          });
          assert.equal(fixture.added,3,'FAKE_SOURCE_FIXTURES_MISSING');
          await page.waitForTimeout(500);
          snapshot=await page.evaluate(()=>{
            const rows={};
            for(const id of ['none','one','two']){
              const card=document.querySelector('#b46gn-cards [data-b46gn-fixture="b46-badge-qa-'+id+'"]');
              const label=card?.querySelector('.b46gn-live');
              const clock=card?.querySelector('.b46gn-clock');
              rows[id]={cardPresent:!!card,label:label?.childNodes[0]?.textContent?.trim()??null,
                minute:clock?.textContent??null,color:label?getComputedStyle(label).color:null,
                minuteColor:clock?.querySelector('.b46gn-minute-number')?getComputedStyle(clock.querySelector('.b46gn-minute-number')).color:null,
                minuteAnimation:clock?.querySelector('.b46gn-minute-tick')?getComputedStyle(clock.querySelector('.b46gn-minute-tick')).animationDuration:null,
                headHeight:card?.querySelector('.b46gn-cardhead')?.getBoundingClientRect().height??null};
            }
            return rows;
          });
          if(snapshot.one.cardPresent&&snapshot.two.cardPresent&&snapshot.none.cardPresent)break;
          console.log('PROBE_RETRY',JSON.stringify({host,qaAttempt,snapshot}));
          await page.waitForTimeout(450);
          }
          assert(snapshot.one.cardPresent&&snapshot.two.cardPresent&&snapshot.none.cardPresent,'MOBILE_BADGE_FIXTURE_NOT_RENDERED');
          assert.equal(snapshot.none.label,'LIVE','NO_SIGNAL_LIVE_BADGE_CHANGED');
          assert.equal(snapshot.one.label,fixed?'1 signal':'LIVE','ONE_SIGNAL_LABEL_MISMATCH');
          assert.equal(snapshot.two.label,fixed?'2 signal':'LIVE','TWO_SIGNAL_LABEL_MISMATCH');
          assert.equal(snapshot.one.minute,"33'",'MINUTE_CHANGED');
          assert.equal(snapshot.one.color,'rgb(58, 227, 170)','LABEL_NOT_GREEN');
          assert.equal(snapshot.one.minuteColor,'rgb(239, 68, 68)','MINUTE_NOT_RED');
          assert.equal(snapshot.one.minuteAnimation,'1s','MINUTE_TICK_BLINK_CHANGED');
          if(fixed){
            await page.evaluate(()=>{
              const e=document.querySelector('[data-b46-badge-fixture-root] [data-match-id="b46-badge-qa-one"] .signal-inline-stack');
              e.setAttribute('data-inline-signal-count','2');
            });
            await page.waitForFunction(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture="b46-badge-qa-one"] .b46gn-live')?.childNodes[0]?.textContent?.trim()==='2 signal',null,{timeout:2000});
            const fresh=await page.locator('#b46gn-cards [data-b46gn-fixture="b46-badge-qa-one"] .b46gn-live').evaluate(e=>e.childNodes[0].textContent.trim());
            assert.equal(fresh,'2 signal','SIGNAL_COUNT_ATTRIBUTE_UPDATE_NOT_VISIBLE');
            snapshot.updatedFrom1To2=fresh;
          }
          state.probe=snapshot;
        }
        if(width===1280&&route==='/'){
          assert(!state.mobile,'DESKTOP_GREEN_NOIR_SHOULD_BE_DISABLED');
        }
        if(errors.length)console.log('PAGE_WARN',JSON.stringify({host,width,route,errors:errors.slice(0,5)}));
        out.push({width,route,...state});
        await page.close();
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
 const d=await cf('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:proof.candidate,percentage:100}],annotations:{'workers/message':'Mobile Live Match signal count labels only, preserving clock and all fixture data'}});
 state.deployment=d.id;assert.equal(await active(),proof.candidate,'DEPLOY_DID_NOT_ACTIVATE');
 let loaded=false;for(let i=0;i<15;i++){const p=await get(ORIGIN,'/index.html');if(p.status===200&&hash(p.bytes)===proof.candidateSHA){loaded=true;break}await new Promise(r=>setTimeout(r,3000))}
 assert(loaded,'CUTOVER_NOT_VISIBLE');state.productionStyles=await visual(ORIGIN,true);state.healthAfter=await health(ORIGIN);
 assert.equal(canonical(await config()),canonical(conf),'CONFIG_CHANGED_AFTER_ACTIVATION');state.ok=true;state.productionChanged=true;
 }
}catch(e){
 state.ok=false;state.error=e.message;
 if(activated&&baseId){try{if((await active())===state.candidate){await cf('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:baseId,percentage:100}],annotations:{'workers/message':'Auto rollback mobile signal count header patch'}});state.rolledBack=(await active())===baseId}}catch(re){state.rollbackError=re.message}}
}
state.finishedAt=new Date().toISOString();
await writeFile(path+'audit-last/result.json',JSON.stringify(state,null,2));
console.log('B46_SIGNAL_BADGE_RESULT',JSON.stringify(state));
assert(state.ok,state.error||'SIGNAL_BADGE_QA_FAILED');
