import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {patchFlowJs,verifySoftCurve,PATCH_ID,MOBILE_HELPERS} from './patch.mjs';
const SCRIPT='ball46-production',EXPECTED_ACTIVE='58d9e23c-8c5c-4488-a2d3-00a10a901c7d',origin='https://ball46.com';
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
const ANCHOR='return __b46PcSeamlessDrawer20261020(await '+PC_ACTIVE.slice(7,-1)+',url.pathname);';
const NEXT='return __b46UltraSoftMobile20261020(await '+ANCHOR.slice(7,-1)+',url.pathname);';
const helper=[
'function __b46PatchMobileUltraSoft20261020(s){',
'const PATCH_ID='+JSON.stringify(PATCH_ID)+';',
'const MOBILE_HELPERS='+JSON.stringify(MOBILE_HELPERS)+';',
'const assert=function(value,message){if(!value)throw new Error(message);};',
'assert.equal=function(a,b,message){if(a!==b)throw new Error(message+": "+a+" != "+b);};',
'return ('+patchFlowJs.toString()+')(s);',
'}',
'async function __b46UltraSoftMobile20261020(response,path){',
'if(path!=="/expanded-match-343.js"||!response||response.status!==200)return response;',
'const original=await response.text();',
'const modified=__b46PatchMobileUltraSoft20261020(original);',
'const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.set("Cache-Control","no-store");',
'return new Response(modified,{status:response.status,statusText:response.statusText,headers});',
'}'
].join('\n');
function patchWorker(src){
 assert.equal(src.split(ANCHOR).length,2,'PRODUCTION_WORKER_CALL_CHAIN_CHANGED');
 assert(!src.includes('__b46UltraSoftMobile20261020'),'ALREADY_INSTALLED');
 const at=src.lastIndexOf('export default');assert(at>0,'MAIN_EXPORT_NOT_FOUND');
 const out=src.slice(0,at)+'\n'+helper+'\n'+src.slice(at).replace(ANCHOR,NEXT);
 assert.equal(out.replace('\n'+helper+'\n','').replace(NEXT,ANCHOR),src,'NON_TARGET_WORKER_CODE_CHANGED');
 return out;
}
mkdirSync('audit',{recursive:true});
const report={job:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,script:SCRIPT,baseline:EXPECTED_ACTIVE,scope:'Mobile <=767px Event Flow 11-minute smooth hairline and single bloom, no engine/PC changes',writes:[],startedAt:new Date().toISOString()};
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
async function observe(browser,width,theme,shot,assetBytes=null){
 const page=await browser.newPage(),errs=[];let intercepted=0;
 try{
  page.on('pageerror',e=>errs.push(String(e).slice(0,250)));
  if(assetBytes){
   await page.setRequestInterception(true);
   page.on('request',req=>{
    const u=new URL(req.url());
    if(u.hostname==='ball46.com'&&u.pathname==='/expanded-match-343.js'){
     intercepted++;req.respond({status:200,contentType:'application/javascript; charset=utf-8',body:assetBytes});
    }else req.continue();
   });
  }
  await page.setViewport({width,height:950,isMobile:width<=767,deviceScaleFactor:1});await page.setCacheEnabled(false);
  await page.goto(origin+'/?flow_visual_audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:85000});
  await new Promise(r=>setTimeout(r,6300));
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await new Promise(r=>setTimeout(r,900));
  const sel=width<=767?'.b46gn-card':'.workspace.singlepage article.match-row:not(.active)';
  await page.waitForSelector(sel,{visible:true,timeout:17000});
  const initial=await page.evaluate(w=>{
   const get=s=>{const e=[...document.querySelectorAll(s)].find(x=>x.getBoundingClientRect().width>0);if(!e)return null;const a=getComputedStyle(e),r=e.getBoundingClientRect();return{width:Math.round(r.width),height:Math.round(r.height),background:a.backgroundColor,gradient:a.backgroundImage,color:a.color,shadow:a.boxShadow};};
   return{card:get(w<=767?'.b46gn-card':'.workspace.singlepage article.match-row:not(.active)'),head:get(w<=767?'.b46gn-cardhead':'.workspace.singlepage .league-head')};
  },width);
  const btn=await page.$(sel);await btn.click();await new Promise(r=>setTimeout(r,2800));
  const detail=await page.evaluate(()=>{
   const el=[...document.querySelectorAll('.expand-flow-card')].find(x=>x.getBoundingClientRect().width>0);
   const svg=el?.querySelector('.expand-flow-chart svg');
   const market=[...document.querySelectorAll('.expand-full-market-card')].find(x=>x.getBoundingClientRect().width>0);
   return{flow:!!el,flowTitle:el?.querySelector('.expand-card-head')?.textContent?.slice(0,45),hasChart:!!svg,hasFullMarket:!!market,chartAspect:svg?.getAttribute('preserveAspectRatio'),chartViewBox:svg?.getAttribute('viewBox')};
  });
  await page.screenshot({path:'audit/'+shot+'.png',fullPage:false});
  return{width,theme,initial,detail,intercepted,errorCount:errs.length,errors:errs.slice(0,3)};
 }finally{await page.close();}
}
function compareUI(before,after,requireIntercept){
 assert(before.initial.card&&after.initial.card&&before.initial.head&&after.initial.head,'MATCH_ROW_NOT_VISIBLE');
 for(const k of ['card','head'])for(const v of ['width','height','background','gradient','color','shadow'])assert.deepEqual(after.initial[k][v],before.initial[k][v],'ROW_LAYOUT_THEME_CHANGED '+k+'.'+v);
 assert(before.detail.flow&&after.detail.flow,'EVENT_FLOW_PANEL_LOST');
 assert.equal(after.detail.hasFullMarket,before.detail.hasFullMarket,'FULL_MARKET_CHANGED');
 assert.equal(after.detail.chartAspect,before.detail.chartAspect,'CHART_ASPECT_CHANGED');
 assert.equal(after.errorCount,before.errorCount,'ADDED_BROWSER_ERRORS '+after.errors.join(';'));
 if(requireIntercept)assert(after.intercepted>0,'CANDIDATE_JS_NOT_EXECUTED');
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let candidate=null,activated=false;
try{
 report.unit=verifySoftCurve();report.activeBefore=await active();
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
 assert(original['/'].buf.toString().includes('b46-pc-seamless-drawer-20261020'),'CURRENT_PC_DRAWER_MISSING');
 const expectedJs=patchFlowJs(original['/expanded-match-343.js'].buf.toString());
 report.scriptHashBefore=original['/expanded-match-343.js'].hash;report.scriptHashAfter=sha(expectedJs);
 report.healthBefore=await health(origin);save();
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(chrome,'CHROME_MISSING');
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 try{
  report.beforeUI={};
  for(const width of [1440,390])for(const theme of ['light','dark']){const k=width+'-'+theme;report.beforeUI[k]=await observe(browser,width,theme,'before-'+k);}
  const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings,keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':'B46_MOBILE_ULTRASOFT_EVENTFLOW_20261020','workers/message':'Mobile 11min smooth raw-preserving SVG hairlines and glow 1X; desktop unaffected'}};
  for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
  const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  for(const m of base.modules)form.set(m.name,new Blob([m.name===base.main_module?patchedSource:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
  assert.equal((await active()).version,EXPECTED_ACTIVE,'ACTIVE_VERSION_MOVED_BEFORE_CANDIDATE');
  const candidateResponse=await api('/workers/scripts/'+SCRIPT+'/versions',form);candidate=candidateResponse.id;report.candidate=candidate;report.writes.push({type:'candidate-only-upload',id:candidate});save();
  const cv=await version(candidate);assert.equal(cv.annotations?.['workers/tag'],'B46_MOBILE_ULTRASOFT_EVENTFLOW_20261020','UNOWNED_CANDIDATE');
  const modAfter=modulesHash(cv);
  for(const m of report.baseModules){const hit=modAfter.find(x=>x.name===m.name);assert(hit,'MISSING_UPLOADED_MODULE');assert.equal(hit.hash,m.name===base.main_module?sha(patchedSource):m.hash,'NON_TARGET_MODULE_CHANGED '+m.name);}
  const preview='https://'+candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
  const tested=await assets(preview);
  for(const p of urls)assert.equal(tested[p].hash,p==='/expanded-match-343.js'?report.scriptHashAfter:original[p].hash,'PREVIEW_ASSET_CHANGED '+p);
  report.previewAssets=mapHashes(tested);report.previewHealth=await health(preview);
  report.previewUI={};
  for(const width of [1440,390])for(const theme of ['light','dark']){
   const k=width+'-'+theme;
   const val=await observe(browser,width,theme,'preview-'+k,tested['/expanded-match-343.js'].buf);
   report.previewUI[k]=val;save();compareUI(report.beforeUI[k],val,true);
  }
  report.candidateVerified=true;save();
  assert.equal((await active()).version,EXPECTED_ACTIVE,'PRODUCTION_MOVED_BEFORE_SWITCH');
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/settings'))),settingsSHA,'WORKER_SETTINGS_DRIFT');
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/schedules'))),schedulesSHA,'WORKER_CRONS_DRIFT');
  const promotion=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'BALL46 Mobile Event Flow Ultra Soft 11-minute hairline glow 1X only'}});
  activated=true;report.writes.push({type:'production_100_percent',version:candidate,deployment:promotion.id});save();
  assert.equal((await active()).version,candidate,'CANDIDATE_NOT_ACTIVE');
  let visible=false;
  for(let i=0;i<20;i++){
   const f=await read(origin,'/expanded-match-343.js');
   if(f.hash===report.scriptHashAfter){visible=true;break;}
   assert.equal(f.hash,report.scriptHashBefore,'UNKNOWN_PRODUCTION_JS_VERSION');await sleep(1800);
  }
  assert(visible,'UPDATED_JS_NOT_PUBLIC');
  const post=await assets(origin);
  for(const p of urls)assert.equal(post[p].hash,p==='/expanded-match-343.js'?report.scriptHashAfter:original[p].hash,'PRODUCTION_ASSET_CHANGED '+p);
  report.afterAssets=mapHashes(post);report.healthAfter=await health(origin);
  report.productionUI={};
  for(const width of [1440,390])for(const theme of ['light','dark']){
   const k=width+'-'+theme;
   const val=await observe(browser,width,theme,'production-'+k);
   report.productionUI[k]=val;save();compareUI(report.beforeUI[k],val,false);
  }
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/settings'))),settingsSHA,'SETTINGS_CHANGED');
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/schedules'))),schedulesSHA,'SCHEDULES_CHANGED');
  assert.equal((await active()).version,candidate,'ACTIVE_MOVED_DURING_CHECK');
  report.success=true;report.activeAfter=candidate;report.finishedAt=new Date().toISOString();save();
  console.log('BALL46_MOBILE_EVENTFLOW_ULTRASOFT_DEPLOY_SUCCESS',candidate);
 }finally{await browser.close();}
}catch(e){
 report.success=false;report.error=e.stack||String(e);
 if(activated&&candidate){try{
   if((await active()).version===candidate){
    await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:EXPECTED_ACTIVE,percentage:100}],annotations:{'workers/message':'Rollback mobile ultra soft flow after verification failure'}});
    report.writes.push({type:'automatic_rollback',to:EXPECTED_ACTIVE});
    report.rolledBack=(await active()).version===EXPECTED_ACTIVE;
   }
  }catch(err){report.rollbackError=String(err);}
 }
 report.finishedAt=new Date().toISOString();save();
 console.error('BALL46_MOBILE_EVENTFLOW_ULTRASOFT_STOP',e.stack||String(e));process.exitCode=1;
}
