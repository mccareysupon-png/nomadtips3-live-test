import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {injectHideTicker,TICKER_CSS,TICKER_MARKER} from './theme.mjs';
const SCRIPT='ball46-production',EXPECTED_ACTIVE='12073ddb-3e74-4716-ac80-ffa62bb7b0b8',origin='https://ball46.com';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CLOUDFLARE_ACCOUNT_MISSING');
const apiRoot='https://api.cloudflare.com/client/v4/accounts/'+account;
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const BASE='return __b46PcDarkPerformance20261020(await __b46MobileFeaturedElevation20261020(await __b46MobileSignalPanelElevation20261020(await __b46MobileFlowDepth20261020(await __b46MatchTitleElevation20261020(await __b46InjectFooter(response))))),url.pathname);';
const MATCH='return __b46DarkMatchCard20261020(await '+BASE.slice(7,-1)+',url.pathname);';
const INTERACTION='return __b46DarkMatchInteraction20261020(await '+MATCH.slice(7,-1)+',url.pathname);';
const MOBILE='return __b46MobileOriginalCards20261020(await '+INTERACTION.slice(7,-1)+',url.pathname);';
const PC_ACTIVE='return __b46PcNoInitialActive20261020(await '+MOBILE.slice(7,-1)+',url.pathname);';
const DRAWER='return __b46PcSeamlessDrawer20261020(await '+PC_ACTIVE.slice(7,-1)+',url.pathname);';
const FLOW='return __b46UltraSoftMobile20261020(await '+DRAWER.slice(7,-1)+',url.pathname);';
const ANCHOR='return __b46SignalMobileDeepTeal20261020(await '+FLOW.slice(7,-1)+',url.pathname);';
const NEXT='return __b46PcHideResultTicker20261020(await '+ANCHOR.slice(7,-1)+',url.pathname);';
const helper=[
'function __b46PcTickerHiddenHtml20261020(s){',
'const overlay='+JSON.stringify(TICKER_CSS)+';',
'if(!s.includes("b46-signal-mobile-deep-teal-v2-20261020")||!s.includes("b46-mobile-ultrasoft-flow-v3-20261020")||!s.includes("</body>")||s.includes("b46-pc-hide-result-ticker-20261020"))throw new Error("TOP_TICKER_THEME_SOURCE_DRIFT");',
'return s.replace("</body>",overlay+"</body>");',
'}',
'async function __b46PcHideResultTicker20261020(response,path){',
'if(!["/","/index.html"].includes(path)||!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;',
'const original=await response.text();',
'const modified=__b46PcTickerHiddenHtml20261020(original);',
'const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");',
'return new Response(modified,{status:response.status,statusText:response.statusText,headers});',
'}'
].join('\n');
function patchWorker(src){
 assert.equal(src.split(ANCHOR).length,2,'PRODUCTION_WORKER_CALL_CHAIN_CHANGED');
 assert(!src.includes('__b46PcHideResultTicker20261020'),'TICKER_HIDE_ALREADY_INSTALLED');
 const at=src.lastIndexOf('export default');assert(at>0,'MAIN_EXPORT_NOT_FOUND');
 const out=src.slice(0,at)+'\n'+helper+'\n'+src.slice(at).replace(ANCHOR,NEXT);
 assert.equal(out.replace('\n'+helper+'\n','').replace(NEXT,ANCHOR),src,'NON_TARGET_WORKER_CODE_CHANGED');
 return out;
}
mkdirSync('audit',{recursive:true});
const report={job:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,script:SCRIPT,baseline:EXPECTED_ACTIVE,scope:'PC/Laptop only hide entire top PUSH LOSS WIN signal result ticker; never alter source data or mobile',writes:[],startedAt:new Date().toISOString()};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function api(path,body=null){
 const res=await fetch(apiRoot+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000)});
 const obj=await res.json();assert(res.ok&&obj.success===true,'CF_API_ERROR '+res.status+':'+JSON.stringify(obj.errors||[]));return obj.result;
}
async function active(){
 const r=await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1'),d=r.deployments?.[0];
 assert(d&&d.versions?.length===1&&Number(d.versions[0].percentage)===100,'NOT_100_PERCENT_ACTIVE_VERSION');
 return {version:d.versions[0].version_id,deployment:d.id};
}
async function version(id){const v=await api('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');assert(v.main_module&&Array.isArray(v.modules)&&v.modules.length>0,'WORKER_MODULE_MISSING');return v;}
const modulesHash=v=>v.modules.map(m=>({name:m.name,type:m.content_type,hash:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));
async function read(base,path){
 const url=new URL(path,base);url.searchParams.set('flow_ultrasoft_audit',process.env.GITHUB_RUN_ID+'-'+Date.now());
 const res=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});
 const buf=Buffer.from(await res.arrayBuffer());return {path,status:res.status,contentType:res.headers.get('content-type'),buf,hash:sha(buf)};
}
const urls=['/','/index.html','/app.css','/dashboard-v2-tune.css','/singlepage-workspace-343.js','/expanded-match-343.js'];
async function assets(base){const result={};for(const p of urls){const f=await read(base,p);assert.equal(f.status,200,'MISSING_ASSET '+p);result[p]=f;}return result;}
const mapHashes=a=>Object.fromEntries(Object.entries(a).map(([p,v])=>[p,{sha256:v.hash,bytes:v.buf.length,status:v.status}]));
async function health(base){
 const out={};
 for(const p of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){
  const r=await read(base,p);assert.equal(r.status,200,'API_HTTP_ERROR '+p);
  const obj=JSON.parse(r.buf.toString());assert.equal(obj.ok,true,'API_UNHEALTHY '+p);
  out[p]={ok:true,stale:obj.stale};
 }
 return out;
}
async function observe(browser,width,theme,shot,overrideHtml=null){
 const page=await browser.newPage(),errors=[];let overridden=0;
 try{
  page.on('pageerror',e=>errors.push(String(e).slice(0,350)));
  if(overrideHtml){
   await page.setRequestInterception(true);
   page.on('request',req=>{
    const u=new URL(req.url());
    if(req.isNavigationRequest()&&u.hostname==='ball46.com'&&(u.pathname==='/'||u.pathname==='/index.html')){
     overridden++;req.respond({status:200,contentType:'text/html; charset=utf-8',body:overrideHtml});
    }else req.continue();
   });
  }
  await page.setViewport({width,height:920,isMobile:width<=767,deviceScaleFactor:1});await page.setCacheEnabled(false);
  await page.goto(origin+'/?pc_ticker_hide_qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:85000});
  await new Promise(r=>setTimeout(r,5200));
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await new Promise(r=>setTimeout(r,1050));
  const snap=await page.evaluate(()=>{
   const vis=e=>e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
   const sample=e=>{if(!e)return null;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return{display:cs.display,width:+r.width.toFixed(2),height:+r.height.toFixed(2),left:+r.left.toFixed(2),top:+r.top.toFixed(2),color:cs.color,bg:cs.backgroundColor,image:cs.backgroundImage,shadow:cs.boxShadow,font:cs.fontSize,padding:cs.padding};};
   const choose=q=>[...document.querySelectorAll(q)].find(vis);
   const ticker=[...document.querySelectorAll('.b46-signal-ticker')];
   const workspace=document.querySelector('.workspace.singlepage');
   let fixture=null;
   if(workspace){
    const slot=document.createElement('section');
    slot.className='workspace-scorebar-slot';slot.id='pc-ticker-qa-fixture';
    slot.innerHTML='<div class="b46-signal-ticker"><div class="b46-ticker-track"><span class="b46-ticker-item"><b class="b46-ticker-status">PUSH</b> 1–0 · Test signal result</span></div></div>';
    workspace.appendChild(slot);
    fixture={slot:sample(slot),ticker:sample(slot.querySelector('.b46-signal-ticker'))};
    slot.remove();
   }
   return{theme:document.documentElement.dataset.theme,width:innerWidth,marker:!!document.querySelector('#b46-pc-hide-result-ticker-20261020'),
    tickerCount:ticker.length,visibleTickerCount:ticker.filter(vis).length,
    tickerDisplays:ticker.map(e=>getComputedStyle(e).display),
    fixture,
    performance:sample(choose('#ball46-daily-performance')),
    league:sample(choose('.workspace.singlepage .league-head')),
    match:sample(choose('.workspace.singlepage article.match-row, .b46gn-card')),
    bodyBackground:getComputedStyle(document.body).backgroundColor,
    ultraSoft:!!window.__b46MobileFlowUltraSoftV3Installed,
    signalTheme:!!window.__b46SignalMobileV2Installed};
  });
  await page.screenshot({path:'audit/'+shot+'.png',fullPage:false});
  return {width,theme,snap,overridden,errors};
 }finally{await page.close();}
}
function checkUI(a,b,width,theme,candidate){
 assert(a&&b&&a.snap&&b.snap,'BROWSER_TEST_MISSING');
 if(candidate)assert(b.overridden>0,'CANDIDATE_HTML_NOT_APPLIED');
 assert.equal(a.errors.length,b.errors.length,'NEW_JS_RUNTIME_ERRORS '+b.errors.join(';'));
 assert.equal(b.snap.theme,theme,'BROWSER_THEME_CHANGED');
 assert.equal(b.snap.bodyBackground,a.snap.bodyBackground,'SITE_BACKGROUND_CHANGED');
 assert.equal(b.snap.ultraSoft,a.snap.ultraSoft,'EVENT_FLOW_V3_LOST');
 assert.equal(b.snap.signalTheme,a.snap.signalTheme,'MOBILE_SIGNAL_THEME_LOST');
 for(const key of ['performance','league','match']){
  if(a.snap[key]&&b.snap[key])for(const property of ['width','height','color','bg','image','shadow','font','padding'])
    assert.deepEqual(b.snap[key][property],a.snap[key][property],'UNRELATED_COMPONENT_CHANGED '+width+' '+theme+' '+key+'.'+property);
 }
 assert(b.snap.fixture?.slot&&b.snap.fixture?.ticker,'TICKER_TEST_FIXTURE_NOT_CREATED');
 if(width>=768){
  assert.equal(b.snap.fixture.slot.display,'none','TICKER_SLOT_NOT_REMOVED');
  assert.equal(b.snap.fixture.slot.height,0,'TICKER_SLOT_LEAVES_GAP');
  assert.equal(b.snap.fixture.ticker.display,'none','TICKER_NOT_HIDDEN');
  assert.equal(b.snap.visibleTickerCount,0,'VISIBLE_TOP_RESULTS_TICKER_REMAINS');
  assert(b.snap.marker,'TICKER_STYLE_NOT_PRESENT_ON_PC');
 }else{
  assert.deepEqual(b.snap.fixture,a.snap.fixture,'MOBILE_TICKER_FIXTURE_CHANGED');
  assert.deepEqual(b.snap.tickerDisplays,a.snap.tickerDisplays,'MOBILE_RESULT_TICKER_CHANGED');
  assert.equal(b.snap.visibleTickerCount,a.snap.visibleTickerCount,'MOBILE_TICKER_VISIBILITY_CHANGED');
 }
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let candidate=null,activated=false;
try{
 report.unit='Previously deployed Event Flow V3 retained, asset SHA verified';report.activeBefore=await active();
 assert.equal(report.activeBefore.version,EXPECTED_ACTIVE,'CURRENT_PRODUCTION_VERSION_MOVED_STOP');
 const domains=await api('/workers/domains');
 assert.deepEqual(domains.filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com'],'DOMAIN_ROUTE_DRIFT');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings'),schedules=await api('/workers/scripts/'+SCRIPT+'/schedules'),settingsSHA=sha(canonical(settings)),schedulesSHA=sha(canonical(schedules));
 const base=await version(EXPECTED_ACTIVE);report.baseModules=modulesHash(base);
 const main=base.modules.find(x=>x.name===base.main_module);assert(main,'MAIN_NOT_FOUND');
 const baselineSource=Buffer.from(main.content_base64,'base64').toString('utf8'),patchedSource=patchWorker(baselineSource);
 report.runtimeHashBefore=sha(baselineSource);report.runtimeHashAfter=sha(patchedSource);
 report.beforeAssets=mapHashes(await assets(origin));
 const original=await assets(origin),originalHTML=original['/'].hash;
 assert.equal(original['/index.html'].hash,originalHTML,'HTML_ASSET_NOT_IDENTICAL');
 assert(original['/'].buf.toString().includes('b46-signal-mobile-deep-teal-v2-20261020')&&original['/'].buf.toString().includes('b46-mobile-ultrasoft-flow-v3-20261020'),'LATEST_WORKER_FEATURES_MISSING');
 const expectedHTML=injectHideTicker(original['/'].buf.toString());
 report.expectedHTMLHash=sha(expectedHTML);report.originalScriptHash=original['/expanded-match-343.js'].hash;
 report.healthBefore=await health(origin);save();
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(chrome,'CHROME_MISSING');
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 try{
  report.beforeUI={};
  for(const width of [1440,1024,390])for(const theme of ['light','dark']){const k=width+'-'+theme;report.beforeUI[k]=await observe(browser,width,theme,'before-'+k);}
  const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings,keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':'B46_PC_HIDE_RESULT_TICKER_20261020','workers/message':'Hide entire scrolling result ticker PC/laptop only, preserve Signal engine and mobile'}};
  for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
  const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  for(const m of base.modules)form.set(m.name,new Blob([m.name===base.main_module?patchedSource:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
  assert.equal((await active()).version,EXPECTED_ACTIVE,'ACTIVE_VERSION_MOVED_BEFORE_CANDIDATE');
  const candidateResponse=await api('/workers/scripts/'+SCRIPT+'/versions',form);candidate=candidateResponse.id;report.candidate=candidate;report.writes.push({type:'candidate-only-upload',id:candidate});save();
  const cv=await version(candidate);assert.equal(cv.annotations?.['workers/tag'],'B46_PC_HIDE_RESULT_TICKER_20261020','UNOWNED_CANDIDATE');
  const modAfter=modulesHash(cv);
  for(const m of report.baseModules){const hit=modAfter.find(x=>x.name===m.name);assert(hit,'MISSING_UPLOADED_MODULE');assert.equal(hit.hash,m.name===base.main_module?sha(patchedSource):m.hash,'NON_TARGET_MODULE_CHANGED '+m.name);}
  const preview='https://'+candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
  const tested=await assets(preview);
  for(const p of urls)assert.equal(tested[p].hash,p==='/'||p==='/index.html'?report.expectedHTMLHash:original[p].hash,'PREVIEW_ASSET_CHANGED '+p);
  report.previewAssets=mapHashes(tested);report.previewHealth=await health(preview);
  report.previewUI={};
  for(const width of [1440,1024,390])for(const theme of ['light','dark']){
   const k=width+'-'+theme;
   const val=await observe(browser,width,theme,'preview-'+k,tested['/'].buf);
   report.previewUI[k]=val;save();checkUI(report.beforeUI[k],val,width,theme,true);
  }
  report.candidateVerified=true;save();
  assert.equal((await active()).version,EXPECTED_ACTIVE,'PRODUCTION_MOVED_BEFORE_SWITCH');
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/settings'))),settingsSHA,'WORKER_SETTINGS_DRIFT');
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/schedules'))),schedulesSHA,'WORKER_CRONS_DRIFT');
  const promotion=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'BALL46 PC/laptop hide top scrolling results ticker; mobile and Signal API unchanged'}});
  activated=true;report.writes.push({type:'production_100_percent',version:candidate,deployment:promotion.id});save();
  assert.equal((await active()).version,candidate,'CANDIDATE_NOT_ACTIVE');
  let visible=false;
  for(let i=0;i<20;i++){
   const f=await read(origin,'/');
   if(f.hash===report.expectedHTMLHash){visible=true;break;}
   assert.equal(f.hash,originalHTML,'UNKNOWN_PRODUCTION_HTML_VERSION');await sleep(1800);
  }
  assert(visible,'UPDATED_HTML_NOT_PUBLIC');
  const post=await assets(origin);
  for(const p of urls)assert.equal(post[p].hash,p==='/'||p==='/index.html'?report.expectedHTMLHash:original[p].hash,'PRODUCTION_ASSET_CHANGED '+p);
  report.afterAssets=mapHashes(post);report.healthAfter=await health(origin);
  report.productionUI={};
  for(const width of [1440,1024,390])for(const theme of ['light','dark']){
   const k=width+'-'+theme;
   const val=await observe(browser,width,theme,'production-'+k);
   report.productionUI[k]=val;save();checkUI(report.beforeUI[k],val,width,theme,false);
  }
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/settings'))),settingsSHA,'SETTINGS_CHANGED');
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/schedules'))),schedulesSHA,'SCHEDULES_CHANGED');
  assert.equal((await active()).version,candidate,'ACTIVE_MOVED_DURING_CHECK');
  report.success=true;report.activeAfter=candidate;report.finishedAt=new Date().toISOString();save();
  console.log('BALL46_PC_TICKER_REMOVED_SUCCESS',candidate);
 }finally{await browser.close();}
}catch(e){
 report.success=false;report.error=e.stack||String(e);
 if(activated&&candidate){try{
   if((await active()).version===candidate){
    await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:EXPECTED_ACTIVE,percentage:100}],annotations:{'workers/message':'Rollback PC ticker hide after verification failure'}});
    report.writes.push({type:'automatic_rollback',to:EXPECTED_ACTIVE});
    report.rolledBack=(await active()).version===EXPECTED_ACTIVE;
   }
  }catch(err){report.rollbackError=String(err);}
 }
 report.finishedAt=new Date().toISOString();save();
 console.error('BALL46_PC_TICKER_REMOVED_STOP',e.stack||String(e));process.exitCode=1;
}
